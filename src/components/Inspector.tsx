import React from 'react';
import { useApp } from '../state/AppContext';
import { RISK_COLORS } from '../utils/constants';
import { audioSynth } from '../engine/audioSynth';
import { 
  Volume2, 
  Sparkles, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  HelpCircle,
  Clock,
  Music,
  Check,
  ShieldAlert,
  GitCommit,
  Radio
} from 'lucide-react';

export const Inspector: React.FC = () => {
  const {
    workingMidi,
    selectedNoteId,
    analyses,
    modifyNotePitch,
  } = useApp();

  if (!workingMidi || !selectedNoteId) {
    return (
      <aside className="w-80 bg-[#18191c] border-l border-[#2e3238] flex flex-col items-center justify-center p-6 text-center select-none shrink-0 text-slate-500">
        <Music className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-xs font-medium">Select a note on the timeline to inspect harmony relations and view suggestions.</p>
      </aside>
    );
  }

  const selectedNote = workingMidi.notes.find(n => n.id === selectedNoteId);
  const analysis = analyses.get(selectedNoteId);

  if (!selectedNote || !analysis) {
    return (
      <aside className="w-80 bg-[#18191c] border-l border-[#2e3238] p-4 text-slate-500 text-xs shrink-0">
        Note data not found.
      </aside>
    );
  }

  const riskConfig = RISK_COLORS[analysis.status];

  const handleAudition = (pitch: number) => {
    audioSynth.playNote(pitch, 0.5, 0.85);
  };

  const cat = analysis.categorizedReasons || {
    harmony: [],
    timing: [],
    melodic: [],
    collision: [],
  };

  return (
    <aside className="w-80 bg-[#18191c] border-l border-[#2e3238] flex flex-col h-full select-none shrink-0 overflow-y-auto divide-y divide-[#272a30]">
      {/* Inspector Top Header: Note Pitch & Risk Badge */}
      <div className="p-4 bg-[#1e2025]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {analysis.pitchName}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              (MIDI {analysis.pitch})
            </span>
            <button
              onClick={() => handleAudition(analysis.pitch)}
              className="p-1.5 rounded-full bg-[#272a30] hover:bg-[#32363e] text-slate-300 transition"
              title="Audition Note"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Risk Badge */}
          <div className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 ${riskConfig.badge}`}>
            {analysis.status === 'WARNING' && <AlertTriangle className="w-3.5 h-3.5" />}
            {analysis.status === 'CHECK' && <AlertCircle className="w-3.5 h-3.5" />}
            {analysis.status === 'INFO' && <Info className="w-3.5 h-3.5" />}
            {analysis.status === 'SAFE' && <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{analysis.status}</span>
          </div>
        </div>

        {/* Pitch Steppers */}
        <div className="mt-3 flex items-center justify-between gap-1">
          <span className="text-[11px] text-slate-400 font-semibold">Nudge:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => modifyNotePitch(analysis.noteId, analysis.pitch - 12)}
              className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-mono text-slate-300 transition"
              title="Down 1 Octave (-12)"
            >
              -12
            </button>
            <button
              onClick={() => modifyNotePitch(analysis.noteId, analysis.pitch - 1)}
              className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-mono text-slate-300 transition"
              title="Down 1 Semitone (-1)"
            >
              -1
            </button>
            <button
              onClick={() => modifyNotePitch(analysis.noteId, analysis.pitch + 1)}
              className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-mono text-slate-300 transition"
              title="Up 1 Semitone (+1)"
            >
              +1
            </button>
            <button
              onClick={() => modifyNotePitch(analysis.noteId, analysis.pitch + 12)}
              className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-mono text-slate-300 transition"
              title="Up 1 Octave (+12)"
            >
              +12
            </button>
          </div>
        </div>
      </div>

      {/* Harmony Context Details */}
      <div className="p-4 space-y-2.5 text-xs">
        <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider mb-2">
          Harmony & Context
        </h4>

        {/* Track */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Track:</span>
          <span className="font-semibold text-slate-200">{analysis.trackName}</span>
        </div>

        {/* Chord */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Estimated Chord:</span>
          <span className="font-bold text-blue-300 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/30">
            {analysis.chordDisplayName}
          </span>
        </div>

        {/* Relation */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Relation:</span>
          <span className={`font-semibold ${
            analysis.relation.isChordTone ? 'text-emerald-400' :
            analysis.relation.isTension ? 'text-sky-400' :
            'text-amber-400'
          }`}>
            {analysis.relation.intervalName}
          </span>
        </div>

        {/* Position */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Position:</span>
          <span className="font-mono text-slate-300 text-[11px]">{analysis.positionDescription}</span>
        </div>

        {/* Duration */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Duration:</span>
          <span className="font-mono text-slate-300 text-[11px]">{analysis.durationDescription}</span>
        </div>

        {/* Resolution */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Resolution:</span>
          <span className="text-slate-300 font-medium text-[11px] text-right max-w-[150px] truncate" title={analysis.resolutionDescription}>
            {analysis.resolutionDescription}
          </span>
        </div>

        {/* Risk Score */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-400">Risk Score:</span>
          <span className={`font-mono font-bold ${riskConfig.text}`}>
            {analysis.riskScore} / 100
          </span>
        </div>
      </div>

      {/* Categorized Analysis Reasons (Section 31) */}
      <div className="p-4 space-y-2.5">
        <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Analysis Reasons</span>
        </h4>

        <div className="space-y-2 mt-2">
          {/* Harmony Category */}
          {cat.harmony.length > 0 && (
            <div className="bg-[#202226] p-2 rounded-lg border border-[#2e3238]">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Music className="w-3 h-3" />
                <span>Harmony</span>
              </span>
              <ul className="space-y-1 text-xs text-slate-300">
                {cat.harmony.map((r, i) => (
                  <li key={i} className="leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Timing Category */}
          {cat.timing.length > 0 && (
            <div className="bg-[#202226] p-2 rounded-lg border border-[#2e3238]">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                <span>Timing & Metric</span>
              </span>
              <ul className="space-y-1 text-xs text-slate-300">
                {cat.timing.map((r, i) => (
                  <li key={i} className="leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Melodic Context Category */}
          {cat.melodic.length > 0 && (
            <div className="bg-[#202226] p-2 rounded-lg border border-[#2e3238]">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <GitCommit className="w-3 h-3" />
                <span>Melodic Voice Leading</span>
              </span>
              <ul className="space-y-1 text-xs text-slate-300">
                {cat.melodic.map((r, i) => (
                  <li key={i} className="leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Collision Category */}
          {cat.collision.length > 0 && (
            <div className="bg-[#202226] p-2 rounded-lg border border-[#2e3238]">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <ShieldAlert className="w-3 h-3" />
                <span>Voice Collision</span>
              </span>
              <ul className="space-y-1 text-xs text-slate-300">
                {cat.collision.map((r, i) => (
                  <li key={i} className="leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Suggested Pitch Corrections */}
      {analysis.suggestions.length > 0 && (
        <div className="p-4 space-y-2.5">
          <h4 className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Suggested Pitch Corrections</span>
          </h4>

          <div className="space-y-1.5 mt-2">
            {analysis.suggestions.map((sug, idx) => {
              const isCurrentPitch = sug.pitch === analysis.pitch;
              return (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border flex items-center justify-between transition ${
                    isCurrentPitch
                      ? 'bg-slate-800/40 border-slate-700 opacity-60'
                      : 'bg-[#202226] border-[#3c404a] hover:bg-[#272a30]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAudition(sug.pitch)}
                      className="p-1 rounded bg-[#2c2f36] hover:bg-[#383c45] text-slate-300 transition"
                      title="Audition Suggestion"
                    >
                      <Volume2 className="w-3 h-3" />
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-100">{sug.pitchName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({sug.diffSemitones > 0 ? `+${sug.diffSemitones}` : sug.diffSemitones} st)
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-medium block">
                        {sug.reason}
                      </span>
                    </div>
                  </div>

                  {!isCurrentPitch && (
                    <button
                      onClick={() => modifyNotePitch(analysis.noteId, sug.pitch)}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm transition"
                      title="Apply this pitch change"
                    >
                      <Check className="w-3 h-3" />
                      <span>Apply</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};
