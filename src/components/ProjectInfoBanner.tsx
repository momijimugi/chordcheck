import React from 'react';
import { useApp } from '../state/AppContext';
import { FileText, Layers, Music, Clock, Activity, Hash, AlertTriangle, Key } from 'lucide-react';
import { PITCH_NAMES, PITCH_NAMES_FLAT } from '../utils/constants';

export const ProjectInfoBanner: React.FC = () => {
  const {
    workingMidi,
    keyContext,
    analysisSettings,
    setKeyOverride,
    isAnalyzing,
    analysisProgress,
    analysisStage,
    analysisError,
    reanalyze,
  } = useApp();

  if (!workingMidi) return null;

  const initialBpm = (workingMidi.tempos && workingMidi.tempos[0]?.bpm)
    ? Math.round(workingMidi.tempos[0].bpm)
    : 120;

  const initialTimeSig = (workingMidi.timeSignatures && workingMidi.timeSignatures[0])
    ? `${workingMidi.timeSignatures[0].numerator}/${workingMidi.timeSignatures[0].denominator}`
    : '4/4';

  const handleKeyChange = (val: string) => {
    if (val === 'auto') {
      setKeyOverride('auto');
    } else {
      const [rootStr, modeStr] = val.split('_');
      setKeyOverride({
        root: parseInt(rootStr, 10),
        mode: modeStr as 'major' | 'minor',
      });
    }
  };

  const keySelectValue = (!analysisSettings.keyOverride || analysisSettings.keyOverride === 'auto')
    ? 'auto'
    : `${analysisSettings.keyOverride.root}_${analysisSettings.keyOverride.mode}`;

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

        {/* Key Context & Manual Selector (Phase F) */}
        <div className="flex items-center gap-1.5 text-teal-300 font-medium bg-[#1a1c22] px-2 py-0.5 rounded border border-[#2e3238]">
          <Key className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="text-[10px] text-slate-400 font-normal">Key:</span>
          <select
            value={keySelectValue}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="bg-transparent text-teal-300 font-semibold text-[11px] focus:outline-none cursor-pointer"
            title="調性（Key）の手動指定または自動推定"
          >
            <option value="auto" className="bg-[#1a1c22] text-teal-300">
              Auto ({keyContext?.name || 'C Major'} - {keyContext?.confidence || 50}%)
            </option>
            <optgroup label="メジャーキー (Major)" className="bg-[#1a1c22] text-slate-300">
              <option value="0_major">C Major</option>
              <option value="1_major">Db Major / C# Major</option>
              <option value="2_major">D Major</option>
              <option value="3_major">Eb Major</option>
              <option value="4_major">E Major</option>
              <option value="5_major">F Major</option>
              <option value="6_major">F# Major / Gb Major</option>
              <option value="7_major">G Major</option>
              <option value="8_major">Ab Major</option>
              <option value="9_major">A Major</option>
              <option value="10_major">Bb Major</option>
              <option value="11_major">B Major</option>
            </optgroup>
            <optgroup label="マイナーキー (Minor)" className="bg-[#1a1c22] text-slate-300">
              <option value="0_minor">C Minor</option>
              <option value="1_minor">C# Minor</option>
              <option value="2_minor">D Minor</option>
              <option value="3_minor">Eb Minor / D# Minor</option>
              <option value="4_minor">E Minor</option>
              <option value="5_minor">F Minor</option>
              <option value="6_minor">F# Minor</option>
              <option value="7_minor">G Minor</option>
              <option value="8_minor">G# Minor / Ab Minor</option>
              <option value="9_minor">A Minor</option>
              <option value="10_minor">Bb Minor</option>
              <option value="11_minor">B Minor</option>
            </optgroup>
          </select>
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

      {/* Right: Analysis Status / Progress Bar / Error Warning */}
      <div className="flex items-center gap-2 shrink-0">
        {isAnalyzing ? (
          <div className="flex items-center gap-2 bg-[#1a1c22] border border-emerald-500/40 px-2.5 py-1 rounded-md text-[10px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-0.5" />
            <div className="flex flex-col gap-0.5 min-w-[130px]">
              <div className="flex justify-between text-emerald-300 font-semibold">
                <span>{analysisStage || '解析中...'}</span>
                <span>{analysisProgress}%</span>
              </div>
              <div className="w-full bg-[#272a30] rounded-full h-1 overflow-hidden">
                <div
                  className="bg-emerald-400 h-1 transition-all duration-200"
                  style={{ width: `${analysisProgress}%` }}
                />
              </div>
            </div>
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
