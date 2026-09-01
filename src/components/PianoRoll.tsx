import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { RISK_COLORS } from '../utils/constants';
import { pitchToName, getPitchClass } from '../music/pitch';
import { buildMeterMap, ticksToMusicalPosition } from '../music/meter';
import { MidiData } from '../types/midi';
import { ZoomIn, ZoomOut, Music } from 'lucide-react';

const MIN_PITCH = 12;  // C0
const MAX_PITCH = 108; // C8
const TOTAL_KEYS = MAX_PITCH - MIN_PITCH + 1;

export const PianoRollEmptyState: React.FC = () => {
  return (
    <div className="flex-1 bg-[#141518] flex flex-col items-center justify-center text-slate-500 text-sm select-none p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[#1e2025] flex items-center justify-center mb-3 border border-[#2e3238]">
        <Music className="w-6 h-6 text-slate-600" />
      </div>
      <h3 className="font-semibold text-slate-300 mb-1">MIDIデータが読み込まれていません</h3>
      <p className="text-xs text-slate-500 max-w-sm">
        MIDIファイルを画面上にドラッグ＆ドロップするか、上部ツールバーからファイルまたはデモ楽曲を開いてください。
      </p>
    </div>
  );
};

interface ContentProps {
  workingMidi: MidiData;
}

export const PianoRollContent: React.FC<ContentProps> = ({ workingMidi }) => {
  const {
    analyses,
    selectedNoteId,
    selectNote,
    activeFilter,
    colorMode,
    zoomX,
    zoomY,
    setZoomX,
    setZoomY,
    scrollLeft,
    scrollTop,
    setScroll,
    isPlaying,
    playheadTicks,
  } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1200, height: 600 });

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setViewportSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Sync scroll from state
  useEffect(() => {
    if (containerRef.current && !isSyncingScroll.current) {
      containerRef.current.scrollLeft = scrollLeft;
      containerRef.current.scrollTop = scrollTop;
    }
  }, [scrollLeft, scrollTop]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    isSyncingScroll.current = true;
    setScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop);
    setTimeout(() => {
      isSyncingScroll.current = false;
    }, 50);
  };

  const ppq = workingMidi.ppq || 480;
  const totalTicks = Math.max(workingMidi.durationTicks, ppq * 16);
  const gridWidth = totalTicks * zoomX + 800;
  const gridHeight = TOTAL_KEYS * zoomY;

  // Meter Map for Variable Time Signatures (Phase B)
  const meterMap = useMemo(() => {
    return buildMeterMap(workingMidi.timeSignatures, ppq, totalTicks);
  }, [workingMidi.timeSignatures, ppq, totalTicks]);

  // Track map for track visibility/color lookup
  const trackMap = useMemo(() => {
    const map = new Map<number, (typeof workingMidi.tracks)[0]>();
    workingMidi.tracks.forEach(t => map.set(t.id, t));
    return map;
  }, [workingMidi]);

  // Keys array from MAX_PITCH down to MIN_PITCH
  const pianoKeys = useMemo(() => {
    const keys = [];
    for (let p = MAX_PITCH; p >= MIN_PITCH; p--) {
      const pc = getPitchClass(p);
      const isBlack = [1, 3, 6, 8, 10].includes(pc);
      const isC = pc === 0;
      const name = pitchToName(p);
      keys.push({ pitch: p, pc, isBlack, isC, name });
    }
    return keys;
  }, []);

  // Dynamic Time grid lines based on Meter Map (Bars, Beats, & Signature changes)
  const gridLines = useMemo(() => {
    const lines: {
      ticks: number;
      left: number;
      isBar: boolean;
      barNumber: number | null;
      timeSigBadge: string | null;
    }[] = [];

    meterMap.forEach((region, rIdx) => {
      let currentRegionTicks = region.startTicks;
      let barInRegion = 0;

      while (currentRegionTicks < region.endTicks) {
        const barTicks = currentRegionTicks;
        const barNumber = region.startBar + barInRegion;
        const isFirstBarOfRegion = barInRegion === 0;
        const timeSigBadge = (isFirstBarOfRegion && (rIdx > 0 || region.numerator !== 4 || region.denominator !== 4))
          ? `${region.numerator}/${region.denominator}`
          : null;

        lines.push({
          ticks: barTicks,
          left: barTicks * zoomX,
          isBar: true,
          barNumber,
          timeSigBadge,
        });

        // Beat lines
        for (let beat = 1; beat < region.numerator; beat++) {
          const beatTicks = barTicks + beat * region.ticksPerBeat;
          if (beatTicks < region.endTicks) {
            lines.push({
              ticks: beatTicks,
              left: beatTicks * zoomX,
              isBar: false,
              barNumber: null,
              timeSigBadge: null,
            });
          }
        }

        currentRegionTicks += region.ticksPerBar;
        barInRegion++;
      }
    });

    return lines;
  }, [meterMap, zoomX]);

  // Viewport Virtualization bounds (Phase F)
  const visibleStartTicks = Math.max(0, (scrollLeft - 400) / zoomX);
  const visibleEndTicks = (scrollLeft + viewportSize.width + 400) / zoomX;
  const visibleMaxPitch = Math.min(MAX_PITCH, MAX_PITCH - Math.floor((scrollTop - 100) / zoomY) + 12);
  const visibleMinPitch = Math.max(MIN_PITCH, MAX_PITCH - Math.ceil((scrollTop + viewportSize.height + 100) / zoomY) - 12);

  // Virtualized Visible Notes
  const visibleNotes = useMemo(() => {
    return workingMidi.notes.filter(n => {
      // Time overlap check
      if (n.endTicks < visibleStartTicks || n.startTicks > visibleEndTicks) return false;
      // Pitch range check
      if (n.pitch < visibleMinPitch || n.pitch > visibleMaxPitch) return false;
      return true;
    });
  }, [workingMidi.notes, visibleStartTicks, visibleEndTicks, visibleMinPitch, visibleMaxPitch]);

  // Filter evaluation helper
  const isNoteMatchingFilter = useCallback((analysis: any) => {
    if (!analysis) return true;
    switch (activeFilter) {
      case 'WARNING_ONLY':
        return analysis.status === 'WARNING';
      case 'CHECK':
        return analysis.status === 'CHECK' || analysis.status === 'WARNING';
      case 'INFO':
        return analysis.status === 'INFO';
      case 'SAFE':
        return analysis.status === 'SAFE';
      case 'ALL':
      default:
        return true;
    }
  }, [activeFilter]);

  // Fit Project helper (horizontal zoom fit)
  const handleFitProject = () => {
    if (containerRef.current && workingMidi.durationTicks > 0) {
      const containerWidth = containerRef.current.clientWidth - 100;
      const optimalZoomX = Math.max(0.02, Math.min(0.5, containerWidth / workingMidi.durationTicks));
      setZoomX(optimalZoomX);
      setScroll(0, scrollTop);
    }
  };

  // Fit Notes helper (vertical scroll fit to note range)
  const handleFitNotes = () => {
    if (workingMidi.notes.length > 0) {
      const pitches = workingMidi.notes.map(n => n.pitch);
      const minP = Math.min(...pitches);
      const maxP = Math.max(...pitches);
      const avgP = (minP + maxP) / 2;
      const targetTop = (MAX_PITCH - avgP) * zoomY - 200;
      setScroll(scrollLeft, Math.max(0, targetTop));
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#121316] relative overflow-hidden select-none">
      {/* Scrollable Piano Roll Main Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto relative flex"
        style={{ scrollBehavior: 'auto' }}
      >
        {/* Left Sticky Piano Keys */}
        <div
          className="sticky left-0 bg-[#18191c] border-r border-[#2e3238] shrink-0 z-20 shadow-lg"
          style={{ width: '56px', height: `${gridHeight}px` }}
        >
          {pianoKeys.map((key) => {
            return (
              <div
                key={key.pitch}
                style={{ height: `${zoomY}px` }}
                className={`border-b border-[#22242a] flex items-center justify-end px-1.5 transition ${
                  key.isBlack
                    ? 'bg-[#1b1c20] text-slate-500'
                    : 'bg-[#2a2c33] text-slate-300'
                } ${key.isC ? 'border-b-blue-500/50 font-bold text-blue-300' : ''}`}
              >
                {key.isC && (
                  <span className="text-[10px] font-mono leading-none">
                    {key.name}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Timeline Grid & Notes Area */}
        <div
          className="relative bg-[#141518]"
          style={{
            width: `${gridWidth}px`,
            height: `${gridHeight}px`,
          }}
        >
          {/* Pitch Horizontal Rows */}
          {pianoKeys.map((key, idx) => (
            <div
              key={key.pitch}
              style={{
                top: `${idx * zoomY}px`,
                height: `${zoomY}px`,
              }}
              className={`absolute left-0 right-0 border-b ${
                key.isBlack
                  ? 'bg-[#16171b]/60 border-[#1f2127]'
                  : 'bg-[#1b1d22]/30 border-[#23262d]'
              } ${key.isC ? 'border-b-[#3c404b]' : ''}`}
            />
          ))}

          {/* Bar & Beat Vertical Grid Lines */}
          {gridLines.map((line, idx) => (
            <div
              key={idx}
              style={{ left: `${line.left}px` }}
              className={`absolute top-0 bottom-0 pointer-events-none ${
                line.isBar
                  ? 'border-l border-[#3e4350] z-0'
                  : 'border-l border-[#23262d] z-0'
              }`}
            >
              {line.isBar && (
                <div className="absolute top-1 left-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-500 font-bold">
                    {line.barNumber}
                  </span>
                  {line.timeSigBadge && (
                    <span className="text-[9px] font-mono font-black text-sky-400 bg-sky-950/80 px-1 py-0.2 rounded border border-sky-500/40">
                      {line.timeSigBadge}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Virtualized Notes Rendering */}
          {visibleNotes.map((note) => {
            const track = trackMap.get(note.trackId);
            if (track && !track.settings.visible) return null;

            const isChordGuideTrack = track?.settings.role === 'chord_guide';
            const analysis = analyses.get(note.id);
            const matchesFilter = isChordGuideTrack ? true : isNoteMatchingFilter(analysis);
            const isSelected = selectedNoteId === note.id;

            const top = (MAX_PITCH - note.pitch) * zoomY;
            const left = note.startTicks * zoomX;
            const width = Math.max(8, note.durationTicks * zoomX - 1);
            const height = Math.max(4, zoomY - 1);

            // Risk status styling
            const status = isChordGuideTrack ? 'SAFE' : (analysis?.status || 'SAFE');
            const riskConfig = RISK_COLORS[status];

            // Note appearance based on colorMode or Chord Guide
            let noteBg = isChordGuideTrack ? '#0f766e' : riskConfig.hex;
            let noteBorder = isChordGuideTrack ? '#2dd4bf' : riskConfig.hex;

            if (!isChordGuideTrack && colorMode === 'track' && track) {
              noteBg = track.settings.color;
              noteBorder = riskConfig.hex;
            }

            return (
              <div
                key={note.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isChordGuideTrack) {
                    selectNote(note.id);
                  }
                }}
                style={{
                  top: `${top}px`,
                  left: `${left}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  backgroundColor: matchesFilter ? noteBg : `${noteBg}22`,
                  borderColor: isSelected ? '#ffffff' : matchesFilter ? noteBorder : `${noteBorder}33`,
                  opacity: matchesFilter ? 1 : 0.2,
                }}
                className={`absolute rounded-[3px] border cursor-pointer transition-all flex items-center px-1 overflow-hidden select-none ${
                  isSelected
                    ? 'ring-2 ring-white ring-offset-1 ring-offset-black z-30 shadow-lg scale-[1.02]'
                    : isChordGuideTrack
                    ? 'z-10 shadow-sm border-dashed'
                    : status === 'WARNING'
                    ? 'shadow-sm shadow-rose-950/80 z-10'
                    : 'z-0 hover:brightness-125'
                }`}
                title={
                  isChordGuideTrack
                    ? `${note.name} (コードガイド)`
                    : `${note.name} (${track?.name || 'Track'}) - ${status} (${analysis?.relation.intervalName || ''})`
                }
              >
                {width > 22 && height >= 10 && (
                  <span className="text-[9px] font-bold text-white/90 drop-shadow-sm truncate pointer-events-none leading-none">
                    {isChordGuideTrack ? `GUIDE ${note.name}` : note.name}
                  </span>
                )}
              </div>
            );
          })}

          {/* Active Playhead Line */}
          {isPlaying && (
            <div
              style={{ left: `${playheadTicks * zoomX}px` }}
              className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-40 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            />
          )}
        </div>
      </div>

      {/* Floating Zoom & Fit Controls Overlay */}
      <div className="absolute bottom-4 right-4 bg-[#202226]/90 backdrop-blur border border-[#3c404a] rounded-lg p-1.5 flex items-center gap-1.5 shadow-xl z-30">
        <button
          onClick={handleFitProject}
          className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-medium text-slate-300 transition"
          title="楽曲全体を横幅いっぱいに表示"
        >
          全体表示
        </button>
        <button
          onClick={handleFitNotes}
          className="px-2 py-1 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] font-medium text-slate-300 transition"
          title="発音されている音域を縦方向の中央に表示"
        >
          音域中央
        </button>
        <div className="w-[1px] h-3 bg-[#3c404a] mx-0.5" />
        <button
          onClick={() => setZoomX((z: number) => z * 1.25)}
          className="p-1 rounded bg-[#272a30] hover:bg-[#32363e] text-slate-300 transition"
          title="時間軸を拡大 (横ズーム+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoomX((z: number) => z * 0.8)}
          className="p-1 rounded bg-[#272a30] hover:bg-[#32363e] text-slate-300 transition"
          title="時間軸を縮小 (横ズーム-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="w-[1px] h-3 bg-[#3c404a] mx-0.5" />
        <button
          onClick={() => setZoomY((z: number) => z + 2)}
          className="px-1.5 py-0.5 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] text-slate-300 transition"
          title="鍵盤高さを拡大 (縦ズーム+)"
        >
          縦+
        </button>
        <button
          onClick={() => setZoomY((z: number) => Math.max(8, z - 2))}
          className="px-1.5 py-0.5 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] text-slate-300 transition"
          title="鍵盤高さを縮小 (縦ズーム-)"
        >
          縦-
        </button>
      </div>
    </div>
  );
};

export const PianoRoll: React.FC = () => {
  const { workingMidi } = useApp();

  if (!workingMidi) {
    return <PianoRollEmptyState />;
  }

  return <PianoRollContent workingMidi={workingMidi} />;
};
