
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

const NOTE_REGEX = /^([CDEFGAB])(#|b)?(\d)(\(([\d.]+)\))$/;
const PAUSE_REGEX = /^P(\(([\d.]+)\))$/;

export const parseNoteSequence = (sequence: string): ParsedNote[] => {
  const notes: ParsedNote[] = [];
  let currentTime = 0;
  
  // Разбиваем последовательность на отдельные элементы
  const elements = sequence.split(',').map(s => s.trim());
  
  elements.forEach((element, index) => {
    const originalText = element;
    let parsedNote: ParsedNote = {
      duration: 1,
      isPause: false,
      startTime: currentTime,
      endTime: currentTime + 1,
      originalText,
      isError: false
    };

    // Проверяем паузу
    const pauseMatch = element.match(PAUSE_REGEX);
    if (pauseMatch) {
      const duration = parseFloat(pauseMatch[2]);
      if (isNaN(duration) || duration <= 0) {
        parsedNote.isError = true;
        parsedNote.errorMessage = `Неверная длительность паузы: ${pauseMatch[2]}`;
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
        const octave = parseInt(octaveStr);
        const duration = parseFloat(durationStr);

        // Проверяем октаву
        if (octave < 0 || octave > 8) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `Неверная октава: ${octave}. Диапазон: 0-8`;
        }
        // Проверяем длительность
        else if (isNaN(duration) || duration <= 0) {
          parsedNote.isError = true;
          parsedNote.errorMessage = `Неверная длительность: ${durationStr}`;
        } else {
          parsedNote.note = noteName + (accidental || '');
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

export const initializeAudio = async () => {
  if (!synth) {
    synth = new Tone.Synth().toDestination();
  }
  
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
};

export const playSequence = async (notes: ParsedNote[]) => {
  await initializeAudio();
  
  if (!synth) return;

  let currentTime = Tone.now();
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      synth!.triggerAttackRelease(noteName, note.duration, currentTime);
    }
    currentTime += note.duration;
  });
};

export const stopSequence = () => {
  if (synth) {
    synth.triggerRelease();
  }
};

export const exportMidi = async (notes: ParsedNote[]) => {
  const midi = new Midi();
  const track = midi.addTrack();

  let currentTime = 0;
  
  notes.forEach((note) => {
    if (!note.isPause && !note.isError && note.note && note.octave !== undefined) {
      const noteName = `${note.note}${note.octave}`;
      track.addNote({
        midi: Tone.Frequency(noteName).toMidi(),
        time: currentTime,
        duration: note.duration
      });
    }
    currentTime += note.duration;
  });

  // Создаем и скачиваем файл
  const midiArray = midi.toArray();
  const blob = new Blob([midiArray], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sequence.mid';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};
