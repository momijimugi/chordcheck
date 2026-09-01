import { Midi } from '@tonejs/midi';

export type TrackRole = 
  | 'auto' 
  | 'melody' 
  | 'harmony' 
  | 'bass' 
  | 'chord_guide'
  | 'percussion' 
  | 'keyswitch' 
  | 'ignore';

export type ChordAnalysisRole =
  | 'primary_harmony'
  | 'supporting_harmony'
  | 'bass_anchor'
  | 'melody'
  | 'exclude'
  | 'auto';

export type RangePreset = 
  | 'all' 
  | 'ignore_below_c0' 
  | 'ignore_below_c1' 
  | 'ignore_below_c2' 
  | 'custom';

export type InstrumentFamily =
  | 'piano'
  | 'keyboard'
  | 'guitar'
  | 'bass'
  | 'strings'
  | 'brass'
  | 'woodwind'
  | 'synth'
  | 'drums'
  | 'percussion'
  | 'vocal'
  | 'orchestra'
  | 'unknown';

export interface TrackClassification {
  suggestedRole: TrackRole;
  suggestedChordRole?: ChordAnalysisRole;
  chordRoleConfidence?: number;
  instrumentFamily: InstrumentFamily;
  instrumentName?: string;
  confidence: number;
  drumConfidence?: number;
  reasons: string[];
}

export interface TrackSettings {
  trackId: number;
  sourceTrackIndex: number;
  name: string;
  channel: number;
  role: TrackRole;
  detectedRole?: TrackRole;
  roleSource?: 'automatic' | 'manual';
  chordAnalysisRole?: ChordAnalysisRole;
  detectedChordAnalysisRole?: ChordAnalysisRole;
  chordAnalysisRoleSource?: 'automatic' | 'manual';
  chordRoleConfidence?: number;
  instrumentFamily?: InstrumentFamily;
  manualInstrumentFamily?: InstrumentFamily;
  classification?: TrackClassification;
  rangePreset: RangePreset;
  analysisMinPitch: number; // 0 to 127
  analysisMaxPitch: number; // 0 to 127
  ignore: boolean;
  color: string;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  hasKeyswitchWarning?: boolean;
  keyswitchPitchCount?: number;
  melodicConfidence?: number; // 0.0 to 1.0 (higher = monophonic melodic line)
}

export interface NoteData {
  id: string; // unique note id: `${trackId}_${index}_${startTicks}`
  trackId: number;
  sourceTrackIndex: number;
  sourceNoteIndex: number;
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
  velocity: number; // 0-1
  channel: number;
  originalPitch: number; // for reset tracking
  noteOnPitchByteOffset?: number; // Exact byte index in raw SMF
  noteOffPitchByteOffset?: number; // Exact byte index in raw SMF
  rawPatchStatus?: 'matched' | 'ambiguous' | 'unmatched'; // β0.3.2 SMF offset matching status
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
  sourceTrackIndex: number;
  name: string;
  channel: number;
  instrument?: string;
  notes: NoteData[];
  settings: TrackSettings;
  melodicConfidence: number; // 0.0 to 1.0
}

export interface MidiData {
  name: string;
  ppq: number;
  durationTicks: number;
  durationSeconds: number;
  totalBars: number;
  tempos: TempoInfo[];
  timeSignatures: TimeSignatureInfo[];
  tracks: TrackData[];
  notes: NoteData[];
  rawMidi?: Midi; // Parsed Standard MIDI object
  originalBytes?: Uint8Array; // Immutable raw SMF byte array for byte-identical patching
}
