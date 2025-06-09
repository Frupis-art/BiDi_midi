
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, Save } from 'lucide-react';
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
  const [sequence, setSequence] = useState('C4(1), D4(0.5), E4(0.5), F4(1), P(0.5), G4(2)');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [hasPlayedSuccessfully, setHasPlayedSuccessfully] = useState(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const validateAndParseSequence = () => {
    try {
      const notes = parseNoteSequence(sequence);
      setParsedNotes(notes);
      
      const hasErrors = notes.some(note => note.isError);
      setHasValidSequence(!hasErrors);
      
      if (hasErrors) {
        toast.error('Обнаружены ошибки в последовательности нот');
      } else {
        toast.success('Последовательность успешно проанализирована');
      }
    } catch (error) {
      console.error('Parse error:', error);
      setParsedNotes([]);
      setHasValidSequence(false);
      toast.error('Ошибка при анализе последовательности');
    }
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!hasValidSequence) {
      validateAndParseSequence();
      return;
    }

    try {
      setIsPlaying(true);
      setCurrentNoteIndex(-1);
      
      await playSequence(parsedNotes);
      
      // Визуальное выделение нот во время воспроизведения
      let currentTime = 0;
      timeoutRefs.current = [];
      
      parsedNotes.forEach((note, index) => {
        const startTimeout = setTimeout(() => {
          setCurrentNoteIndex(index);
        }, currentTime * 1000);
        
        const endTimeout = setTimeout(() => {
          if (index === parsedNotes.length - 1) {
            setCurrentNoteIndex(-1);
            setIsPlaying(false);
            setHasPlayedSuccessfully(true);
            toast.success('Воспроизведение завершено');
          }
        }, (currentTime + note.duration) * 1000);
        
        timeoutRefs.current.push(startTimeout, endTimeout);
        currentTime += note.duration;
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
    if (!hasPlayedSuccessfully || !hasValidSequence) {
      toast.error('Сначала успешно воспроизведите последовательность');
      return;
    }

    try {
      await exportMidi(parsedNotes);
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

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">MIDI Секвенсор</CardTitle>
          <p className="text-sm text-muted-foreground text-center">
            Формат ввода: C4(1), D#5(0.5), P(1) - где C,D,E,F,G,A,B - ноты, # - диез, 4,5 - октавы (0-8), P - пауза, (1) - длительность
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="sequence" className="text-sm font-medium">
              Последовательность нот:
            </label>
            <Textarea
              id="sequence"
              value={sequence}
              onChange={(e) => {
                setSequence(e.target.value);
                setHasValidSequence(false);
                setHasPlayedSuccessfully(false);
              }}
              placeholder="Введите последовательность нот..."
              className="min-h-24 font-mono"
            />
          </div>

          {parsedNotes.length > 0 && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-2">Предварительный просмотр:</p>
              <div className="font-mono text-sm whitespace-pre-wrap">
                {renderSequenceWithHighlights()}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handlePlay}
              className="flex items-center gap-2"
              variant={isPlaying ? "destructive" : "default"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Стоп' : 'Плей'}
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasPlayedSuccessfully}
              className="flex items-center gap-2"
              variant="outline"
            >
              <Save className="w-4 h-4" />
              Сохранить
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
