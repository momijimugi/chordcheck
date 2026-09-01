import { AnalysisResolution, AnalysisSettings, ChordSegment, KeyContext, NoteAnalysis, RiskLevel } from './analysis';
import { MidiData, NoteData, RangePreset, TrackData, TrackRole } from './midi';

export type FilterType = 'ALL' | 'WARNING_ONLY' | 'CHECK' | 'INFO' | 'SAFE';

export type ColorMode = 'risk' | 'track';

export interface HistoryState {
  notes: NoteData[];
  tracks: TrackData[];
  segments: ChordSegment[];
}

export interface AppState {
  originalMidi: MidiData | null;
  workingMidi: MidiData | null;
  segments: ChordSegment[];
  analyses: Map<string, NoteAnalysis>;
  statusCounts: {
    SAFE: number;
    INFO: number;
    CHECK: number;
    WARNING: number;
    TOTAL: number;
  };
  keyContext?: KeyContext;
  selectedNoteId: string | null;
  selectedSegmentId: string | null;
  activeFilter: FilterType;
  colorMode: ColorMode;
  analysisSettings: AnalysisSettings;
  showLowConfidenceOnly: boolean;
  // History for Undo / Redo
  past: HistoryState[];
  future: HistoryState[];
  // Viewport / Zoom
  zoomX: number;
  zoomY: number;
  scrollLeft: number;
  scrollTop: number;
  // Playback
  isPlaying: boolean;
  playheadTicks: number;
  // Loading and analysis state
  isAnalyzing: boolean;
  analysisProgress: number; // 0 to 100
  analysisStage: string;
  analysisError: string | null;
  // UI states
  isSettingsOpen: boolean;
  activeDemoId: string | null;
  isDraggingFile: boolean;
}
