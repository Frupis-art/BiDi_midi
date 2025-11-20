import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CirclePlay, Save, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Upload, Download, Music, Globe, Trash2, VolumeX, Volume2, Plus, Minus, Heart } from 'lucide-react';
import MidiGallery, { MidiFile } from './MidiGallery';
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

interface SequenceData {
  sequence: string;
  parsedNotes: ParsedNote[];
  selectedInstrument: string;
  isMuted: boolean;
  isSolo: boolean;
  volume: number;
  currentNoteIndex: number;
}

interface MidiSequencerProps {
  onCurrentNoteChange?: (sequenceIndex: number, noteIndex: number) => void;
}

const MidiSequencer = forwardRef<{ 
  handlePlay: () => void;
  registerPlaybackEndCallback: (callback: () => void) => void;
}, MidiSequencerProps>(({ onCurrentNoteChange }, ref) => {
  const { language, toggleLanguage, t } = useLanguage();
  
  // Инициализируем с двумя последовательностями
  const [sequences, setSequences] = useState<SequenceData[]>([
    {
      sequence: 'f#5e5d5c#5babc#5',
      parsedNotes: [],
      selectedInstrument: 'piano',
      isMuted: false,
      isSolo: false,
      volume: 0.7,
      currentNoteIndex: -1
    },
    {
      sequence: 'd3(250)a3(250)d(250)f#(250) a2(250)e3(250)a3(250)c#(250) b2(250)f#3(250)b3(250)d(250) f#2(250)c#(250)a3(250)c#(250) g2(250)d3(250)g3(250)b3(250) d2(250)a2(250)d3(250)f#3(250) g2(250)d3(250)g3(250)b3(250) a2(250)e3(250)a3(250)c#(250)',
      parsedNotes: [],
      selectedInstrument: 'piano',
      isMuted: false,
      isSolo: false,
      volume: 0.7,
      currentNoteIndex: -1
    }
  ]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasValidSequence, setHasValidSequence] = useState(false);
  const [speed, setSpeed] = useState([1]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showGalleryDialog, setShowGalleryDialog] = useState(false);
  const [galleryName, setGalleryName] = useState('');
  const [galleryAuthor, setGalleryAuthor] = useState('');
  const [deletedSequences, setDeletedSequences] = useState<SequenceData[]>([]);
  const [showSaveHint, setShowSaveHint] = useState(false); // НОВОЕ: подсветка кнопки сохранения
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackEndCallbackRef = useRef<(() => void) | null>(null);
  const midiGalleryRef = useRef<any>(null); // Ref для управления MidiGallery

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

  // Показываем подсказку для кнопки сохранения
  useEffect(() => {
    if (hasValidSequence) {
      setShowSaveHint(true);
      const timer = setTimeout(() => setShowSaveHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [hasValidSequence]);

  // Добавление новой последовательности (с восстановлением из истории)
  const addSequence = () => {
    if (deletedSequences.length > 0) {
      // Восстанавливаем последнюю удаленную последовательность (LIFO)
      const restoredSequence = deletedSequences[deletedSequences.length - 1];
      setDeletedSequences(prev => prev.slice(0, -1));
      setSequences(prev => [...prev, restoredSequence]);
    } else {
      // Создаем новую последовательность
      const newSequence: SequenceData = {
        sequence: '',
        parsedNotes: [],
        selectedInstrument: 'piano',
        isMuted: false,
        isSolo: false,
        volume: 0.7,
        currentNoteIndex: -1
      };
      setSequences(prev => [...prev, newSequence]);
    }
  };

  // Удаление последней последовательности (с сохранением в историю)
  const removeSequence = () => {
    if (sequences.length > 1) {
      const lastSequence = sequences[sequences.length - 1];
      setDeletedSequences(prev => [...prev, lastSequence]);
      setSequences(prev => prev.slice(0, -1));
    }
  };

  // Обновление последовательности
  const updateSequence = (index: number, field: keyof SequenceData, value: any) => {
    setSequences(prev => prev.map((seq, i) => {
      if (i === index) {
        const updatedSeq = { ...seq, [field]: value };
        // Если изменяется currentNoteIndex, вызываем callback
        if (field === 'currentNoteIndex' && onCurrentNoteChange) {
          onCurrentNoteChange(index, value);
        }
        return updatedSeq;
      }
      return seq;
    }));
  };

  // Анализ всех последовательностей
  const analysisResults = useMemo(() => {
    return sequences.map(seq => {
      if (!seq.sequence.trim()) {
        return { notes: [], hasErrors: false, hasValidSequence: false };
      }

      try {
        const notes = parseNoteSequence(seq.sequence, t);
        const hasErrors = notes.some(note => note.isError);
        return {
          notes,
          hasErrors,
          hasValidSequence: !hasErrors && notes.length > 0
        };
      } catch (error) {
        return { notes: [], hasErrors: true, hasValidSequence: false };
      }
    });
  }, [sequences, t]);

  // Обновляем состояние при изменении результата анализа
  useEffect(() => {
    const updatedSequences = sequences.map((seq, index) => ({
      ...seq,
      parsedNotes: analysisResults[index]?.notes || []
    }));
    
    setSequences(updatedSequences);
    setHasValidSequence(analysisResults.some(result => result.hasValidSequence));
  }, [analysisResults]);

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
    
    // Циклическое переключение октав
    if (newOctave < 0) newOctave = 8;
    if (newOctave > 8) newOctave = 0;
    
    return {
      note: notes[newNoteIndex],
      octave: newOctave
    };
  };

  const transposeSequence = (sequenceIndex: number, semitones: number) => {
    const analysisResult = analysisResults[sequenceIndex];
    if (!analysisResult?.hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of sequences[sequenceIndex].parsedNotes) {
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
    
    updateSequence(sequenceIndex, 'sequence', newSequence);
    toast.success(`${t('transposed')} ${semitones > 0 ? '+' : ''}${semitones} (последовательность ${sequenceIndex + 1})`);
  };

  const multiplyDuration = (multiplier: number, sequenceIndex: number) => {
    const analysisResult = analysisResults[sequenceIndex];
    if (!analysisResult?.hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of sequences[sequenceIndex].parsedNotes) {
      if (note.isPause) {
        const newDuration = Math.ceil(note.duration * multiplier);
        if (newDuration !== 1000) {
          newSequence += `P(${newDuration})`;
        } else {
          newSequence += 'P';
        }
      } else if (note.isError) {
        newSequence += note.originalText;
      } else if (note.note && note.octave !== undefined) {
        const newDuration = Math.ceil(note.duration * multiplier);
        
        let noteText = note.note;
        if (note.octave !== 4) noteText += note.octave;
        if (newDuration !== 1000) noteText += `(${newDuration})`;
        
        newSequence += noteText;
      }
    }
    
    updateSequence(sequenceIndex, 'sequence', newSequence);
    const multiplierText = multiplier === 0.5 ? 'x0.5' : 'x2';
    toast.success(`Длительность изменена ${multiplierText} (последовательность ${sequenceIndex + 1})`);
  };

  const handleVolumeChange = (sequenceIndex: number, delta: number) => {
    const currentVolume = sequences[sequenceIndex].volume;
    const newVolume = Math.max(0, Math.min(1, currentVolume + delta));
    updateSequence(sequenceIndex, 'volume', newVolume);
    
    // Воспроизводим тестовый звук с новой громкостью
    const testNote = { note: 'C', octave: 4, duration: 300, isPause: false, startTime: 0, endTime: 300, originalText: 'C4', isError: false };
    playSequence([testNote], 1, sequences[sequenceIndex].selectedInstrument, newVolume);
  };

  const handleMute = (sequenceIndex: number) => {
    updateSequence(sequenceIndex, 'isMuted', !sequences[sequenceIndex].isMuted);
  };

  const handleSolo = (sequenceIndex: number) => {
    updateSequence(sequenceIndex, 'isSolo', !sequences[sequenceIndex].isSolo);
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
      
      // Сбрасываем индексы для всех последовательностей
      setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
      
      // Воспроизводим все немутированные последовательности одновременно
      const playPromises = [];
      
      for (let i = 0; i < sequences.length; i++) {
        const seq = sequences[i];
        const result = analysisResults[i];
        
        // Определяем, должна ли последовательность играть
        const hasSolo = sequences.some(s => s.isSolo);
        const shouldPlay = hasSolo ? seq.isSolo : !seq.isMuted;
        
        if (result?.hasValidSequence && shouldPlay) {
          playPromises.push(playSequence(seq.parsedNotes, speed[0], seq.selectedInstrument, seq.volume));
        }
      }
      
      await Promise.all(playPromises);
      
      timeoutRefs.current = [];
      
      // Подсветка для всех последовательностей
      for (let seqIndex = 0; seqIndex < sequences.length; seqIndex++) {
        const result = analysisResults[seqIndex];
        
        if (result?.hasValidSequence) {
          let currentTime = 0;
          sequences[seqIndex].parsedNotes.forEach((note, noteIndex) => {
            const adjustedDuration = note.duration / speed[0];
            
            const startTimeout = setTimeout(() => {
              updateSequence(seqIndex, 'currentNoteIndex', noteIndex);
              // Вызываем callback для передачи информации о текущей ноте
              if (onCurrentNoteChange) {
                onCurrentNoteChange(seqIndex, noteIndex);
              }
            }, currentTime);
            
            const endTimeout = setTimeout(() => {
              if (noteIndex === sequences[seqIndex].parsedNotes.length - 1) {
                updateSequence(seqIndex, 'currentNoteIndex', -1);
                // Сбрасываем текущую ноту при завершении последовательности
                if (onCurrentNoteChange) {
                  onCurrentNoteChange(seqIndex, -1);
                }
              }
            }, currentTime + adjustedDuration);
            
            timeoutRefs.current.push(startTimeout, endTimeout);
            currentTime += adjustedDuration;
          });
        }
      }
      
      // Определяем максимальную длительность для завершения воспроизведения
      let maxDuration = 0;
      for (let i = 0; i < sequences.length; i++) {
        const result = analysisResults[i];
        if (result?.hasValidSequence) {
          const duration = sequences[i].parsedNotes.reduce((sum, note) => sum + note.duration / speed[0], 0);
          maxDuration = Math.max(maxDuration, duration);
        }
      }
      
      const finishTimeout = setTimeout(() => {
        setIsPlaying(false);
        setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
        
        if (playbackEndCallbackRef.current) {
          playbackEndCallbackRef.current();
          playbackEndCallbackRef.current = null;
        }
        
        toast.success(t('playbackCompleted'));
      }, maxDuration);
      
      timeoutRefs.current.push(finishTimeout);
      
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
      toast.error(t('playbackError'));
    }
  };

  const stopPlayback = () => {
    stopSequence();
    setIsPlaying(false);
    setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
    
    // Сбрасываем текущую ноту во всех компонентах
    if (onCurrentNoteChange) {
      onCurrentNoteChange(0, -1);
    }
    
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
  };

  const registerPlaybackEndCallback = (callback: () => void) => {
    playbackEndCallbackRef.current = callback;
  };

  // ИСПРАВЛЕННАЯ ФУНКЦИЯ: сохранение MIDI файла
 // ОБНОВЛЕННАЯ ФУНКЦИЯ: сохранение со ВСЕМИ дорожками
const handleSaveOption = async (format: 'midi' | 'mp3') => {
  if (!hasValidSequence) {
    toast.error(t('playbackError'));
    return;
  }

  try {
    // Для MIDI используем новый подход со ВСЕМИ дорожками
    if (format === 'midi') {
      // Берем ВСЕ последовательности
      const allSequences = sequences.map(seq => seq.sequence);
      
      // Парсим ВСЕ последовательности
      const { parseNoteSequence, exportMidi } = await import('@/utils/midiUtils');
      const allParsedNotes = allSequences.map(sequence => 
        sequence ? parseNoteSequence(sequence, t) : []
      );

      console.log(`💾 Сохранение MIDI: ${allParsedNotes.length} дорожек`);

      // Создаем MIDI со ВСЕМИ дорожками
      const midiBlob = await exportMidi(allParsedNotes, speed[0], { format: 'midi' });

      if (!midiBlob) {
        toast.error('Не удалось создать MIDI файл');
        return;
      }

      // Скачиваем
      const url = URL.createObjectURL(midiBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `composition_${Date.now()}.mid`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      toast.success(`${t('midiSaved')} (${allParsedNotes.length} дорожек)`);
    } else {
      // Для MP3 также используем ВСЕ дорожки
      const allParsedNotes = sequences.map(seq => seq.parsedNotes);
      
      console.log(`💾 Сохранение Audio: ${allParsedNotes.length} дорожек`);

      // Передаем массив всех дорожек в exportMidi
      await exportMidi(allParsedNotes, speed[0], { format });
      toast.success(`${t('audioSaved')} (${allParsedNotes.length} дорожек)`);
    }

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

    // Останавливаем воспроизведение при импорте
    stopPlayback();

    try {
      const { sequences: importedSequences } = await importMidi(file);
      
      console.log(`📁 MIDI Import: обнаружено ${importedSequences.length} последовательностей`);
      importedSequences.forEach((seq, i) => {
        console.log(`📝 Последовательность ${i + 1}: длина ${seq.length} символов, первые 30 символов: "${seq.substring(0, 30)}..."`);
      });
      
      // Очищаем все существующие парсеры
      const clearedSequences: SequenceData[] = [];
      
      // Создаем новые последовательности для каждого импортированного трека
      importedSequences.forEach((sequence, index) => {
        console.log(`🎵 Создаем последовательность ${index + 1}: ${sequence.substring(0, 50)}...`);
        clearedSequences.push({
          sequence,
          parsedNotes: [],
          selectedInstrument: 'piano',
          isMuted: false,
          isSolo: false,
          volume: 0.7,
          currentNoteIndex: -1
        });
      });
      
      // Если не было импортировано ни одного трека, создаем пустую последовательность
      if (clearedSequences.length === 0) {
        clearedSequences.push({
          sequence: '',
          parsedNotes: [],
          selectedInstrument: 'piano',
          isMuted: false,
          isSolo: false,
          volume: 0.7,
          currentNoteIndex: -1
        });
      }
      
      console.log(`🔄 Устанавливаем ${clearedSequences.length} последовательностей в состояние`);
      setSequences(clearedSequences);
      setDeletedSequences([]); // Очищаем историю удаленных последовательностей
      
      toast.success(`${t('midiImported')} (${importedSequences.length} ${importedSequences.length === 1 ? 'трек' : 'треков'})`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(t('importError') + ': ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ИСПРАВЛЕННАЯ ФУНКЦИЯ: загрузка файла из галереи - теперь принимает массив последовательностей
  const handleLoadFromGallery = (sequences: string[]) => {
    // Создаем новые последовательности, полностью заменяя существующие
    const newSequences: SequenceData[] = sequences.map(sequence => ({
      sequence: sequence,
      parsedNotes: [],
      selectedInstrument: 'piano',
      isMuted: false,
      isSolo: false,
      volume: 0.7,
      currentNoteIndex: -1
    }));
    
    // Если массив пустой, добавляем одну пустую последовательность
    if (newSequences.length === 0) {
      newSequences.push({
        sequence: '',
        parsedNotes: [],
        selectedInstrument: 'piano',
        isMuted: false,
        isSolo: false,
        volume: 0.7,
        currentNoteIndex: -1
      });
    }
    
    setSequences(newSequences);
    setDeletedSequences([]);
    toast.success(`Последовательности загружены из галереи (${sequences.length} шт.)`);
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

  // ИСПРАВЛЕННАЯ ФУНКЦИЯ: сохранение в галерею - теперь сохраняет ВСЕ последовательности
  const handleSaveToGallery = async () => {
    if (!galleryName.trim() || !galleryAuthor.trim()) {
      toast.error('Заполните все поля');
      return;
    }

    // Увеличили лимит до 20 символов
    if (galleryName.length < 3 || galleryName.length > 20) {
      toast.error('Название должно быть от 3 до 20 символов');
      return;
    }

    if (galleryAuthor.length < 3 || galleryAuthor.length > 20) {
      toast.error('Автор должен быть от 3 до 20 символов');
      return;
    }

    // Проверка на допустимые символы
    const validChars = /^[a-zA-Zа-яА-Я0-9\s\-]+$/;
    if (!validChars.test(galleryName) || !validChars.test(galleryAuthor)) {
      toast.error('Используйте только буквы, цифры, пробелы и дефисы');
      return;
    }

    try {
      // ИСПРАВЛЕНИЕ: получаем ВСЕ последовательности
      const allSequences = sequences.map(seq => seq.sequence);
      
      // Вызываем метод загрузки из галереи
      await midiGalleryRef.current?.uploadToGallery(allSequences, galleryName, galleryAuthor);
      
      setGalleryName('');
      setGalleryAuthor('');
      setShowGalleryDialog(false);
    } catch (error) {
      toast.error('Ошибка загрузки: ' + (error as Error).message);
    }
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Expose handlePlay through ref
  useImperativeHandle(ref, () => ({
    handlePlay,
    registerPlaybackEndCallback
  }));

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
                Последовательности
              </label>
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mid,.midi"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <Button
                  onClick={() => {
                    setSequences(prev => prev.map(seq => ({ ...seq, sequence: '' })));
                    toast.success('Поля очищены');
                  }}
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-7 md:h-8"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  <span className="hidden md:inline">Очистить</span>
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  className="text-xs px-2 py-1 h-7 md:h-8"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  <span className="hidden md:inline">{t('openMidi')}</span>
                  <span className="md:hidden">MIDI</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Рендерим все последовательности */}
          {sequences.map((seq, index) => {
            const analysisResult = analysisResults[index];
            
            return (
              <div key={index} className="space-y-2 border border-border rounded-lg p-3">
                <div className="space-y-2">
                  <label className="text-xs md:text-sm font-medium">
                    Последовательность {index + 1}
                  </label>
                  <div className="flex gap-1">
                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => transposeSequence(index, 1)}
                        disabled={!analysisResult?.hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={t('transposeUp')}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => transposeSequence(index, -1)}
                        disabled={!analysisResult?.hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={t('transposeDown')}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => multiplyDuration(0.5, index)}
                        disabled={!analysisResult?.hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title="Уменьшить длительность x0.5"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => multiplyDuration(2, index)}
                        disabled={!analysisResult?.hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title="Увеличить длительность x2"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <Textarea
                      value={seq.sequence}
                      onChange={(e) => updateSequence(index, 'sequence', e.target.value)}
                      placeholder={`Последовательность ${index + 1}`}
                      className="min-h-20 md:min-h-24 font-mono flex-1 text-xs md:text-sm"
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => handleMute(index)}
                        className={`w-6 h-6 md:w-7 md:h-7 p-0 text-xs ${seq.isMuted ? 'bg-red-500 text-white' : ''}`}
                        variant={seq.isMuted ? 'default' : 'outline'}
                        title={`Mute последовательность ${index + 1}`}
                      >
                        M
                      </Button>
                      <Button
                        onClick={() => handleSolo(index)}
                        className={`w-6 h-6 md:w-7 md:h-7 p-0 text-xs ${seq.isSolo ? 'bg-yellow-500 text-white' : ''}`}
                        variant={seq.isSolo ? 'default' : 'outline'}
                        title={`Solo последовательность ${index + 1}`}
                      >
                        S
                      </Button>
                      <Button
                        onClick={() => handleVolumeChange(index, 0.1)}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={`Увеличить громкость (${Math.round(seq.volume * 100)}%)`}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => handleVolumeChange(index, -0.1)}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={`Уменьшить громкость (${Math.round(seq.volume * 100)}%)`}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs md:text-sm font-medium">
                    Инструмент {index + 1}
                  </label>
                  <Select 
                    value={seq.selectedInstrument} 
                    onValueChange={(value) => updateSequence(index, 'selectedInstrument', value)}
                  >
                    <SelectTrigger className="w-full h-9 md:h-10 text-sm">
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

                <div className="p-2 md:p-3 bg-muted rounded-md">
                  <p className="text-xs md:text-sm font-medium mb-2">{t('preview')} {index + 1}:</p>
                  <div className="font-mono text-xs md:text-sm whitespace-nowrap overflow-x-auto max-w-full break-all">
                    {renderSequenceWithHighlights(seq.parsedNotes, seq.sequence, seq.currentNoteIndex)}
                  </div>
                </div>

                {analysisResult?.hasErrors && (
                  <div className="p-2 md:p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-xs md:text-sm text-red-800 font-medium">{t('errorsFound')} {index + 1}:</p>
                    <ul className="text-xs text-red-700 mt-1 list-disc list-inside">
                      {seq.parsedNotes
                        .filter(note => note.isError)
                        .map((note, noteIndex) => (
                          <li key={noteIndex}>{note.errorMessage}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Кнопки добавления/удаления последовательностей */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={addSequence}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
             title="Добавить инструмент"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              onClick={removeSequence}
              variant="outline"
              size="sm"
              disabled={sequences.length <= 1}
              className="flex items-center gap-2"
             title="Удалить последний инструмент"
            >
              <Minus className="w-4 h-4" />
            </Button>
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
              className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full p-0"
              variant={isPlaying ? "destructive" : "default"}
            >
              <CirclePlay className="w-5 h-5 md:w-6 md:h-6" />
            </Button>

            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
              <DialogTrigger asChild>
                <Button
                  disabled={!hasValidSequence}
                  className={`flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full p-0 ${
                    showSaveHint ? 'ring-2 ring-blue-500 animate-pulse' : ''
                  }`}
                  variant="outline"
                  title={t('save')}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">{t('selectFormat')}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => handleSaveOption('midi')}
                    className="flex flex-col items-center gap-2 h-16 text-sm"
                    variant="outline"
                  >
                    <Download className="w-5 h-5" />
                    <span className="text-xs">{t('midiFile')}</span>
                  </Button>
                  <Button
                    onClick={() => handleSaveOption('mp3')}
                    className="flex flex-col items-center gap-2 h-16 text-sm"
                    variant="outline"
                  >
                    <Music className="w-5 h-5" />
                    <span className="text-xs">{t('audioFile')}</span>
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Кнопка сохранения в галерею */}
            <Dialog open={showGalleryDialog} onOpenChange={setShowGalleryDialog}>
              <DialogTrigger asChild>
                <Button
                  disabled={!hasValidSequence}
                  className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full p-0"
                  variant="outline"
                  title="Добавить в галерею"
                >
                  <Heart className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base md:text-lg">Добавить в галерею</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="gallery-name" className="text-sm">Введите название (3-20 символов)</Label>
                    <Input
                      id="gallery-name"
                      value={galleryName}
                      onChange={(e) => setGalleryName(e.target.value)}
                      placeholder="Название произведения"
                      maxLength={20}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gallery-author" className="text-sm">Введите автора (3-20 символов)</Label>
                    <Input
                      id="gallery-author"
                      value={galleryAuthor}
                      onChange={(e) => setGalleryAuthor(e.target.value)}
                      placeholder="Автор произведения"
                      maxLength={20}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowGalleryDialog(false)}
                      variant="outline"
                      className="flex-1 h-9 text-sm"
                    >
                      Отмена
                    </Button>
                    <Button
                      onClick={handleSaveToGallery}
                      className="flex-1 h-9 text-sm"
                      disabled={!galleryName.trim() || !galleryAuthor.trim()}
                    >
                      Добавить
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
      
      {/* Компонент галереи */}
      <MidiGallery 
        ref={midiGalleryRef}
        onLoadFile={handleLoadFromGallery} 
      />
    </div>
  );
});

export default MidiSequencer;