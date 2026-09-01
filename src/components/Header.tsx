import React, { useRef } from 'react';
import { useApp } from '../state/AppContext';
import { DEMO_PRESETS, DemoCaseId } from '../utils/demoMidi';
import { 
  FolderOpen, 
  Download, 
  RotateCcw, 
  RotateCw, 
  RefreshCw, 
  Play, 
  Square, 
  Settings, 
  Palette,
  Sparkles,
  Music2
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    workingMidi,
    exportMidi,
    loadMidiFile,
    loadDemo,
    activeDemoId,
    undo,
    redo,
    past,
    future,
    resetAll,
    reanalyze,
    isPlaying,
    togglePlay,
    colorMode,
    setColorMode,
    setSettingsOpen,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadMidiFile(e.target.files[0]);
    }
  };

  return (
    <header className="h-14 bg-[#18191c] border-b border-[#2e3238] flex items-center justify-between px-4 select-none shrink-0 z-30">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-md shadow-emerald-950/40">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-100 tracking-wide">MIDI Harmony Inspector</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">β0.4版</span>
          </div>
          <p className="text-[11px] text-slate-400">MIDI和声スペルチェッカー＆リンター</p>
        </div>
      </div>

      {/* Main Actions */}
      <div className="flex items-center gap-2">
        {/* File Open */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".mid,.midi"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-[#3c404a] transition"
          title="MIDIファイルを開く (.mid, .midi)"
        >
          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          <span>MIDIを開く</span>
        </button>

        {/* Demo Presets Dropdown */}
        <div className="relative flex items-center">
          <div className="flex items-center bg-[#272a30] rounded-md border border-[#3c404a] px-2 py-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
            <select
              value={activeDemoId || ''}
              onChange={(e) => {
                if (e.target.value) loadDemo(e.target.value as DemoCaseId);
              }}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[200px] truncate"
              title="組み込みテスト用デモ楽曲を選択"
            >
              <option value="" disabled className="bg-[#202226] text-slate-400">デモ楽曲を選択...</option>
              {DEMO_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-[#202226] text-slate-200">
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-[#3c404a] mx-1" />

        {/* Undo & Redo */}
        <div className="flex items-center bg-[#272a30] rounded-md border border-[#3c404a] overflow-hidden">
          <button
            onClick={undo}
            disabled={past.length === 0}
            className="px-2 py-1.5 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent text-slate-300 transition"
            title="元に戻す (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3 bg-[#3c404a]" />
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="px-2 py-1.5 hover:bg-[#32363e] disabled:opacity-40 disabled:hover:bg-transparent text-slate-300 transition"
            title="やり直す (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Reset All */}
        <button
          onClick={resetAll}
          disabled={!workingMidi}
          className="px-2.5 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] disabled:opacity-40 text-slate-300 text-xs font-medium flex items-center gap-1 border border-[#3c404a] transition"
          title="すべての変更を読み込み時の初期状態にリセット"
        >
          <span>リセット</span>
        </button>

        {/* Reanalyze */}
        <button
          onClick={reanalyze}
          disabled={!workingMidi}
          className="px-2.5 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] disabled:opacity-40 text-slate-300 text-xs font-medium flex items-center gap-1 border border-[#3c404a] transition"
          title="和声とノートの整合性を再解析"
        >
          <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
          <span>再解析</span>
        </button>

        <div className="h-4 w-[1px] bg-[#3c404a] mx-1" />

        {/* Playback Button */}
        <button
          onClick={togglePlay}
          disabled={!workingMidi}
          className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition disabled:opacity-40 ${
            isPlaying
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
          }`}
          title="音声プレビューの再生 / 停止 (Space)"
        >
          {isPlaying ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>停止</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>再生</span>
            </>
          )}
        </button>

        {/* Export MIDI */}
        <button
          onClick={exportMidi}
          disabled={!workingMidi}
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-emerald-950/40 transition"
          title="修正後のStandard MIDIファイル (.mid) を非破壊で書き出し"
        >
          <Download className="w-3.5 h-3.5" />
          <span>MIDI書き出し</span>
        </button>
      </div>

      {/* Right Controls: Color mode, Settings */}
      <div className="flex items-center gap-2">
        {/* Color Mode Switcher */}
        <button
          onClick={() => setColorMode(colorMode === 'risk' ? 'track' : 'risk')}
          className="px-2.5 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-[#3c404a] transition"
          title="ノートの色分け（危険度 / トラック別）を切り替え"
        >
          <Palette className="w-3.5 h-3.5 text-purple-400" />
          <span>{colorMode === 'risk' ? '危険度カラー' : 'トラックカラー'}</span>
        </button>

        {/* Settings Modal Toggle */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] text-slate-300 border border-[#3c404a] transition"
          title="解析設定・分解能・重み付けの調整"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
