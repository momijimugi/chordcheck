import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, ColorMode, FilterType, HistoryState } from '../types/state';
import { AnalysisSettings, ChordCandidate, ChordSegment, ChordType, KeyContext, NoteAnalysis } from '../types/analysis';
import { MidiData, NoteData, RangePreset, TrackData, TrackRole } from '../types/midi';
import { DEFAULT_ANALYSIS_SETTINGS, PITCH_NAMES } from '../utils/constants';
import { parseMidiFile } from '../engine/midiParser';
import { exportMidiFile } from '../engine/midiExporter';
import { createDemoMidi, DemoCaseId } from '../utils/demoMidi';
import { downloadMidiFile } from '../utils/download';
import { audioSynth } from '../engine/audioSynth';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { getPitchRangeForPreset } from '../engine/keyswitchDetection';
import { detectKeyFromNotes, getNotesForKeyDetection } from '../music/keyDetection';
import { getTempoAtTicks } from '../music/meter';
import { harmonyWorkerBridge } from '../workers/harmonyWorkerBridge';

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
  setKeyOverride: (keyOverride: { root: number; mode: 'major' | 'minor' } | 'auto') => void;
  reanalyze: () => void;
  undo: () => void;
  redo: () => void;
  resetAll: () => void;
  selectNote: (noteId: string | null) => void;
  selectSegment: (segmentId: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setColorMode: (mode: ColorMode) => void;
  setShowLowConfidenceOnly: (show: boolean) => void;
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
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState<boolean>(false);
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS);

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const [zoomX, setZoomXState] = useState<number>(0.15);
  const [zoomY, setZoomYState] = useState<number>(14);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState<number>(500);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadTicks, setPlayheadTicks] = useState<number>(0);

  // Analysis progress & Worker state (Phase A)
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisStage, setAnalysisStage] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const playheadRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const lastPlayTimeRef = useRef<number>(0);

  // Key detection respecting manual override (Phase D, E, F)
  const keyContext = useMemo<KeyContext | undefined>(() => {
    if (!workingMidi || workingMidi.notes.length === 0) return undefined;

    if (analysisSettings.keyOverride && analysisSettings.keyOverride !== 'auto') {
      const rootStr = PITCH_NAMES[analysisSettings.keyOverride.root];
      const modeStr = analysisSettings.keyOverride.mode === 'major' ? 'Major' : 'Minor';
      return {
        root: analysisSettings.keyOverride.root,
        mode: analysisSettings.keyOverride.mode,
        name: `${rootStr} ${modeStr}`,
        confidence: 100,
        manualOverride: true,
      };
    }

    const keyNotes = getNotesForKeyDetection(workingMidi);
    return detectKeyFromNotes(keyNotes, workingMidi.ppq);
  }, [workingMidi, analysisSettings.keyOverride]);

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

  // Web Worker-backed analysis executor (Phase A)
  const runAnalysis = useCallback((
    midi: MidiData,
    settings: AnalysisSettings,
    existingSegs: ChordSegment[] = []
  ) => {
    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setAnalysisStage('和声解析を開始中...');
    setAnalysisError(null);

    harmonyWorkerBridge.analyze(
      midi,
      settings,
      existingSegs,
      {
        onProgress: (progress, stage) => {
          setAnalysisProgress(progress);
          setAnalysisStage(stage);
        },
        onSuccess: (result) => {
          setSegments(result.segments);
          setAnalyses(result.analyses);
          setStatusCounts(result.statusCounts);
          setIsAnalyzing(false);
          setAnalysisProgress(100);
          setAnalysisStage('解析完了');
        },
        onError: (err) => {
          console.error('[AppContext] Analysis error:', err);
          setAnalysisError(err);
          setIsAnalyzing(false);
        },
      }
    );
  }, []);

  const loadMidiBuffer = useCallback((buffer: ArrayBuffer, fileName: string) => {
    try {
      setIsAnalyzing(true);
      setAnalysisProgress(5);
      setAnalysisStage('MIDIファイル読み込み中...');
      setAnalysisError(null);

      const parsed = parseMidiFile(buffer, fileName);
      setOriginalMidi(parsed);
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
      alert('MIDIファイルの解析に失敗しました。標準MIDIファイル (.mid) であることをご確認ください。');
      setIsAnalyzing(false);
    }
  }, [analysisSettings, runAnalysis]);

  const loadMidiFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    loadMidiBuffer(buffer, file.name);
    setActiveDemoId(null);
  }, [loadMidiBuffer]);

  const loadDemo = useCallback((demoId: DemoCaseId) => {
    try {
      setIsAnalyzing(true);
      setAnalysisProgress(5);
      setAnalysisStage('デモMIDIを生成中...');
      const parsed = createDemoMidi(demoId);
      setOriginalMidi(parsed);
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
    } catch (err: any) {
      console.error('Failed to load demo:', err);
      setIsAnalyzing(false);
    }
  }, [analysisSettings, runAnalysis]);

  const exportMidi = useCallback(() => {
    if (!workingMidi) return;
    const bytes = exportMidiFile(workingMidi, workingMidi.tracks);
    const filename = `${workingMidi.name || 'project'}_harmony-fixed.mid`;
    downloadMidiFile(bytes, filename);
  }, [workingMidi]);

  const modifyNotePitch = useCallback((noteId: string, newPitch: number) => {
    if (!workingMidi) return;
    const clampedPitch = Math.max(0, Math.min(127, Math.round(newPitch)));

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
    audioSynth.playNote(clampedPitch, 0.4, 0.8);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

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
          sourceType: 'MANUAL' as const,
          confidence: 100,
        };
      }
      return seg;
    });

    setSegments(updatedSegments);
    runAnalysis(workingMidi, analysisSettings, updatedSegments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

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
          sourceType: 'MANUAL' as const,
        };
      }
      return seg;
    });

    setSegments(updatedSegments);
    runAnalysis(workingMidi, analysisSettings, updatedSegments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

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
            hasKeyswitchWarning: false,
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

  const setKeyOverride = useCallback((keyOverride: { root: number; mode: 'major' | 'minor' } | 'auto') => {
    updateAnalysisSettings({ keyOverride });
  }, [updateAnalysisSettings]);

  const reanalyze = useCallback(() => {
    if (workingMidi) {
      runAnalysis(workingMidi, analysisSettings, segments);
    }
  }, [workingMidi, analysisSettings, segments, runAnalysis]);

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

  const resetAll = useCallback(() => {
    if (!workingMidi || !workingMidi.originalBytes) return;
    const freshMidi = parseMidiFile(workingMidi.originalBytes.buffer, `${workingMidi.name}.mid`);
    setPast(prev => [...prev, takeSnapshot(workingMidi, segments)]);
    setFuture([]);
    setWorkingMidi(freshMidi);
    runAnalysis(freshMidi, analysisSettings);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

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

  const navigateWarning = useCallback((direction: 'prev' | 'next') => {
    if (!workingMidi || analyses.size === 0) return;

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
      const noteX = targetNote.startTicks * zoomX;
      const noteY = (108 - targetNote.pitch) * zoomY;
      setScroll(Math.max(0, noteX - 350), Math.max(0, noteY - 180));
    }
  }, [workingMidi, analyses, activeFilter, selectedNoteId, zoomX, zoomY, selectNote, setScroll]);

  // Tempo Map Adaptive Playback (Phase L / Section 44)
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

      const step = (now: number) => {
        if (!isPlayingRef.current) return;
        const deltaSec = (now - lastPlayTimeRef.current) / 1000;
        lastPlayTimeRef.current = now;

        const currentPosTicks = playheadRef.current;
        const currentBpm = getTempoAtTicks(currentPosTicks, workingMidi.tempos);
        const ticksPerSec = (currentBpm / 60) * workingMidi.ppq;
        const currentTicks = currentPosTicks + deltaSec * ticksPerSec;

        if (currentTicks >= workingMidi.durationTicks) {
          playheadRef.current = 0;
          setPlayheadTicks(0);
          setIsPlaying(false);
          isPlayingRef.current = false;
          audioSynth.stopAll();
          return;
        }

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  return (
    <AppContext.Provider
      value={{
        originalMidi,
        workingMidi,
        segments,
        analyses,
        statusCounts,
        keyContext,
        selectedNoteId,
        selectedSegmentId,
        activeFilter,
        colorMode,
        showLowConfidenceOnly,
        analysisSettings,
        past,
        future,
        zoomX,
        zoomY,
        scrollLeft,
        scrollTop,
        isPlaying,
        playheadTicks,
        isAnalyzing,
        analysisProgress,
        analysisStage,
        analysisError,
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
        setKeyOverride,
        reanalyze,
        undo,
        redo,
        resetAll,
        selectNote,
        selectSegment,
        setFilter,
        setColorMode,
        setShowLowConfidenceOnly,
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
