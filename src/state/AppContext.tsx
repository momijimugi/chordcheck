import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, ColorMode, FilterType, HistoryState } from '../types/state';
import { AnalysisSettings, ChordCandidate, ChordSegment, ChordType, KeyContext, NoteAnalysis } from '../types/analysis';
import { ChordAnalysisRole, InstrumentFamily, MidiData, NoteData, RangePreset, TrackData, TrackRole } from '../types/midi';
import { DEFAULT_ANALYSIS_SETTINGS, PITCH_NAMES } from '../utils/constants';
import { parseMidiFile } from '../engine/midiParser';
import { exportMidiFile, getExportDiagnosticInfo, ExportDiagnosticInfo } from '../engine/midiExporter';
import { createDemoMidi, DemoCaseId } from '../utils/demoMidi';
import { downloadMidiFile } from '../utils/download';
import { audioSynth } from '../engine/audioSynth';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { getPitchRangeForPreset } from '../engine/keyswitchDetection';
import { detectKeyFromNotes, getNotesForKeyDetection } from '../music/keyDetection';
import { getTempoAtTicks } from '../music/meter';
import { harmonyWorkerBridge } from '../workers/harmonyWorkerBridge';
import { matchesNoteFilter } from '../utils/noteFilter';

interface AppContextValue extends AppState {
  loadMidiFile: (file: File) => Promise<void>;
  loadMidiBuffer: (buffer: ArrayBuffer, fileName: string) => void;
  loadDemo: (demoId: DemoCaseId) => void;
  exportMidi: () => void;
  performExport: () => void;
  isExportSafetyModalOpen: boolean;
  setIsExportSafetyModalOpen: (open: boolean) => void;
  exportSafetyDiag: ExportDiagnosticInfo | null;
  modifyNotePitch: (noteId: string, newPitch: number) => void;
  modifyChordSegment: (segmentId: string, root: number, type: ChordType, bass?: number) => void;
  overrideChordCandidate: (segmentId: string, candidate: ChordCandidate) => void;
  updateTrackRole: (trackId: number, role: TrackRole) => void;
  updateTrackChordRole: (trackId: number, chordRole: ChordAnalysisRole) => void;
  updateTrackInstrument: (trackId: number, family: InstrumentFamily) => void;
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
  // Drum Confirmation Modal
  isDrumConfirmModalOpen: boolean;
  pendingDrumTracks: TrackData[];
  confirmDrumTracks: (selectedTrackIds: number[]) => void;
  dismissDrumConfirm: () => void;
  // Note Review Workflow (Phase I ~ O / β0.4.1)
  reviewedNoteIds: Set<string>;
  toggleNoteReviewed: (noteId: string) => void;
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

  // Note Review State (Phase I & J / β0.4.1)
  const [reviewedNoteIds, setReviewedNoteIds] = useState<Set<string>>(new Set());

  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const [zoomX, setZoomXState] = useState<number>(0.15);
  const [zoomY, setZoomYState] = useState<number>(14);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [scrollTop, setScrollTop] = useState<number>(500);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadTicks, setPlayheadTicksState] = useState<number>(0);

  // Drum Confirmation state
  const [isDrumConfirmModalOpen, setIsDrumConfirmModalOpen] = useState<boolean>(false);
  const [pendingDrumTracks, setPendingDrumTracks] = useState<TrackData[]>([]);

  // Analysis progress & Worker state
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

  // O(1) Playback Scheduler Refs (Phase Q & R / β0.4.1)
  const sortedNotesRef = useRef<NoteData[]>([]);
  const nextNoteIndexRef = useRef<number>(0);
  const trackMapRef = useRef<Map<number, TrackData>>(new Map());

  // Key detection respecting manual override
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

  // Toggle Note Reviewed state
  const toggleNoteReviewed = useCallback((noteId: string) => {
    setReviewedNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  // Web Worker-backed analysis executor
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

  const checkAndPromptDrums = useCallback((midi: MidiData) => {
    const highConfDrums = midi.tracks.filter(
      t => (t.settings.classification?.drumConfidence ?? 0) >= 80 &&
           t.settings.role !== 'percussion' &&
           t.settings.roleSource !== 'manual'
    );
    if (highConfDrums.length > 0) {
      setPendingDrumTracks(highConfDrums);
      setIsDrumConfirmModalOpen(true);
    }
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
      setReviewedNoteIds(new Set());
      setPlayheadTicksState(0);
      playheadRef.current = 0;
      setIsPlaying(false);
      isPlayingRef.current = false;
      audioSynth.stopAll();

      runAnalysis(parsed, analysisSettings);
      checkAndPromptDrums(parsed);
    } catch (err) {
      console.error('Failed to parse MIDI file:', err);
      alert('MIDIファイルの解析に失敗しました。標準MIDIファイル (.mid) であることをご確認ください。');
      setIsAnalyzing(false);
    }
  }, [analysisSettings, runAnalysis, checkAndPromptDrums]);

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
      setReviewedNoteIds(new Set());
      setActiveDemoId(demoId);
      setPlayheadTicksState(0);
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

  // Drum Confirmation Handlers (Phase P Fix: only candidate tracks are updated)
  const confirmDrumTracks = useCallback((selectedTrackIds: number[]) => {
    if (!workingMidi) return;
    const selectedSet = new Set(selectedTrackIds);
    const candidateSet = new Set(pendingDrumTracks.map(t => t.id));

    const updatedTracks = workingMidi.tracks.map(t => {
      if (!candidateSet.has(t.id)) {
        return t; // Unrelated tracks are left untouched!
      }
      if (selectedSet.has(t.id)) {
        return {
          ...t,
          settings: {
            ...t.settings,
            role: 'percussion' as TrackRole,
            ignore: true,
            roleSource: 'manual' as const,
            instrumentFamily: 'drums' as InstrumentFamily,
          },
        };
      } else {
        return {
          ...t,
          settings: {
            ...t.settings,
            role: 'auto' as TrackRole,
            ignore: false,
            roleSource: 'manual' as const,
          },
        };
      }
    });

    const nextMidi = { ...workingMidi, tracks: updatedTracks };
    setWorkingMidi(nextMidi);
    setIsDrumConfirmModalOpen(false);
    setPendingDrumTracks([]);
    runAnalysis(nextMidi, analysisSettings, segments);
  }, [workingMidi, pendingDrumTracks, analysisSettings, segments, runAnalysis]);

  const dismissDrumConfirm = useCallback(() => {
    if (!workingMidi) return;
    const candidateSet = new Set(pendingDrumTracks.map(t => t.id));
    const updatedTracks = workingMidi.tracks.map(t => {
      if (!candidateSet.has(t.id)) {
        return t; // Unrelated tracks are left untouched!
      }
      return {
        ...t,
        settings: {
          ...t.settings,
          role: 'auto' as TrackRole,
          ignore: false,
          roleSource: 'manual' as const,
        },
      };
    });
    setWorkingMidi({ ...workingMidi, tracks: updatedTracks });
    setIsDrumConfirmModalOpen(false);
    setPendingDrumTracks([]);
  }, [workingMidi, pendingDrumTracks]);

  // Export Safety Modal state
  const [isExportSafetyModalOpen, setIsExportSafetyModalOpen] = useState<boolean>(false);
  const [exportSafetyDiag, setExportSafetyDiag] = useState<ExportDiagnosticInfo | null>(null);

  const performExport = useCallback(() => {
    if (!workingMidi) return;
    const bytes = exportMidiFile(workingMidi, workingMidi.tracks);
    const filename = `${workingMidi.name || 'project'}_harmony-fixed.mid`;
    downloadMidiFile(bytes, filename);
  }, [workingMidi]);

  const exportMidi = useCallback(() => {
    if (!workingMidi) return;
    const diag = getExportDiagnosticInfo(workingMidi, workingMidi.tracks);
    if (diag.mode === 'Tone.js Fallback' || diag.mode === 'Standard Generation') {
      setExportSafetyDiag(diag);
      setIsExportSafetyModalOpen(true);
    } else {
      performExport();
    }
  }, [workingMidi, performExport]);

  // Modify Note Pitch (clears review state for this note)
  const modifyNotePitch = useCallback((noteId: string, newPitch: number) => {
    if (!workingMidi) return;
    const clampedPitch = Math.max(0, Math.min(127, Math.round(newPitch)));

    setPast(prev => [...prev.slice(-40), takeSnapshot(workingMidi, segments)]);
    setFuture([]);

    // Clear reviewed state on pitch change (Phase N / Section 42)
    setReviewedNoteIds(prev => {
      if (prev.has(noteId)) {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      }
      return prev;
    });

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
            roleSource: 'manual' as const,
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

  const updateTrackChordRole = useCallback((trackId: number, chordRole: ChordAnalysisRole) => {
    if (!workingMidi) return;
    const updatedTracks = workingMidi.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          settings: {
            ...t.settings,
            chordAnalysisRole: chordRole,
            chordAnalysisRoleSource: (chordRole === 'auto' ? 'automatic' : 'manual') as 'automatic' | 'manual',
          },
        };
      }
      return t;
    });

    const nextMidi: MidiData = { ...workingMidi, tracks: updatedTracks };
    setWorkingMidi(nextMidi);
    runAnalysis(nextMidi, analysisSettings, segments);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  const updateTrackInstrument = useCallback((trackId: number, family: InstrumentFamily) => {
    if (!workingMidi) return;
    const updatedTracks = workingMidi.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          settings: {
            ...t.settings,
            instrumentFamily: family,
            manualInstrumentFamily: family,
          },
        };
      }
      return t;
    });

    setWorkingMidi({ ...workingMidi, tracks: updatedTracks });
  }, [workingMidi]);

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
            roleSource: 'manual' as const,
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
    setReviewedNoteIds(new Set());
    setWorkingMidi(freshMidi);
    runAnalysis(freshMidi, analysisSettings);
  }, [workingMidi, segments, analysisSettings, runAnalysis]);

  const selectNote = useCallback((noteId: string | null) => {
    setSelectedNoteId(noteId);
    if (noteId && workingMidi) {
      const note = workingMidi.notes.find(n => n.id === noteId);
      if (note) {
        const track = workingMidi.tracks.find(t => t.id === note.trackId);
        audioSynth.playNote(note.pitch, 0.4, 0.8, track?.settings.instrumentFamily || 'piano');
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

  // Warning Navigator (Excludes Reviewed Notes, Phase L / Phase G)
  const navigateWarning = useCallback((direction: 'prev' | 'next') => {
    if (!workingMidi || analyses.size === 0) return;

    const flaggedNotes = workingMidi.notes.filter(n => {
      if (reviewedNoteIds.has(n.id)) return false; // Exclude reviewed!
      const a = analyses.get(n.id);
      if (!a) return false;
      return matchesNoteFilter(a.status, activeFilter);
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
  }, [workingMidi, analyses, reviewedNoteIds, activeFilter, selectedNoteId, zoomX, zoomY, selectNote, setScroll]);

  // Binary search helper for next note index
  const findNextNoteIndex = useCallback((targetTicks: number, notesArr: NoteData[]): number => {
    let low = 0;
    let high = notesArr.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (notesArr[mid].startTicks < targetTicks) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }, []);

  // O(1) Playback Scheduler & Solo Playback Fix (Phase Q & R)
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

      // Pre-sort notes and build pre-computed track map
      const sorted = [...workingMidi.notes].sort((a, b) => a.startTicks - b.startTicks);
      sortedNotesRef.current = sorted;
      const tMap = new Map<number, TrackData>();
      workingMidi.tracks.forEach(t => tMap.set(t.id, t));
      trackMapRef.current = tMap;

      // If playhead was at the end, restart from 0
      if (playheadRef.current >= workingMidi.durationTicks - 10) {
        playheadRef.current = 0;
        setPlayheadTicksState(0);
      }

      nextNoteIndexRef.current = findNextNoteIndex(playheadRef.current, sorted);

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
          setPlayheadTicksState(0);
          setIsPlaying(false);
          isPlayingRef.current = false;
          audioSynth.stopAll();
          return;
        }

        // Check if any track has solo === true (Phase R / Section 57-58)
        const hasSolo = workingMidi.tracks.some(t => t.settings.solo);
        const curSorted = sortedNotesRef.current;
        const curMap = trackMapRef.current;

        // O(1) sequential playback of arrived notes
        while (nextNoteIndexRef.current < curSorted.length) {
          const note = curSorted[nextNoteIndexRef.current];
          if (note.startTicks >= currentTicks) {
            break;
          }
          nextNoteIndexRef.current++;

          if (note.startTicks >= currentPosTicks) {
            const track = curMap.get(note.trackId);
            if (!track || track.settings.ignore || track.settings.muted) continue;
            if (hasSolo && !track.settings.solo) continue; // Solo filter!

            const family = track.settings.instrumentFamily || 'piano';
            audioSynth.playNote(note.pitch, note.durationTicks / ticksPerSec, note.velocity, family);
          }
        }

        playheadRef.current = currentTicks;
        setPlayheadTicksState(currentTicks);

        animFrameRef.current = requestAnimationFrame(step);
      };

      animFrameRef.current = requestAnimationFrame(step);
    }
  }, [workingMidi, findNextNoteIndex]);

  const setPlayhead = useCallback((ticks: number) => {
    playheadRef.current = ticks;
    setPlayheadTicksState(ticks);
    if (sortedNotesRef.current.length > 0) {
      nextNoteIndexRef.current = findNextNoteIndex(ticks, sortedNotesRef.current);
    }
  }, [findNextNoteIndex]);

  // Global Keyboard Shortcuts (Space play/pause, Ctrl+Z, Ctrl+Y, [, ])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName) || target?.isContentEditable) {
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
        performExport,
        isExportSafetyModalOpen,
        setIsExportSafetyModalOpen,
        exportSafetyDiag,
        modifyNotePitch,
        modifyChordSegment,
        overrideChordCandidate,
        updateTrackRole,
        updateTrackChordRole,
        updateTrackInstrument,
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
        isDrumConfirmModalOpen,
        pendingDrumTracks,
        confirmDrumTracks,
        dismissDrumConfirm,
        reviewedNoteIds,
        toggleNoteReviewed,
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
