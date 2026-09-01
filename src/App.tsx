import React, { useState, useRef } from 'react';
import { useApp } from './state/AppContext';
import { Header } from './components/Header';
import { ProjectInfoBanner } from './components/ProjectInfoBanner';
import { WarningNavigator } from './components/WarningNavigator';
import { HarmonyTimeline } from './components/HarmonyTimeline';
import { TrackList } from './components/TrackList';
import { PianoRoll } from './components/PianoRoll';
import { Inspector } from './components/Inspector';
import { SettingsModal } from './components/SettingsModal';
import { ExportSafetyModal } from './components/ExportSafetyModal';
import { DEMO_PRESETS } from './utils/demoMidi';
import { UploadCloud, Music, Sparkles, ShieldCheck } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const { workingMidi, loadMidiFile, loadDemo } = useApp();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        alert('有効なMIDIファイル（.mid または .midi）を選択してください。');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadMidiFile(e.target.files[0]);
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

      {/* Hidden file input for open action */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".mid,.midi"
        className="hidden"
      />

      {/* Main Content: Workspace or Startup Empty State */}
      {workingMidi ? (
        <>
          {/* 2. Real MIDI Project Info & Status Banner */}
          <ProjectInfoBanner />

          {/* 3. Warning Navigator & Filter Bar */}
          <WarningNavigator />

          {/* 4. Harmony Progression Timeline Header */}
          <HarmonyTimeline />

          {/* 5. DAW Workspace: TrackList + PianoRoll + Inspector */}
          <div className="flex-1 flex overflow-hidden relative">
            <TrackList />
            <PianoRoll />
            <Inspector />
          </div>
        </>
      ) : (
        /* Startup Clean Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#18191c] border border-[#2e3238] rounded-2xl p-8 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-950/50">
              <Music className="w-8 h-8 text-white" />
            </div>

            <h1 className="text-2xl font-black text-white mb-2 tracking-wide">
              MIDI Harmony Inspector <span className="text-xs uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">β0.2</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-8">
              複数トラックMIDIの和声スペルチェッカー＆リンター。コード進行を自動推定し、コード外音や衝突を検出。DAW用に安全に修正・書き出しできます。
            </p>

            {/* Drop Zone & Open Button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#3c404a] hover:border-emerald-500/60 bg-[#1e2025] hover:bg-[#23262d] rounded-xl p-8 cursor-pointer transition flex flex-col items-center justify-center gap-3 mb-6 group"
            >
              <UploadCloud className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition duration-200" />
              <div>
                <span className="text-sm font-semibold text-slate-200 block">
                  ここにMIDIファイルをドラッグ＆ドロップ
                </span>
                <span className="text-xs text-slate-500">
                  またはクリックしてファイルを選択 (.mid, .midi)
                </span>
              </div>
            </div>

            {/* Built-in Demo Scenarios */}
            <div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  テスト用デモ楽曲でお試し:
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEMO_PRESETS.map((demo) => (
                  <button
                    key={demo.id}
                    onClick={() => loadDemo(demo.id)}
                    className="p-2.5 rounded-lg bg-[#202226] hover:bg-[#272a30] border border-[#2e3238] hover:border-slate-500 text-left transition flex flex-col justify-between"
                  >
                    <span className="font-bold text-xs text-slate-200 truncate block">
                      {demo.name.split(':')[0]}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                      {demo.name.split(':')[1] || demo.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy Guarantee Note */}
            <div className="mt-8 pt-4 border-t border-[#2e3238] flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>完全ブラウザ内ローカル処理。MIDIデータが外部サーバーへ送信されることは一切ありません。</span>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal />

      {/* Export Safety Warning Modal (Phase D / β0.3.2) */}
      <ExportSafetyModal
        isOpen={useApp().isExportSafetyModalOpen}
        onClose={() => useApp().setIsExportSafetyModalOpen(false)}
        onConfirm={useApp().performExport}
        diagnostic={useApp().exportSafetyDiag}
      />

      {/* Drag & Drop Full-screen Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-sm border-4 border-dashed border-emerald-400 z-50 flex flex-col items-center justify-center p-8 text-center pointer-events-none animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-emerald-400 mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold text-white mb-1">ここにMIDIファイルをドロップ</h2>
          <p className="text-sm text-emerald-200">
            Standard MIDIファイル（.mid, .midi）はブラウザ内で100%安全に解析されます。
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
