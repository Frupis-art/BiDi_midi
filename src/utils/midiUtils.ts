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

// Обновленные регулярные выражения для упрощенного формата (регистронезависимые)
const NOTE_REGEX = /^([cdefgabCDEFGAB])(#|b)?(\d)?(\(([\d.]+)\))?$/;
const PAUSE_REGEX = /^[pP](\(([\d.]+)\))?$/;

export const parseNoteSequence = (sequence: string): ParsedNote[] => {
  const notes: ParsedNote[] = [];
  let currentTime = 0;
  
  // Разбиваем последовательность на отдельные элементы (без запятых)
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
      // Начинается новая нота или пауза
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
      duration: 1, // Дефолтная длительность 1
      isPause: false,
      startTime: currentTime,
      endTime: currentTime + 1,
      originalText,
      isError: false
    };

    // Проверяем паузу
    const pauseMatch = element.match(PAUSE_REGEX);
    if (pauseMatch) {
      const durationStr = pauseMatch[2];
      const duration = durationStr ? parseFloat(durationStr) : 1; // Дефолт 1
      
      if (durationStr && (isNaN(duration) || duration <= 0)) {
        parsedNote.isError = true;
        parsedNote.errorMessage = `Неверная длительность паузы: ${durationStr}`;
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
        const duration = durationStr ? parseFloat(durationStr) : 1; // Дефолтная длительность 1

        // Проверяем октаву - только диапазон 0-8
        if (octave < 0 || octave > 8) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `Неверная октава: ${octave}. Диапазон: 0-8`;
        }
        // Проверяем длительность
        else if (durationStr && (isNaN(duration) || duration <= 0)) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `Неверная длительность: ${durationStr}`;
        } else {
          parsedNote.note = noteName.toUpperCase() + (accidental || '');
          parsedNote.octave = octave;
          parsedNote.duration = duration;
          parsedNote.endTime = currentTime + duration;
        }
      } else {
        parsedNote.isError = true;
        parsedNote.errorMessage = `Неверный формат: ${element}`;
      }
    }

    notes.push(parsedNote);
    currentTime = parsedNote.endTime;
  });

  return notes;
};

let synth: Tone.Synth | null = null;
let activeNotes: string[] = [];
let scheduledEvents: number[] = []; // Добавляем массив для отслеживания запланированных событий

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

  // Останавливаем все активные ноты и очищаем очередь
  stopSequence();

  let currentTime = Tone.now();
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      const adjustedDuration = note.duration / speed;
      
      // Планируем воспроизведение и сохраняем ID события
      const eventId = Tone.Transport.schedule((time) => {
        synth!.triggerAttackRelease(noteName, adjustedDuration, time);
      }, currentTime);
      
      scheduledEvents.push(eventId);
      activeNotes.push(noteName);
    }
    currentTime += note.duration / speed;
  });
};

export const stopSequence = () => {
  if (synth) {
    // Останавливаем синтезатор принудительно
    synth.triggerRelease();
    activeNotes = [];
  }
  
  // Очищаем все запланированные события
  scheduledEvents.forEach(eventId => {
    Tone.Transport.clear(eventId);
  });
  scheduledEvents = [];
  
  // Останавливаем транспорт если он запущен
  if (Tone.Transport.state === 'started') {
    Tone.Transport.stop();
  }
};

export const exportMidi = async (notes: ParsedNote[], speed: number = 1, useMobileShare: boolean = false) => {
  const midi = new Midi();
  const track = midi.addTrack();

  let currentTime = 0;
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      const adjustedDuration = note.duration / speed;
      track.addNote({
        midi: Tone.Frequency(noteName).toMidi(),
        time: currentTime,
        duration: adjustedDuration
      });
    }
    currentTime += note.duration / speed;
  });

  // Создаем файл
  const midiArray = midi.toArray();
  const blob = new Blob([midiArray], { type: 'audio/midi' });
  
  if (useMobileShare && 'share' in navigator) {
    // Используем Web Share API для мобильных устройств
    try {
      const file = new File([blob], 'sequence.mid', { type: 'audio/midi' });
      await navigator.share({
        files: [file],
        title: 'MIDI Sequence',
        text: 'Exported MIDI sequence'
      });
    } catch (error) {
      console.error('Share failed:', error);
      // Fallback к обычному скачиванию
      downloadMidiFile(blob);
    }
  } else {
    // Обычное скачивание
    downloadMidiFile(blob);
  }
};

const downloadMidiFile = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sequence.mid';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};
