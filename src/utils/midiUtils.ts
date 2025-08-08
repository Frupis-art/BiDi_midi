import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import JSZip from 'jszip';

interface ParsedNote {
  note?: string;
  octave?: number;
  duration: number;
  isPause: boolean;
  startTime: number;
  endTime: number;
  originalText: string;
  isError: boolean;
  errorMessage?: string;
}

// Обновленные регулярные выражения для миллисекунд
const NOTE_REGEX = /^([cdefgabCDEFGAB])(#|b)?(\d)?(\(([\d.]+)\))?$/;
const PAUSE_REGEX = /^[pP](\(([\d.]+)\))?$/;

export const parseNoteSequence = (sequence: string, t: (key: string) => string): ParsedNote[] => {
  const notes: ParsedNote[] = [];
  let currentTime = 0;
  
  // Разбиваем последовательность на отдельные элементы
  const elements = [];
  let currentElement = '';
  let inBrackets = false;
  
  for (let i = 0; i < sequence.length; i++) {
    const char = sequence[i];
    
    if (char === '(') {
      inBrackets = true;
      currentElement += char;
    } else if (char === ')') {
      inBrackets = false;
      currentElement += char;
    } else if (!inBrackets && /[cdefgabpCDEFGABP]/.test(char) && currentElement) {
      elements.push(currentElement.trim());
      currentElement = char;
    } else {
      currentElement += char;
    }
  }
  
  if (currentElement) {
    elements.push(currentElement.trim());
  }
  
  elements.forEach((element, index) => {
    const originalText = element;
    let parsedNote: ParsedNote = {
      duration: 1000, // Дефолтная длительность 1000мс
      isPause: false,
      startTime: currentTime,
      endTime: currentTime + 1000,
      originalText,
      isError: false
    };

    // Проверяем паузу
    const pauseMatch = element.match(PAUSE_REGEX);
    if (pauseMatch) {
      const durationStr = pauseMatch[2];
      const duration = durationStr ? parseFloat(durationStr) : 1000; // Дефолт 1000мс
      
      if (durationStr && (isNaN(duration) || duration <= 0)) {
        parsedNote.isError = true;
        parsedNote.errorMessage = `${t('invalidPauseDuration')}: ${durationStr}`;
      } else {
        parsedNote.isPause = true;
        parsedNote.duration = duration;
        parsedNote.endTime = currentTime + duration;
      }
    } else {
      // Проверяем ноту
      const noteMatch = element.match(NOTE_REGEX);
      if (noteMatch) {
        const [, noteName, accidental, octaveStr, , durationStr] = noteMatch;
        const octave = octaveStr ? parseInt(octaveStr) : 4; // Дефолтная октава 4
        const duration = durationStr ? parseFloat(durationStr) : 1000; // Дефолтная длительность 1000мс

        // Проверяем октаву - только диапазон 0-8
        if (octave < 0 || octave > 8) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `${t('invalidOctave')}: ${octave}. ${t('octaveRange')}`;
        }
        // Проверяем длительность
        else if (durationStr && (isNaN(duration) || duration <= 0)) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `${t('invalidDuration')}: ${durationStr}`;
        } else {
          parsedNote.note = noteName.toUpperCase() + (accidental || '');
          parsedNote.octave = octave;
          parsedNote.duration = duration;
          parsedNote.endTime = currentTime + duration;
        }
      } else {
        parsedNote.isError = true;
        parsedNote.errorMessage = `${t('invalidFormat')}: ${element}`;
      }
    }

    notes.push(parsedNote);
    currentTime = parsedNote.endTime;
  });

  return notes;
};

let synthInstances: any[] = [];
let activeNotes: string[] = [];
let scheduledEvents: NodeJS.Timeout[] = [];

const createInstrument = (instrument: string) => {
  switch (instrument) {
    case 'piano':
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 0.7, release: 1 }
      }).toDestination();
    
    case 'clarinet':
    case 'oboe':
      return new Tone.FMSynth({
        modulationIndex: 12,
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 1.2 }
      }).toDestination();
    
    case 'trumpet':
      return new Tone.FMSynth({
        modulationIndex: 8,
        harmonicity: 1.5,
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.1, decay: 0.2, sustain: 0.9, release: 0.8 }
      }).toDestination();
    
    case 'flute':
      return new Tone.AMSynth({
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.3, decay: 0.2, sustain: 0.6, release: 1.5 }
      }).toDestination();
    
    case 'cello':
    case 'violin':
      return new Tone.AMSynth({
        harmonicity: 1,
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 2 }
      }).toDestination();
    
    case 'bassoon':
      return new Tone.FMSynth({
        modulationIndex: 15,
        harmonicity: 0.5,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.3, decay: 0.4, sustain: 0.7, release: 1.5 }
      }).toDestination();
    
    case 'guitar':
      return new Tone.PluckSynth({
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.7
      }).toDestination();
    
    default:
      return new Tone.Synth().toDestination();
  }
};

export const initializeAudio = async (instrument: string = 'piano') => {
  // Очищаем предыдущие инстансы
  synthInstances.forEach(synth => {
    if (synth) synth.dispose();
  });
  synthInstances = [];
  
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
};

export const playSequence = async (notes: ParsedNote[], speed: number = 1, instrument: string = 'piano', volume: number = 0.7) => {
  await initializeAudio(instrument);
  
  // Создаем новый инструмент для этой последовательности
  const synth = createInstrument(instrument);
  synth.volume.value = Tone.gainToDb(volume); // Устанавливаем громкость
  synthInstances.push(synth);

  let currentTime = 0;
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      const adjustedDuration = (note.duration / 1000) / speed; // Конвертируем мс в секунды
      
      const timeoutId = setTimeout(() => {
        if (synth) {
          synth.triggerAttackRelease(noteName, adjustedDuration);
        }
      }, (currentTime / 1000) * 1000); // Конвертируем мс в мс для setTimeout
      
      scheduledEvents.push(timeoutId);
      activeNotes.push(noteName);
    }
    currentTime += note.duration / speed;
  });
};

export const stopSequence = () => {
  // Останавливаем все инструменты
  synthInstances.forEach(synth => {
    if (synth) {
      synth.triggerRelease();
    }
  });
  activeNotes = [];
  
  scheduledEvents.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  scheduledEvents = [];
};

// Обновленная функция экспорта с поддержкой двух последовательностей
export const exportMidi = async (
  notes1: ParsedNote[], 
  notes2: ParsedNote[], 
  speed: number = 1, 
  options?: { format: 'midi' | 'mp3' }
) => {
  const midi = new Midi();
  
  // Создаем первый трек для первой последовательности
  if (notes1.length > 0 && notes1.some(note => !note.isError && !note.isPause)) {
    const track1 = midi.addTrack();
    track1.name = "Sequence 1";
    track1.channel = 0;

    let currentTime1 = 0;
    notes1.forEach((note) => {
      if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
        const noteName = `${note.note}${note.octave}`;
        const adjustedDuration = (note.duration / 1000) / speed;
        track1.addNote({
          midi: Tone.Frequency(noteName).toMidi(),
          time: currentTime1 / 1000,
          duration: adjustedDuration
        });
      }
      currentTime1 += note.duration / speed;
    });
  }

  // Создаем второй трек для второй последовательности
  if (notes2.length > 0 && notes2.some(note => !note.isError && !note.isPause)) {
    const track2 = midi.addTrack();
    track2.name = "Sequence 2";
    track2.channel = 1;

    let currentTime2 = 0;
    notes2.forEach((note) => {
      if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
        const noteName = `${note.note}${note.octave}`;
        const adjustedDuration = (note.duration / 1000) / speed;
        track2.addNote({
          midi: Tone.Frequency(noteName).toMidi(),
          time: currentTime2 / 1000,
          duration: adjustedDuration
        });
      }
      currentTime2 += note.duration / speed;
    });
  }

  if (options?.format === 'mp3') {
    await convertToMp3(notes1, notes2, speed);
  } else {
    const midiArray = midi.toArray();
    const midiBlob = new Blob([midiArray], { type: 'audio/midi' });
    
    // Проверяем различные мобильные платформы включая Telegram
    const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isTelegramWebApp) {
      // Специальная обработка для Telegram WebApp
      downloadMidiFile(midiBlob, 'sequence', 'mid');
    } else if (isMobile && 'share' in navigator) {
      try {
        const file = new File([midiBlob], 'sequence.mid', { type: 'audio/midi' });
        await navigator.share({
          files: [file],
          title: 'MIDI Sequence',
          text: 'Exported MIDI sequence'
        });
      } catch (error) {
        console.error('Share failed:', error);
        downloadMidiFile(midiBlob, 'sequence', 'mid');
      }
    } else {
      downloadMidiFile(midiBlob, 'sequence', 'mid');
    }
  }
};

const downloadMidiFile = (blob: Blob, baseName: string, extension: string) => {
  const url = URL.createObjectURL(blob);
  
  // Генерируем уникальное имя файла с правильным форматом
  const fileName = generateUniqueFileName(baseName, extension);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  
  // Для Telegram WebApp добавляем специальные атрибуты
  const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
  if (isTelegramWebApp) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

// Обновленная функция конвертации в MP3 с поддержкой двух последовательностей
const convertToMp3 = async (notes1: ParsedNote[], notes2: ParsedNote[], speed: number) => {
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  
  // Вычисляем общую длительность
  let totalDuration1 = 0;
  notes1.forEach(note => {
    totalDuration1 += (note.duration / 1000) / speed;
  });
  
  let totalDuration2 = 0;
  notes2.forEach(note => {
    totalDuration2 += (note.duration / 1000) / speed;
  });
  
  const totalDuration = Math.max(totalDuration1, totalDuration2);
  const bufferLength = Math.ceil(totalDuration * sampleRate);
  const audioBuffer = audioContext.createBuffer(2, bufferLength, sampleRate); // Стерео
  
  // Первая последовательность в левый канал
  const leftChannel = audioBuffer.getChannelData(0);
  let currentTime1 = 0;
  for (const note of notes1) {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const frequency = Tone.Frequency(`${note.note}${note.octave}`).toFrequency();
      const noteDuration = (note.duration / 1000) / speed;
      const startSample = Math.floor((currentTime1 / 1000) * sampleRate);
      const endSample = Math.floor(((currentTime1 / 1000) + noteDuration) * sampleRate);
      
      for (let i = startSample; i < endSample && i < bufferLength; i++) {
        const t = (i - startSample) / sampleRate;
        const envelope = Math.exp(-t * 2);
        leftChannel[i] += Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }
    }
    currentTime1 += note.duration / speed;
  }
  
  // Вторая последовательность в правый канал
  const rightChannel = audioBuffer.getChannelData(1);
  let currentTime2 = 0;
  for (const note of notes2) {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const frequency = Tone.Frequency(`${note.note}${note.octave}`).toFrequency();
      const noteDuration = (note.duration / 1000) / speed;
      const startSample = Math.floor((currentTime2 / 1000) * sampleRate);
      const endSample = Math.floor(((currentTime2 / 1000) + noteDuration) * sampleRate);
      
      for (let i = startSample; i < endSample && i < bufferLength; i++) {
        const t = (i - startSample) / sampleRate;
        const envelope = Math.exp(-t * 2);
        rightChannel[i] += Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }
    }
    currentTime2 += note.duration / speed;
  }
  
  const wavBlob = audioBufferToWav(audioBuffer);
  
  // Проверяем различные мобильные платформы включая Telegram
  const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isTelegramWebApp) {
    // Специальная обработка для Telegram WebApp
    downloadAudioFile(wavBlob, 'sequence', 'wav');
  } else if (isMobile && 'share' in navigator) {
    try {
      const file = new File([wavBlob], 'sequence.wav', { type: 'audio/wav' });
      await navigator.share({
        files: [file],
        title: 'Audio Sequence',
        text: 'Exported audio sequence'
      });
    } catch (error) {
      console.error('Share failed:', error);
      downloadAudioFile(wavBlob, 'sequence', 'wav');
    }
  } else {
    downloadAudioFile(wavBlob, 'sequence', 'wav');
  }
};

const downloadAudioFile = (blob: Blob, baseName: string, extension: string) => {
  const url = URL.createObjectURL(blob);
  
  // Генерируем уникальное имя файла с правильным форматом
  const fileName = generateUniqueFileName(baseName, extension);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  
  // Для Telegram WebApp добавляем специальные атрибуты
  const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
  if (isTelegramWebApp) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

const generateUniqueFileName = (baseName: string, extension: string): string => {
  // Генерируем максимально уникальное имя с несколькими компонентами
  const timestamp = Date.now();
  const random1 = Math.floor(Math.random() * 10000);
  const random2 = Math.floor(Math.random() * 10000);
  
  // Для Telegram WebApp используем очень уникальное именование
  const isTelegramWebApp = !!(window as any).Telegram?.WebApp;
  if (isTelegramWebApp) {
    // Используем timestamp + два случайных числа для максимальной уникальности
    return `${baseName}_${timestamp}_${random1}_${random2}.${extension}`;
  }
  
  // Для других платформ используем timestamp + random
  const fileName = `${baseName}_${timestamp}_${random1}.${extension}`;
  
  return fileName;
};

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  
  const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * bytesPerSample);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true);
  view.setUint16(32, numberOfChannels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, length * numberOfChannels * bytesPerSample, true);
  
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

// Функция конвертации бемолей в диезы
const convertFlatToSharp = (noteName: string): string => {
  const flatToSharpMap: { [key: string]: string } = {
    'Bb': 'A#',
    'Db': 'C#',
    'Eb': 'D#',
    'Gb': 'F#',
    'Ab': 'G#'
  };
  
  return flatToSharpMap[noteName] || noteName;
};

// Обновленная функция импорта с поддержкой разделения треков
export const importMidi = async (file: File): Promise<{ sequences: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const midi = new Midi(arrayBuffer);
        
        const sequences: string[] = [];
        
        // Берём только треки, содержащие ноты
        const tracks = midi.tracks.filter(t => t.notes.length > 0);
        if (tracks.length === 0) {
          throw new Error('MIDI файл не содержит нот');
        }
        
        tracks.forEach((track, trackIndex) => {
          // Сортируем ноты по времени начала
          const sortedNotes = [...track.notes].sort((a, b) => a.time - b.time);
          
          // Жадное разбиение трека на монофонические голоса (минимальное число голосов без перекрытий)
          type Voice = { notes: any[]; lastEnd: number };
          const voices: Voice[] = [];
          const EPS = 1e-6;
          
          for (const n of sortedNotes) {
            let placed = false;
            for (const v of voices) {
              if (n.time >= v.lastEnd - EPS) {
                v.notes.push(n);
                v.lastEnd = Math.max(v.lastEnd, n.time + n.duration);
                placed = true;
                break;
              }
            }
            if (!placed) {
              voices.push({ notes: [n], lastEnd: n.time + n.duration });
            }
          }
          
          // Формируем последовательность для каждого голоса с учётом пауз между событиями
          voices.forEach((voice, vIndex) => {
            let seq = '';
            let currentTimeSec = 0;
            const voiceNotes = [...voice.notes].sort((a, b) => a.time - b.time);
            
            for (const note of voiceNotes) {
              // Добавляем паузу перед нотой, если есть разрыв
              const gapSec = note.time - currentTimeSec;
              if (gapSec > EPS) {
                const gapMs = Math.max(1, Math.round(gapSec * 1000));
                seq += gapMs !== 1000 ? `P(${gapMs})` : 'P';
                currentTimeSec += gapSec;
              }
              
              const durationMs = Math.max(1, Math.round(note.duration * 1000));
              const nameNoOct = note.name.replace(/\d/g, '');
              const octave = parseInt((note.name.match(/\d+/)?.[0] || '4'), 10);
              const convertedName = convertFlatToSharp(nameNoOct);
              
              let text = convertedName;
              if (octave !== 4) text += octave;
              if (durationMs !== 1000) text += `(${durationMs})`;
              seq += text;
              
              currentTimeSec = Math.max(currentTimeSec, note.time + note.duration);
            }
            
            if (seq.trim()) {
              sequences.push(seq);
              console.log(`MIDI: Трек ${trackIndex + 1}, голос ${vIndex + 1} → ${voiceNotes.length} нот, последовательность: ${seq.substring(0, 50)}...`);
            }
          });
        });
        
        resolve({ sequences });
      } catch (error) {
        reject(new Error('Ошибка при чтении MIDI файла: ' + error));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Ошибка при чтении файла'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Функция импорта XML/MXL с разбиением на голоса и учётом <divisions>
export const importXml = async (file: File): Promise<{ sequences: string[] }> => {
  return new Promise(async (resolve, reject) => {
    try {
      let xmlContent: string;
      
      if (file.name.toLowerCase().endsWith('.mxl')) {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(file);
        let musicXmlFile = zipContents.file('score.xml') || 
                          zipContents.file('musicxml.xml') ||
                          Object.values(zipContents.files).find(f => f.name.endsWith('.xml') && !f.dir);
        if (!musicXmlFile) throw new Error('No MusicXML file found in MXL archive');
        xmlContent = await musicXmlFile.async('text');
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          xmlContent = event.target?.result as string;
          processXmlContent();
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsText(file);
        return;
      }
      
      processXmlContent();
      
      function processXmlContent() {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
          const parseError = xmlDoc.querySelector('parsererror');
          if (parseError) throw new Error('Некорректный XML файл');
          
          const sequences: string[] = [];
          const parts = xmlDoc.querySelectorAll('part');
          if (parts.length === 0) throw new Error('XML файл не содержит музыкальных партий');
          
          parts.forEach((part, partIndex) => {
            // Голоса внутри партии: voiceNumber -> sequenceText
            const voiceSequences = new Map<string, string>();
            let currentDivisions = 1; // по умолчанию четверть = 1 единица
            
            const measures = part.querySelectorAll('measure');
            measures.forEach((measure) => {
              const divisionsEl = measure.querySelector('attributes > divisions');
              if (divisionsEl) {
                const d = parseInt(divisionsEl.textContent || '1', 10);
                if (d > 0) currentDivisions = d;
              }
              
              const notes = measure.querySelectorAll('note');
              notes.forEach((noteEl) => {
                const voice = (noteEl.querySelector('voice')?.textContent || '1').trim();
                const isRest = !!noteEl.querySelector('rest');
                const durationDiv = parseInt(noteEl.querySelector('duration')?.textContent || '0', 10);
                const ms = durationDiv > 0 && currentDivisions > 0
                  ? Math.max(1, Math.round((durationDiv / currentDivisions) * 1000))
                  : 1000;
                
                let seq = voiceSequences.get(voice) || '';
                if (isRest) {
                  seq += ms !== 1000 ? `P(${ms})` : 'P';
                } else {
                  const pitch = noteEl.querySelector('pitch');
                  if (pitch) {
                    const step = pitch.querySelector('step')?.textContent || 'C';
                    const octave = parseInt(pitch.querySelector('octave')?.textContent || '4', 10);
                    const alterStr = pitch.querySelector('alter')?.textContent;
                    let noteName = step;
                    if (alterStr) {
                      const alter = parseInt(alterStr, 10);
                      if (alter === 1) noteName += '#';
                      else if (alter === -1) noteName += 'b';
                    }
                    const converted = convertFlatToSharp(noteName);
                    let text = converted;
                    if (octave !== 4) text += octave;
                    if (ms !== 1000) text += `(${ms})`;
                    seq += text;
                  }
                }
                voiceSequences.set(voice, seq);
              });
            });
            
            // Добавляем все голоса этой партии как отдельные последовательности
            Array.from(voiceSequences.entries()).sort((a,b) => parseInt(a[0]) - parseInt(b[0]))
              .forEach(([voiceNo, seq]) => {
                if (seq.trim()) {
                  sequences.push(seq);
                  console.log(`MXL: Партия ${partIndex + 1}, голос ${voiceNo} → последовательность: ${seq.substring(0, 50)}...`);
                }
              });
          });
          
          if (sequences.length === 0) throw new Error('XML файл не содержит нот');
          resolve({ sequences });
        } catch (error) {
          reject(new Error('Ошибка при чтении XML файла: ' + error));
        }
      }
    } catch (error) {
      reject(new Error('Ошибка обработки MXL файла: ' + error));
    }
  });
};