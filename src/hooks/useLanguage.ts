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
    invalidPauseDuration: 'Неверная длительность паузы',
    // Новые переводы для галереи
    galleryTitle: 'Галерея MIDI',
    sortBy: 'Упорядочить по:',
    rating: 'Рейтинг',
    date: 'Новое',
    refresh: 'Обновить',
    galleryEmpty: 'Галерея пуста',
    loadToSequences: 'Подгрузить в последовательности',
    downloadMidi: 'Скачать MIDI файл',
    deleteFile: 'Удалить файл (АДМИН)',
    addToGallery: 'Добавить в галерею',
    enterTitle: 'Введите название (3-12 символов)',
    enterAuthor: 'Введите автора (3-12 символов)',
    titlePlaceholder: 'Название произведения',
    authorPlaceholder: 'Автор произведения',
    cancel: 'Отмена',
    add: 'Добавить',
    fillAllFields: 'Заполните все поля',
    titleLength: 'Название должно быть от 3 до 12 символов',
    authorLength: 'Автор должен быть от 3 до 12 символов',
    validCharsOnly: 'Используйте только буквы, цифры, пробелы и дефисы',
    galleryRefreshed: 'Галерея обновлена',
    refreshError: 'Ошибка при обновлении галереи',
    confirmLoad: 'Текущие последовательности будут очищены. Продолжить?',
    confirmDelete: 'Удалить файл из галереи?',
    fileDeleted: 'удален',
    fileAdded: 'добавлен в галерею',
    fileLoaded: 'Загружен файл:',
    downloading: 'Скачивается:',
    exportError: 'Ошибка при экспорте MIDI файла',
    adminRightsActivated: '🔐 Админские права активированы',
    // Инструменты
    instrumentSequence1: 'Инструмент для последовательности 1',
    instrumentSequence2: 'Инструмент для последовательности 2',
    piano: 'Фортепиано',
    clarinet: 'Кларнет',
    trumpet: 'Труба',
    flute: 'Флейта',
    cello: 'Виолончель',
    bassoon: 'Фагот',
    oboe: 'Гобой',
    violin: 'Скрипка',
    guitar: 'Гитара',
    // Кнопки и действия
    clear: 'Очистить',
    fieldsCleared: 'Поля очищены',
    decreaseDuration: 'Уменьшить длительность x0.5',
    increaseDuration: 'Увеличить длительность x2',
    durationChanged: 'Длительность изменена',
    sequence: 'последовательность',
    // Сортировка
    higherToLower: 'Больше→Меньше',
    lowerToHigher: 'Меньше→Больше',
    newerToOlder: 'Новее→Старее',
    olderToNewer: 'Старее→Новее'
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
    invalidPauseDuration: 'Invalid pause duration',
    // New translations for gallery
    galleryTitle: 'MIDI Gallery',
    sortBy: 'Sort by:',
    rating: 'Rating',
    date: 'Date',
    refresh: 'Refresh',
    galleryEmpty: 'Gallery is empty',
    loadToSequences: 'Load to sequences',
    downloadMidi: 'Download MIDI file',
    deleteFile: 'Delete file (ADMIN)',
    addToGallery: 'Add to gallery',
    enterTitle: 'Enter title (3-12 characters)',
    enterAuthor: 'Enter author (3-12 characters)',
    titlePlaceholder: 'Composition title',
    authorPlaceholder: 'Composition author',
    cancel: 'Cancel',
    add: 'Add',
    fillAllFields: 'Fill all fields',
    titleLength: 'Title must be 3-12 characters',
    authorLength: 'Author must be 3-12 characters',
    validCharsOnly: 'Use only letters, numbers, spaces and hyphens',
    galleryRefreshed: 'Gallery refreshed',
    refreshError: 'Error refreshing gallery',
    confirmLoad: 'Current sequences will be cleared. Continue?',
    confirmDelete: 'Delete file from gallery?',
    fileDeleted: 'deleted',
    fileAdded: 'added to gallery',
    fileLoaded: 'Loaded file:',
    downloading: 'Downloading:',
    exportError: 'Error exporting MIDI file',
    adminRightsActivated: '🔐 Admin rights activated',
    // Instruments
    instrumentSequence1: 'Instrument for sequence 1',
    instrumentSequence2: 'Instrument for sequence 2',
    piano: 'Piano',
    clarinet: 'Clarinet',
    trumpet: 'Trumpet',
    flute: 'Flute',
    cello: 'Cello',
    bassoon: 'Bassoon',
    oboe: 'Oboe',
    violin: 'Violin',
    guitar: 'Guitar',
    // Buttons and actions
    clear: 'Clear',
    fieldsCleared: 'Fields cleared',
    decreaseDuration: 'Decrease duration x0.5',
    increaseDuration: 'Increase duration x2',
    durationChanged: 'Duration changed',
    sequence: 'sequence',
    // Sorting
    higherToLower: 'Higher→Lower',
    lowerToHigher: 'Lower→Higher',
    newerToOlder: 'Newer→Older',
    olderToNewer: 'Older→Newer'
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