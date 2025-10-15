import React, { useState, useRef, useEffect } from "react";
import MidiSequencer from '@/components/MidiSequencer';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';

type Note = {
  symbol: string;
  octave: number;
  duration: number;
  sharp: boolean;
  pause: boolean;
};

type NoteImageState = {
  currentIndex: number;
  availablePaths: string[];
  hasAlts: boolean;
};

const Index = () => {
  const [tabInput, setTabInput] = useState("");
  const [parsedNotes, setParsedNotes] = useState<Note[]>([]);
  const [instrument, setInstrument] = useState("recorder");
  const [imageSize, setImageSize] = useState(100);
  const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
  const [availableInstruments, setAvailableInstruments] = useState<string[]>([]);
  const [isPlayButtonWaiting, setIsPlayButtonWaiting] = useState(false);
  const [isPlayButtonActive, setIsPlayButtonActive] = useState(false);
  const [noteStates, setNoteStates] = useState<Record<number, NoteImageState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [screenshotTitle, setScreenshotTitle] = useState("");
  const [showScreenshotDialog, setShowScreenshotDialog] = useState(false);
  const [currentPlayingNote, setCurrentPlayingNote] = useState<{sequenceIndex: number, noteIndex: number} | null>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const midiSequencerRef = useRef<{ 
    handlePlay: () => void;
    registerPlaybackEndCallback: (callback: () => void) => void;
  }>(null);
  const playDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imageCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fetchInstruments = async () => {
      try {
        const response = await fetch('/tabs/instruments.json');
        if (!response.ok) throw new Error("Failed to fetch instruments");
        
        const instruments = await response.json();
        setAvailableInstruments(instruments);
        
        if (instruments.length > 0) {
          setInstrument(instruments[0]);
        }
      } catch (error) {
        console.error("Error loading instruments:", error);
        setAvailableInstruments(["recorder", "clarinet", "flute", "cello"]);
      }
    };

    fetchInstruments();
  }, []);

  const parseTabNotes = (input: string): Note[] => {
    const flatToSharp: {[key: string]: string} = {
      "DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#",
      "D♭": "C#", "E♭": "D#", "G♭": "F#", "A♭": "G#", "B♭": "A#"
    };

    const regex = /([A-GP])([#♭])?(\d+)?(?:\((\d+)\))?/g;
    const notes: Note[] = [];
    let match;
    
    while ((match = regex.exec(input.toUpperCase())) !== null) {
      const [_, symbol, modifier, octaveStr, durationStr] = match;
      if (!symbol) continue;
      
      if (symbol === "P") {
        notes.push({
          symbol: "P",
          octave: 0,
          duration: durationStr ? parseInt(durationStr) : 1000,
          sharp: false,
          pause: true
        });
        continue;
      }
      
      notes.push({
        symbol,
        octave: octaveStr ? parseInt(octaveStr) : 4,
        duration: durationStr ? parseInt(durationStr) : 1000,
        sharp: modifier === "#",
        pause: false
      });
    }
    
    return notes;
  };

  const getImageName = (note: Note) => {
    if (note.pause) return "P";
    
    // Автоматическая замена E# -> F, B# -> C
    if (note.sharp) {
      if (note.symbol === 'E') {
        return `F${note.octave}`;
      }
      if (note.symbol === 'B') {
        return `C${note.octave + 1}`;
      }
    }
    
    return `${note.symbol}${note.sharp ? "dis" : ""}${note.octave}`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTabInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
  };

  const waitForImages = (container: HTMLElement) => {
    const images = Array.from(container.querySelectorAll('img'));
    const promises = images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    });
    return Promise.all(promises);
  };

  const takeScreenshot = async () => {
    if (!tabContainerRef.current || isTakingScreenshot) return;
    
    if (!screenshotTitle.trim()) {
      toast.error("Введите название для скриншота");
      return;
    }
    
    setIsTakingScreenshot(true);
    
    try {
      await waitForImages(tabContainerRef.current);
      
      // Создаем временный контейнер для A4 формата
      const printContainer = document.createElement('div');
      printContainer.style.width = '210mm'; // A4 ширина
      printContainer.style.minHeight = '297mm'; // A4 высота
      printContainer.style.padding = '20mm';
      printContainer.style.backgroundColor = 'white';
      printContainer.style.boxSizing = 'border-box';
      printContainer.style.position = 'fixed';
      printContainer.style.left = '-10000px';
      printContainer.style.top = '0';
      
      // Добавляем заголовок
      const titleEl = document.createElement('div');
      titleEl.style.textAlign = 'center';
      titleEl.style.marginBottom = '20px';
      titleEl.style.fontSize = '24px';
      titleEl.style.fontWeight = 'bold';
      titleEl.textContent = screenshotTitle;
      printContainer.appendChild(titleEl);
      
      // Клонируем и настраиваем контент
      const contentClone = tabContainerRef.current.cloneNode(true) as HTMLDivElement;
      contentClone.style.width = '100%';
      contentClone.style.backgroundColor = 'white';
      contentClone.style.padding = '0';
      contentClone.style.border = 'none';
      
      // Сохраняем оригинальные размеры изображений
      const noteElements = contentClone.querySelectorAll('.note-container');
      noteElements.forEach(el => {
        const element = el as HTMLElement;
        element.style.width = `${imageSize}px`;
        element.style.minHeight = `${imageSize * 3 + 60}px`;
        
        const images = element.querySelectorAll('img');
        images.forEach(img => {
          img.style.width = `${imageSize}px`;
          if (img.alt.includes('tab')) {
            img.style.height = `${imageSize * 1.5}px`;
          } else {
            img.style.height = `${imageSize * 1.5}px`;
          }
        });
      });
      
      printContainer.appendChild(contentClone);
      document.body.appendChild(printContainer);

      const canvas = await html2canvas(printContainer, {
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scale: 2, // Высокое качество для печати
      });
      
      // Убираем временный контейнер
      document.body.removeChild(printContainer);
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${screenshotTitle.replace(/[^\wа-яА-Я\s]/gi, '').replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setScreenshotTitle("");
      setShowScreenshotDialog(false);
      toast.success('Скриншот сохранен в формате A4!');
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      toast.error('Не удалось создать скриншот');
    } finally {
      setIsTakingScreenshot(false);
    }
  };

  const handleTabConvert = () => {
    const notes = parseTabNotes(tabInput);
    setParsedNotes(notes);
    
    // Инициализация состояний для новых нот
    const newStates: Record<number, NoteImageState> = {};
    notes.forEach((_, index) => {
      newStates[index] = { 
        currentIndex: 0,
        availablePaths: [],
        hasAlts: false
      };
    });
    setNoteStates(newStates);
  };

  const handlePlayWithDelay = () => {
    if (isPlayButtonWaiting || isPlayButtonActive) {
      if (playDelayTimeoutRef.current) {
        clearTimeout(playDelayTimeoutRef.current);
        playDelayTimeoutRef.current = null;
      }
      
      if (midiSequencerRef.current && isPlayButtonActive) {
        midiSequencerRef.current.handlePlay();
      }
      
      setIsPlayButtonWaiting(false);
      setIsPlayButtonActive(false);
      return;
    }

    setIsPlayButtonWaiting(true);
    
    playDelayTimeoutRef.current = setTimeout(() => {
      setIsPlayButtonWaiting(false);
      setIsPlayButtonActive(true);
      
      if (midiSequencerRef.current) {
        midiSequencerRef.current.registerPlaybackEndCallback(() => {
          setIsPlayButtonActive(false);
        });
        
        midiSequencerRef.current.handlePlay();
      }
    }, 2000);
  };

  // Обработчик для изменения текущей ноты
  const handleCurrentNoteChange = (sequenceIndex: number, noteIndex: number) => {
    setCurrentPlayingNote(noteIndex >= 0 ? { sequenceIndex, noteIndex } : null);
  };

  // Оптимизированная проверка изображений с таймаутом
  const checkImageExists = (path: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      
      // Устанавливаем таймаут для быстрой реакции
      const timeout = setTimeout(() => {
        resolve(false);
        img.onload = null;
        img.onerror = null;
      }, 300); // Таймаут 300мс

      img.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
      
      img.src = path;
    });
  };

  // Функция для получения всех доступных путей изображений для ноты
  const getAvailablePaths = async (note: Note): Promise<{ paths: string[], hasAlts: boolean }> => {
    if (note.pause) {
      return { paths: ['/tabs/P.png'], hasAlts: false };
    }
    
    const imageName = getImageName(note);
    const basePath = `/tabs/${instrument}/`;
    const paths: string[] = [];
    let hasAlts = false;
    
    // Проверяем основное изображение
    const mainPath = `${basePath}${imageName}.png`;
    if (await checkImageExists(mainPath)) {
      paths.push(mainPath);
    }
    
    // Проверяем альтернативные изображения (до 3)
    for (let i = 1; i <= 3; i++) {
      const altPath = `${basePath}${imageName}_alt${i}.png`;
      if (await checkImageExists(altPath)) {
        paths.push(altPath);
        hasAlts = true;
      }
    }
    
    // Если ничего не найдено, используем заглушку
    if (paths.length === 0) {
      return { paths: ['/tabs/NO_notes.png'], hasAlts: false };
    }
    
    return { paths, hasAlts };
  };

  // Функция для принудительной перезагрузки изображений
  const refreshImages = async () => {
    if (parsedNotes.length === 0) return;
    
    setIsLoading(true);
    
    try {
      const newStates: Record<number, NoteImageState> = {};
      
      // Создаем массив промисов для параллельной проверки
      const promises = parsedNotes.map(async (note, index) => {
        const { paths, hasAlts } = await getAvailablePaths(note);
        return { index, paths, hasAlts };
      });
      
      // Ожидаем выполнения всех проверок
      const results = await Promise.all(promises);
      
      // Формируем новое состояние
      results.forEach(({ index, paths, hasAlts }) => {
        newStates[index] = {
          currentIndex: 0,
          availablePaths: paths,
          hasAlts
        };
      });
      
      setNoteStates(newStates);
    } catch (error) {
      console.error("Error refreshing images:", error);
    } finally {
      setIsLoading(false);
      // Увеличиваем счетчик попыток
      setRefreshAttempts(prev => prev + 1);
    }
  };

  // Эффект для инициализации путей изображений с параллельной загрузкой
  useEffect(() => {
    const initializeImagePaths = async () => {
      if (parsedNotes.length === 0) return;
      
      setIsLoading(true);
      
      try {
        const newStates: Record<number, NoteImageState> = {};
        
        // Создаем массив промисов для параллельной проверки
        const promises = parsedNotes.map(async (note, index) => {
          const { paths, hasAlts } = await getAvailablePaths(note);
          return { index, paths, hasAlts };
        });
        
        // Ожидаем выполнения всех проверок
        const results = await Promise.all(promises);
        
        // Формируем новое состояние
        results.forEach(({ index, paths, hasAlts }) => {
          newStates[index] = {
            currentIndex: 0,
            availablePaths: paths,
            hasAlts
          };
        });
        
        setNoteStates(newStates);
      } catch (error) {
        console.error("Error initializing images:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeImagePaths();
  }, [parsedNotes, instrument]);

  // Эффект для автоматического обновления изображений через 1.5 секунды
  useEffect(() => {
    if (Object.keys(noteStates).length > 0 && refreshAttempts < 2) {
      imageCheckTimeoutRef.current = setTimeout(() => {
        const hasMissingImages = Object.values(noteStates).some(
          state => state.availablePaths.includes('/tabs/NO_notes.png')
        );
        
        if (hasMissingImages) {
          refreshImages();
        }
      }, 1500);
    }
    
    return () => {
      if (imageCheckTimeoutRef.current) {
        clearTimeout(imageCheckTimeoutRef.current);
      }
    };
  }, [noteStates, refreshAttempts]);

  // Сбрасываем счетчик попыток при смене инструмента или нот
  useEffect(() => {
    setRefreshAttempts(0);
  }, [instrument, parsedNotes]);

  const handleImageClick = (index: number) => {
    setNoteStates(prev => {
      const state = prev[index];
      if (!state || !state.hasAlts) return prev;
      
      const nextIndex = (state.currentIndex + 1) % state.availablePaths.length;
      
      return {
        ...prev,
        [index]: {
          ...state,
          currentIndex: nextIndex
        }
      };
    });
  };

  const getImagePath = (index: number): string => {
    const state = noteStates[index];
    if (!state || state.availablePaths.length === 0) {
      return '/tabs/NO_notes.png';
    }
    return state.availablePaths[state.currentIndex];
  };

  // Функция для получения пути к изображению ноты (из папки notes)
  const getNoteImagePath = (note: Note): string => {
    if (note.pause) return '/tabs/notes/P.png';
    
    const imageName = getImageName(note);
    return `/tabs/notes/${imageName}.png`;
  };

  // Функция для получения пути к изображению табулатуры
  const getTabImagePath = (note: Note): string => {
    if (note.pause) return '/tabs/P.png';
    
    const imageName = getImageName(note);
    return `/tabs/${instrument}/${imageName}.png`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-2 md:py-8">
      <div className="container mx-auto px-2 md:px-4">
        <h1 className="text-xl md:text-4xl font-bold text-center mb-2 md:mb-8 text-foreground">
          BiDi MIDI
        </h1>
        
        <MidiSequencer 
          ref={midiSequencerRef}
          onCurrentNoteChange={handleCurrentNoteChange}
        />
        
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
          <div className="mt-12 bg-white rounded-lg shadow-md p-4 md:p-6">
            <h2 className="text-2xl font-bold mb-4 text-center">WoodWind Fingering</h2>
            
            <div className="mb-4">
              <label className="block mb-2 font-medium">Введите ноты:</label>
                <div className="flex gap-2">
<div className="relative flex-1">
  <textarea
    ref={textareaRef}
    value={tabInput}
    onChange={handleTextareaChange}
    placeholder="Пример: C4D#5(500)PG3(2000)"
    className="w-full border-2 border-[#e2e8f0] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0f172a] min-h-[100px] resize-none"
    style={{ 
      minHeight: '100px', 
      maxHeight: '300px', 
      fontSize: '13px',
      paddingRight: '25px' 
    }}
  />
  <div 
    className="absolute right-0.5 bottom-1.5 w-4 h-4 cursor-nwse-resize resize-handle"
    style={{
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cg stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M2 14 L14 2'/%3E%3Cpath d='M6 14 L14 6'/%3E%3C/g%3E%3C/svg%3E\")",
      backgroundSize: '80%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      opacity: 0.7,
      transition: 'opacity 0.2s',
    }}
    onMouseDown={(e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = textareaRef.current?.offsetHeight || 0;
      
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!textareaRef.current) return;
        const newHeight = startHeight + (moveEvent.clientY - startY);
        textareaRef.current.style.height = `${Math.max(100, Math.min(400, newHeight))}px`;
      };
      
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }}
  />
</div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleTabConvert}
                    className="bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors"
                    title="Конвертировать"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="flex flex-col">
                <label className="block mb-2 font-medium">Инструмент:</label>
                <select
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                  className="border-2 border-[#e2e8f0] rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                  style={{
                    backgroundColor: 'white',
                    color: '#334155',
                  }}
                >
                  {availableInstruments.map(instr => (
                    <option key={instr} value={instr}>
                      {instr}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col">
                <label className="block mb-2 font-medium">
                  Размер изображений: {imageSize}px
                </label>
                <div className="w-full relative">
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={imageSize}
                    onChange={(e) => setImageSize(parseInt(e.target.value))}
                    className="w-full accent-[#0f172a] custom-slider relative"
                    style={{
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: '#e2e8f0',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      zIndex: 10,
                      marginBottom: '8px',
                    }}
                  />
                </div>
              </div>
            </div>
            
            {isLoading && (
              <div className="text-center py-4">
                <p className="text-gray-600">Загрузка изображений для {instrument}...</p>
              </div>
            )}
            
            {parsedNotes.length > 0 && (
              <div className="mt-6 relative">
                {isLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-20 rounded-lg">
                    <p className="text-lg font-medium">Загрузка изображений для {instrument}...</p>
                  </div>
                )}
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Результат:</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={refreshImages}
                      disabled={isLoading || isTakingScreenshot}
                      className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors ${
                        isLoading || isTakingScreenshot ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title="Обновить изображения"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    <button
                      onClick={handlePlayWithDelay}
                      disabled={isTakingScreenshot || isLoading}
                      className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center transition-colors ${
                        isTakingScreenshot ? "opacity-50 cursor-not-allowed" : ""
                      } ${
                        isPlayButtonWaiting 
                          ? "animate-pulse bg-blue-100 border-blue-300" 
                          : isPlayButtonActive 
                            ? "bg-green-100 border-green-300" 
                            : "hover:bg-[#f1f5f9]"
                      }`}
                      title={
                        isPlayButtonWaiting 
                          ? "Ожидание воспроизведения... (нажмите для отмены)"
                          : isPlayButtonActive 
                            ? "Воспроизводится (нажмите для остановки)" 
                            : "Воспроизвести в MIDI секвенсере (задержка 2 сек)"
                      }
                    >
                      {isPlayButtonWaiting || isPlayButtonActive ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 00-1-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 5v10l7-5-7-5z"/>
                        </svg>
                      )}
                    </button>
                    
                    <button
                      onClick={() => setShowScreenshotDialog(true)}
                      disabled={isTakingScreenshot || isLoading}
                      className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors ${
                        isTakingScreenshot || isLoading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title="Скриншот"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Диалог для ввода названия скриншота */}
                {showScreenshotDialog && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
                      <h3 className="text-lg font-semibold mb-4">Введите название для скриншота</h3>
                      <input
                        type="text"
                        value={screenshotTitle}
                        onChange={(e) => setScreenshotTitle(e.target.value)}
                        placeholder="Название произведения"
                        className="w-full border-2 border-[#e2e8f0] rounded px-3 py-2 mb-4 focus:outline-none focus:ring-1 focus:ring-[#0f172a]"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowScreenshotDialog(false);
                            setScreenshotTitle("");
                          }}
                          className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600 transition-colors"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={takeScreenshot}
                          disabled={!screenshotTitle.trim() || isTakingScreenshot}
                          className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isTakingScreenshot ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div 
                  ref={tabContainerRef}
                  className="flex flex-wrap items-center p-2 border rounded bg-gray-50"
                  style={{ 
                    gap: "2px",
                    rowGap: "15px"
                  }}
                >
                  {parsedNotes.map((note, index) => {
                    const noteImagePath = getNoteImagePath(note);
                    const tabImagePath = getTabImagePath(note);
                    const isClickable = !note.pause && (noteStates[index]?.hasAlts || false) && !isLoading;
                    
                    // Проверяем, является ли эта нота текущей воспроизводимой
                    const isActive = currentPlayingNote && 
                                    currentPlayingNote.sequenceIndex === 0 && // Первая последовательность
                                    currentPlayingNote.noteIndex === index;

                    return (
                      <div 
                        key={index} 
                        className="note-container flex flex-col items-center"
                        style={{ 
                          width: `${imageSize}px`,
                          minHeight: `${imageSize * 3 + 60}px`,
                          position: 'relative'
                        }}
                      >
                        {/* Верхнее окошко - длительность */}
                        <div 
                          className="font-semibold rounded w-full text-center flex items-center justify-center"
                          style={{ 
                            height: '30px',
                            padding: '2px 5px',
                            fontSize: `${Math.max(8, Math.min(16, imageSize * 0.12))}px`,
                            boxSizing: 'border-box',
                            backgroundColor: isActive ? '#dcfce7' : '#f1f5f9', // Зеленый фон для активной ноты
                            zIndex: 10,
                            position: 'relative',
                            marginBottom: '15px',
                            border: isActive ? '2px solid #22c55e' : '1px solid #e2e8f0', // Зеленая рамка для активной
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {note.duration}
                        </div>
                        
                        {/* Среднее окошко - картинка ноты */}
                        <div 
                          className="relative mb-2"
                          style={{ 
                            width: `${imageSize}px`, 
                            height: `${imageSize * 1.5}px`,
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={noteImagePath}
                            alt={note.symbol}
                            className="rounded bg-white"
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              objectFit: "contain",
                              position: 'relative',
                              zIndex: 5,
                              border: isActive ? '3px solid #22c55e' : '2px solid #e2e8f0', // Утолщенная зеленая рамка
                              boxShadow: isActive ? '0 0 10px rgba(34, 197, 94, 0.3)' : 'none', // Свечение для активной
                              transition: 'all 0.3s ease'
                            }}
                            onError={(e) => {
                              if (!e.currentTarget) return;
                              e.currentTarget.src = '/tabs/NO_notes.png';
                            }}
                          />
                        </div>
                        
                        {/* Нижнее окошко - картинка табулатуры */}
                        <div 
                          className="relative"
                          style={{ 
                            width: `${imageSize}px`, 
                            height: `${imageSize * 1.5}px`,
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={tabImagePath}
                            alt={`${note.symbol} tab`}
                            className="rounded bg-white"
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              objectFit: "contain",
                              position: 'relative',
                              zIndex: 5,
                              cursor: isClickable ? 'pointer' : 'default',
                              border: isActive ? '3px solid #22c55e' : '2px solid #e2e8f0', // Утолщенная зеленая рамка
                              boxShadow: isActive ? '0 0 10px rgba(34, 197, 94, 0.3)' : 'none', // Свечение для активной
                              transition: 'all 0.3s ease'
                            }}
                            onClick={() => {
                              if (isClickable) {
                                handleImageClick(index);
                              }
                            }}
                            onError={(e) => {
                              if (!e.currentTarget) return;
                              e.currentTarget.src = '/tabs/NO_notes.png';
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Блок с ссылками и сносками */}
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6 mt-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold mb-4 text-center">Полезные ссылки</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <a 
                href="https://audio-convert.com/ru/mp3-converter/mp3-to-midi" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
              >
                <h4 className="font-semibold text-lg mb-2 text-gray-800">MP3 в MIDI</h4>
                <p className="text-sm text-gray-600">
                  Конвертируйте MP3 файлы в MIDI формат для использования в секвенсере
                </p>
              </a>
              
              <a 
                href="https://webmscore-pwa.librescore.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all duration-200"
              >
                <h4 className="font-semibold text-lg mb-2 text-gray-800">MIDI конвертер</h4>
                <p className="text-sm text-gray-600">
                  Конвертируйте MIDI в другие форматы (текст, звук, ноты)
                </p>
              </a>
              
              <a 
                href="https://bitmidi.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all duration-200"
              >
                <h4 className="font-semibold text-lg mb-2 text-gray-800">Библиотека MIDI</h4>
                <p className="text-sm text-gray-600">
                  Большая коллекция MIDI файлов для вдохновения и обучения
                </p>
              </a>
            </div>
            
            <div className="border-t pt-4 text-center">
              <div className="mb-3">
                <p className="text-lg font-semibold text-gray-800">© 2025 BiDi MIDI</p>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4 text-sm text-gray-600">
                <a 
                  href="https://github.com/Frupis-art/BiDi_midi" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub репозиторий
                </a>
                
                <span className="hidden sm:block">•</span>
                
                <div className="flex items-center gap-2">
                  <span>Разработано: Frupis_art</span>
                </div>
                
                <span className="hidden sm:block">•</span>
                
                <a 
                  href="mailto:fly4ik@yandex.ru" 
                  className="hover:text-blue-600 transition-colors"
                >
                  Контакт: fly4ik@yandex.ru
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .resize-handle:hover {
          opacity: 1;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: white;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          cursor: pointer;
        }
        
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: white;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default Index;