import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUp, ArrowDown, Upload, Download, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export interface MidiFile {
  id: string;
  name: string;
  author: string;
  sequence1: string;
  sequence2: string;
  rating: number;
  userVotes: Record<string, 'up' | 'down'>;
  createdAt: number;
}

interface MidiGalleryProps {
  onLoadFile: (sequence1: string, sequence2: string) => void;
}

const MidiGallery: React.FC<MidiGalleryProps> = ({ onLoadFile }) => {
  const [midiFiles, setMidiFiles] = useState<MidiFile[]>([]);
  const [sortBy, setSortBy] = useState<'rating' | 'date'>('rating');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [currentUserId] = useState(() => {
    let userId = localStorage.getItem('midiGalleryUserId');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('midiGalleryUserId', userId);
    }
    return userId;
  });

  // Загрузка файлов из localStorage
  useEffect(() => {
    const savedFiles = localStorage.getItem('midiGalleryFiles');
    if (savedFiles) {
      try {
        setMidiFiles(JSON.parse(savedFiles));
      } catch (error) {
        console.error('Error loading MIDI files:', error);
      }
    }
  }, []);

  // Сохранение файлов в localStorage
  const saveFiles = (files: MidiFile[]) => {
    localStorage.setItem('midiGalleryFiles', JSON.stringify(files));
    setMidiFiles(files);
  };

  // Генерация уникального ID для файла
  const generateFileId = () => {
    return Math.random().toString(36).substr(2, 5).toUpperCase();
  };

  // Загрузка файла в галерею
  const handleUploadToGallery = (sequence1: string, sequence2: string) => {
    if (!uploadName.trim() || !uploadAuthor.trim()) {
      toast.error('Заполните все поля');
      return;
    }

    if (uploadName.length < 3 || uploadName.length > 8) {
      toast.error('Название должно быть от 3 до 8 символов');
      return;
    }

    if (uploadAuthor.length < 3 || uploadAuthor.length > 8) {
      toast.error('Автор должен быть от 3 до 8 символов');
      return;
    }

    // Проверка на допустимые символы (буквы, цифры, пробелы, дефисы)
    const validChars = /^[a-zA-Zа-яА-Я0-9\s\-]+$/;
    if (!validChars.test(uploadName) || !validChars.test(uploadAuthor)) {
      toast.error('Используйте только буквы, цифры, пробелы и дефисы');
      return;
    }

    const fileId = generateFileId();
    const newFile: MidiFile = {
      id: fileId,
      name: uploadName.trim(),
      author: uploadAuthor.trim(),
      sequence1,
      sequence2,
      rating: 0,
      userVotes: {},
      createdAt: Date.now()
    };

    const updatedFiles = [...midiFiles, newFile];
    saveFiles(updatedFiles);
    
    setUploadName('');
    setUploadAuthor('');
    setShowUploadDialog(false);
    toast.success(`Файл ${uploadName}_${uploadAuthor}_${fileId}.midi добавлен в галерею`);
  };

  // Голосование за файл
  const handleVote = (fileId: string, voteType: 'up' | 'down') => {
    const updatedFiles = midiFiles.map(file => {
      if (file.id === fileId) {
        const newUserVotes = { ...file.userVotes };
        const currentVote = newUserVotes[currentUserId];
        
        // Удаляем старый голос если есть
        if (currentVote === 'up') {
          file.rating--;
        } else if (currentVote === 'down') {
          file.rating++;
        }
        
        // Добавляем новый голос если он отличается от текущего
        if (currentVote !== voteType) {
          newUserVotes[currentUserId] = voteType;
          if (voteType === 'up') {
            file.rating++;
          } else {
            file.rating--;
          }
        } else {
          // Если голос такой же - убираем его
          delete newUserVotes[currentUserId];
        }
        
        return {
          ...file,
          userVotes: newUserVotes
        };
      }
      return file;
    });
    
    saveFiles(updatedFiles);
  };

  // Загрузка файла в последовательности
  const handleLoadFile = (file: MidiFile) => {
    const confirmMessage = 'Текущие последовательности будут очищены. Продолжить?';
    if (window.confirm(confirmMessage)) {
      onLoadFile(file.sequence1, file.sequence2);
      toast.success(`Загружен файл: ${file.name}_${file.author}_${file.id}`);
    }
  };

  // Скачивание MIDI файла
  const handleDownloadFile = async (file: MidiFile) => {
    try {
      // Парсим последовательности для экспорта
      const { parseNoteSequence } = await import('@/utils/midiUtils');
      const parsedNotes1 = parseNoteSequence(file.sequence1, (key: string) => key);
      const parsedNotes2 = parseNoteSequence(file.sequence2, (key: string) => key);
      
      // Экспортируем как MIDI
      const { exportMidi } = await import('@/utils/midiUtils');
      await exportMidi(parsedNotes1, parsedNotes2, 1, { 
        format: 'midi' as const
      });
      
      toast.success(`Скачивается: ${file.name}_${file.author}_${file.id}.midi`);
    } catch (error) {
      console.error('Ошибка при скачивании MIDI:', error);
      toast.error('Ошибка при экспорте MIDI файла');
    }
  };

  // Сортировка файлов
  const sortedFiles = [...midiFiles].sort((a, b) => {
    if (sortBy === 'rating') {
      return sortOrder === 'desc' ? b.rating - a.rating : a.rating - b.rating;
    } else {
      return sortOrder === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
    }
  });

  // Переключение порядка сортировки
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-xl">Галерея MIDI</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-sm">Упорядочить по:</span>
          <Select value={sortBy} onValueChange={(value: 'rating' | 'date') => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Рейтинг</SelectItem>
              <SelectItem value="date">Новое</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={toggleSortOrder}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            {sortOrder === 'desc' ? 
              (sortBy === 'rating' ? 'Больше→Меньше' : 'Новее→Старее') : 
              (sortBy === 'rating' ? 'Меньше→Больше' : 'Старее→Новее')
            }
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedFiles.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Галерея пуста</p>
        ) : (
          <div className="space-y-2">
            {sortedFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-2 p-2 border rounded-md">
                {/* Кнопки действий */}
                <div className="flex gap-1">
                  <Button
                    onClick={() => handleLoadFile(file)}
                    variant="outline"
                    size="sm"
                    title="Подгрузить в последовательности"
                  >
                    <Upload className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={() => handleDownloadFile(file)}
                    variant="outline"
                    size="sm"
                    title="Скачать MIDI файл"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                </div>

                {/* Название файла */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono truncate block">
                    {file.name}_{file.author}_{file.id}
                  </span>
                </div>

                {/* Кнопки голосования */}
                <div className="flex gap-1">
                  <Button
                    onClick={() => handleVote(file.id, 'up')}
                    variant={file.userVotes[currentUserId] === 'up' ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                  >
                    <ArrowUp className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button
                    onClick={() => handleVote(file.id, 'down')}
                    variant={file.userVotes[currentUserId] === 'down' ? "destructive" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                  >
                    <ArrowDown className="w-3 h-3 text-red-600" />
                  </Button>
                </div>

                {/* Рейтинг */}
                <div className="min-w-[3rem] text-center">
                  <span className={`text-sm font-semibold ${
                    file.rating < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {file.rating}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Диалог загрузки в галерею */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Добавить в галерею</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="upload-name">Введите название (3-8 символов)</Label>
                <Input
                  id="upload-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Название произведения"
                  maxLength={8}
                />
              </div>
              <div>
                <Label htmlFor="upload-author">Введите автора (3-8 символов)</Label>
                <Input
                  id="upload-author"
                  value={uploadAuthor}
                  onChange={(e) => setUploadAuthor(e.target.value)}
                  placeholder="Автор произведения"
                  maxLength={8}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowUploadDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Отмена
                </Button>
                <Button
                  onClick={() => {
                    // Этот обработчик будет переопределен в родительском компоненте
                  }}
                  className="flex-1"
                  disabled={!uploadName.trim() || !uploadAuthor.trim()}
                >
                  Добавить
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export { MidiGallery, type MidiGalleryProps };
export default MidiGallery;