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

let synth: Tone.Synth | null = null;
let activeNotes: string[] = [];
let scheduledEvents: NodeJS.Timeout[] = [];

export const initializeAudio = async () => {
  if (!synth) {
    synth = new Tone.Synth().toDestination();
  }
  
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
};

export const playSequence = async (notes: ParsedNote[], speed: number = 1) => {
  await initializeAudio();
  
  if (!synth) return;

  stopSequence();

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
  if (synth) {
    synth.triggerRelease();
    activeNotes = [];
  }
  
  scheduledEvents.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  scheduledEvents = [];
};

export const exportMidi = async (notes: ParsedNote[], speed: number = 1, options?: { format: 'midi' | 'mp3' }) => {
  const midi = new Midi();
  const track = midi.addTrack();

  let currentTime = 0;
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      const adjustedDuration = (note.duration / 1000) / speed; // Конвертируем мс в секунды
      track.addNote({
        midi: Tone.Frequency(noteName).toMidi(),
        time: currentTime / 1000, // Конвертируем мс в секунды
        duration: adjustedDuration
      });
    }
    currentTime += note.duration / speed;
  });

  if (options?.format === 'mp3') {
    await convertToMp3(notes, speed);
  } else {
    const midiArray = midi.toArray();
    const midiBlob = new Blob([midiArray], { type: 'audio/midi' });
    
    // Проверяем, мобильная ли платформа
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && 'share' in navigator) {
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
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

const convertToMp3 = async (notes: ParsedNote[], speed: number) => {
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  
  let totalDuration = 0;
  notes.forEach(note => {
    totalDuration += (note.duration / 1000) / speed; // Конвертируем мс в секунды
  });
  
  const bufferLength = Math.ceil(totalDuration * sampleRate);
  const audioBuffer = audioContext.createBuffer(1, bufferLength, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  let currentTime = 0;
  for (const note of notes) {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const frequency = Tone.Frequency(`${note.note}${note.octave}`).toFrequency();
      const noteDuration = (note.duration / 1000) / speed; // Конвертируем мс в секунды
      const startSample = Math.floor((currentTime / 1000) * sampleRate);
      const endSample = Math.floor(((currentTime / 1000) + noteDuration) * sampleRate);
      
      for (let i = startSample; i < endSample && i < bufferLength; i++) {
        const t = (i - startSample) / sampleRate;
        const envelope = Math.exp(-t * 2);
        channelData[i] += Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }
    }
    currentTime += note.duration / speed;
  }
  
  const wavBlob = audioBufferToWav(audioBuffer);
  
  // Проверяем, мобильная ли платформа
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile && 'share' in navigator) {
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
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
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

export const importMidi = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const midi = new Midi(arrayBuffer);
        
        let sequence = '';
        
        const track = midi.tracks.find(t => t.notes.length > 0);
        if (!track) {
          throw new Error('MIDI файл не содержит нот');
        }
        
        track.notes.forEach((note, index) => {
          const noteName = note.name.replace(/(\d)/, '');
          const octave = parseInt(note.name.match(/\d/)?.[0] || '4');
          const duration = Math.round(note.duration * 1000); // Конвертируем в миллисекунды
          
          let noteText = noteName;
          if (octave !== 4) noteText += octave;
          if (duration !== 1000) noteText += `(${duration})`;
          
          sequence += noteText;
        });
        
        resolve(sequence);
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
