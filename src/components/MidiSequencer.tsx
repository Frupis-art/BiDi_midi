
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { CirclePlay, Save, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { parseNoteSequence, playSequence, stopSequence, exportMidi } from '@/utils/midiUtils';
import { toast } from 'sonner';

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

const MidiSequencer = () => {
  const [sequence, setSequence] = useState('CA3B4(1)G#PD(0.5)');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [speed, setSpeed] = useState([1]);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const handleAnalyze = () => {
    try {
      const notes = parseNoteSequence(sequence);
      setParsedNotes(notes);
      
      const hasErrors = notes.some(note => note.isError);
      setHasValidSequence(!hasErrors);
      setHasAnalyzed(true);
      
      if (hasErrors) {
        toast.error('Обнаружены ошибки в последовательности нот');
      } else {
        toast.success('Последовательность успешно проанализирована');
      }
    } catch (error) {
      console.error('Parse error:', error);
      setParsedNotes([]);
      setHasValidSequence(false);
      setHasAnalyzed(false);
      toast.error('Ошибка при анализе последовательности');
    }
  };

  const transposeNote = (note: string, semitones: number): string => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    
    // Преобразуем бемоли в диезы
    let normalizedNote = note;
    if (note.includes('b')) {
      const flatNote = note.slice(0, 2);
      if (flatNote in flatToSharp) {
        normalizedNote = flatToSharp[flatNote as keyof typeof flatToSharp];
      }
    }
    
    const noteIndex = notes.indexOf(normalizedNote);
    if (noteIndex === -1) return note;
    
    const newIndex = (noteIndex + semitones + 12) % 12;
    return notes[newIndex];
  };

  const transposeSequence = (semitones: number) => {
    if (!hasAnalyzed) {
      toast.error('Сначала выполните анализ последовательности');
      return;
    }

    let newSequence = '';
    let currentIndex = 0;
    
    for (const note of parsedNotes) {
      if (note.isPause || note.isError) {
        newSequence += note.originalText;
      } else if (note.note && note.octave !== undefined) {
        const transposedNote = transposeNote(note.note, semitones);
        let newOctave = note.octave;
        
        // Проверяем переход через границы октав
        if (semitones > 0 && note.note === 'G#' && transposedNote === 'A') {
          newOctave = Math.min(8, newOctave + 1);
        } else if (semitones > 0 && note.note === 'A#' && transposedNote === 'B') {
          newOctave = Math.min(8, newOctave + 1);
        } else if (semitones > 0 && note.note === 'B' && transposedNote === 'C') {
          newOctave = Math.min(8, newOctave + 1);
        } else if (semitones < 0 && note.note === 'C' && transposedNote === 'B') {
          newOctave = Math.max(0, newOctave - 1);
        }
        
        // Проверяем границы октав
        if (newOctave > 8) {
          toast.error('Транспонирование превышает максимальную октаву (8)');
          return;
        } else if (newOctave < 0) {
          toast.error('Транспонирование превышает минимальную октаву (0)');
          return;
        }
        
        let noteText = transposedNote;
        if (newOctave !== 4) noteText += newOctave;
        if (note.duration !== 1) noteText += `(${note.duration})`;
        
        newSequence += noteText;
      }
      currentIndex++;
    }
    
    setSequence(newSequence);
    // Сбрасываем состояние анализа для повторного анализа
    setHasValidSequence(false);
    setHasAnalyzed(false);
    setParsedNotes([]);
    
    toast.success(`Транспонирование на ${semitones > 0 ? '+' : ''}${semitones} полутонов выполнено`);
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!hasValidSequence) {
      toast.error('Сначала выполните анализ последовательности');
      return;
    }

    try {
      setIsPlaying(true);
      setCurrentNoteIndex(-1);
      
      await playSequence(parsedNotes, speed[0]);
      
      // Визуальное выделение нот во время воспроизведения
      let currentTime = 0;
      timeoutRefs.current = [];
      
      parsedNotes.forEach((note, index) => {
        const adjustedDuration = note.duration / speed[0];
        
        const startTimeout = setTimeout(() => {
          setCurrentNoteIndex(index);
        }, currentTime * 1000);
        
        const endTimeout = setTimeout(() => {
          if (index === parsedNotes.length - 1) {
            setCurrentNoteIndex(-1);
            setIsPlaying(false);
            toast.success('Воспроизведение завершено');
          }
        }, (currentTime + adjustedDuration) * 1000);
        
        timeoutRefs.current.push(startTimeout, endTimeout);
        currentTime += adjustedDuration;
      });
      
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      setCurrentNoteIndex(-1);
      toast.error('Ошибка при воспроизведении');
    }
  };

  const stopPlayback = () => {
    stopSequence();
    setIsPlaying(false);
    setCurrentNoteIndex(-1);
    
    // Очищаем все таймауты
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
  };

  const handleSave = async () => {
    if (!hasValidSequence) {
      toast.error('Сначала выполните успешный анализ последовательности');
      return;
    }

    try {
      // Проверяем, работаем ли мы на мобильном устройстве
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile && 'share' in navigator) {
        // Используем Web Share API для мобильных устройств
        await exportMidi(parsedNotes, speed[0], true);
      } else {
        // Обычное скачивание для десктопа
        await exportMidi(parsedNotes, speed[0], false);
      }
      
      toast.success('MIDI файл сохранен');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Ошибка при сохранении файла');
    }
  };

  const renderSequenceWithHighlights = () => {
    if (parsedNotes.length === 0) {
      return sequence;
    }

    return parsedNotes.map((note, index) => {
      let className = '';
      if (note.isError) {
        className = 'bg-red-200 text-red-800';
      } else if (currentNoteIndex === index) {
        className = 'bg-green-200 text-green-800';
      }

      return (
        <span key={index} className={className} title={note.errorMessage}>
          {note.originalText}
        </span>
      );
    });
  };

  useEffect(() => {
    return () => {
      // Очистка при размонтировании компонента
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    // Сбрасываем состояние анализа при изменении последовательности
    if (hasAnalyzed) {
      setHasValidSequence(false);
      setHasAnalyzed(false);
      setParsedNotes([]);
    }
  }, [sequence]);

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">MIDI Секвенсор</CardTitle>
          <p className="text-sm text-muted-foreground text-center">
            Упрощенный формат: CA3B4(1)G#PD(0.5) - ноты C,D,E,F,G,A,B, # - диез, октава по умолчанию 4, P - пауза, время по умолчанию 1с
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="sequence" className="text-sm font-medium">
              Последовательность нот:
            </label>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  onClick={() => transposeSequence(1)}
                  disabled={!hasAnalyzed}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Транспонировать на полутон вверх"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => transposeSequence(-1)}
                  disabled={!hasAnalyzed}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Транспонировать на полутон вниз"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                id="sequence"
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                placeholder="Введите последовательность нот..."
                className="min-h-24 font-mono flex-1"
              />
            </div>
          </div>

          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-2">Предварительный просмотр:</p>
            <div className="font-mono text-sm whitespace-pre-wrap">
              {renderSequenceWithHighlights()}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Скорость воспроизведения: {speed[0]}x
            </label>
            <Slider
              value={speed}
              onValueChange={setSpeed}
              min={0.5}
              max={4}
              step={0.1}
              className="w-full"
            />
          </div>

          <div className="flex gap-3 items-center">
            <Button
              onClick={handleAnalyze}
              className="flex items-center justify-center w-12 h-12 rounded-full p-0"
              variant="outline"
            >
              <Search className="w-5 h-5" />
            </Button>

            <Button
              onClick={handlePlay}
              disabled={!hasValidSequence}
              className="flex items-center justify-center w-12 h-12 rounded-full p-0"
              variant={isPlaying ? "destructive" : "default"}
            >
              <CirclePlay className="w-5 h-5" />
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasValidSequence}
              className="flex items-center justify-center w-12 h-12 rounded-full p-0"
              variant="outline"
            >
              <Save className="w-5 h-5" />
            </Button>
          </div>

          {!hasValidSequence && parsedNotes.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800 font-medium">Найдены ошибки:</p>
              <ul className="text-sm text-red-700 mt-1 list-disc list-inside">
                {parsedNotes
                  .filter(note => note.isError)
                  .map((note, index) => (
                    <li key={index}>{note.errorMessage}</li>
                  ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MidiSequencer;
