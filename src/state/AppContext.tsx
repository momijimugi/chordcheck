import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, ColorMode, FilterType, HistoryState } from '../types/state';
import { AnalysisSettings, ChordCandidate, ChordSegment, ChordType, NoteAnalysis } from '../types/analysis';
import { MidiData, NoteData, RangePreset, TrackData, TrackRole } from '../types/midi';
import { DEFAULT_ANALYSIS_SETTINGS } from '../utils/constants';
import { parseMidiFile } from '../engine/midiParser';
import { exportMidiFile } from '../engine/midiExporter';
import { analyzeMidi } from '../engine/noteAnalyzer';
import { createDemoMidi, DemoCaseId } from '../utils/demoMidi';
import { downloadMidiFile } from '../utils/download';
import { audioSynth } from '../engine/audioSynth';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { getPitchRangeForPreset } from '../engine/keyswitchDetection';

interface AppContextValue extends AppState {
  loadMidiFile: (file: File) => Promise<void>;
  loadMidiBuffer: (buffer: ArrayBuffer, fileName: string) => void;
  loadDemo: (demoId: DemoCaseId) => void;
  exportMidi: () => void;
  modifyNotePitch: (noteId: string, newPitch: number) => void;
  modifyChordSegment: (segmentId: string, root: number, type: ChordType, bass?: number) => void;
  overrideChordCandidate: (segmentId: string, candidate: ChordCandidate) => void;
  updateTrackRole: (trackId: number, role: TrackRole) => void;
  updateTrackRange: (trackId: number, preset: RangePreset, min?: number, max?: number) => void;
  toggleTrackMute: (trackId: number) => void;
  toggleTrackSolo: (trackId: number) => void;
  toggleTrackVisibility: (trackId: number) => void;
  toggleTrackIgnore: (trackId: number) => void;
  updateAnalysisSettings: (settings: Partial<AnalysisSettings>) => void;
  reanalyze: () => void;
  undo: () => void;
  redo: () => void;
  resetAll: () => void;
  selectNote: (noteId: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setColorMode: (mode: ColorMode) => void;
  navigateWarning: (direction: 'prev' | 'next') => void;
  setZoomX: (zoom: number | ((prev: number) => number)) => void;
  setZoomY: (zoom: number | ((prev: number) => number)) => void;
  setScroll: (left: number, top: number) => void;
  togglePlay: () => void;
  setPlayheadTicks: (ticks: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setIsDraggingFile: (dragging: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [originalMidi, setOriginalMidi] = useState<MidiData | null>(null);
  const [workingMidi, setWorkingMidi] = useState<MidiData | null>(null);
  const [segments, setSegments] = useState<ChordSegment[]>([]);
  const [analyses, setAnalyses] = useState<Map<string, NoteAnalysis>>(new Map());
  const [statusCounts, setStatusCounts] = useState({
    SAFE: 0,
    INFO: 0,
    CHECK: 0,
    WARNING: 0,
    TOTAL: 0,
  });

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [colorMode, setColorMode] = useState<ColorMode>('risk');
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS);

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const [zoomX, setZoomXState] = useState<number>(0.15); // px per tick
  const [zoomY, setZoomYState] = useState<number>(14);   // px per key
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState<number>(500);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadTicks, setPlayheadTicks] = useState<number>(0);

  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const playheadRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const lastPlayTimeRef = useRef<number>(0);

  // Helper to clone notes and tracks for undo snapshots
  const takeSnapshot = (midi: MidiData, segs: ChordSegment[]): HistoryState => ({
    notes: midi.notes.map(n => ({ ...n })),
    tracks: midi.tracks.map(t => ({
      ...t,
      settings: { ...t.settings },
      notes: t.notes.map(n => ({ ...n })),
    })),
    segments: segs.map(s => ({
      ...s,
      candidates: s.candidates.map(c => ({ ...c })),
    })),
  });

  // Re-run analysis on working MIDI
  const runAnalysis = useCallback((
    midi: MidiData,
    settings: AnalysisSettings,
    existingSegs: ChordSegment[] = []
  ) => {
    const result = analyzeMidi(midi, settings, existingSegs);
    setSegments(result.segments);
    setAnalyses(result.analyses);
    setStatusCounts(result.statusCounts);
  }, []);

  // Load ArrayBuffer
  const loadMidiBuffer = useCallback((buffer: ArrayBuffer, fileName: string) => {
    try {
      const parsed = parseMidiFile(buffer, fileName);
      setOriginalMidi(JSON.parse(JSON.stringify(parsed)));
      setWorkingMidi(parsed);
      setPast([]);
      setFuture([]);
      setSelectedNoteId(null);
      setSelectedSegmentId(null);
      setPlayheadTicks(0);
      playheadRef.current = 0;
      setIsPlaying(false);
      isPlayingRef.current = false;
      audioSynth.stopAll();

      runAnalysis(parsed, analysisSettings);
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
      alert('Failed to parse MIDI file. Please make sure it is a valid Standard MIDI File (.mid).');
    }
  }, [analysisSettings, runAnalysis]);

  // Load File
  const loadMidiFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    loadMidiBuffer(buffer, file.name);
    setActiveDemoId(null);
  }, [loadMidiBuffer]);

  // Load Demo
  const loadDemo = useCallback((demoId: DemoCaseId) => {
    const parsed = createDemoMidi(demoId);
    setOriginalMidi(JSON.parse(JSON.stringify(parsed)));
    setWorkingMidi(parsed);
    setPast([]);
    setFuture([]);
    setSelectedNoteId(null);
    setSelectedSegmentId(null);
    setActiveDemoId(demoId);
    setPlayheadTicks(0);
    playheadRef.current = 0;
    setIsPlaying(false);
    isPlayingRef.current = false;
    audioSynth.stopAll();

    runAnalysis(parsed, analysisSettings);
  }, [analysisSettings, runAnalysis]);

  // Export MIDI
  const exportMidi = useCallback(() => {
    if (!workingMidi) return;
    const bytes = exportMidiFile(workingMidi, workingMidi.tracks);
    const filename = `${workingMidi.name || 'project'}_harmony-fixed.mid`;
    downloadMidiFile(bytes, filename);
  }, [workingMidi]);

  // Modify Note Pitch
  const modifyNotePitch = useCallback((noteId: string, newPitch: number) => {
    if (!workingMidi) return;
    const clampedPitch = Math.max(0, Math.min(127, Math.round(newPitch)));

    // Push past state
    setPast(prev => [...prev.slice(-40), takeSnapshot(workingMidi, segments)]);
    setFuture([]);

    const updatedNotes = workingMidi.notes.map(note => {
      if (note.id === noteId) {
        return {
          ...note,
          pitch: clampedPitch,
          pitchClass: getPitchClass(clampedPitch),
          octave: getOctave(clampedPitch),
          name: pitchToName(clampedPitch),
        };
      }
      return note;
    });

    const updatedTracks = workingMidi.tracks.map(track => ({
      ...track,
      notes: track.notes.map(note => {
        if (note.id === noteId) {
          return {
            ...note,
            pitch: clampedPitch,
            pitchClass: getPitchClass(clampedPitch),
            octave: getOctave(clampedPitch),
            name: pitchToName(clampedPitch),
          };
        }
        return note;
      }),
    }));

    const nextMidi: MidiData = {
      ...workingMidi,
      notes: updatedNotes,
      tracks: updatedTracks,
    };

    setWorkingMidi(nextMidi);
    runAnalysis(nextMidi, analysisSettings, segments);

    // Audition the new pitch
    audioSynth.playNote(clampedPitch, 0.4, 0.8);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  // Modify Chord Segment
  const modifyChordSegment = useCallback((
    segmentId: string,
    root: number,
    type: ChordType,
    bass?: number
  ) => {
    if (!workingMidi) return;

    setPast(prev => [...prev.slice(-40), takeSnapshot(workingMidi, segments)]);
    setFuture([]);

    const chosenBass = bass !== undefined ? bass : root;
    const updatedSegments = segments.map(seg => {
      if (seg.id === segmentId) {
        const rootName = pitchToName(root * 1 + 60).replace(/\d/, '');
        const bassName = pitchToName(chosenBass * 1 + 60).replace(/\d/, '');
        return {
          ...seg,
          root,
          rootName,
          type,
          bass: chosenBass,
          bassName,
          displayName: root === chosenBass ? `${rootName}${type === 'maj' ? '' : type}` : `${rootName}${type === 'maj' ? '' : type}/${bassName}`,
          manualOverride: true,
          confidence: 100,
        };
      }
      return seg;
    });

    setSegments(updatedSegments);
    runAnalysis(workingMidi, analysisSettings, updatedSegments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  // Override Chord from Candidate
  const overrideChordCandidate = useCallback((segmentId: string, candidate: ChordCandidate) => {
    if (!workingMidi) return;

    setPast(prev => [...prev.slice(-40), takeSnapshot(workingMidi, segments)]);
    setFuture([]);

    const updatedSegments = segments.map(seg => {
      if (seg.id === segmentId) {
        return {
          ...seg,
          root: candidate.root,
          rootName: candidate.rootName,
          type: candidate.type,
          typeName: candidate.typeName,
          bass: candidate.bass,
          bassName: candidate.bassName,
          displayName: candidate.displayName,
          confidence: candidate.confidence,
          manualOverride: true,
        };
      }
      return seg;
    });

    setSegments(updatedSegments);
    runAnalysis(workingMidi, analysisSettings, updatedSegments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  // Track Settings modifications
  const updateTrackRole = useCallback((trackId: number, role: TrackRole) => {
    if (!workingMidi) return;
    const updatedTracks = workingMidi.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          settings: {
            ...t.settings,
            role,
            ignore: role === 'ignore' || role === 'keyswitch' || role === 'percussion',
          },
        };
      }
      return t;
    });

    const nextMidi: MidiData = { ...workingMidi, tracks: updatedTracks };
    setWorkingMidi(nextMidi);
    runAnalysis(nextMidi, analysisSettings, segments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  const updateTrackRange = useCallback((
    trackId: number,
    preset: RangePreset,
    customMin?: number,
    customMax?: number
  ) => {
    if (!workingMidi) return;
    const bounds = getPitchRangeForPreset(preset);
    const min = customMin !== undefined ? customMin : bounds.min;
    const max = customMax !== undefined ? customMax : bounds.max;

    const updatedTracks = workingMidi.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          settings: {
            ...t.settings,
            rangePreset: preset,
            analysisMinPitch: min,
            analysisMaxPitch: max,
            hasKeyswitchWarning: false, // Dismiss alert on apply
          },
        };
      }
      return t;
    });

    const nextMidi: MidiData = { ...workingMidi, tracks: updatedTracks };
    setWorkingMidi(nextMidi);
    runAnalysis(nextMidi, analysisSettings, segments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  const toggleTrackMute = useCallback((trackId: number) => {
    if (!workingMidi) return;
    setWorkingMidi({
      ...workingMidi,
      tracks: workingMidi.tracks.map(t => t.id === trackId ? { ...t, settings: { ...t.settings, muted: !t.settings.muted } } : t),
    });
  }, [workingMidi]);

  const toggleTrackSolo = useCallback((trackId: number) => {
    if (!workingMidi) return;
    setWorkingMidi({
      ...workingMidi,
      tracks: workingMidi.tracks.map(t => t.id === trackId ? { ...t, settings: { ...t.settings, solo: !t.settings.solo } } : t),
    });
  }, [workingMidi]);

  const toggleTrackVisibility = useCallback((trackId: number) => {
    if (!workingMidi) return;
    setWorkingMidi({
      ...workingMidi,
      tracks: workingMidi.tracks.map(t => t.id === trackId ? { ...t, settings: { ...t.settings, visible: !t.settings.visible } } : t),
    });
  }, [workingMidi]);

  const toggleTrackIgnore = useCallback((trackId: number) => {
    if (!workingMidi) return;
    const updatedTracks = workingMidi.tracks.map(t => {
      if (t.id === trackId) {
        const nextIgnore = !t.settings.ignore;
        return {
          ...t,
          settings: {
            ...t.settings,
            ignore: nextIgnore,
            role: nextIgnore ? 'ignore' : (t.settings.detectedRole || 'auto'),
          },
        };
      }
      return t;
    });

    const nextMidi = { ...workingMidi, tracks: updatedTracks };
    setWorkingMidi(nextMidi);
    runAnalysis(nextMidi, analysisSettings, segments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  const updateAnalysisSettings = useCallback((newSettings: Partial<AnalysisSettings>) => {
    const next = { ...analysisSettings, ...newSettings };
    setAnalysisSettings(next);
    if (workingMidi) {
      runAnalysis(workingMidi, next, segments);
    }
  }, [analysisSettings, workingMidi, segments, runAnalysis]);

  const reanalyze = useCallback(() => {
    if (workingMidi) {
      runAnalysis(workingMidi, analysisSettings, segments);
    }
  }, [workingMidi, analysisSettings, segments, runAnalysis]);

  // Undo
  const undo = useCallback(() => {
    if (past.length === 0 || !workingMidi) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setFuture(prev => [takeSnapshot(workingMidi, segments), ...prev]);
    setPast(newPast);

    const nextMidi: MidiData = {
      ...workingMidi,
      notes: previous.notes,
      tracks: previous.tracks,
    };
    setWorkingMidi(nextMidi);
    setSegments(previous.segments);
    runAnalysis(nextMidi, analysisSettings, previous.segments);
  }, [past, workingMidi, segments, analysisSettings, runAnalysis]);

  // Redo
  const redo = useCallback(() => {
    if (future.length === 0 || !workingMidi) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setPast(prev => [...prev, takeSnapshot(workingMidi, segments)]);
    setFuture(newFuture);

    const nextMidi: MidiData = {
      ...workingMidi,
      notes: next.notes,
      tracks: next.tracks,
    };
    setWorkingMidi(nextMidi);
    setSegments(next.segments);
    runAnalysis(nextMidi, analysisSettings, next.segments);
  }, [future, workingMidi, segments, analysisSettings, runAnalysis]);

  // Reset All
  const resetAll = useCallback(() => {
    if (!originalMidi) return;
    const cloned = JSON.parse(JSON.stringify(originalMidi)) as MidiData;
    setPast(prev => [...prev, takeSnapshot(workingMidi!, segments)]);
    setFuture([]);
    setWorkingMidi(cloned);
    runAnalysis(cloned, analysisSettings);
  }, [originalMidi, workingMidi, segments, analysisSettings, runAnalysis]);

  // Select Note & Audition
  const selectNote = useCallback((noteId: string | null) => {
    setSelectedNoteId(noteId);
    if (noteId && workingMidi) {
      const note = workingMidi.notes.find(n => n.id === noteId);
      if (note) {
        audioSynth.playNote(note.pitch, 0.4, 0.8);
      }
    }
  }, [workingMidi]);

  const selectSegment = useCallback((segmentId: string | null) => {
    setSelectedSegmentId(segmentId);
  }, []);

  const setFilter = useCallback((filter: FilterType) => {
    setActiveFilter(filter);
  }, []);

  // Navigate Warnings sequentially
  const navigateWarning = useCallback((direction: 'prev' | 'next') => {
    if (!workingMidi || analyses.size === 0) return;

    // Get all warning/check notes in chronological tick order
    const flaggedNotes = workingMidi.notes.filter(n => {
      const a = analyses.get(n.id);
      if (!a) return false;
      if (activeFilter === 'WARNING_ONLY') return a.status === 'WARNING';
      if (activeFilter === 'CHECK') return a.status === 'CHECK';
      return a.status === 'WARNING' || a.status === 'CHECK';
    });

    if (flaggedNotes.length === 0) return;

    let targetIndex = 0;
    if (selectedNoteId) {
      const currentIndex = flaggedNotes.findIndex(n => n.id === selectedNoteId);
      if (currentIndex >= 0) {
        if (direction === 'next') {
          targetIndex = (currentIndex + 1) % flaggedNotes.length;
        } else {
          targetIndex = (currentIndex - 1 + flaggedNotes.length) % flaggedNotes.length;
        }
      }
    }

    const targetNote = flaggedNotes[targetIndex];
    if (targetNote) {
      selectNote(targetNote.id);
      // Auto-scroll timeline to bring note into view
      const noteX = targetNote.startTicks * zoomX;
      setScrollLeft(Math.max(0, noteX - 300));
    }
  }, [workingMidi, analyses, activeFilter, selectedNoteId, zoomX, selectNote]);

  // Zoom helpers
  const setZoomX = useCallback((zoom: number | ((prev: number) => number)) => {
    setZoomXState(prev => {
      const val = typeof zoom === 'function' ? zoom(prev) : zoom;
      return Math.max(0.02, Math.min(1.0, val));
    });
  }, []);

  const setZoomY = useCallback((zoom: number | ((prev: number) => number)) => {
    setZoomYState(prev => {
      const val = typeof zoom === 'function' ? zoom(prev) : zoom;
      return Math.max(8, Math.min(32, val));
    });
  }, []);

  const setScroll = useCallback((left: number, top: number) => {
    setScrollLeft(Math.max(0, left));
    setScrollTop(Math.max(0, top));
  }, []);

  // Playback engine
  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      audioSynth.stopAll();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      if (!workingMidi || workingMidi.durationTicks === 0) return;
      setIsPlaying(true);
      isPlayingRef.current = true;
      lastPlayTimeRef.current = performance.now();

      const bpm = (workingMidi.tempos && workingMidi.tempos[0]?.bpm) || 120;
      const ticksPerSec = (bpm / 60) * workingMidi.ppq;

      const step = (now: number) => {
        if (!isPlayingRef.current) return;
        const deltaSec = (now - lastPlayTimeRef.current) / 1000;
        lastPlayTimeRef.current = now;

        const currentTicks = playheadRef.current + deltaSec * ticksPerSec;
        if (currentTicks >= workingMidi.durationTicks) {
          playheadRef.current = 0;
          setPlayheadTicks(0);
          setIsPlaying(false);
          isPlayingRef.current = false;
          audioSynth.stopAll();
          return;
        }

        // Audition notes starting in this slice
        workingMidi.notes.forEach(note => {
          const track = workingMidi.tracks.find(t => t.id === note.trackId);
          if (track && (track.settings.muted || track.settings.ignore)) return;

          if (note.startTicks >= playheadRef.current && note.startTicks < currentTicks) {
            audioSynth.playNote(note.pitch, note.durationTicks / ticksPerSec, note.velocity);
          }
        });

        playheadRef.current = currentTicks;
        setPlayheadTicks(currentTicks);

        animFrameRef.current = requestAnimationFrame(step);
      };

      animFrameRef.current = requestAnimationFrame(step);
    }
  }, [workingMidi]);

  const setPlayhead = useCallback((ticks: number) => {
    playheadRef.current = ticks;
    setPlayheadTicks(ticks);
  }, []);

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, [, ], Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === '[' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        navigateWarning('prev');
      } else if (e.key === ']' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        navigateWarning('next');
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, navigateWarning, togglePlay]);

  // Initial load with default Test 7 demo so user immediately sees rich data on launch!
  useEffect(() => {
    loadDemo('test7');
  }, []);

  return (
    <AppContext.Provider
      value={{
        originalMidi,
        workingMidi,
        segments,
        analyses,
        statusCounts,
        selectedNoteId,
        selectedSegmentId,
        activeFilter,
        colorMode,
        analysisSettings,
        past,
        future,
        zoomX,
        zoomY,
        scrollLeft,
        scrollTop,
        isPlaying,
        playheadTicks,
        isSettingsOpen,
        activeDemoId,
        isDraggingFile,
        loadMidiFile,
        loadMidiBuffer,
        loadDemo,
        exportMidi,
        modifyNotePitch,
        modifyChordSegment,
        overrideChordCandidate,
        updateTrackRole,
        updateTrackRange,
        toggleTrackMute,
        toggleTrackSolo,
        toggleTrackVisibility,
        toggleTrackIgnore,
        updateAnalysisSettings,
        reanalyze,
        undo,
        redo,
        resetAll,
        selectNote,
        selectSegment,
        setFilter,
        setColorMode,
        navigateWarning,
        setZoomX,
        setZoomY,
        setScroll,
        togglePlay,
        setPlayheadTicks: setPlayhead,
        setSettingsOpen,
        setIsDraggingFile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
