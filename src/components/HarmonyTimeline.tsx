import React, { useState, useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { ChordCandidate, ChordSegment, ChordType } from '../types/analysis';
import { PITCH_NAMES } from '../utils/constants';
import { ALL_CHORD_TYPES, CHORD_DEFINITIONS } from '../music/chords';
import { Edit3, Check, X, Lock, ShieldCheck, Sparkles, Filter } from 'lucide-react';

export const HarmonyTimeline: React.FC = () => {
  const {
    workingMidi,
    segments,
    zoomX,
    scrollLeft,
    modifyChordSegment,
    overrideChordCandidate,
    selectedSegmentId,
    selectSegment,
    showLowConfidenceOnly,
  } = useApp();

  const [editingSegment, setEditingSegment] = useState<ChordSegment | null>(null);
  const [customRoot, setCustomRoot] = useState<number>(0);
  const [customType, setCustomType] = useState<ChordType>('maj');
  const [customBass, setCustomBass] = useState<number>(0);

  if (!workingMidi || segments.length === 0) return null;

  const totalWidth = workingMidi.durationTicks * zoomX + 600;

  // Visual Merge of consecutive identical chord segments (Section 29)
  const mergedSegments = useMemo(() => {
    if (segments.length === 0) return [];

    const merged: {
      id: string;
      startTicks: number;
      endTicks: number;
      barStart: number;
      barEnd: number;
      beatStart: number;
      beatEnd: number;
      displayName: string;
      confidence: number;
      manualOverride: boolean;
      sourceType: 'AUTO' | 'GUIDE' | 'MANUAL';
      rawSegments: ChordSegment[];
      primarySegment: ChordSegment;
    }[] = [];

    let current = {
      id: segments[0].id,
      startTicks: segments[0].startTicks,
      endTicks: segments[0].endTicks,
      barStart: segments[0].barIndex,
      barEnd: segments[0].barIndex,
      beatStart: segments[0].beatIndex,
      beatEnd: segments[0].beatIndex,
      displayName: segments[0].displayName,
      confidence: segments[0].confidence,
      manualOverride: segments[0].manualOverride,
      sourceType: segments[0].sourceType || (segments[0].manualOverride ? 'MANUAL' : 'AUTO'),
      rawSegments: [segments[0]],
      primarySegment: segments[0],
    };

    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const segSource = seg.sourceType || (seg.manualOverride ? 'MANUAL' : 'AUTO');

      // If consecutive segment has same chord display name, manualOverride, and source type, merge visually
      if (
        seg.displayName === current.displayName &&
        seg.manualOverride === current.manualOverride &&
        segSource === current.sourceType
      ) {
        current.endTicks = seg.endTicks;
        current.barEnd = seg.barIndex;
        current.beatEnd = seg.beatIndex;
        current.confidence = Math.min(current.confidence, seg.confidence);
        current.rawSegments.push(seg);
      } else {
        merged.push(current);
        current = {
          id: seg.id,
          startTicks: seg.startTicks,
          endTicks: seg.endTicks,
          barStart: seg.barIndex,
          barEnd: seg.barIndex,
          beatStart: seg.beatIndex,
          beatEnd: seg.beatIndex,
          displayName: seg.displayName,
          confidence: seg.confidence,
          manualOverride: seg.manualOverride,
          sourceType: segSource,
          rawSegments: [seg],
          primarySegment: seg,
        };
      }
    }
    merged.push(current);
    return merged;
  }, [segments]);

  const openEditor = (seg: ChordSegment) => {
    setEditingSegment(seg);
    setCustomRoot(seg.root);
    setCustomType(seg.type);
    setCustomBass(seg.bass);
    selectSegment(seg.id);
  };

  const handleApplyCustom = () => {
    if (editingSegment) {
      modifyChordSegment(editingSegment.id, customRoot, customType, customBass);
      setEditingSegment(null);
    }
  };

  const handleSelectCandidate = (candidate: ChordCandidate) => {
    if (editingSegment) {
      overrideChordCandidate(editingSegment.id, candidate);
      setEditingSegment(null);
    }
  };

  return (
    <div className="h-14 bg-[#1e2025] border-b border-[#2e3238] flex items-center relative overflow-hidden select-none shrink-0">
      {/* Fixed Left Header */}
      <div className="w-56 h-full bg-[#18191c] border-r border-[#2e3238] flex items-center justify-between px-3 shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-300">Harmony Progression</span>
        </div>
      </div>

      {/* Horizontally scrolling merged chord segments track */}
      <div
        className="flex-1 h-full relative overflow-x-hidden"
        style={{ width: `calc(100% - 224px)` }}
      >
        <div
          className="h-full relative flex items-center"
          style={{
            width: `${totalWidth}px`,
            transform: `translateX(-${scrollLeft}px)`,
          }}
        >
          {mergedSegments.map((block) => {
            const left = block.startTicks * zoomX;
            const width = Math.max(48, (block.endTicks - block.startTicks) * zoomX - 2);
            const isSelected = selectedSegmentId === block.primarySegment.id;
            const isLowConf = block.confidence < 60 && !block.manualOverride && block.sourceType !== 'GUIDE';

            if (showLowConfidenceOnly && !isLowConf) {
              return null;
            }

            return (
              <div
                key={block.id}
                onClick={() => openEditor(block.primarySegment)}
                style={{
                  left: `${left}px`,
                  width: `${width}px`,
                }}
                className={`absolute h-10 top-2 rounded-md border flex flex-col justify-center px-2 cursor-pointer transition shadow-sm ${
                  block.manualOverride || block.sourceType === 'MANUAL'
                    ? 'bg-purple-950/50 border-purple-500/70 text-purple-200 hover:bg-purple-900/60'
                    : block.sourceType === 'GUIDE'
                    ? 'bg-teal-950/50 border-teal-500/70 text-teal-200 hover:bg-teal-900/60'
                    : isLowConf
                    ? 'bg-rose-950/40 border-rose-500/60 text-rose-200 hover:bg-rose-900/50'
                    : isSelected
                    ? 'bg-blue-950/50 border-blue-500 text-blue-200 shadow-md'
                    : 'bg-[#272a30] border-[#3c404a] text-slate-200 hover:bg-[#32363e] hover:border-slate-400'
                }`}
                title={`Bar ${block.barStart}.${block.beatStart} ~ ${block.barEnd}.${block.beatEnd}: ${block.displayName} (${block.confidence}% confidence | ${block.sourceType}). Click to edit.`}
              >
                <div className="flex items-center justify-between gap-1 overflow-hidden">
                  <span className="font-bold text-xs truncate tracking-tight">{block.displayName}</span>
                  
                  {/* Source Tag Badge (MANUAL / GUIDE / AUTO) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {block.sourceType === 'MANUAL' ? (
                      <span className="text-[9px] text-purple-300 font-mono px-1 rounded bg-purple-900/60 border border-purple-500/50 flex items-center gap-0.5">
                        <Lock className="w-2 h-2" />
                        <span>MANUAL</span>
                      </span>
                    ) : block.sourceType === 'GUIDE' ? (
                      <span className="text-[9px] text-teal-300 font-mono px-1 rounded bg-teal-900/60 border border-teal-500/50 flex items-center gap-0.5">
                        <ShieldCheck className="w-2 h-2" />
                        <span>GUIDE</span>
                      </span>
                    ) : (
                      <span className={`text-[10px] font-mono px-1 rounded ${
                        block.confidence >= 80 ? 'text-emerald-400 bg-emerald-950/40' :
                        block.confidence >= 60 ? 'text-amber-400 bg-amber-950/40' :
                        'text-rose-400 bg-rose-950/40'
                      }`}>
                        {block.confidence}%
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-[9px] text-slate-400 truncate">
                  {block.barStart === block.barEnd
                    ? `Bar ${block.barStart}`
                    : `Bars ${block.barStart}–${block.barEnd}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Chord Editor Popover Modal */}
      {editingSegment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#202226] border border-[#3c404a] rounded-xl w-full max-w-md shadow-2xl p-5 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#2e3238]">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-purple-400" />
                  <span>Edit Chord (Bar {editingSegment.barIndex} Beat {editingSegment.beatIndex})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Estimated: <strong className="text-slate-200">{editingSegment.displayName}</strong> ({editingSegment.confidence}% | {editingSegment.sourceType})</p>
              </div>
              <button
                onClick={() => setEditingSegment(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#2e3238] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Candidates Picker */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Top Chord Candidates (Click to apply):
              </label>
              <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {editingSegment.candidates.map((cand, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectCandidate(cand)}
                    className={`px-3 py-2 rounded-lg border text-left flex items-center justify-between transition ${
                      editingSegment.displayName === cand.displayName
                        ? 'bg-blue-950/40 border-blue-500/80 text-blue-200'
                        : 'bg-[#272a30] border-[#3c404a] hover:bg-[#32363e] text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{cand.displayName}</span>
                      <span className="text-[11px] text-slate-400 font-sans">({cand.typeName})</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-black/30 px-1.5 py-0.5 rounded">
                      {cand.confidence}%
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Chord Override */}
            <div className="mt-5 pt-4 border-t border-[#2e3238]">
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Custom Chord Specification:
              </label>
              
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Root</span>
                  <select
                    value={customRoot}
                    onChange={(e) => setCustomRoot(parseInt(e.target.value, 10))}
                    className="w-full bg-[#18191c] border border-[#3c404a] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {PITCH_NAMES.map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Type</span>
                  <select
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as ChordType)}
                    className="w-full bg-[#18191c] border border-[#3c404a] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {ALL_CHORD_TYPES.map((type) => (
                      <option key={type} value={type}>{CHORD_DEFINITIONS[type].name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Bass</span>
                  <select
                    value={customBass}
                    onChange={(e) => setCustomBass(parseInt(e.target.value, 10))}
                    className="w-full bg-[#18191c] border border-[#3c404a] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {PITCH_NAMES.map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingSegment(null)}
                  className="px-3 py-1.5 rounded-md bg-[#272a30] hover:bg-[#32363e] text-xs font-medium text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustom}
                  className="px-4 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md shadow-purple-950/40 transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Manual Override</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
