export type TrackRole = 
  | 'auto' 
  | 'melody' 
  | 'harmony' 
  | 'bass' 
  | 'percussion' 
  | 'keyswitch' 
  | 'ignore';

export type RangePreset = 
  | 'all' 
  | 'ignore_below_c0' 
  | 'ignore_below_c1' 
  | 'ignore_below_c2' 
  | 'custom';

export interface TrackSettings {
  trackId: number;
  name: string;
  channel: number;
  role: TrackRole;
  detectedRole?: TrackRole;
  rangePreset: RangePreset;
  analysisMinPitch: number; // 0 to 127 (e.g. C1 is 24, C2 is 36)
  analysisMaxPitch: number; // 0 to 127
  ignore: boolean;
  color: string;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  hasKeyswitchWarning?: boolean;
  keyswitchPitchCount?: number;
}

export interface NoteData {
  id: string; // unique note id: `${trackId}_${index}_${startTicks}`
  trackId: number;
  pitch: number; // 0-127
  pitchClass: number; // 0-11 (C=0, C#=1 ... B=11)
  octave: number;
  name: string; // e.g. "C4", "F#5"
  startTicks: number;
  durationTicks: number;
  endTicks: number;
  startSeconds: number;
  durationSeconds: number;
  endSeconds: number;
  velocity: number; // 0-1 (or 0-127 normalized to 0-1)
  channel: number;
  originalPitch: number; // for reset tracking
}

export interface TimeSignatureInfo {
  ticks: number;
  time: number;
  numerator: number;
  denominator: number;
}

export interface TempoInfo {
  ticks: number;
  time: number;
  bpm: number;
}

export interface TrackData {
  id: number;
  name: string;
  channel: number;
  instrument?: string;
  notes: NoteData[];
  settings: TrackSettings;
}

export interface MidiData {
  name: string;
  ppq: number; // Pulses (ticks) per quarter note
  durationTicks: number;
  durationSeconds: number;
  tempos: TempoInfo[];
  timeSignatures: TimeSignatureInfo[];
  tracks: TrackData[];
  notes: NoteData[]; // flattened list of all notes
}
