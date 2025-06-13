import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CirclePlay, Save, Search, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Upload, Download, Share, Cloud, Music } from 'lucide-react';
import { parseNoteSequence, playSequence, stopSequence, exportMidi, importMidi } from '@/utils/midiUtils';
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
  const [sequence, setSequence] = useState('DDAABBA(2)GGF#F#EED(4)P(2)AAGGF#F#E(2)AAGGF#F#E(2)P(1.5)DDAABBA(2)GGF#F#EED(4)');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [lastAnalyzedSequence, setLastAnalyzedSequence] = useState('');
  const [lastManualSequence, setLastManualSequence] = useState('');
  const [speed, setSpeed] = useState([1]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsAnalysis = sequence !== lastAnalyzedSequence && sequence !== lastManualSequence;

  const handleSequenceChange = (value: string) => {
    setSequence(value);
    setLastManualSequence(value);
  };

  const handleAnalyze = () => {
    try {
      const notes = parseNoteSequence(sequence);
      setParsedNotes(notes);
      
      const hasErrors = notes.some(note => note.isError);
      setHasValidSequence(!hasErrors);
      setHasAnalyzed(true);
      setLastAnalyzedSequence(sequence);
      
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

  const transposeNote = (note: string, octave: number, semitones: number): { note: string, octave: number } => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    
    let normalizedNote = note;
    if (note.includes('b')) {
      const flatNote = note.slice(0, 2);
      if (flatNote in flatToSharp) {
        normalizedNote = flatToSharp[flatNote as keyof typeof flatToSharp];
      }
    }
    
    const noteIndex = notes.indexOf(normalizedNote);
    if (noteIndex === -1) return { note, octave };
    
    // Вычисляем новый индекс ноты и октаву
    let newNoteIndex = noteIndex + semitones;
    let newOctave = octave;
    
    // Обрабатываем переход через границы октав
    while (newNoteIndex < 0) {
      newNoteIndex += 12;
      newOctave--;
    }
    while (newNoteIndex >= 12) {
      newNoteIndex -= 12;
      newOctave++;
    }
    
    // Ограничиваем октавы диапазоном 0-8
    if (newOctave < 0) newOctave = 0;
    if (newOctave > 8) newOctave = 8;
    
    return {
      note: notes[newNoteIndex],
      octave: newOctave
    };
  };

  const transposeSequence = (semitones: number) => {
    if (!hasValidSequence) {
      toast.error('Сначала выполните анализ последовательности');
      return;
    }

    let newSequence = '';
    
    for (const note of parsedNotes) {
      if (note.isPause || note.isError) {
        newSequence += note.originalText;
      } else if (note.note && note.octave !== undefined) {
        const { note: newNote, octave: newOctave } = transposeNote(note.note, note.octave, semitones);
        
        let noteText = newNote;
        if (newOctave !== 4) noteText += newOctave;
        if (note.duration !== 1) noteText += `(${note.duration})`;
        
        newSequence += noteText;
      }
    }
    
    setSequence(newSequence);
    setLastAnalyzedSequence(newSequence);
    
    const newNotes = parseNoteSequence(newSequence);
    setParsedNotes(newNotes);
    
    toast.success(`Транспонирование на ${semitones > 0 ? '+' : ''}${semitones} полутонов выполнено`);
  };

  const adjustTiming = (adjustment: number) => {
    if (!hasAnalyzed || parsedNotes.length === 0) {
      // Если нет анализа, работаем с текстом напрямую
      adjustTimingInText(adjustment);
    } else {
      // Если есть анализ, работаем с parsedNotes
      adjustTimingInParsedNotes(adjustment);
    }
  };

  const adjustTimingInText = (adjustment: number) => {
    // Разбираем последовательность на элементы
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

    // Обрабатываем каждый элемент
    const adjustedElements = elements.map(element => {
      const durationMatch = element.match(/\(([\d.]+)\)$/);
      
      if (durationMatch) {
        // У элемента уже есть время в скобках
        const currentDuration = parseFloat(durationMatch[1]);
        const newDuration = Math.round((currentDuration + adjustment) * 10) / 10;
        const finalDuration = Math.max(0.1, newDuration);
        return element.replace(/\(([\d.]+)\)$/, `(${finalDuration})`);
      } else {
        // У элемента нет времени в скобках, считаем что время = 1
        const newDuration = Math.round((1 + adjustment) * 10) / 10;
        const finalDuration = Math.max(0.1, newDuration);
        if (finalDuration !== 1) {
          return element + `(${finalDuration})`;
        }
        return element;
      }
    });
    
    const adjustedSequence = adjustedElements.join('');
    setSequence(adjustedSequence);
    setLastManualSequence(adjustedSequence);
    
    const action = adjustment > 0 ? 'увеличено' : 'уменьшено';
    toast.success(`Время всех нот ${action} на ${Math.abs(adjustment)}с`);
  };

  const adjustTimingInParsedNotes = (adjustment: number) => {
    let newSequence = '';
    
    for (const note of parsedNotes) {
      if (note.isError) {
        newSequence += note.originalText;
      } else {
        const newDuration = Math.round((note.duration + adjustment) * 10) / 10;
        const finalDuration = Math.max(0.1, newDuration);
        
        if (note.isPause) {
          newSequence += 'P';
          if (finalDuration !== 1) {
            newSequence += `(${finalDuration})`;
          }
        } else if (note.note && note.octave !== undefined) {
          let noteText = note.note;
          if (note.octave !== 4) noteText += note.octave;
          if (finalDuration !== 1) noteText += `(${finalDuration})`;
          newSequence += noteText;
        }
      }
    }
    
    setSequence(newSequence);
    setLastAnalyzedSequence(newSequence);
    setLastManualSequence(newSequence);
    
    const newNotes = parseNoteSequence(newSequence);
    setParsedNotes(newNotes);
    
    const action = adjustment > 0 ? 'увеличено' : 'уменьшено';
    toast.success(`Время всех нот ${action} на ${Math.abs(adjustment)}с`);
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
    
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
  };

  const handleSaveOption = async (format: 'midi' | 'mp3') => {
    if (!hasValidSequence) {
      toast.error('Сначала выполните успешный анализ последовательности');
      return;
    }

    try {
      await exportMidi(parsedNotes, speed[0], { format });
      
      const messages = {
        midi: 'MIDI файл сохранен',
        mp3: 'Аудио файл сохранен'
      };
      
      toast.success(messages[format]);
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Ошибка при сохранении файла');
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      toast.error('Пожалуйста, выберите MIDI файл (.mid или .midi)');
      return;
    }

    try {
      const importedSequence = await importMidi(file);
      setSequence(importedSequence);
      setHasValidSequence(false);
      setHasAnalyzed(false);
      setParsedNotes([]);
      setLastAnalyzedSequence('');
      setLastManualSequence(importedSequence);
      toast.success('MIDI файл успешно импортирован');
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Ошибка при импорте файла: ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      stopPlayback();
    };
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">BiDi MIDI</CardTitle>
          <p className="text-sm text-muted-foreground text-center">
            Упрощенный формат: CA3B4(1)G#PD(0.5) - ноты C,D,E,F,G,A,B, # - диез, октава по умолчанию 4, P - пауза, время по умолчанию 1с
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="sequence" className="text-sm font-medium">
                Последовательность нот:
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mid,.midi"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Открыть MIDI
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  onClick={() => transposeSequence(1)}
                  disabled={!hasValidSequence}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Транспонировать на полутон вверх"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => transposeSequence(-1)}
                  disabled={!hasValidSequence}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Транспонировать на полутон вниз"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => adjustTiming(-0.1)}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Уменьшить время всех нот на 0.1с"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => adjustTiming(0.1)}
                  className="w-8 h-8 p-0"
                  variant="outline"
                  title="Увеличить время всех нот на 0.1с"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                id="sequence"
                value={sequence}
                onChange={(e) => handleSequenceChange(e.target.value)}
                placeholder="Введите последовательность нот..."
                className="min-h-24 font-mono flex-1"
              />
            </div>
          </div>

          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-2">Предварительный просмотр:</p>
            <div className="font-mono text-sm whitespace-nowrap overflow-x-auto max-w-full break-all">
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
              disabled={!hasValidSequence || needsAnalysis}
              className="flex items-center justify-center w-12 h-12 rounded-full p-0"
              variant={isPlaying ? "destructive" : "default"}
            >
              <CirclePlay className="w-5 h-5" />
            </Button>

            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button
                  disabled={!hasValidSequence || needsAnalysis}
                  className="flex items-center justify-center w-12 h-12 rounded-full p-0"
                  variant="outline"
                >
                  <Save className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Выберите формат файла</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => handleSaveOption('midi')}
                    className="flex flex-col items-center gap-2 h-20"
                    variant="outline"
                  >
                    <Download className="w-6 h-6" />
                    <span className="text-sm">MIDI файл</span>
                  </Button>
                  <Button
                    onClick={() => handleSaveOption('mp3')}
                    className="flex flex-col items-center gap-2 h-20"
                    variant="outline"
                  >
                    <Music className="w-6 h-6" />
                    <span className="text-sm">Аудио файл</span>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {needsAnalysis && hasAnalyzed && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 font-medium">
                Последовательность изменена. Требуется повторный анализ.
              </p>
            </div>
          )}

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