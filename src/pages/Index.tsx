import MidiSequencer from '@/components/MidiSequencer';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 md:py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl md:text-4xl font-bold text-center mb-4 md:mb-8 text-foreground">
          BiDi MIDI
        </h1>
        <MidiSequencer />
      </div>
    </div>
  );
};

export default Index;