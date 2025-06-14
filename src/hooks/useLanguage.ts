import { useState, useEffect } from 'react';

export type Language = 'ru' | 'en';

interface Translations {
  ru: Record<string, string>;
  en: Record<string, string>;
}

const translations: Translations = {
  ru: {
    title: 'BiDi MIDI',
    description: 'Упрощенный формат: CA3B4(1000)G#PD(500) - ноты C,D,E,F,G,A,B, # - диез, октава по умолчанию 4, P - пауза, время по умолчанию 1000мс',
    sequenceLabel: 'Последовательность нот:',
    openMidi: 'Открыть MIDI',
    preview: 'Предварительный просмотр:',
    speed: 'Скорость воспроизведения',
    transposeUp: 'Транспонировать на полутон вверх',
    transposeDown: 'Транспонировать на полутон вниз',
    selectFormat: 'Выберите формат файла',
    midiFile: 'MIDI файл',
    audioFile: 'Аудио файл',
    sequenceChanged: 'Последовательность изменена. Требуется повторный анализ.',
    errorsFound: 'Найдены ошибки:',
    playbackCompleted: 'Воспроизведение завершено',
    playbackError: 'Ошибка при воспроизведении',
    midiSaved: 'MIDI файл сохранен',
    audioSaved: 'Аудио файл сохранен',
    saveError: 'Ошибка при сохранении файла',
    midiImported: 'MIDI файл успешно импортирован',
    importError: 'Ошибка при импорте файла',
    selectMidiFile: 'Пожалуйста, выберите MIDI файл (.mid или .midi)',
    transposed: 'Транспонирование выполнено',
    invalidOctave: 'Неверная октава',
    octaveRange: 'Диапазон: 0-8',
    invalidDuration: 'Неверная длительность',
    invalidFormat: 'Неверный формат',
    invalidPauseDuration: 'Неверная длительность паузы'
  },
  en: {
    title: 'BiDi MIDI',
    description: 'Simplified format: CA3B4(1000)G#PD(500) - notes C,D,E,F,G,A,B, # - sharp, default octave 4, P - pause, default time 1000ms',
    sequenceLabel: 'Note sequence:',
    openMidi: 'Open MIDI',
    preview: 'Preview:',
    speed: 'Playback speed',
    transposeUp: 'Transpose up by semitone',
    transposeDown: 'Transpose down by semitone',
    selectFormat: 'Select file format',
    midiFile: 'MIDI file',
    audioFile: 'Audio file',
    sequenceChanged: 'Sequence changed. Re-analysis required.',
    errorsFound: 'Errors found:',
    playbackCompleted: 'Playback completed',
    playbackError: 'Playback error',
    midiSaved: 'MIDI file saved',
    audioSaved: 'Audio file saved',
    saveError: 'Error saving file',
    midiImported: 'MIDI file imported successfully',
    importError: 'Error importing file',
    selectMidiFile: 'Please select a MIDI file (.mid or .midi)',
    transposed: 'Transposition completed',
    invalidOctave: 'Invalid octave',
    octaveRange: 'Range: 0-8',
    invalidDuration: 'Invalid duration',
    invalidFormat: 'Invalid format',
    invalidPauseDuration: 'Invalid pause duration'
  }
};

export const useLanguage = () => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('bidi-midi-language');
    return (saved as Language) || 'ru';
  });

  useEffect(() => {
    localStorage.setItem('bidi-midi-language', language);
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ru' ? 'en' : 'ru');
  };

  return { language, setLanguage, t, toggleLanguage };
};