import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CirclePlay, Save, ArrowUp, ArrowDown, Upload, Download, Music, Globe } from 'lucide-react';
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
  const [sequence, setSequence] = useState('DDAABBA(2000)GGF#F#EED(4000)P(2000)AAGGF#F#E(2000)AAGGF#F#E(2000)P(1500)DDAABBA(2000)GGF#F#EED(4000)');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [speed, setSpeed] = useState([1]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Анализ в реальном времени
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

  // Обновляем состояние при изменении результата анализа
  useEffect(() => {
    setParsedNotes(analysisResult.notes);
    setHasValidSequence(analysisResult.hasValidSequence);
  }, [analysisResult]);

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
    
    while (newNoteIndex < 0) {
      newNoteIndex += 12;
      newOctave--;
    }
    while (newNoteIndex >= 12) {
      newNoteIndex -= 12;
      newOctave++;
    }
    
    if (newOctave < 0) newOctave = 0;
    if (newOctave > 8) newOctave = 8;
    
    return {
      note: notes[newNoteIndex],
      octave: newOctave
    };
  };

  const transposeSequence = (semitones: number) => {
    if (!hasValidSequence) {
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
    toast.success(`${t('transposed')} ${semitones > 0 ? '+' : ''}${semitones}`);
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
      
      await playSequence(parsedNotes, speed[0]);
      
      let currentTime = 0;
      timeoutRefs.current = [];
      
      parsedNotes.forEach((note, index) => {
        const adjustedDuration = note.duration / speed[0];
        
        const startTimeout = setTimeout(() => {
          setCurrentNoteIndex(index);
        }, currentTime);
        
        const endTimeout = setTimeout(() => {
          if (index === parsedNotes.length - 1) {
            setCurrentNoteIndex(-1);
            setIsPlaying(false);
            toast.success(t('playbackCompleted'));
          }
        }, currentTime + adjustedDuration);
        
        timeoutRefs.current.push(startTimeout, endTimeout);
        currentTime += adjustedDuration;
      });
      
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      setCurrentNoteIndex(-1);
      toast.error(t('playbackError'));
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
      toast.error(t('playbackError'));
      return;
    }

    try {
      await exportMidi(parsedNotes, speed[0], { format });
      
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
      const importedSequence = await importMidi(file);
      setSequence(importedSequence);
      toast.success(t('midiImported'));
    } catch (error) {
      console.error('Import error:', error);
      toast.error(t('importError') + ': ' + (error as Error).message);
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
                {t('sequenceLabel')}
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
                  disabled={!hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeUp')}
                >
                  <ArrowUp className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
                <Button
                  onClick={() => transposeSequence(-1)}
                  disabled={!hasValidSequence}
                  className="w-6 h-6 md:w-8 md:h-8 p-0"
                  variant="outline"
                  title={t('transposeDown')}
                >
                  <ArrowDown className="w-3 h-3 md:w-4 md:h-4" />
                </Button>
              </div>
              <Textarea
                id="sequence"
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                placeholder={t('sequenceLabel')}
                className="min-h-20 md:min-h-24 font-mono flex-1 text-xs md:text-sm"
              />
            </div>
          </div>

          <div className="p-2 md:p-3 bg-muted rounded-md">
            <p className="text-xs md:text-sm font-medium mb-2">{t('preview')}:</p>
            <div className="font-mono text-xs md:text-sm whitespace-nowrap overflow-x-auto max-w-full break-all">
              {renderSequenceWithHighlights()}
            </div>
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
              <p className="text-xs md:text-sm text-red-800 font-medium">{t('errorsFound')}:</p>
              <ul className="text-xs md:text-sm text-red-700 mt-1 list-disc list-inside">
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