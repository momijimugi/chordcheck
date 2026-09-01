import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { PITCH_NAMES, RISK_COLORS } from '../utils/constants';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const MIN_PITCH = 12;  // C0
const MAX_PITCH = 108; // C8
const TOTAL_KEYS = MAX_PITCH - MIN_PITCH + 1;

export const PianoRoll: React.FC = () => {
  const {
    workingMidi,
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

  if (!workingMidi) {
    return (
      <div className="flex-1 bg-[#141518] flex items-center justify-center text-slate-500 text-sm select-none">
        No MIDI data loaded. Open a MIDI file or select a Demo test case above.
      </div>
    );
  }

  const ppq = workingMidi.ppq || 480;
  const totalTicks = Math.max(workingMidi.durationTicks, ppq * 16);
  const gridWidth = totalTicks * zoomX + 800;
  const gridHeight = TOTAL_KEYS * zoomY;

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

  // Time grid lines (Bars and Beats)
  const gridLines = useMemo(() => {
    const lines = [];
    const ticksPerBeat = ppq;
    const ticksPerBar = ppq * 4;
    const totalBars = Math.ceil(totalTicks / ticksPerBar) + 2;

    for (let bar = 0; bar < totalBars; bar++) {
      const barTicks = bar * ticksPerBar;
      lines.push({
        ticks: barTicks,
        left: barTicks * zoomX,
        isBar: true,
        barNumber: bar + 1,
      });

      for (let beat = 1; beat < 4; beat++) {
        const beatTicks = barTicks + beat * ticksPerBeat;
        lines.push({
          ticks: beatTicks,
          left: beatTicks * zoomX,
          isBar: false,
          barNumber: null,
        });
      }
    }
    return lines;
  }, [totalTicks, ppq, zoomX]);

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
                <span className="absolute top-1 left-1.5 text-[10px] font-mono text-slate-500 font-bold">
                  {line.barNumber}
                </span>
              )}
            </div>
          ))}

          {/* Notes Rendering */}
          {workingMidi.notes.map((note) => {
            const track = trackMap.get(note.trackId);
            if (track && !track.settings.visible) return null;

            const analysis = analyses.get(note.id);
            const matchesFilter = isNoteMatchingFilter(analysis);
            const isSelected = selectedNoteId === note.id;

            const top = (MAX_PITCH - note.pitch) * zoomY;
            const left = note.startTicks * zoomX;
            const width = Math.max(8, note.durationTicks * zoomX - 1);
            const height = Math.max(4, zoomY - 1);

            // Risk status styling
            const status = analysis?.status || 'SAFE';
            const riskConfig = RISK_COLORS[status];

            // Note appearance based on colorMode
            let noteBg = riskConfig.hex;
            let noteBorder = riskConfig.hex;

            if (colorMode === 'track' && track) {
              noteBg = track.settings.color;
              noteBorder = riskConfig.hex;
            }

            return (
              <div
                key={note.id}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNote(note.id);
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
                    : status === 'WARNING'
                    ? 'shadow-sm shadow-rose-950/80 z-10'
                    : 'z-0 hover:brightness-125'
                }`}
                title={`${note.name} (${track?.name || 'Track'}) - ${status} (${analysis?.relation.intervalName || ''})`}
              >
                {width > 22 && height >= 10 && (
                  <span className="text-[9px] font-bold text-white/90 drop-shadow-sm truncate pointer-events-none leading-none">
                    {note.name}
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

      {/* Floating Zoom Controls Overlay */}
      <div className="absolute bottom-4 right-4 bg-[#202226]/90 backdrop-blur border border-[#3c404a] rounded-lg p-1.5 flex items-center gap-1.5 shadow-xl z-30">
        <span className="text-[10px] text-slate-400 font-semibold px-1">Zoom:</span>
        <button
          onClick={() => setZoomX((z: number) => z * 1.25)}
          className="p-1 rounded bg-[#272a30] hover:bg-[#32363e] text-slate-300 transition"
          title="Zoom In Time (Horizontal)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoomX((z: number) => z * 0.8)}
          className="p-1 rounded bg-[#272a30] hover:bg-[#32363e] text-slate-300 transition"
          title="Zoom Out Time (Horizontal)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="w-[1px] h-3 bg-[#3c404a] mx-0.5" />
        <button
          onClick={() => setZoomY((z: number) => z + 2)}
          className="px-1.5 py-0.5 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] text-slate-300 transition"
          title="Increase Note Height"
        >
          Y+
        </button>
        <button
          onClick={() => setZoomY((z: number) => Math.max(8, z - 2))}
          className="px-1.5 py-0.5 rounded bg-[#272a30] hover:bg-[#32363e] text-[10px] text-slate-300 transition"
          title="Decrease Note Height"
        >
          Y-
        </button>
      </div>
    </div>
  );
};
