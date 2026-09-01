import React from 'react';
import { useApp } from '../state/AppContext';
import { FileText, Layers, Music, Clock, Activity, Hash, AlertTriangle } from 'lucide-react';

export const ProjectInfoBanner: React.FC = () => {
  const { workingMidi, isAnalyzing, analysisStage, analysisError, reanalyze } = useApp();

  if (!workingMidi) return null;

  const initialBpm = (workingMidi.tempos && workingMidi.tempos[0]?.bpm)
    ? Math.round(workingMidi.tempos[0].bpm)
    : 120;

  const initialTimeSig = (workingMidi.timeSignatures && workingMidi.timeSignatures[0])
    ? `${workingMidi.timeSignatures[0].numerator}/${workingMidi.timeSignatures[0].denominator}`
    : '4/4';

  const japaneseStage = () => {
    if (analysisStage === 'Reading MIDI...') return 'MIDIファイル読み込み中...';
    if (analysisStage === 'Analyzing harmony...') return '和声を解析中...';
    if (analysisStage === 'Generating demo MIDI...') return 'デモMIDIを生成中...';
    if (analysisStage === 'Complete') return '解析完了';
    return analysisStage || '解析中...';
  };

  return (
    <div className="bg-[#141518] border-b border-[#23262d] px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 overflow-x-auto gap-4">
      {/* Left: Project File Name and Stats */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Project Name */}
        <div className="flex items-center gap-1.5 text-slate-200 font-semibold truncate max-w-[200px]" title={workingMidi.name}>
          <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{workingMidi.name}.mid</span>
        </div>

        <div className="w-[1px] h-3 bg-[#2e3238]" />

        {/* Tracks */}
        <div className="flex items-center gap-1" title="トラック数">
          <Layers className="w-3 h-3 text-purple-400" />
          <span>{workingMidi.tracks.length} トラック</span>
        </div>

        {/* Notes */}
        <div className="flex items-center gap-1" title="総ノート数">
          <Music className="w-3 h-3 text-emerald-400" />
          <span>{workingMidi.notes.length.toLocaleString()} 音</span>
        </div>

        {/* PPQ */}
        <div className="flex items-center gap-1" title="分解能 (Pulses Per Quarter Note)">
          <Hash className="w-3 h-3 text-slate-500" />
          <span>{workingMidi.ppq} PPQ</span>
        </div>

        {/* Tempo */}
        <div className="flex items-center gap-1" title="初期テンポ">
          <Activity className="w-3 h-3 text-amber-400" />
          <span>{initialBpm} BPM</span>
        </div>

        {/* Time Signature */}
        <div className="flex items-center gap-1" title="初期拍子記号">
          <Clock className="w-3 h-3 text-sky-400" />
          <span>{initialTimeSig} 拍子</span>
        </div>

        {/* Duration in Bars */}
        <div className="flex items-center gap-1 text-slate-300 font-mono" title="総小節数">
          <span>{workingMidi.totalBars} 小節</span>
        </div>
      </div>

      {/* Right: Analysis Status / Error Warning */}
      <div className="flex items-center gap-2 shrink-0">
        {isAnalyzing ? (
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-0.5" />
            <span>{japaneseStage()}</span>
          </div>
        ) : analysisError ? (
          <div className="flex items-center gap-2 text-rose-300 bg-rose-950/40 border border-rose-500/40 px-2 py-0.5 rounded text-[10px]">
            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
            <span>解析エラー: {analysisError}</span>
            <button
              onClick={reanalyze}
              className="underline hover:text-white font-semibold"
            >
              再試行
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
