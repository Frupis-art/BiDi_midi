<<<<<<< HEAD
import React, { useState, useRef, useEffect } from "react";
import MidiSequencer from '@/components/MidiSequencer';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';

type Note = {
  symbol: string;
  octave: number;
  duration: number;
  sharp: boolean;
  pause: boolean;
};

const Index = () => {
  const [tabInput, setTabInput] = useState("");
  const [parsedNotes, setParsedNotes] = useState<Note[]>([]);
  const [instrument, setInstrument] = useState("recorder");
  const [imageSize, setImageSize] = useState(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableInstruments, setAvailableInstruments] = useState<string[]>([]);
  const tabContainerRef = useRef<HTMLDivElement>(null);

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

  const exportToZIP = async () => {
    if (parsedNotes.length === 0 || isGenerating) return;
    
    setIsGenerating(true);
    
    try {
      const zip = new JSZip();
      const folder = zip.folder("tablature");
      
      const formattedDate = new Date().toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '.');
      
      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${instrument} fingerchart</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              background: #f5f5f5; 
              color: #333;
            }
            .header { 
              text-align: center; 
              margin-bottom: 15px; 
              padding-bottom: 10px;
              border-bottom: 1px solid #ddd;
            }
            h1 { 
              font-size: 1.8rem; 
              margin-bottom: 5px;
              color: #2c3e50;
              text-transform: capitalize;
            }
            .notes-container { 
              display: flex; 
              flex-wrap: wrap; 
              gap: 3px;
              justify-content: center;
              padding: 0;
            }
            .note { 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              background: white; 
              padding: 8px; 
              border-radius: 6px; 
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              margin-bottom: 15px;
            }
            .duration { 
              font-size: 0.9rem; 
              background: #f1f5f9;
              padding: 3px 6px; 
              borderRadius: 3px; 
              margin-bottom: 5px;
              color: #555;
              font-weight: normal;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 25px;
            }
            img { 
              display: block; 
              max-width: 100%; 
              height: auto;
            }
            .footer {
              margin-top: 20px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
              font-size: 0.9rem;
              color: #666;
              text-align: center;
            }
            .brand {
              margin-top: 5px;
              color: #3498db;
            }
            .brand a {
              color: #2980b9;
              text-decoration: none;
            }
            .brand a:hover {
              text-decoration: underline;
            }
            .date {
              font-size: 0.8rem;
              color: #777;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${instrument} fingerchart</h1>
          </div>
          
          <div class="notes-container">
      `;

      for (let i = 0; i < parsedNotes.length; i++) {
        const note = parsedNotes[i];
        const imageName = getImageName(note);
        const imageUrl = `/tabs/${instrument}/${imageName}.png`;
        const fileName = `${i+1}_${note.duration}_${imageName}.png`;
        const fallbackFileName = `${i+1}_${note.duration}_missing.png`;
        
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error("Image not found");
          const blob = await response.blob();
          folder.file(fileName, blob);
          
          htmlContent += `
            <div class="note">
              <div class="duration">${note.duration}</div>
              <img src="${fileName}" width="${imageSize}" alt="${imageName}" />
            </div>
          `;
        } catch (error) {
          try {
            const fallbackResponse = await fetch(`/tabs/NO_notes.png`);
            const fallbackBlob = await fallbackResponse.blob();
            folder.file(fallbackFileName, fallbackBlob);
            
            htmlContent += `
              <div class="note">
                <div class="duration">${note.duration}</div>
                <img src="${fallbackFileName}" width="${imageSize}" alt="Missing note" />
              </div>
            `;
          } catch (fallbackError) {
            console.error("Fallback image missing", fallbackError);
            htmlContent += `
              <div class="note">
                <div class="duration">${note.duration}</div>
                <div style="width:${imageSize}px; height:${imageSize}px; background:#eee; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">
                  Image missing
                </div>
              </div>
            `;
          }
        }
      }

      htmlContent += `
          </div>
          
          <div class="footer">
            <div class="date">Generated on ${formattedDate}</div>
            <div class="brand">Created with <a href="https://bidi-midi.lovable.app" target="_blank">BiDi MIDI</a></div>
          </div>
        </body>
        </html>
      `;
      
      folder.file("index.html", htmlContent);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${instrument}-fingerchart.zip`);
      
    } catch (error) {
      console.error("Error creating ZIP:", error);
      alert("Ошибка при создании архива");
    } finally {
      setIsGenerating(false);
    }
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
    if (!tabContainerRef.current || isGenerating) return;
    
    setIsGenerating(true);
    
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
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f5f5f5',
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
      setIsGenerating(false);
    }
  };

  const handleTabConvert = () => {
    const notes = parseTabNotes(tabInput);
    setParsedNotes(notes);
  };

=======
import MidiSequencer from '@/components/MidiSequencer';

const Index = () => {
>>>>>>> 87ec78f9d9d0bad5b5537a4fc328da0f88e86ba9
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-2 md:py-8">
      <div className="container mx-auto px-2 md:px-4">
        <h1 className="text-xl md:text-4xl font-bold text-center mb-2 md:mb-8 text-foreground">
          BiDi MIDI
        </h1>
<<<<<<< HEAD
        
        <MidiSequencer />
        
        <div className="mt-12 p-6 bg-white rounded-lg shadow-md">
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
              {/* Кнопка конвертирования с увеличенной границей */}
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
            {/* Убрана подпись с форматом ввода */}
          </div>
          
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div className="flex flex-col">
              <label className="block mb-2 font-medium">Инструмент:</label>
              {/* Выпадающий список с белым фоном */}
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
                  {/* Кнопка скриншота с увеличенной границей */}
                  <button
                    onClick={takeScreenshot}
                    disabled={isGenerating}
                    className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors ${
                      isGenerating ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    title="Скриншот"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {/* Кнопка ZIP с увеличенной границей */}
                  <button
                    onClick={exportToZIP}
                    disabled={isGenerating}
                    className={`bg-white border-2 border-[#e2e8f0] rounded-full w-10 h-10 flex items-center justify-center hover:bg-[#f1f5f9] transition-colors ${
                      isGenerating ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    title="Сохранить ZIP"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
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
                          fontSize: `${Math.max(12, Math.min(20, imageSize * 0.12))}px`,
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
                          src={`/tabs/${instrument}/${imageName}.png`}
                          alt={note.symbol}
                          className="border rounded bg-white"
                          style={{ 
                            width: '100%', 
                            height: '100%',
                            objectFit: "contain",
                            position: 'relative',
                            zIndex: 5
                          }}
                          onError={(e) => {
                            e.currentTarget.src = `/tabs/NO_notes.png`;
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
      
      <style jsx>{`
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
=======
        <MidiSequencer />
      </div>
>>>>>>> 87ec78f9d9d0bad5b5537a4fc328da0f88e86ba9
    </div>
  );
};

export default Index;