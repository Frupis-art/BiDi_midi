import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

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
  isComment?: boolean;
}

// Обновленные регулярные выражения для миллисекунд (без поддержки бемолей)
const NOTE_REGEX = /^([cdefgabCDEFGAB])(#)?(\d)?(\(([\d.]+)\))?$/;
const PAUSE_REGEX = /^[pP](\(([\d.]+)\))?$/;
// Обновленное регулярное выражение для комментариев с поддержкой переносов строк
const COMMENT_REGEX = /^\/\/[\s\S]*\/\/$/;

export const parseNoteSequence = (sequence: string, t: (key: string) => string): ParsedNote[] => {
  const notes: ParsedNote[] = [];
  let currentTime = 0;
  
  // Новая логика разбиения строки на элементы с поддержкой многострочных комментариев
  const elements = [];
  let i = 0;
  
  while (i < sequence.length) {
    // Пропускаем пробелы (но НЕ переносы строк, если мы не в комментарии)
    while (i < sequence.length && /[ \t]/.test(sequence[i])) {
      i++;
    }
    
    if (i >= sequence.length) break;
    
    // Проверяем, начинается ли комментарий
    if (sequence[i] === '/' && sequence[i + 1] === '/') {
      // Ищем конец комментария
      let commentEnd = i + 2;
      while (commentEnd < sequence.length - 1) {
        if (sequence[commentEnd] === '/' && sequence[commentEnd + 1] === '/') {
          commentEnd += 2;
          break;
        }
        commentEnd++;
      }
      
      const comment = sequence.substring(i, commentEnd);
      elements.push(comment);
      console.log('Found comment:', comment); // Для отладки
      i = commentEnd;
    } else {
      // Пропускаем переносы строк вне комментариев
      if (sequence[i] === '\n' || sequence[i] === '\r') {
        i++;
        continue;
      }
      
      // Обычная нота или пауза
      let elementStart = i;
      
      // Читаем букву ноты или P для паузы
      if (/[cdefgabpCDEFGABP]/.test(sequence[i])) {
        i++;
        
        // Читаем только диез (бемоль убрали)
        if (i < sequence.length && sequence[i] === '#') {
          i++;
        }
        
        // Читаем октаву
        if (i < sequence.length && /\d/.test(sequence[i])) {
          i++;
        }
        
        // Читаем длительность в скобках
        if (i < sequence.length && sequence[i] === '(') {
          i++; // пропускаем открывающую скобку
          while (i < sequence.length && sequence[i] !== ')') {
            i++;
          }
          if (i < sequence.length && sequence[i] === ')') {
            i++; // пропускаем закрывающую скобку
          }
        }
        
        const element = sequence.substring(elementStart, i);
        if (element.trim()) {
          elements.push(element.trim());
        }
      } else {
        // Неизвестный символ - пропускаем
        i++;
      }
    }
  }
  
  console.log('Parsed elements:', elements); // Для отладки
  
  elements.forEach((element, index) => {
    const originalText = element;
    let parsedNote: ParsedNote = {
      duration: 1000, // Дефолтная длительность 1000мс
      isPause: false,
      startTime: currentTime,
      endTime: currentTime + 1000,
      originalText,
      isError: false,
      isComment: false
    };

    console.log('Processing element:', element); // Для отладки

    // Проверяем комментарий ПЕРВЫМ
    if (COMMENT_REGEX.test(element)) {
      console.log('Found comment:', element); // Для отладки
      parsedNote.isComment = true;
      parsedNote.duration = 0; // Комментарии не занимают времени
      parsedNote.endTime = currentTime;
    }
    // Проверяем паузу
    else {
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
    }

    notes.push(parsedNote);
    
    // Комментарии не влияют на время
    if (!parsedNote.isComment) {
      currentTime = parsedNote.endTime;
    }
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

export const playSequence = async (notes: ParsedNote[], speed: number = 1, instrument: string = 'piano') => {
  await initializeAudio(instrument);
  
  // Создаем новый инструмент для этой последовательности
  const synth = createInstrument(instrument);
  synthInstances.push(synth);

  let currentTime = 0;
  
  notes.forEach((note) => {
    // Пропускаем комментарии при воспроизведении
    if (!note.isPause && !note.isError && !note.isComment && note.note && note.octave !== undefined) {
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
    
    // Комментарии не влияют на время воспроизведения
    if (!note.isComment) {
      currentTime += note.duration / speed;
    }
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

// Обновленная функция экспорта с поддержкой двух последовательностей (комментарии игнорируются)
export const exportMidi = async (
  notes1: ParsedNote[], 
  notes2: ParsedNote[], 
  speed: number = 1, 
  options?: { format: 'midi' | 'mp3' }
) => {
  const midi = new Midi();
  
  // Создаем первый трек для первой последовательности (игнорируем комментарии)
  const validNotes1 = notes1.filter(note => !note.isError && !note.isPause && !note.isComment);
  if (validNotes1.length > 0) {
    const track1 = midi.addTrack();
    track1.name = "Sequence 1";
    track1.channel = 0;

    let currentTime1 = 0;
    notes1.forEach((note) => {
      if (!note.isPause && !note.isError && !note.isComment && note.note && note.octave !== undefined) {
        const noteName = `${note.note}${note.octave}`;
        const adjustedDuration = (note.duration / 1000) / speed;
        track1.addNote({
          midi: Tone.Frequency(noteName).toMidi(),
          time: currentTime1 / 1000,
          duration: adjustedDuration
        });
      }
      // Комментарии не влияют на время в MIDI
      if (!note.isComment) {
        currentTime1 += note.duration / speed;
      }
    });
  }

  // Создаем второй трек для второй последовательности (игнорируем комментарии)
  const validNotes2 = notes2.filter(note => !note.isError && !note.isPause && !note.isComment);
  if (validNotes2.length > 0) {
    const track2 = midi.addTrack();
    track2.name = "Sequence 2";
    track2.channel = 1;

    let currentTime2 = 0;
    notes2.forEach((note) => {
      if (!note.isPause && !note.isError && !note.isComment && note.note && note.octave !== undefined) {
        const noteName = `${note.note}${note.octave}`;
        const adjustedDuration = (note.duration / 1000) / speed;
        track2.addNote({
          midi: Tone.Frequency(noteName).toMidi(),
          time: currentTime2 / 1000,
          duration: adjustedDuration
        });
      }
      // Комментарии не влияют на время в MIDI
      if (!note.isComment) {
        currentTime2 += note.duration / speed;
      }
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

// Обновленная функция конвертации в MP3 с поддержкой двух последовательностей (комментарии игнорируются)
const convertToMp3 = async (notes1: ParsedNote[], notes2: ParsedNote[], speed: number) => {
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  
  // Вычисляем общую длительность (игнорируем комментарии)
  let totalDuration1 = 0;
  notes1.forEach(note => {
    if (!note.isComment) {
      totalDuration1 += (note.duration / 1000) / speed;
    }
  });
  
  let totalDuration2 = 0;
  notes2.forEach(note => {
    if (!note.isComment) {
      totalDuration2 += (note.duration / 1000) / speed;
    }
  });
  
  const totalDuration = Math.max(totalDuration1, totalDuration2);
  const bufferLength = Math.ceil(totalDuration * sampleRate);
  const audioBuffer = audioContext.createBuffer(2, bufferLength, sampleRate); // Стерео
  
  // Первая последовательность в левый канал (игнорируем комментарии)
  const leftChannel = audioBuffer.getChannelData(0);
  let currentTime1 = 0;
  for (const note of notes1) {
    if (!note.isPause && !note.isError && !note.isComment && note.note && note.octave !== undefined) {
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
    // Комментарии не влияют на время
    if (!note.isComment) {
      currentTime1 += note.duration / speed;
    }
  }
  
  // Вторая последовательность в правый канал (игнорируем комментарии)
  const rightChannel = audioBuffer.getChannelData(1);
  let currentTime2 = 0;
  for (const note of notes2) {
    if (!note.isPause && !note.isError && !note.isComment && note.note && note.octave !== undefined) {
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
    // Комментарии не влияют на время
    if (!note.isComment) {
      currentTime2 += note.duration / speed;
    }
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

// Обновленная функция импорта с поддержкой разделения треков и пауз
export const importMidi = async (file: File): Promise<{ sequence1: string, sequence2: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const midi = new Midi(arrayBuffer);
        
        let sequence1 = '';
        let sequence2 = '';
        
        // Ищем треки с нотами
        const tracksWithNotes = midi.tracks.filter(t => t.notes.length > 0);
        
        if (tracksWithNotes.length === 0) {
          throw new Error('MIDI файл не содержит нот');
        }
        
        // Функция для конвертации трека в последовательность с паузами
        const convertTrackToSequence = (track: any): string => {
          // Сортируем ноты по времени начала
          const sortedNotes = [...track.notes].sort((a, b) => a.time - b.time);
          let sequence = '';
          let currentTime = 0;
          
          sortedNotes.forEach((note, index) => {
            const noteStartTime = note.time;
            const noteDuration = note.duration;
            
            // Если есть пауза перед нотой
            if (noteStartTime > currentTime) {
              const pauseDuration = Math.round((noteStartTime - currentTime) * 1000);
              if (pauseDuration > 0) {
                if (pauseDuration === 1000) {
                  sequence += 'P';
                } else {
                  sequence += `P(${pauseDuration})`;
                }
              }
            }
            
            // Добавляем ноту
            const noteName = note.name.replace(/(\d)/, '');
            const octave = parseInt(note.name.match(/\d/)?.[0] || '4');
            const duration = Math.round(noteDuration * 1000);
            
            let noteText = noteName;
            if (octave !== 4) noteText += octave;
            if (duration !== 1000) noteText += `(${duration})`;
            
            sequence += noteText;
            
            // Обновляем текущее время
            currentTime = noteStartTime + noteDuration;
          });
          
          return sequence;
        };
        
        // Первый трек идет в первую последовательность
        if (tracksWithNotes[0]) {
          sequence1 = convertTrackToSequence(tracksWithNotes[0]);
        }
        
        // Второй трек (если есть) идет во вторую последовательность
        if (tracksWithNotes[1]) {
          sequence2 = convertTrackToSequence(tracksWithNotes[1]);
        }
        
        resolve({ sequence1, sequence2 });
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