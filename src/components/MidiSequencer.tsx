import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CirclePlay, Save, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Upload, Download, Music, Globe, Trash2, Heart, VolumeX, Volume2, Plus, Minus } from 'lucide-react';
import MidiGallery from './MidiGallery';
import { parseNoteSequence, playSequence, stopSequence, exportMidi, importMidi } from '@/utils/midiUtils';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { Plus, Minus } from 'lucide-react';

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

interface SequenceBlock {
  id: string;
  sequenceText: string;
  parsedNotes: ParsedNote[];
  selectedInstrument: string;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
  currentNoteIndex: number;
}

const MidiSequencer = React.forwardRef<{ 
  handlePlay: () => void;
  registerPlaybackEndCallback: (callback: () => void) => void;
}>((props, ref) => {
  const { language, toggleLanguage, t } = useLanguage();
  const [sequences, setSequences] = useState<SequenceBlock[]>([
    {
      id: '1',
      sequenceText: 'f#5e5d5c#5babc#5',
      parsedNotes: [],
      selectedInstrument: 'piano',
      volume: 0.7,
      isMuted: false,
      isSolo: false,
      currentNoteIndex: -1
    },
    {
      id: '2',
      sequenceText: 'd3(250)a3(250)d(250)f#(250) a2(250)e3(250)a3(250)c#(250) b2(250)f#3(250)b3(250)d(250) f#2(250)c#(250)a3(250)c#(250) g2(250)d3(250)g3(250)b3(250) d2(250)a2(250)d3(250)f#3(250) g2(250)d3(250)g3(250)b3(250) a2(250)e3(250)a3(250)c#(250)',
      parsedNotes: [],
      selectedInstrument: 'piano',
      volume: 0.7,
      isMuted: false,
      isSolo: false,
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
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackEndCallbackRef = useRef<(() => void) | null>(null);

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

  // Анализ в реальном времени для всех последовательностей
  useEffect(() => {
    const updatedSequences = sequences.map(seq => {
      if (!seq.sequenceText.trim()) {
        return { ...seq, parsedNotes: [] };
      }

      try {
        const notes = parseNoteSequence(seq.sequenceText, t);
        return { ...seq, parsedNotes: notes };
      } catch (error) {
        return { ...seq, parsedNotes: [] };
      }
    });

    setSequences(updatedSequences);
    
    const hasValid = updatedSequences.some(seq => 
      seq.parsedNotes.length > 0 && !seq.parsedNotes.some(note => note.isError)
    );
    setHasValidSequence(hasValid);
  }, [sequences.map(s => s.sequenceText).join('|'), t]);

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

  const transposeSequence = (index: number, semitones: number) => {
    const sequence = sequences[index];
    if (!sequence || sequence.parsedNotes.length === 0 || sequence.parsedNotes.some(note => note.isError)) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of sequence.parsedNotes) {
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
    
    setSequences(prev => prev.map((seq, i) => 
      i === index ? { ...seq, sequenceText: newSequence } : seq
    ));
    toast.success(`${t('transposed')} ${semitones > 0 ? '+' : ''}${semitones} (последовательность ${index + 1})`);
  };

  const multiplyDuration = (index: number, multiplier: number) => {
    const sequence = sequences[index];
    if (!sequence || sequence.parsedNotes.length === 0 || sequence.parsedNotes.some(note => note.isError)) {
      toast.error(t('playbackError'));
      return;
    }

    let newSequence = '';
    
    for (const note of sequence.parsedNotes) {
      if (note.isPause || note.isError) {
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
    
    setSequences(prev => prev.map((seq, i) => 
      i === index ? { ...seq, sequenceText: newSequence } : seq
    ));
    
    const multiplierText = multiplier === 0.5 ? 'x0.5' : 'x2';
    toast.success(`Длительность изменена ${multiplierText} (последовательность ${index + 1})`);
  };

  const handleVolumeChange = (index: number, delta: number) => {
    setSequences(prev => prev.map((seq, i) => {
      if (i === index) {
        const newVolume = Math.max(0, Math.min(1, seq.volume + delta));
        // Воспроизводим тестовый звук с новой громкостью
        const testNote = { note: 'C', octave: 4, duration: 300, isPause: false, startTime: 0, endTime: 300, originalText: 'C4', isError: false };
        playSequence([{ parsedNotes: [testNote], instrument: seq.selectedInstrument, volume: newVolume }], 1);
        return { ...seq, volume: newVolume };
      }
      return seq;
    }));
  };

  const handleMute = (index: number) => {
    setSequences(prev => prev.map((seq, i) => {
      if (i === index) {
        return { ...seq, isMuted: !seq.isMuted, isSolo: seq.isSolo ? false : seq.isSolo };
      }
      return seq;
    }));
  };

  const handleSolo = (index: number) => {
    setSequences(prev => prev.map((seq, i) => {
      if (i === index) {
        const newSolo = !seq.isSolo;
        return { ...seq, isSolo: newSolo };
      } else if (sequences[index].isSolo) {
        // Если выключаем solo, сбрасываем mute для других последовательностей
        return { ...seq, isMuted: false };
      } else {
        // Если включаем solo, mute другие последовательности
        return { ...seq, isMuted: true, isSolo: false };
      }
    }));
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
      
      // Сбрасываем индексы подсветки
      setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
      
      // Воспроизводим обе последовательности одновременно с учетом mute/solo
      const sequencesToPlay = sequences
        .filter(seq => seq.parsedNotes.length > 0 && !seq.parsedNotes.some(note => note.isError) && !seq.isMuted)
        .map(seq => ({
          parsedNotes: seq.parsedNotes,
          instrument: seq.selectedInstrument,
          volume: seq.volume
        }));
      
      if (sequencesToPlay.length > 0) {
        await playSequence(sequencesToPlay, speed[0]);
      }
      
      timeoutRefs.current = [];
      
      // Подсветка для всех последовательностей
      sequences.forEach((seq, seqIndex) => {
        if (seq.parsedNotes.length > 0 && !seq.parsedNotes.some(note => note.isError) && !seq.isMuted) {
          let currentTime = 0;
          seq.parsedNotes.forEach((note, noteIndex) => {
            const adjustedDuration = note.duration / speed[0];
            
            const startTimeout = setTimeout(() => {
              setSequences(prev => prev.map((s, i) => 
                i === seqIndex ? { ...s, currentNoteIndex: noteIndex } : s
              ));
            }, currentTime);
            
            const endTimeout = setTimeout(() => {
              if (noteIndex === seq.parsedNotes.length - 1) {
                setSequences(prev => prev.map((s, i) => 
                  i === seqIndex ? { ...s, currentNoteIndex: -1 } : s
                ));
              }
            }, currentTime + adjustedDuration);
            
            timeoutRefs.current.push(startTimeout, endTimeout);
            currentTime += adjustedDuration;
          });
        }
      });
        });
      }
      
      // Определяем максимальную длительность для завершения воспроизведения
      const maxDuration = Math.max(...sequences.map(seq => 
        seq.parsedNotes.length > 0 && !seq.parsedNotes.some(note => note.isError) && !seq.isMuted
          ? seq.parsedNotes.reduce((sum, note) => sum + note.duration / speed[0], 0)
          : 0
      ));
      
      const finishTimeout = setTimeout(() => {
        setIsPlaying(false);
        setSequences(prev => prev.map(seq => ({ ...seq, currentNoteIndex: -1 })));
        
        // Call the registered callback if it exists
        if (playbackEndCallbackRef.current) {
          playbackEndCallbackRef.current();
          playbackEndCallbackRef.current = null; // Clear after use
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
    
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
  };

  const registerPlaybackEndCallback = (callback: () => void) => {
    playbackEndCallbackRef.current = callback;
  };

  const handleSaveOption = async (format: 'midi' | 'mp3') => {
    if (!hasValidSequence) {
      toast.error(t('playbackError'));
      return;
    }

    try {
      // Передаем обе последовательности в функцию экспорта
      const sequenceData = sequences.map(seq => ({ parsedNotes: seq.parsedNotes }));
      await exportMidi(sequenceData, speed[0], { format });
      
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
      const importedSequences = await importMidi(file);
      
      setSequences(prev => prev.map((seq, index) => {
        if (index < importedSequences.length) {
          return { ...seq, sequenceText: importedSequences[index] };
        }
        return seq;
      }));
      
      let message = t('midiImported');
      if (importedSequences.length > 1) {
        message += ` (${importedSequences.length} треков)`;
      } else if (importedSequences.length === 1) {
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

  const renderSequenceWithHighlights = (sequence: SequenceBlock) => {
    const { parsedNotes, sequenceText, currentNoteIndex } = sequence;
    
    if (notes.length === 0) {
      return sequenceText;
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

  // Функция добавления новой последовательности
  const handleAddSequence = () => {
    const newId = (sequences.length + 1).toString();
    const newSequence: SequenceBlock = {
      id: newId,
      sequenceText: '',
      parsedNotes: [],
      selectedInstrument: 'piano',
      volume: 0.7,
      isMuted: false,
      isSolo: false,
      currentNoteIndex: -1
    };
    
    setSequences(prev => [...prev, newSequence]);
    toast.success(`Добавлена последовательность ${sequences.length + 1}`);
  };

  // Функция удаления последней последовательности
  const handleRemoveSequence = () => {
    if (sequences.length > 1) {
      setSequences(prev => prev.slice(0, -1));
      toast.success(`Удалена последовательность ${sequences.length}`);
    }
  };

  // Функция добавления в галерею
  const handleGalleryUpload = () => {
    console.log('handleGalleryUpload вызвана');
    console.log('galleryName:', galleryName);
    console.log('galleryAuthor:', galleryAuthor);
    console.log('sequence:', sequence);
    console.log('sequence2:', sequence2);
    
    if (!galleryName.trim() || !galleryAuthor.trim()) {
      console.log('Ошибка: пустые поля');
      toast.error('Заполните все поля');
      return;
    }

    if (galleryName.length < 3 || galleryName.length > 12) {
      console.log('Ошибка: неправильная длина названия');
      toast.error('Название должно быть от 3 до 12 символов');
      return;
    }

    if (galleryAuthor.length < 3 || galleryAuthor.length > 12) {
      console.log('Ошибка: неправильная длина автора');
      toast.error('Автор должен быть от 3 до 12 символов');
      return;
    }

    // Проверка на допустимые символы
    const validChars = /^[a-zA-Zа-яА-Я0-9\s\-]+$/;
    if (!validChars.test(galleryName) || !validChars.test(galleryAuthor)) {
      console.log('Ошибка: недопустимые символы');
      toast.error('Используйте только буквы, цифры, пробелы и дефисы');
      return;
    }

    try {
      // Генерируем уникальный ID
      const fileId = Math.random().toString(36).substr(2, 5).toUpperCase();
      console.log('Generated fileId:', fileId);
      
      // Создаем объект файла
      const newFile = {
        id: fileId,
        name: galleryName.trim(),
        author: galleryAuthor.trim(),
        sequence1: sequences[0]?.sequenceText || '',
        sequence2: sequences[1]?.sequenceText || '',
        rating: 0,
        userVotes: {},
        createdAt: Date.now()
      };

      console.log('newFile объект:', newFile);

      // Проверяем доступность localStorage
      if (typeof(Storage) === "undefined") {
        console.log('Ошибка: localStorage недоступен');
        toast.error('Хранилище недоступно в вашем браузере');
        return;
      }

      // Получаем существующие файлы
      const existingFilesStr = localStorage.getItem('midiGalleryFiles');
      console.log('Существующие файлы (строка):', existingFilesStr);
      
      const existingFiles = existingFilesStr ? JSON.parse(existingFilesStr) : [];
      console.log('Существующие файлы (массив):', existingFiles);
      
      const updatedFiles = [...existingFiles, newFile];
      console.log('Обновленный массив файлов:', updatedFiles);
      
      // Проверяем размер перед сохранением
      const dataSize = JSON.stringify(updatedFiles).length;
      console.log('Размер данных (символы):', dataSize);
      console.log('Размер данных (KB):', (dataSize / 1024).toFixed(2));
      
      if (dataSize > 4 * 1024 * 1024) { // 4MB предел
        toast.error('Галерея переполнена (лимит ~4MB). Удалите старые файлы.');
        return;
      }
      
      // Сохраняем в localStorage
      localStorage.setItem('midiGalleryFiles', JSON.stringify(updatedFiles));
      console.log('Файл сохранен в localStorage');
      
      setGalleryName('');
      setGalleryAuthor('');
      setShowGalleryDialog(false);
      
      const fileName = `${galleryName}_${galleryAuthor}_${fileId}.midi`;
      toast.success(`Файл ${fileName} добавлен в галерею`);
      console.log('Успешно добавлен файл:', fileName);
      
    } catch (error) {
      console.error('Ошибка при сохранении в галерею:', error);
      toast.error('Ошибка при сохранении: ' + (error as Error).message);
    }
  };

  // Функция загрузки файла из галереи
  const handleLoadFromGallery = (sequence1: string, sequence2: string) => {
    setSequences(prev => prev.map((seq, index) => {
      if (index === 0) return { ...seq, sequenceText: sequence1 };
      if (index === 1) return { ...seq, sequenceText: sequence2 };
      return seq;
    }));
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Expose handlePlay through ref
  React.useImperativeHandle(ref, () => ({
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
          {/* Кнопки управления файлами */}
          <div className="flex items-center justify-between mb-4">
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
                  setSequences(prev => prev.map(seq => ({ ...seq, sequenceText: '' })));
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

          {/* Динамические блоки последовательностей */}
          {sequences.map((sequence, index) => {
            const hasValidSequence = sequence.parsedNotes.length > 0 && !sequence.parsedNotes.some(note => note.isError);
            const hasErrors = sequence.parsedNotes.some(note => note.isError);
            
            return (
              <div key={sequence.id} className="space-y-2 border-b pb-4 last:border-b-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs md:text-sm font-medium">
                      Последовательность {index + 1}
                    </label>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => transposeSequence(index, 1)}
                        disabled={!hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={t('transposeUp')}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => transposeSequence(index, -1)}
                        disabled={!hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={t('transposeDown')}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => multiplyDuration(index, 0.5)}
                        disabled={!hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title="Уменьшить длительность x0.5"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => multiplyDuration(index, 2)}
                        disabled={!hasValidSequence}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title="Увеличить длительность x2"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <Textarea
                      value={sequence.sequenceText}
                      onChange={(e) => setSequences(prev => prev.map((seq, i) => 
                        i === index ? { ...seq, sequenceText: e.target.value } : seq
                      ))}
                      placeholder={`Последовательность ${index + 1}`}
                      className="min-h-20 md:min-h-24 font-mono flex-1 text-xs md:text-sm"
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => handleMute(index)}
                        className={`w-6 h-6 md:w-7 md:h-7 p-0 text-xs ${sequence.isMuted ? 'bg-red-500 text-white' : ''}`}
                        variant={sequence.isMuted ? 'default' : 'outline'}
                        title={`Mute последовательность ${index + 1}`}
                      >
                        M
                      </Button>
                      <Button
                        onClick={() => handleSolo(index)}
                        className={`w-6 h-6 md:w-7 md:h-7 p-0 text-xs ${sequence.isSolo ? 'bg-yellow-500 text-white' : ''}`}
                        variant={sequence.isSolo ? 'default' : 'outline'}
                        title={`Solo последовательность ${index + 1}`}
                      >
                        S
                      </Button>
                      <Button
                        onClick={() => handleVolumeChange(index, 0.1)}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={`Увеличить громкость (${Math.round(sequence.volume * 100)}%)`}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => handleVolumeChange(index, -0.1)}
                        className="w-6 h-6 md:w-7 md:h-7 p-0"
                        variant="outline"
                        title={`Уменьшить громкость (${Math.round(sequence.volume * 100)}%)`}
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
                    value={sequence.selectedInstrument} 
                    onValueChange={(value) => setSequences(prev => prev.map((seq, i) => 
                      i === index ? { ...seq, selectedInstrument: value } : seq
                    ))}
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
                    {renderSequenceWithHighlights(sequence)}
                  </div>
                </div>

                {hasErrors && (
                  <div className="p-2 md:p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-xs md:text-sm text-red-800 font-medium">{t('errorsFound')} {index + 1}:</p>
                    <ul className="text-xs text-red-700 mt-1 list-disc list-inside">
                      {sequence.parsedNotes
                        .filter(note => note.isError)
                        .map((note, errorIndex) => (
                          <li key={errorIndex}>{note.errorMessage}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Кнопки добавления/удаления последовательностей */}
          <div className="flex items-center justify-center gap-2 py-2">
            <Button
              onClick={handleAddSequence}
              variant="outline"
              size="sm"
              className="flex items-center gap-1 h-8 md:h-10 px-3 text-xs md:text-sm"
              title="Добавить последовательность"
            >
              <Plus className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden md:inline">Добавить</span>
            </Button>
            <Button
              onClick={handleRemoveSequence}
              disabled={sequences.length <= 1}
              variant="outline"
              size="sm"
              className="flex items-center gap-1 h-8 md:h-10 px-3 text-xs md:text-sm"
              title="Удалить последнюю последовательность"
            >
              <Minus className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden md:inline">Удалить</span>
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
                  className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full p-0"
                  variant="outline"
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
                    <Label htmlFor="gallery-name" className="text-sm">Введите название (3-12 символов)</Label>
                    <Input
                      id="gallery-name"
                      value={galleryName}
                      onChange={(e) => setGalleryName(e.target.value)}
                      placeholder="Название произведения"
                      maxLength={12}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gallery-author" className="text-sm">Введите автора (3-12 символов)</Label>
                    <Input
                      id="gallery-author"
                      value={galleryAuthor}
                      onChange={(e) => setGalleryAuthor(e.target.value)}
                      placeholder="Автор произведения"
                      maxLength={12}
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
                      onClick={handleGalleryUpload}
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
      
      <MidiGallery onLoadFile={handleLoadFromGallery} />
    </div>
  );
});

export default MidiSequencer;