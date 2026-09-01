import React from 'react';
import { useApp } from '../state/AppContext';
import { AnalysisResolution, HarmonySourceMode } from '../types/analysis';
import { DEFAULT_ANALYSIS_SETTINGS } from '../utils/constants';
import { Settings, X, RotateCcw, Sliders, ShieldCheck } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    analysisSettings,
    updateAnalysisSettings,
  } = useApp();

  if (!isSettingsOpen) return null;

  const handleResetDefaults = () => {
    updateAnalysisSettings(DEFAULT_ANALYSIS_SETTINGS);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#202226] border border-[#3c404a] rounded-xl w-full max-w-lg shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2e3238]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base text-slate-100">和声解析エンジンの設定</h3>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#2e3238] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Harmonic Source Mode & Resolution */}
        <div className="mt-5 space-y-4">
          {/* Harmony Source Mode */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>コード進行の取得優先度:</span>
            </label>
            <select
              value={analysisSettings.harmonySourceMode}
              onChange={(e) => updateAnalysisSettings({ harmonySourceMode: e.target.value as HarmonySourceMode })}
              className="w-full bg-[#18191c] border border-[#3c404a] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="chord_guide_preferred">コードガイド優先（コードガイドがあれば最優先、なければ自動推定）</option>
              <option value="auto">完全自動推定（全トラックの音から推定）</option>
              <option value="chord_guide_only">コードガイド専用（指定トラックのみで判定）</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Cubase等のコードトラックをMIDI化したトラックがある場合、その情報を最優先してコード区間を作成します。
            </p>
          </div>

          {/* Grid Resolution */}
          <div className="pt-3 border-t border-[#2e3238]">
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              自動コード解析の分解能グリッド:
            </label>
            <select
              value={analysisSettings.resolution}
              onChange={(e) => updateAnalysisSettings({ resolution: e.target.value as AnalysisResolution })}
              className="w-full bg-[#18191c] border border-[#3c404a] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="1/4_beat">1/4拍（16分音符単位）</option>
              <option value="1/2_beat">1/2拍（8分音符単位）</option>
              <option value="1_beat">1拍（4分音符単位 - 推奨）</option>
              <option value="2_beats">2拍（2分音符単位）</option>
              <option value="1_bar">1小節（小節単位）</option>
            </select>
          </div>

          {/* Section 2: Short Notes Handling */}
          <div className="pt-3 border-t border-[#2e3238]">
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              装飾音・短い音の扱い:
            </label>

            <div className="flex items-center justify-between p-3 bg-[#18191c] rounded-lg border border-[#2e3238] mb-3">
              <div>
                <span className="text-xs font-medium text-slate-200 block">短い音の和声への影響を抑制</span>
                <span className="text-[11px] text-slate-400">8分音符未満の短いパッセージがコード推定に過剰に影響しないよう重みを下げます</span>
              </div>
              <input
                type="checkbox"
                checked={analysisSettings.reduceShortNoteInfluence}
                onChange={(e) => updateAnalysisSettings({ reduceShortNoteInfluence: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-[#272a30] border-[#3c404a] cursor-pointer"
              />
            </div>
          </div>

          {/* Section 3: Risk Scoring Weights */}
          <div className="pt-3 border-t border-[#2e3238] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>危険度スコアの感度調整</span>
              </label>
              <button
                onClick={handleResetDefaults}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>初期値に戻す</span>
              </button>
            </div>

            {/* Sliders */}
            <div className="space-y-3 bg-[#18191c] p-3 rounded-lg border border-[#2e3238] text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>コード外音ペナルティ</span>
                  <span className="font-mono text-rose-400">+{analysisSettings.unknownChromaticPenalty}</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={analysisSettings.unknownChromaticPenalty}
                  onChange={(e) => updateAnalysisSettings({ unknownChromaticPenalty: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>強拍・頭拍ペナルティ</span>
                  <span className="font-mono text-amber-400">+{analysisSettings.strongBeatPenalty}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={analysisSettings.strongBeatPenalty}
                  onChange={(e) => updateAnalysisSettings({ strongBeatPenalty: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>経過音・刺繍音ボーナス (軽減)</span>
                  <span className="font-mono text-emerald-400">{analysisSettings.passingToneBonus}</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="-20"
                  value={analysisSettings.passingToneBonus}
                  onChange={(e) => updateAnalysisSettings({ passingToneBonus: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>他声部衝突（短2度/短9度）ペナルティ</span>
                  <span className="font-mono text-rose-400">+{analysisSettings.collisionPenalty}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={analysisSettings.collisionPenalty}
                  onChange={(e) => updateAnalysisSettings({ collisionPenalty: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-950/40 transition"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};
