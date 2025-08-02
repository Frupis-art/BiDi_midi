import React, { useState, useRef, useEffect } from "react";
import MidiSequencer from '@/components/MidiSequencer';
import html2canvas from 'html2canvas';

type Note = {
  symbol: string;
  octave: number;
  duration: number;
  sharp: boolean;
  pause: boolean;
};

type NoteImageState = {
  currentAltIndex: number;
  maxAltIndex: number;
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
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const midiSequencerRef = useRef<{ 
    handlePlay: () => void;
    registerPlaybackEndCallback: (callback: () => void) => void;
  }>(null);
  const playDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    return `${note.symbol}${note.sharp ? "dis" : ""}${note.octave}`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTabInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
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
    
    setIsTakingScreenshot(true);
    
    try {
      await waitForImages(tabContainerRef.current);
      
      const originalStyles: string[] = [];
      const noteElements = tabContainerRef.current.querySelectorAll('.note-container');
      
      noteElements.forEach(el => {
        const element = el as HTMLElement;
        originalStyles.push(element.style.cssText);
        element.style.display = 'flex';
        element.style.flexDirection = 'column';
        element.style.position = 'relative';
      });

      const canvas = await html2canvas(tabContainerRef.current, {
        useCORS: true,
        logging: false,
        background: '#f5f5f5',
      });
      
      noteElements.forEach((el, i) => {
        (el as HTMLElement).style.cssText = originalStyles[i];
      });
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${instrument}-fingerchart-screenshot.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      alert('Не удалось создать скриншот');
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
      newStates[index] = { currentAltIndex: 0, maxAltIndex: 0 };
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

  const handleImageClick = (index: number, imageName: string) => {
    const currentState = noteStates[index] || { currentAltIndex: 0, maxAltIndex: 0 };
    const nextAltIndex = currentState.currentAltIndex + 1;
    
    // Проверяем существование следующей альтернативы
    const nextAltPath = nextAltIndex === 1 
      ? `/tabs/${instrument}/${imageName}_alt1.png`
      : `/tabs/${instrument}/${imageName}_alt${nextAltIndex}.png`;
    
    // Проверка существования изображения
    const img = new Image();
    img.src = nextAltPath;
    
    img.onload = () => {
      // Изображение существует, обновляем состояние
      setNoteStates(prev => ({
        ...prev,
        [index]: {
          currentAltIndex: nextAltIndex,
          maxAltIndex: Math.max(nextAltIndex, currentState.maxAltIndex)
        }
      }));
    };
    
    img.onerror = () => {
      // Изображение не существует, возвращаемся к основному
      setNoteStates(prev => ({
        ...prev,
        [index]: {
          currentAltIndex: 0,
          maxAltIndex: currentState.maxAltIndex
        }
      }));
    };
  };

  const getImagePath = (note: Note, index: number) => {
    const imageName = getImageName(note);
    
    if (note.pause) {
      return '/tabs/P.png';
    }
    
    const state = noteStates[index];
    if (!state) return `/tabs/${instrument}/${imageName}.png`;
    
    if (state.currentAltIndex === 0) {
      return `/tabs/${instrument}/${imageName}.png`;
    }
    
    return `/tabs/${instrument}/${imageName}_alt${state.currentAltIndex}.png`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-2 md:py-8">
      <div className="container mx-auto px-2 md:px-4">
        <h1 className="text-xl md:text-4xl font-bold text-center mb-2 md:mb-8 text-foreground">
          BiDi MIDI
        </h1>
        
        <MidiSequencer ref={midiSequencerRef} />
        
        <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
          <div className="mt-12 bg-white rounded-lg shadow-md p-4 md:p-6">
            <h2 className="text-2xl font-bold mb-4 text-center">WoodWind Fingering</h2>
            
            <div className="mb-4">
              <label className="block mb-2 font-medium">Введите ноты:</label>
                <div className="flex gap-2">
                <textarea
                  value={tabInput}
                  onChange={handleTextareaChange}
                  placeholder="Пример: C4D#5(500)PG3(2000)"
                  className="flex-1 border-2 border-[#e2e8f0] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0f172a] min-h-[100px] resize-none"
                  rows={3}
                  style={{ minHeight: '100px' }}
                />
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
                    className="w-full accent-[#0f172a] custom-slider"
                    style={{
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: '#e2e8f0',
                      outline: 'none',
                      WebkitAppearance: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
            
            {parsedNotes.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Результат:</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePlayWithDelay}
                      disabled={isTakingScreenshot}
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
                      onClick={takeScreenshot}
                      disabled={isTakingScreenshot}
                      className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors ${
                        isTakingScreenshot ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title="Скриншот"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div 
                  ref={tabContainerRef}
                  className="flex flex-wrap items-center p-2 border rounded bg-gray-50"
                  style={{ 
                    gap: "2px",
                    rowGap: "15px"
                  }}
                >
                  {parsedNotes.map((note, index) => {
                    const imageName = getImageName(note);
                    const imagePath = getImagePath(note, index);
                    const state = noteStates[index];
                    
                    return (
                      <div 
                        key={index} 
                        className="note-container flex flex-col items-center"
                        style={{ 
                          width: `${imageSize}px`,
                          minHeight: `${imageSize + 30}px`,
                          position: 'relative'
                        }}
                      >
                        <div 
                          className="font-semibold rounded w-full text-center flex items-center justify-center"
                          style={{ 
                            height: '20px',
                            padding: '2px 5px',
                            fontSize: `${Math.max(8, Math.min(16, imageSize * 0.12))}px`,
                            boxSizing: 'border-box',
                            backgroundColor: '#f1f5f9',
                            zIndex: 10,
                            position: 'relative',
                            marginBottom: '15px'
                          }}
                        >
                          {note.duration}
                        </div>
                        
                        <div 
                          className="relative"
                          style={{ 
                            width: `${imageSize}px`, 
                            height: `${imageSize}px`,
                            flexShrink: 0
                          }}
                        >
                          <img
                            src={imagePath}
                            alt={note.symbol}
                            className="border rounded bg-white"
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              objectFit: "contain",
                              position: 'relative',
                              zIndex: 5,
                              cursor: note.pause ? 'default' : 'pointer'
                            }}
                            onClick={() => !note.pause && handleImageClick(index, imageName)}
                            onError={(e) => {
                              const currentState = noteStates[index] || { currentAltIndex: 0, maxAltIndex: 0 };
                              
                              // Если основное изображение не загрузилось
                              if (currentState.currentAltIndex === 0) {
                                // Проверяем наличие альтернативы _alt1
                                const alt1Path = `/tabs/${instrument}/${imageName}_alt1.png`;
                                const img = new Image();
                                img.src = alt1Path;
                                
                                img.onload = () => {
                                  // Альтернатива существует, используем её
                                  setNoteStates(prev => ({
                                    ...prev,
                                    [index]: {
                                      currentAltIndex: 1,
                                      maxAltIndex: 1
                                    }
                                  }));
                                };
                                
                                img.onerror = () => {
                                  // Альтернатив нет, используем заглушку
                                  e.currentTarget.src = '/tabs/NO_notes.png';
                                };
                              } else {
                                // Уже показывали альтернативу, но она не загрузилась
                                e.currentTarget.src = '/tabs/NO_notes.png';
                              }
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
      </div>
      
      <style>{`
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