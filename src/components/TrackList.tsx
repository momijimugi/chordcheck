import React from 'react';
import { useApp } from '../state/AppContext';
import { ChordAnalysisRole, InstrumentFamily, RangePreset, TrackRole } from '../types/midi';
import { 
  Eye, 
  EyeOff, 
  ShieldAlert, 
  Layers,
  Sparkles,
  Drum,
  Music2
} from 'lucide-react';

export const TrackList: React.FC = () => {
  const {
    workingMidi,
    selectedNoteId,
    updateTrackRole,
    updateTrackChordRole,
    updateTrackRange,
    updateTrackInstrument,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackVisibility,
  } = useApp();

  if (!workingMidi) return null;

  const selectedNote = selectedNoteId ? workingMidi.notes.find(n => n.id === selectedNoteId) : null;
  const activeTrackId = selectedNote ? selectedNote.trackId : null;

  const getFamilyIcon = (family?: InstrumentFamily) => {
    switch (family) {
      case 'piano':
      case 'keyboard': return '🎹';
      case 'guitar': return '🎸';
      case 'bass': return '🎸';
      case 'strings': return '🎻';
      case 'brass': return '🎺';
      case 'woodwind': return '🎷';
      case 'synth': return '🎛';
      case 'drums':
      case 'percussion': return '🥁';
      case 'vocal': return '🎤';
      case 'orchestra': return '🎼';
      default: return '🎵';
    }
  };

  const getRoleLabel = (role: TrackRole) => {
    switch (role) {
      case 'melody': return 'メロディ';
      case 'harmony': return '和音 / バッキング';
      case 'bass': return 'ベース';
      case 'chord_guide': return 'コードガイド';
      case 'percussion': return 'ドラム / 打楽器';
      case 'keyswitch': return 'キースイッチ / 除外';
      case 'ignore': return '解析除外';
      case 'auto':
      default:
        return '自動判定';
    }
  };

  const getChordRoleLabel = (role?: ChordAnalysisRole) => {
    switch (role) {
      case 'primary_harmony': return '主和声';
      case 'supporting_harmony': return '補助和声';
      case 'bass_anchor': return 'ベース';
      case 'melody': return 'メロディ';
      case 'exclude': return '除外';
      case 'auto':
      default:
        return '自動';
    }
  };

  return (
    <aside className="w-56 bg-[#18191c] border-r border-[#2e3238] flex flex-col h-full select-none shrink-0 overflow-hidden">
      {/* Track List Header */}
      <div className="h-10 bg-[#1c1e22] border-b border-[#2e3238] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>トラック ({workingMidi.tracks.length})</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {workingMidi.notes.length.toLocaleString()} 音
        </span>
      </div>

      {/* Tracks Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#272a30]">
        {workingMidi.tracks.map((track) => {
          const { settings } = track;
          const isIgnored = settings.ignore || settings.role === 'ignore';
          const isChordGuide = settings.role === 'chord_guide';
          const isPercussion = settings.role === 'percussion';
          const isSelected = activeTrackId === track.id;

          const isSuggestedChordGuide = settings.role !== 'chord_guide' && (
            track.name.toLowerCase().includes('chord') ||
            track.name.toLowerCase().includes('guide')
          );

          const drumConf = settings.classification?.drumConfidence ?? 0;
          const isHighConfidenceDrum = drumConf >= 80 && !isPercussion;

          return (
            <div
              key={track.id}
              className={`p-2.5 transition ${
                isSelected
                  ? 'bg-blue-950/40 border-l-2 border-l-blue-400'
                  : isChordGuide
                  ? 'bg-teal-950/20 border-l-2 border-l-teal-500'
                  : isIgnored
                  ? 'opacity-60 bg-[#141518]'
                  : 'bg-[#18191c] hover:bg-[#202226]'
              }`}
            >
              {/* Top Row: Color indicator, Instrument Icon, Name, Mute/Solo/Vis */}
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: settings.color }}
                  />
                  <span className="text-xs shrink-0" title={settings.instrumentFamily}>
                    {getFamilyIcon(settings.instrumentFamily)}
                  </span>
                  <span className="font-semibold text-xs text-slate-200 truncate" title={track.name}>
                    {track.name}
                  </span>
                </div>

                {/* Controls: Mute, Solo, Eye */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition ${
                      settings.muted
                        ? 'bg-rose-500 text-white'
                        : 'bg-[#272a30] text-slate-400 hover:text-slate-200'
                    }`}
                    title="トラックをミュート"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleTrackSolo(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition ${
                      settings.solo
                        ? 'bg-amber-500 text-black'
                        : 'bg-[#272a30] text-slate-400 hover:text-slate-200'
                    }`}
                    title="トラックをソロ再生"
                  >
                    S
                  </button>
                  <button
                    onClick={() => toggleTrackVisibility(track.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-200 transition ${
                      !settings.visible ? 'text-slate-600' : ''
                    }`}
                    title="ピアノロールでの表示 / 非表示"
                  >
                    {settings.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Classification proposal badge (Phase F / Section 20) */}
              {settings.classification && (
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/40 text-slate-400 flex items-center gap-0.5 border border-slate-700/50">
                    <Sparkles className="w-2 h-2 text-amber-400" />
                    <span>推定: {getRoleLabel(settings.classification.suggestedRole)} ({settings.classification.confidence}%)</span>
                  </span>
                </div>
              )}

              {/* Second Row: Track Role Selector */}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-slate-400">役割:</span>
                <select
                  value={settings.role}
                  onChange={(e) => updateTrackRole(track.id, e.target.value as TrackRole)}
                  className={`border rounded px-1.5 py-0.5 text-[11px] focus:outline-none cursor-pointer flex-1 max-w-[145px] truncate ${
                    isChordGuide
                      ? 'bg-teal-950/60 border-teal-500 text-teal-200 font-semibold'
                      : isPercussion
                      ? 'bg-amber-950/50 border-amber-500/60 text-amber-200 font-semibold'
                      : 'bg-[#202226] border-[#3c404a] text-slate-200 focus:border-blue-500'
                  }`}
                >
                  <option value="auto">自動 ({getRoleLabel(settings.detectedRole || 'auto')})</option>
                  <option value="melody">メロディ</option>
                  <option value="harmony">和音 / バッキング</option>
                  <option value="bass">ベース</option>
                  <option value="chord_guide">コードガイド ⭐</option>
                  <option value="percussion">ドラム / 打楽器</option>
                  <option value="keyswitch">キースイッチ / 除外</option>
                  <option value="ignore">解析から除外</option>
                </select>
              </div>

              {/* Chord Analysis Role Selector (β0.4.2 Phase B & T) */}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-slate-400">和声解析:</span>
                <select
                  value={settings.chordAnalysisRole || 'auto'}
                  onChange={(e) => updateTrackChordRole(track.id, e.target.value as ChordAnalysisRole)}
                  className={`border rounded px-1.5 py-0.5 text-[11px] focus:outline-none cursor-pointer flex-1 max-w-[145px] truncate ${
                    settings.chordAnalysisRole === 'primary_harmony'
                      ? 'bg-blue-950/60 border-blue-500 text-blue-200 font-semibold'
                      : settings.chordAnalysisRole === 'bass_anchor'
                      ? 'bg-purple-950/50 border-purple-500 text-purple-200 font-semibold'
                      : settings.chordAnalysisRole === 'exclude'
                      ? 'bg-slate-900 border-slate-700 text-slate-400'
                      : 'bg-[#202226] border-[#3c404a] text-slate-200 focus:border-blue-500'
                  }`}
                  title="コード検出時の優先度・役割（主和声は骨格、ベースは根音、メロディはテンション評価に使用）"
                >
                  <option value="auto">
                    自動 ({getChordRoleLabel(settings.detectedChordAnalysisRole || 'supporting_harmony')} {settings.chordRoleConfidence || 70}%)
                  </option>
                  <option value="primary_harmony">◎ 主和声 (骨格)</option>
                  <option value="supporting_harmony">○ 補助和声</option>
                  <option value="bass_anchor">B ベース (根音/ベース)</option>
                  <option value="melody">△ メロディ (テンション)</option>
                  <option value="exclude">― 除外 (和声不使用)</option>
                </select>
              </div>

              {/* Instrument Family Selector (Phase S / Section 72) */}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-slate-400">音色:</span>
                <select
                  value={settings.instrumentFamily || 'unknown'}
                  onChange={(e) => updateTrackInstrument && updateTrackInstrument(track.id, e.target.value as InstrumentFamily)}
                  className="bg-[#202226] border border-[#3c404a] rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer flex-1 max-w-[145px] truncate"
                >
                  <option value="piano">🎹 ピアノ</option>
                  <option value="keyboard">🎹 鍵盤 / オルガン</option>
                  <option value="guitar">🎸 ギター</option>
                  <option value="bass">🎸 ベース</option>
                  <option value="strings">🎻 ストリングス</option>
                  <option value="brass">🎺 ブラス / 金管</option>
                  <option value="woodwind">🎷 木管楽器</option>
                  <option value="synth">🎛 シンセサイザー</option>
                  <option value="drums">🥁 ドラム</option>
                  <option value="percussion">🥁 パーカッション</option>
                  <option value="vocal">🎤 ボーカル</option>
                  <option value="unknown">🎵 標準音色</option>
                </select>
              </div>

              {/* Drum Candidate Alert Banner (Phase C / Section 8) */}
              {isHighConfidenceDrum && (
                <div className="mt-1.5 p-1.5 rounded bg-amber-950/40 border border-amber-500/50 text-[10px] flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-300 font-medium">
                    <Drum className="w-3 h-3 text-amber-400" />
                    <span>ドラム候補 ({drumConf}%)</span>
                  </div>
                  <button
                    onClick={() => updateTrackRole(track.id, 'percussion')}
                    className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[9px] transition"
                  >
                    ドラムに設定
                  </button>
                </div>
              )}

              {/* Chord Guide Suggested Banner */}
              {isSuggestedChordGuide && (
                <div className="mt-1.5 p-1.5 rounded bg-teal-950/30 border border-teal-500/40 text-[10px] flex items-center justify-between">
                  <span className="text-teal-300 font-medium">コードガイドに設定？</span>
                  <button
                    onClick={() => updateTrackRole(track.id, 'chord_guide')}
                    className="px-1.5 py-0.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-[9px] transition"
                  >
                    設定
                  </button>
                </div>
              )}

              {/* Analysis Range Preset */}
              {!isChordGuide && !isPercussion && (
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[10px] text-slate-400">音域:</span>
                  <select
                    value={settings.rangePreset}
                    onChange={(e) => updateTrackRange(track.id, e.target.value as RangePreset)}
                    className="bg-[#202226] border border-[#3c404a] rounded px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer flex-1 max-w-[145px] truncate"
                  >
                    <option value="all">全音域 (0-127)</option>
                    <option value="ignore_below_c0">C0未満を除外 (12-127)</option>
                    <option value="ignore_below_c1">C1未満を除外 (24-127)</option>
                    <option value="ignore_below_c2">C2未満を除外 (36-127)</option>
                  </select>
                </div>
              )}

              {/* Keyswitch Warning Alert Banner */}
              {settings.hasKeyswitchWarning && (
                <div className="mt-2 p-1.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[10px]">
                  <div className="flex items-center gap-1 font-semibold">
                    <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>キースイッチを検出</span>
                  </div>
                  <p className="text-[9px] text-amber-200/80 mt-0.5">
                    {settings.keyswitchPitchCount}件の低音ノート（音域隔離）が見つかりました。
                  </p>
                  <button
                    onClick={() => updateTrackRange(track.id, 'ignore_below_c1')}
                    className="mt-1 w-full py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-[10px] font-semibold text-amber-200 transition text-center"
                  >
                    C1未満を除外（キースイッチ除外）
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
