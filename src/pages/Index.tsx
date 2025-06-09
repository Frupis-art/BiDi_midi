
import MidiSequencer from '@/components/MidiSequencer';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="container mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-foreground">
          MIDI Секвенсор
        </h1>
        <MidiSequencer />
      </div>
    </div>
  );
};

export default Index;
