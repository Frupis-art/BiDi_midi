import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ArrowUp, ArrowDown, Upload, Download, RotateCcw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

// Импортируем Firebase
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

export interface MidiFile {
  id: string;
  name: string;
  author: string;
  sequences: [string, string];
  rating: number;
  userVote?: 'up' | 'down';
  createdAt: number;
}

interface MidiGalleryProps {
  onLoadFile: (sequence1: string, sequence2: string) => void;
}

const MidiGallery = forwardRef<{ 
  setOpen: (open: boolean) => void;
  uploadToGallery: (sequence1: string, sequence2: string, name: string, author: string) => Promise<MidiFile>;
}, MidiGalleryProps>(
  ({ onLoadFile }, ref) => {
    const [midiFiles, setMidiFiles] = useState<MidiFile[]>([]);
    const [sortBy, setSortBy] = useState<'rating' | 'date'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [adminSequences, setAdminSequences] = useState<Record<string, string[]>>({});
    const [adminUnlocked, setAdminUnlocked] = useState<Record<string, boolean>>({});
    const [open, setOpen] = useState(true);
    const [isOnline, setIsOnline] = useState(true);

    // Секретная админская комбинация
    const ADMIN_SEQUENCE = ['up', 'down', 'down', 'up', 'up', 'up', 'up', 'up', 'up', 'down', 'down', 'down', 'down'];

    // Инициализация пользователя
    const [currentUserId] = useState(() => {
      let userId = localStorage.getItem('midiGalleryUserId');
      if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('midiGalleryUserId', userId);
      }
      return userId;
    });

    // Функция для безопасного имени файла
    const safeFileName = (str: string) => 
      str.replace(/[^\wа-яА-Я\s]/gi, '').replace(/\s+/g, '_');

    // Хук для обработки скачивания с защитой от множественных вызовов
    const useDownloadHandler = () => {
      const isDownloadingRef = useRef(false);
      
      return async (file: MidiFile) => {
        if (isDownloadingRef.current) return;
        isDownloadingRef.current = true;
        
        try {
          // Проверка на пустые последовательности
          if (!file.sequences[0] && !file.sequences[1]) {
            toast.error('Файл не содержит данных');
            return;
          }
          
          // Генерируем MIDI из текстовых последовательностей
          const { parseNoteSequence, exportMidi } = await import('@/utils/midiUtils');
          const parsedNotes1 = file.sequences[0] 
            ? parseNoteSequence(file.sequences[0], (key: string) => key)
            : [];
          const parsedNotes2 = file.sequences[1] 
            ? parseNoteSequence(file.sequences[1], (key: string) => key)
            : [];
          
          // Получаем Blob с MIDI данными
        const midiBlob = await exportMidi(parsedNotes1, parsedNotes2, 1, { 
          format: 'midi' as const
        });
        
        if (!midiBlob) return;
        
        // Создаем URL для скачивания
        const url = URL.createObjectURL(midiBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeFileName(file.name)}_${safeFileName(file.author)}.mid`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          
          // Убираем ссылку после скачивания
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
          
          toast.success(`Скачивается: ${file.name}_${file.author}.mid`);
        } catch (error) {
          console.error('Ошибка при скачивании MIDI:', error);
          toast.error('Ошибка при экспорте MIDI файла');
        } finally {
          isDownloadingRef.current = false;
        }
      };
    };
    
    const handleDownloadFile = useDownloadHandler();

    // Проверка подключения к Firebase
    const checkFirebaseConnection = async () => {
      try {
        // Простая проверка соединения - попытка получить коллекцию
        await getDocs(collection(db, 'midi_files'));
        setIsOnline(true);
        return true;
      } catch (err) {
        console.error('Firebase connection error:', err);
        setIsOnline(false);
        return false;
      }
    };

    // Загрузка файлов из localStorage
    const loadLocalFiles = () => {
      const savedFiles = localStorage.getItem('midiGalleryFiles');
      if (savedFiles) {
        try {
          const files: MidiFile[] = JSON.parse(savedFiles);
          setMidiFiles(files);
        } catch (error) {
          console.error('Error loading local files:', error);
        }
      }
    };

    // Сохранение в localStorage
    const saveFilesToLocal = (files: MidiFile[]) => {
      localStorage.setItem('midiGalleryFiles', JSON.stringify(files));
    };

    // Загрузка файлов (Firebase или localStorage)
    const loadFiles = async () => {
      const isConnected = await checkFirebaseConnection();
      
      if (isConnected) {
        try {
          // Загрузка файлов
          const filesSnapshot = await getDocs(collection(db, 'midi_files'));
          const filesData: MidiFile[] = [];
          
          filesSnapshot.forEach((doc) => {
            const data = doc.data();
            filesData.push({
              id: doc.id,
              name: data.name,
              author: data.author,
              sequences: data.sequences,
              rating: data.rating || 0,
              createdAt: data.createdAt?.toMillis() || Date.now(),
            });
          });

          // Загрузка голосов текущего пользователя
          const votesQuery = query(
            collection(db, 'midi_votes'),
            where('userId', '==', currentUserId)
          );
          const votesSnapshot = await getDocs(votesQuery);
          const userVotes: Record<string, 'up' | 'down'> = {};
          
          votesSnapshot.forEach((doc) => {
            const data = doc.data();
            userVotes[data.fileId] = data.vote > 0 ? 'up' : 'down';
          });

          // Объединяем файлы с голосами
          const filesWithVotes = filesData.map(file => ({
            ...file,
            userVote: userVotes[file.id]
          }));

          setMidiFiles(filesWithVotes);
          saveFilesToLocal(filesWithVotes);
        } catch (error) {
          console.error('Firebase load error:', error);
          loadLocalFiles();
        }
      } else {
        loadLocalFiles();
      }
    };

    // Инициализация
    useEffect(() => {
      loadFiles();
    }, []);

    // Загрузка файла в галерею (только текстовые последовательности)
    const uploadToGallery = async (sequence1: string, sequence2: string, name: string, author: string) => {
      // Проверки на длину
      if (name.length < 3 || name.length > 20) {
        throw new Error('Название должно быть от 3 до 20 символов');
      }
      
      if (author.length < 3 || author.length > 20) {
        throw new Error('Автор должен быть от 3 до 20 символов');
      }

      try {
        // Сохраняем только текстовые последовательности в Firebase
        const docRef = await addDoc(collection(db, 'midi_files'), {
          name,
          author,
          sequences: [sequence1, sequence2],
          rating: 0,
          createdAt: serverTimestamp(),
        });
        
        const newFile: MidiFile = {
          id: docRef.id,
          name,
          author,
          sequences: [sequence1, sequence2] as [string, string],
          rating: 0,
          createdAt: Date.now(),
        };
        
        const updatedFiles = [...midiFiles, newFile];
        setMidiFiles(updatedFiles);
        saveFilesToLocal(updatedFiles);
        
        toast.success(`Файл добавлен в онлайн-галерею!`);
        return newFile;
      } catch (error) {
        console.error('Upload failed:', error);
        throw new Error('Ошибка сохранения: ' + error.message);
      }
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
        return;
      }
      
      // Обновляем последовательность
      setAdminSequences(prev => ({
        ...prev,
        [fileId]: newSequence
      }));
      
      // Проверяем, завершена ли админская последовательность
      if (newSequence.length === ADMIN_SEQUENCE.length) {
        setAdminUnlocked(prev => ({
          ...prev,
          [fileId]: true
        }));
        
        // Сбрасываем последовательность
        setAdminSequences(prev => ({
          ...prev,
          [fileId]: []
        }));
        
        toast.success('🔐 Админские права активированы', { duration: 2000 });
        
        // Автоматически скрываем админский доступ через 10 секунд
        setTimeout(() => {
          setAdminUnlocked(prev => ({
            ...prev,
            [fileId]: false
          }));
        }, 10000);
      }
    };

    // Голосование
    const handleVote = async (fileId: string, voteType: 'up' | 'down') => {
      // Админская последовательность
      handleAdminSequence(fileId, voteType);
      
      const voteValue = voteType === 'up' ? 1 : -1;
      const file = midiFiles.find(f => f.id === fileId);
      
      if (!file) return;
      
      // Оптимистичное обновление
      const currentVote = file.userVote;
      let ratingChange = voteValue;
      
      if (currentVote === 'up') {
        ratingChange -= 1;
      } else if (currentVote === 'down') {
        ratingChange += 1;
      }
      
      const updatedFiles = midiFiles.map(f => 
        f.id === fileId ? {
          ...f,
          rating: f.rating + ratingChange,
          userVote: voteType
        } : f
      );
      
      setMidiFiles(updatedFiles);
      saveFilesToLocal(updatedFiles);
      
      try {
        if (isOnline) {
          // Обновляем рейтинг в Firebase
          await updateDoc(doc(db, 'midi_files', fileId), {
            rating: file.rating + ratingChange
          });
          
          // Сохраняем голос пользователя
          const voteDocRef = doc(db, 'midi_votes', `${fileId}_${currentUserId}`);
          await updateDoc(voteDocRef, {
            fileId,
            userId: currentUserId,
            vote: voteValue
          }, { merge: true });
        }
      } catch (error) {
        toast.error('Ошибка голосования');
        setMidiFiles(midiFiles); // Откат изменений
      }
    };

    // Обновление галереи
    const handleRefreshGallery = () => {
      loadFiles();
      toast.success(isOnline 
        ? 'Галерея обновлена' 
        : 'Используется локальная копия');
    };

    // Удаление файла
    const handleDeleteFile = async (fileId: string) => {
      const fileToDelete = midiFiles.find(f => f.id === fileId);
      if (!fileToDelete) return;
      
      const confirmMessage = `Удалить файл "${fileToDelete.name}_${fileToDelete.author}_${fileToDelete.id}" из галереи?`;
      if (!window.confirm(confirmMessage)) return;
      
      try {
        if (isOnline) {
          // Удаляем запись из Firebase
          await deleteDoc(doc(db, 'midi_files', fileId));
          
          // Удаляем все голоса для этого файла
          const votesQuery = query(
            collection(db, 'midi_votes'),
            where('fileId', '==', fileId)
          );
          
          const votesSnapshot = await getDocs(votesQuery);
          votesSnapshot.forEach(async (voteDoc) => {
            await deleteDoc(voteDoc.ref);
          });
        }
        
        // Обновление состояния
        const updatedFiles = midiFiles.filter(f => f.id !== fileId);
        setMidiFiles(updatedFiles);
        saveFilesToLocal(updatedFiles);
        
        // Очищаем админское состояние
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
        
        toast.success(`Файл удален`);
      } catch (error) {
        toast.error('Ошибка удаления: ' + error.message);
      }
    };

    // Загрузка файла в последовательности
    const handleLoadFile = (file: MidiFile) => {
      const confirmMessage = 'Текущие последовательности будут очищены. Продолжить?';
      if (window.confirm(confirmMessage)) {
        onLoadFile(file.sequences[0], file.sequences[1]);
        toast.success(`Загружен файл: ${file.name}_${file.author}_${file.id}`);
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

    // Экспорт методов через ref
    useImperativeHandle(ref, () => ({
      setOpen: (open: boolean) => {
        setOpen(open);
      },
      uploadToGallery: uploadToGallery
    }));

    return (
      <Card className="mt-4 text-xs">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CardHeader className="p-2 md:p-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-md md:text-lg flex items-center gap-1">
                Галерея MIDI
                {isOnline ? 
                  <Wifi className="text-green-500" size={16} /> : 
                  <WifiOff className="text-yellow-500" size={16} />
                }
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="w-6 h-6 md:w-7 md:h-7"
                  aria-label={open ? 'Свернуть галерею' : 'Развернуть галерею'}
                  title={open ? 'Свернуть' : 'Развернуть'}
                >
                  {open ? '−' : '+'}
                </Button>
              </CollapsibleTrigger>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={sortBy} onValueChange={(value: 'rating' | 'date') => setSortBy(value)}>
                  <SelectTrigger className="w-20 md:w-24 h-7 md:h-8 text-xs">
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
                  className="flex items-center gap-1 h-7 md:h-8 px-2 text-xs"
                >
                  {sortOrder === 'desc' ? '/\\' : '\\/'}
                </Button>
                <Button
                  onClick={handleRefreshGallery}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 h-7 md:h-8 px-2 text-xs"
                  title="Обновить галерею"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="p-2 md:p-3 pt-0">
              {/* Индикатор режима */}
              {!isOnline && (
                <div className="mb-2 p-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                  ⚠️ Используется локальная галерея
                </div>
              )}
              
              {sortedFiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-2 text-xs">
                  Галерея пуста
                </p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {sortedFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-1 p-1 border rounded-md">
                      {/* Кнопки действий */}
                      <div className="flex gap-1">
                        <Button
                          onClick={() => handleLoadFile(file)}
                          variant="outline"
                          size="sm"
                          className="w-4 h-4 md:w-5 md:h-5 p-0"
                          title="Подгрузить в последовательности"
                        >
                          <Upload className="w-2 h-2 md:w-3 md:h-3" />
                        </Button>
                        <Button
                          onClick={() => handleDownloadFile(file)}
                          variant="outline"
                          size="sm"
                          className="w-4 h-4 md:w-5 md:h-5 p-0"
                          title="Скачать MIDI файл"
                        >
                          <Download className="w-2 h-2 md:w-3 md:h-3" />
                        </Button>
                        {/* Админская кнопка удаления */}
                        {adminUnlocked[file.id] && (
                          <Button
                            onClick={() => handleDeleteFile(file.id)}
                            variant="destructive"
                            size="sm"
                            className="w-4 h-4 md:w-5 md:h-5 p-0"
                            title="🔐 Удалить файл (АДМИН)"
                          >
                            <Trash2 className="w-2 h-2 md:w-3 md:h-3" />
                          </Button>
                        )}
                      </div>

                      {/* Название файла */}
                      <div className="flex-1 min-w-0 px-1">
                        <span 
                          className="text-xs truncate block" 
                          title={`${file.name} - ${file.author} (ID: ${file.id})`}
                        >
                          {file.name} - {file.author}
                        </span>
                      </div>

                      {/* Кнопки голосования */}
                      <div className="flex gap-0.5">
                        <Button
                          onClick={() => handleVote(file.id, 'up')}
                          variant={file.userVote === 'up' ? 'default' : 'outline'}
                          size="sm"
                          className="w-4 h-4 md:w-5 md:h-5 p-0"
                        >
                          <ArrowUp className="w-2 h-2 text-green-600" />
                        </Button>
                        <Button
                          onClick={() => handleVote(file.id, 'down')}
                          variant={file.userVote === 'down' ? 'destructive' : 'outline'}
                          size="sm"
                          className="w-4 h-4 md:w-5 md:h-5 p-0"
                        >
                          <ArrowDown className="w-2 h-2 text-red-600" />
                        </Button>
                      </div>

                      {/* Рейтинг */}
                      <div className="min-w-[1.5rem] text-center">
                        <span className={`text-xs font-semibold ${file.rating < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {file.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }
);

export default MidiGallery;