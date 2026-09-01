import React, { useState } from 'react';
import { useApp } from './state/AppContext';
import { Header } from './components/Header';
import { WarningNavigator } from './components/WarningNavigator';
import { HarmonyTimeline } from './components/HarmonyTimeline';
import { TrackList } from './components/TrackList';
import { PianoRoll } from './components/PianoRoll';
import { Inspector } from './components/Inspector';
import { SettingsModal } from './components/SettingsModal';
import { UploadCloud, Music } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const { loadMidiFile } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.mid') || file.name.endsWith('.midi')) {
        loadMidiFile(file);
      } else {
        alert('Please drop a valid MIDI file (.mid or .midi).');
      }
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-screen w-screen flex flex-col bg-[#121316] text-slate-200 overflow-hidden font-sans relative select-none"
    >
      {/* 1. Header Toolbar */}
      <Header />

      {/* 2. Warning Navigator & Filter Bar */}
      <WarningNavigator />

      {/* 3. Harmony Progression Timeline Header */}
      <HarmonyTimeline />

      {/* 4. DAW Workspace: TrackList + PianoRoll + Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <TrackList />
        <PianoRoll />
        <Inspector />
      </div>

      {/* Settings Modal */}
      <SettingsModal />

      {/* Full Screen Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-sm border-4 border-dashed border-emerald-400 z-50 flex flex-col items-center justify-center p-8 text-center pointer-events-none animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-emerald-400 mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold text-white mb-1">Drop your MIDI file here</h2>
          <p className="text-sm text-emerald-200">
            Standard MIDI Files (.mid, .midi) are analyzed completely locally in your browser.
          </p>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return <MainLayout />;
};

export default App;
