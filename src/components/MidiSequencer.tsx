import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CirclePlay, Save, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Upload, Download, Music, Globe, Trash2 } from 'lucide-react';
import { parseNoteSequence, playSequence, stopSequence, exportMidi, importMidi } from '@/utils/midiUtils';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';

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
  const { language, toggleLanguage, t } = useLanguage();
  const [sequence, setSequence] = useState('f#5e5d5c#5babc#5');
  const [sequence2, setSequence2] = useState('d3(250)a3(250)d(250)f#(250) a2(250)e3(250)a3(250)c#(250) b2(250)f#3(250)b3(250)d(250) f#2(250)c#(250)a3(250)c#(250) g2(250)d3(250)g3(250)b3(250) d2(250)a2(250)d3(250)f#3(250) g2(250)d3(250)g3(250)b3(250) a2(250)e3(250)a3(250)c#(250)');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [parsedNotes2, setParsedNotes2] = useState<ParsedNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [currentNoteIndex2, setCurrentNoteIndex2] = useState(-1);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [speed, setSpeed] = useState([1]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState('piano');
  const [selectedInstrument2, setSelectedInstrument2] = useState('piano');
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const instruments = [
    { value: 'piano', label: 'Фортепиано' },
    { value: 'clarinet', label: 'Кларнет' },
    { value: 'trumpet', label: 'Труба' },
    { value: 'flute', label: 'Флейта' },
    { value: 'cello', label: 'Виолончель' },
    { value: 'bassoon', label: 'Фагот' },
    { value: 'oboe', label: 'Гобой' },
    { value: 'violin', label: 'Скрипка' },
    { value: 'guitar', label: 'Гитара' }
  ];

  // Анализ в реальном времени для первой последовательности
  const analysisResult = useMemo(() => {
    if (!sequence.trim()) {
      return { notes: [], hasErrors: false, hasValidSequence: false };
    }

    try {
      const notes = parseNoteSequence(sequence, t);
      const hasErrors = notes.some(note => note.isError);
      return {
        notes,
        hasErrors,
        hasValidSequence: !hasErrors && notes.length > 0
      };
    } catch (error) {
      return { notes: [], hasErrors: true, hasValidSequence: false };
    }
  }, [sequence, t]);

  // Анализ в реальном времени для второй последовательности
  const analysisResult2 = useMemo(() => {
    if (!sequence2.trim()) {
      return { notes: [], hasErrors: false, hasValidSequence: false };
    }

    try {
      const notes = parseNoteSequence(sequence2, t);
      const hasErrors = notes.some(note => note.isError);
      return {
        notes,
        hasErrors,
        hasValidSequence: !hasErrors && notes.length > 0
      };
    } catch (error) {
      return { notes: [], hasErrors: true, hasValidSequence: false };
    }
  }, [sequence2, t]);

  // Обновляем состояние при изменении результата анализа
  useEffect(() => {
    setParsedNotes(analysisResult.notes);
    setParsedNotes2(analysisResult2.notes);
    setHasValidSequence(analysisResult.hasValidSequence || analysisResult2.hasValidSequence);
  }, [analysisResult, analysisResult2]);

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
    
    let newNoteIndex = noteIndex + semitones;
    let newOctave = octave;
    
    console.log(`Транспозиция: ${note}${octave} + ${semitones} полутонов`);
    console.log(`Исходный индекс ноты: ${noteIndex}, новый индекс: ${newNoteIndex}, октава: ${newOctave}`);
    
    while (newNoteIndex < 0) {
      newNoteIndex += 12;
      newOctave--;
    }
    while (newNoteIndex >= 12) {
      newNoteIndex -= 12;
      newOctave++;
    }
    
    console.log(`После обработки индексов: нота индекс ${newNoteIndex}, октава ${newOctave}`);
    
    // Циклическое переключение октав
    if (newOctave < 0) newOctave = 8;
    if (newOctave > 8) newOctave = 0;
    
    console.log(`Итоговая нота: ${notes[newNoteIndex]}${newOctave}`);
    
    return {
      note: notes[newNoteIndex],
      octave: newOctave
    };
  };

  const transposeSequence = (semitones: number) => {
    if (!analysisResult.hasValidSequence) {
      toast.error(t('playbackError'));
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
        if (note.duration !== 1000) noteText += `(${note.duration})`;
        
        newSequence += noteText;
      }
    }
    
    setSequence(newSequence);
    toast.success(`${t('transposed')} ${semitones > 0 ? '+' : ''}${semitones} (последовательность 1)`);
  };

  const transposeSequence2 = (semitones: number) => {
    if (!analysisResult2.hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of parsedNotes2) {
      if (note.isPause || note.isError) {
        newSequence += note.originalText;
      } else if (note.note && note.octave !== undefined) {
        const { note: newNote, octave: newOctave } = transposeNote(note.note, note.octave, semitones);
        
        let noteText = newNote;
        if (newOctave !== 4) noteText += newOctave;
        if (note.duration !== 1000) noteText += `(${note.duration})`;
        
        newSequence += noteText;
      }
    }
    
    setSequence2(newSequence);
    toast.success(`${t('transposed')} ${semitones > 0 ? '+' : ''}${semitones} (последовательность 2)`);
  };

  const multiplyDuration = (multiplier: number, sequenceNumber: number) => {
    const currentSequence = sequenceNumber === 1 ? sequence : sequence2;
    const currentNotes = sequenceNumber === 1 ? parsedNotes : parsedNotes2;
    const currentAnalysis = sequenceNumber === 1 ? analysisResult : analysisResult2;
    
    if (!currentAnalysis.hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of currentNotes) {
      if (note.isPause) {
        // Для пауз тоже применяем множитель
        const newDuration = Math.ceil(note.duration * multiplier);
        if (newDuration !== 1000) {
          newSequence += `P(${newDuration})`;
        } else {
          newSequence += 'P';
        }
      } else if (note.isError) {
        newSequence += note.originalText;
      } else if (note.note && note.octave !== undefined) {
        // Для нот применяем множитель к длительности
        const newDuration = Math.ceil(note.duration * multiplier);
        
        let noteText = note.note;
        if (note.octave !== 4) noteText += note.octave;
        if (newDuration !== 1000) noteText += `(${newDuration})`;
        
        newSequence += noteText;
      }
    }
    
    if (sequenceNumber === 1) {
      setSequence(newSequence);
    } else {
      setSequence2(newSequence);
    }
    
    const multiplierText = multiplier === 0.5 ? 'x0.5' : 'x2';
    toast.success(`Длительность изменена ${multiplierText} (последовательность ${sequenceNumber})`);
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    try {
      setIsPlaying(true);
      setCurrentNoteIndex(-1);
      setCurrentNoteIndex2(-1);
      
      // Воспроизводим обе последовательности одновременно
      const playPromises = [];
      
      if (analysisResult.hasValidSequence) {
        playPromises.push(playSequence(parsedNotes, speed[0], selectedInstrument));
      }
      
      if (analysisResult2.hasValidSequence) {
        playPromises.push(playSequence(parsedNotes2, speed[0], selectedInstrument2));
      }
      
      await Promise.all(playPromises);
      
      timeoutRefs.current = [];
      
      // Подсветка для первой последовательности
      if (analysisResult.hasValidSequence) {
        let currentTime = 0;
        parsedNotes.forEach((note, index) => {
          const adjustedDuration = note.duration / speed[0];
          
          const startTimeout = setTimeout(() => {
            setCurrentNoteIndex(index);
          }, currentTime);
          
          const endTimeout = setTimeout(() => {
            if (index === parsedNotes.length - 1) {
              setCurrentNoteIndex(-1);
            }
          }, currentTime + adjustedDuration);
          
          timeoutRefs.current.push(startTimeout, endTimeout);
          currentTime += adjustedDuration;
        });
      }
      
      // Подсветка для второй последовательности
      if (analysisResult2.hasValidSequence) {
        let currentTime = 0;
        parsedNotes2.forEach((note, index) => {
          const adjustedDuration = note.duration / speed[0];
          
          const startTimeout = setTimeout(() => {
            setCurrentNoteIndex2(index);
          }, currentTime);
          
          const endTimeout = setTimeout(() => {
            if (index === parsedNotes2.length - 1) {
              setCurrentNoteIndex2(-1);
            }
          }, currentTime + adjustedDuration);
          
          timeoutRefs.current.push(startTimeout, endTimeout);
          currentTime += adjustedDuration;
        });
      }
      
      // Определяем максимальную длительность для завершения воспроизведения
      const maxDuration1 = analysisResult.hasValidSequence ? 
        parsedNotes.reduce((sum, note) => sum + note.duration / speed[0], 0) : 0;
      const maxDuration2 = analysisResult2.hasValidSequence ? 
        parsedNotes2.reduce((sum, note) => sum + note.duration / speed[0], 0) : 0;
      
      const maxDuration = Math.max(maxDuration1, maxDuration2);
      
      const finishTimeout = setTimeout(() => {
        setIsPlaying(false);
        setCurrentNoteIndex(-1);
        setCurrentNoteIndex2(-1);
        toast.success(t('playbackCompleted'));
      }, maxDuration);
      
      timeoutRefs.current.push(finishTimeout);
      
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      setCurrentNoteIndex(-1);
      setCurrentNoteIndex2(-1);
      toast.error(t('playbackError'));
    }
  };

  const stopPlayback = () => {
    stopSequence();
    setIsPlaying(false);
    setCurrentNoteIndex(-1);
    setCurrentNoteIndex2(-1);
    
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
  };

  const handleSaveOption = async (format: 'midi' | 'mp3') => {
    if (!hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    try {
      // Передаем обе последовательности в функцию экспорта
      await exportMidi(parsedNotes, parsedNotes2, speed[0], { format });
      
      const messages = {
        midi: t('midiSaved'),
        mp3: t('audioSaved')
      };
      
      toast.success(messages[format]);
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('saveError'));
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      toast.error(t('selectMidiFile'));
      return;
    }

    try {
      // Получаем обе последовательности из импорта
      const { sequence1, sequence2 } = await importMidi(file);
      setSequence(sequence1);
      setSequence2(sequence2);
      
      let message = t('midiImported');
      if (sequence1 && sequence2) {
        message += ' (2 трека)';
      } else if (sequence1) {
        message += ' (1 трек)';
      }
      
      toast.success(message);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(t('importError') + ': ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderSequenceWithHighlights = (notes: ParsedNote[], sequenceText: string, currentIndex: number) => {
    if (notes.length === 0) {
      return sequenceText;
    }

    return notes.map((note, index) => {
      let className = '';
      if (note.isError) {
        className = 'bg-red-200 text-red-800';
      } else if (currentIndex === index) {
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
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-center text-xl md:text-2xl flex-1">{t('title')}</CardTitle>
            <Button
              onClick={toggleLanguage}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              {language.toUpperCase()}
            </Button>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground text-center">
            {t('description')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="sequence" className="text-xs md:text-sm font-medium">
                Последовательность 1
              </label>
              <div className="flex items-center gap-1 md:gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mid,.midi"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <Button
                  onClick={() => {
                    setSequence('');
                    setSequence2('');
                    toast.success('Поля очищены');
                  }}
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-7 md:h-9 md:px-3 md:py-2"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">Очистить</span>
                  <span className="sm:hidden">Clear</span>
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-7 md:h-9 md:px-3 md:py-2"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">{t('openMidi')}</span>
                  <span className="sm:hidden">MIDI</span>
                </Button>
              </div>
            </div>
            <div className="flex gap-1 md:gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  onClick={() => transposeSequence(1)}
                  disabled={!analysisResult.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeUp')}
                >
                  <ArrowUp className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => transposeSequence(-1)}
                  disabled={!analysisResult.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeDown')}
                >
                  <ArrowDown className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => multiplyDuration(0.5, 1)}
                  disabled={!analysisResult.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title="Уменьшить длительность x0.5"
                >
                  <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => multiplyDuration(2, 1)}
                  disabled={!analysisResult.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title="Увеличить длительность x2"
                >
                  <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </div>
              <Textarea
                id="sequence"
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                placeholder="Последовательность 1"
                className="min-h-20 md:min-h-24 font-mono flex-1 text-xs md:text-sm"
              />
            </div>
          </div>

          <div className="p-2 md:p-3 bg-muted rounded-md">
            <p className="text-xs md:text-sm font-medium mb-2">{t('preview')} 1:</p>
            <div className="font-mono text-xs md:text-sm whitespace-nowrap overflow-x-auto max-w-full break-all">
              {renderSequenceWithHighlights(parsedNotes, sequence, currentNoteIndex)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="sequence2" className="text-xs md:text-sm font-medium">
                Последовательность 2
              </label>
            </div>
            <div className="flex gap-1 md:gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  onClick={() => transposeSequence2(1)}
                  disabled={!analysisResult2.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeUp')}
                >
                  <ArrowUp className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => transposeSequence2(-1)}
                  disabled={!analysisResult2.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeDown')}
                >
                  <ArrowDown className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => multiplyDuration(0.5, 2)}
                  disabled={!analysisResult2.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title="Уменьшить длительность x0.5"
                >
                  <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => multiplyDuration(2, 2)}
                  disabled={!analysisResult2.hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title="Увеличить длительность x2"
                >
                  <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </div>
              <Textarea
                id="sequence2"
                value={sequence2}
                onChange={(e) => setSequence2(e.target.value)}
                placeholder="Последовательность 2"
                className="min-h-20 md:min-h-24 font-mono flex-1 text-xs md:text-sm"
              />
            </div>
          </div>

          <div className="p-2 md:p-3 bg-muted rounded-md">
            <p className="text-xs md:text-sm font-medium mb-2">{t('preview')} 2:</p>
            <div className="font-mono text-xs md:text-sm whitespace-nowrap overflow-x-auto max-w-full break-all">
              {renderSequenceWithHighlights(parsedNotes2, sequence2, currentNoteIndex2)}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs md:text-sm font-medium">
              Инструмент для последовательности 1
            </label>
            <Select value={selectedInstrument} onValueChange={setSelectedInstrument}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instruments.map((instrument) => (
                  <SelectItem key={instrument.value} value={instrument.value}>
                    {instrument.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs md:text-sm font-medium">
              Инструмент для последовательности 2
            </label>
            <Select value={selectedInstrument2} onValueChange={setSelectedInstrument2}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instruments.map((instrument) => (
                  <SelectItem key={instrument.value} value={instrument.value}>
                    {instrument.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs md:text-sm font-medium">
              {t('speed')}: {speed[0]}x
            </label>
            <Slider
              value={speed}
              onValueChange={setSpeed}
              min={0.5}
              max={5}
              step={0.1}
              className="w-full"
            />
          </div>

          <div className="flex gap-2 md:gap-3 items-center">
            <Button
              onClick={handlePlay}
              disabled={!hasValidSequence}
              className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full p-0"
              variant={isPlaying ? "destructive" : "default"}
            >
              <CirclePlay className="w-4 h-4 md:w-5 md:h-5" />
            </Button>

            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button
                  disabled={!hasValidSequence}
                  className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full p-0"
                  variant="outline"
                >
                  <Save className="w-4 h-4 md:w-5 md:h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{t('selectFormat')}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <Button
                    onClick={() => handleSaveOption('midi')}
                    className="flex flex-col items-center gap-2 h-16 md:h-20"
                    variant="outline"
                  >
                    <Download className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="text-xs md:text-sm">{t('midiFile')}</span>
                  </Button>
                  <Button
                    onClick={() => handleSaveOption('mp3')}
                    className="flex flex-col items-center gap-2 h-16 md:h-20"
                    variant="outline"
                  >
                    <Music className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="text-xs md:text-sm">{t('audioFile')}</span>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {analysisResult.hasErrors && (
            <div className="p-2 md:p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-xs md:text-sm text-red-800 font-medium">{t('errorsFound')} 1:</p>
              <ul className="text-xs md:text-sm text-red-700 mt-1 list-disc list-inside">
                {parsedNotes
                  .filter(note => note.isError)
                  .map((note, index) => (
                    <li key={index}>{note.errorMessage}</li>
                  ))}
              </ul>
            </div>
          )}

          {analysisResult2.hasErrors && (
            <div className="p-2 md:p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-xs md:text-sm text-red-800 font-medium">{t('errorsFound')} 2:</p>
              <ul className="text-xs md:text-sm text-red-700 mt-1 list-disc list-inside">
                {parsedNotes2
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