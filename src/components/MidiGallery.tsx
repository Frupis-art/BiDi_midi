import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUp, ArrowDown, Upload, Download, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';

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
  const { t } = useLanguage();
  const [midiFiles, setMidiFiles] = useState<MidiFile[]>([]);
  const [sortBy, setSortBy] = useState<'rating' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [adminSequences, setAdminSequences] = useState<Record<string, string[]>>({});
  const [adminUnlocked, setAdminUnlocked] = useState<Record<string, boolean>>({});
  const [currentUserId] = useState(() => {
    let userId = localStorage.getItem('midiGalleryUserId');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('midiGalleryUserId', userId);
    }
    return userId;
  });

  // Секретная админская комбинация: 1↑, 2↓, 6↑, 4↓
  const ADMIN_SEQUENCE = ['up', 'down', 'down', 'up', 'up', 'up', 'up', 'up', 'up', 'down', 'down', 'down', 'down'];

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
      toast.error(t('fillAllFields'));
      return;
    }

    if (uploadName.length < 3 || uploadName.length > 12) {
      toast.error(t('titleLength'));
      return;
    }

    if (uploadAuthor.length < 3 || uploadAuthor.length > 12) {
      toast.error(t('authorLength'));
      return;
    }

    // Проверка на допустимые символы (буквы, цифры, пробелы, дефисы)
    const validChars = /^[a-zA-Zа-яА-Я0-9\s\-]+$/;
    if (!validChars.test(uploadName) || !validChars.test(uploadAuthor)) {
      toast.error(t('validCharsOnly'));
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
    toast.success(`${uploadName}_${uploadAuthor}_${fileId}.midi ${t('fileAdded')}`);
  };

  // Обработка админской последовательности
  const handleAdminSequence = (fileId: string, action: 'up' | 'down') => {
    const currentSequence = adminSequences[fileId] || [];
    const newSequence = [...currentSequence, action];
    
    // Проверяем, совпадает ли текущая последовательность с началом админской
    const isValidSoFar = ADMIN_SEQUENCE.slice(0, newSequence.length).every(
      (expectedAction, index) => expectedAction === newSequence[index]
    );
    
    if (!isValidSoFar) {
      // Неправильная последовательность - сбрасываем
      setAdminSequences(prev => ({
        ...prev,
        [fileId]: []
      }));
      console.log(`[ADMIN] Неправильная последовательность для ${fileId}, сброс`);
      return;
    }
    
    // Обновляем последовательность
    setAdminSequences(prev => ({
      ...prev,
      [fileId]: newSequence
    }));
    
    console.log(`[ADMIN] Последовательность для ${fileId}: ${newSequence.join(', ')}`);
    
    // Проверяем, завершена ли админская последовательность
    if (newSequence.length === ADMIN_SEQUENCE.length) {
      console.log(`[ADMIN] Админский доступ разблокирован для файла ${fileId}`);
      setAdminUnlocked(prev => ({
        ...prev,
        [fileId]: true
      }));
      
      // Сбрасываем последовательность
      setAdminSequences(prev => ({
        ...prev,
        [fileId]: []
      }));
      
      toast.success(t('adminRightsActivated'), { duration: 2000 });
      
      // Автоматически скрываем админский доступ через 10 секунд
      setTimeout(() => {
        setAdminUnlocked(prev => ({
          ...prev,
          [fileId]: false
        }));
      }, 10000);
    }
  };

  // Голосование за файл с админской последовательностью
  const handleVote = (fileId: string, voteType: 'up' | 'down') => {
    // Сначала обрабатываем админскую последовательность
    handleAdminSequence(fileId, voteType);
    
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

  // Обновление галереи
  const handleRefreshGallery = () => {
    const savedFiles = localStorage.getItem('midiGalleryFiles');
    if (savedFiles) {
      try {
        const files = JSON.parse(savedFiles);
        setMidiFiles(files);
        toast.success(t('galleryRefreshed'));
      } catch (error) {
        console.error('Error refreshing gallery:', error);
        toast.error(t('refreshError'));
      }
    } else {
      setMidiFiles([]);
      toast.success(t('galleryRefreshed'));
    }
  };

  // Удаление файла (админская функция)
  const handleDeleteFile = (fileId: string) => {
    const fileToDelete = midiFiles.find(f => f.id === fileId);
    if (!fileToDelete) return;
    
    const confirmMessage = `${t('confirmDelete')} "${fileToDelete.name}_${fileToDelete.author}_${fileToDelete.id}"?`;
    if (window.confirm(confirmMessage)) {
      const updatedFiles = midiFiles.filter(file => file.id !== fileId);
      saveFiles(updatedFiles);
      
      // Очищаем админское состояние для этого файла
      setAdminUnlocked(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
      
      setAdminSequences(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
      
      toast.success(`${fileToDelete.name}_${fileToDelete.author}_${fileToDelete.id} ${t('fileDeleted')}`);
    }
  };

  // Загрузка файла в последовательности
  const handleLoadFile = (file: MidiFile) => {
    const confirmMessage = t('confirmLoad');
    if (window.confirm(confirmMessage)) {
      onLoadFile(file.sequence1, file.sequence2);
      toast.success(`${t('fileLoaded')} ${file.name}_${file.author}_${file.id}`);
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
      
      toast.success(`${t('downloading')} ${file.name}_${file.author}_${file.id}.midi`);
    } catch (error) {
      console.error('Ошибка при скачивании MIDI:', error);
      toast.error(t('exportError'));
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
        <CardTitle className="text-xl">{t('galleryTitle')}</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-sm">{t('sortBy')}</span>
          <Select value={sortBy} onValueChange={(value: 'rating' | 'date') => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">{t('rating')}</SelectItem>
              <SelectItem value="date">{t('date')}</SelectItem>
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
              (sortBy === 'rating' ? t('higherToLower') : t('newerToOlder')) : 
              (sortBy === 'rating' ? t('lowerToHigher') : t('olderToNewer'))
            }
          </Button>
          <Button
            onClick={handleRefreshGallery}
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            title={t('refresh')}
          >
            <RotateCcw className="w-3 h-3" />
            {t('refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedFiles.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">{t('galleryEmpty')}</p>
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
                    title={t('loadToSequences')}
                  >
                    <Upload className="w-3 h-3" />
                  </Button>
                  <Button
                    onClick={() => handleDownloadFile(file)}
                    variant="outline"
                    size="sm"
                    title={t('downloadMidi')}
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                  
                  {/* Админская кнопка удаления */}
                  {adminUnlocked[file.id] && (
                    <Button
                      onClick={() => handleDeleteFile(file.id)}
                      variant="destructive"
                      size="sm"
                      title={`🔐 ${t('deleteFile')}`}
                      className="animate-pulse"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
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
              <DialogTitle>{t('addToGallery')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="upload-name">{t('enterTitle')}</Label>
                <Input
                  id="upload-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder={t('titlePlaceholder')}
                  maxLength={8}
                />
              </div>
              <div>
                <Label htmlFor="upload-author">{t('enterAuthor')}</Label>
                <Input
                  id="upload-author"
                  value={uploadAuthor}
                  onChange={(e) => setUploadAuthor(e.target.value)}
                  placeholder={t('authorPlaceholder')}
                  maxLength={8}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowUploadDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => {
                    // Этот обработчик будет переопределен в родительском компоненте
                  }}
                  className="flex-1"
                  disabled={!uploadName.trim() || !uploadAuthor.trim()}
                >
                  {t('add')}
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