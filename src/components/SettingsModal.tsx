import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { AnalysisProfile, AnalysisResolution, ChordAnalysisSpan, HarmonySourceMode, MinSegmentLength, SegmentationMode } from '../types/analysis';
import { DEFAULT_ANALYSIS_SETTINGS, ANALYSIS_PROFILES } from '../utils/constants';
import { getExportDiagnosticInfo } from '../engine/midiExporter';
import { Settings, X, RotateCcw, Sliders, ShieldCheck, Sparkles, Wand2, FileCode, CheckCircle, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    workingMidi,
    analysisSettings,
    updateAnalysisSettings,
    reanalyze,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'engine' | 'diagnostics'>('engine');

  if (!isSettingsOpen) return null;

  const handleResetDefaults = () => {
    updateAnalysisSettings(DEFAULT_ANALYSIS_SETTINGS);
  };

  const handleProfileChange = (profile: AnalysisProfile) => {
    const preset = ANALYSIS_PROFILES[profile];
    updateAnalysisSettings({ ...preset, profile });
  };

  const diag = workingMidi ? getExportDiagnosticInfo(workingMidi, workingMidi.tracks) : null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#202226] border border-[#3c404a] rounded-xl w-full max-w-lg shadow-2xl p-6 text-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2e3238]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base text-slate-100">設定・MIDI診断 (β0.4.2)</h3>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#2e3238] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 mt-4 border-b border-[#2e3238] pb-2 text-xs">
          <button
            onClick={() => setActiveTab('engine')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'engine'
                ? 'bg-[#272a30] text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            和声解析エンジン設定
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'diagnostics'
                ? 'bg-[#272a30] text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>MIDI診断 (Diagnostics)</span>
          </button>
        </div>

        {activeTab === 'engine' ? (
          <div className="mt-4 space-y-4">
            {/* Section 0: Chord Analysis Span (Phase B & C / β0.4.1) */}
            <div className="bg-[#18191c] p-3.5 rounded-lg border border-[#2e3238]">
              <label className="text-xs font-semibold text-slate-200 block mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>コード解析単位 (Harmonic Rhythm Span):</span>
              </label>
              <p className="text-[11px] text-slate-400 mb-2.5 leading-relaxed">
                コード進行が変化する周期を指定します。テンションや経過音によってコードが細かく誤判定される場合は「2小節」などを指定して再解析してください。
              </p>

              <div className="grid grid-cols-5 gap-1.5">
                {(['auto', 'half_bar', 'one_bar', 'two_bars', 'four_bars'] as ChordAnalysisSpan[]).map(span => {
                  const isSelected = (analysisSettings.chordAnalysisSpan || 'auto') === span;
                  const label = span === 'auto' ? '自動' :
                                span === 'half_bar' ? '1/2小節' :
                                span === 'one_bar' ? '1小節' :
                                span === 'two_bars' ? '2小節' : '4小節';

                  return (
                    <button
                      key={span}
                      type="button"
                      onClick={() => updateAnalysisSettings({ chordAnalysisSpan: span })}
                      className={`py-1.5 px-2 rounded-md text-xs font-semibold border text-center transition ${
                        isSelected
                          ? 'bg-purple-950/70 border-purple-500 text-purple-200 shadow-sm'
                          : 'bg-[#202226] border-[#3c404a] text-slate-300 hover:bg-[#272a30]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => reanalyze()}
                  className="px-3 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm transition"
                  title="選択した解析単位でコード進行を再解析"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>この設定でコードを再解析</span>
                </button>
              </div>
            </div>

            {/* Section 1: Analysis Profile Presets */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>音楽ジャンル・解析プロファイル:</span>
              </label>
              <select
                value={analysisSettings.profile}
                onChange={(e) => handleProfileChange(e.target.value as AnalysisProfile)}
                className="w-full bg-[#18191c] border border-[#3c404a] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="balanced">標準 (Balanced) - ポップス・汎用</option>
                <option value="strict">厳格和声 (Strict) - クラシック・和声法重視</option>
                <option value="film_modern">劇伴・映画音楽 (Film / Modern) - 保続音・クラスター許容</option>
                <option value="jazz_extended">ジャズ・拡張和声 (Jazz / Extended) - テンション・オルタード許容</option>
              </select>
            </div>

            {/* Section 2: Harmonic Source Mode */}
            <div className="pt-3 border-t border-[#2e3238]">
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

            {/* Section 3: Adaptive vs Fixed Segmentation */}
            <div className="pt-3 border-t border-[#2e3238]">
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-sky-400" />
                <span>コード区間の分割方式 (Segmentation):</span>
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => updateAnalysisSettings({ segmentationMode: 'adaptive' })}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition ${
                    analysisSettings.segmentationMode === 'adaptive'
                      ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
                      : 'bg-[#18191c] border-[#2e3238] text-slate-400 hover:border-[#3c404a]'
                  }`}
                >
                  <div className="font-bold text-slate-200">適応型 (Adaptive - 推奨)</div>
                  <div className="text-[10px] text-slate-400">音の変化地点・小節頭を検出して柔軟に分割</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateAnalysisSettings({ segmentationMode: 'fixed_grid' })}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-left transition ${
                    analysisSettings.segmentationMode === 'fixed_grid'
                      ? 'bg-sky-950/60 border-sky-500/60 text-sky-200'
                      : 'bg-[#18191c] border-[#2e3238] text-slate-400 hover:border-[#3c404a]'
                  }`}
                >
                  <div className="font-bold text-slate-200">固定グリッド (Fixed Grid)</div>
                  <div className="text-[10px] text-slate-400">指定した音符単位で等間隔に分割</div>
                </button>
              </div>

              {analysisSettings.segmentationMode === 'adaptive' ? (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    最小コード区間長:
                  </label>
                  <select
                    value={analysisSettings.minSegmentLength}
                    onChange={(e) => updateAnalysisSettings({ minSegmentLength: e.target.value as MinSegmentLength })}
                    className="w-full bg-[#18191c] border border-[#3c404a] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="1/4_beat">1/4拍（16分音符）</option>
                    <option value="1/2_beat">1/2拍（8分音符 - 推奨）</option>
                    <option value="1_beat">1拍（4分音符）</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    固定グリッド分解能:
                  </label>
                  <select
                    value={analysisSettings.resolution}
                    onChange={(e) => updateAnalysisSettings({ resolution: e.target.value as AnalysisResolution })}
                    className="w-full bg-[#18191c] border border-[#3c404a] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="1/4_beat">1/4拍（16分音符単位）</option>
                    <option value="1/2_beat">1/2拍（8分音符単位）</option>
                    <option value="1_beat">1拍（4分音符単位 - 推奨）</option>
                    <option value="2_beats">2拍（2分音符単位）</option>
                    <option value="1_bar">1小節（小節単位）</option>
                  </select>
                </div>
              )}
            </div>

            {/* Section 4: Short Notes Handling */}
            <div className="pt-3 border-t border-[#2e3238]">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                装飾音・短い音の扱い:
              </label>

              <div className="flex items-center justify-between p-3 bg-[#18191c] rounded-lg border border-[#2e3238]">
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

            {/* Section 5: Risk Scoring Weights */}
            <div className="pt-3 border-t border-[#2e3238] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>危険度スコアの個別微調整</span>
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
        ) : (
          /* Diagnostics Tab */
          <div className="mt-4 space-y-3 text-xs">
            {workingMidi && diag ? (
              <div className="space-y-3">
                {/* Export Mode Card */}
                <div className="p-3 bg-[#18191c] rounded-lg border border-[#2e3238]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-300">Export 方式:</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                      diag.canExportDirectBytePatch
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                    }`}>
                      {diag.canExportDirectBytePatch ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      <span>{diag.mode}</span>
                    </span>
                  </div>

                  {diag.warningMessage && (
                    <p className="text-[11px] text-amber-400 bg-amber-950/20 p-2 rounded border border-amber-500/20 mt-2">
                      {diag.warningMessage}
                    </p>
                  )}
                  {diag.canExportDirectBytePatch && (
                    <p className="text-[11px] text-emerald-400 bg-emerald-950/20 p-2 rounded border border-emerald-500/20 mt-2">
                      ✓ 元SMFのSysEx・CC・DAW固有メタデータ・未変更ノートが100%完全保持されます。
                    </p>
                  )}
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 gap-2 bg-[#18191c] p-3 rounded-lg border border-[#2e3238]">
                  <div>
                    <span className="text-slate-400 block text-[11px]">ファイル名</span>
                    <span className="font-semibold text-slate-200 font-mono">{workingMidi.name}.mid</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">分解能 (PPQ)</span>
                    <span className="font-semibold text-slate-200 font-mono">{workingMidi.ppq}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">総トラック数</span>
                    <span className="font-semibold text-slate-200 font-mono">{workingMidi.tracks.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">総ノート数</span>
                    <span className="font-semibold text-slate-200 font-mono">{diag.totalNotes.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">オフセット照合成功 (Matched)</span>
                    <span className="font-semibold text-emerald-400 font-mono">{diag.matchedNotesCount.toLocaleString()} / {diag.totalNotes.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">重複・曖昧ノート (Ambiguous)</span>
                    <span className={`font-semibold font-mono ${diag.ambiguousNotesCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {diag.ambiguousNotesCount.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">未照合ノート (Unmatched)</span>
                    <span className={`font-semibold font-mono ${diag.unmatchedNotesCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {diag.unmatchedNotesCount.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">変更ノート数 (Modified)</span>
                    <span className="font-semibold text-sky-400 font-mono">
                      {diag.modifiedNotesCount.toLocaleString()} (安全パッチ: {diag.modifiedSafePatchCount})
                    </span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-[#2e3238] flex justify-between text-slate-400 text-[11px]">
                    <span>テンポ / 拍子イベント数: <strong className="text-slate-200">{workingMidi.tempos.length} / {workingMidi.timeSignatures.length}</strong></span>
                    <span>元SMFバイト保持: <strong className={diag.hasOriginalBytes ? 'text-emerald-400' : 'text-rose-400'}>{diag.hasOriginalBytes ? 'あり (100%)' : 'なし'}</strong></span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-[#2e3238] flex justify-between text-slate-500 text-[10px]">
                    <span>アプリVersion: <strong className="text-slate-300">β0.4.1.1 Production</strong></span>
                    <span>公開環境: <strong className="text-slate-300">GitHub Pages (/chordcheck/)</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500">
                MIDIデータが読み込まれていません。
              </div>
            )}
          </div>
        )}

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
