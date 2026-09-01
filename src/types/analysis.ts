import { TrackRole } from './midi';

export type RiskLevel = 'SAFE' | 'INFO' | 'CHECK' | 'WARNING';

export type ChordType = 
  | 'maj' 
  | 'min' 
  | 'dim' 
  | 'aug' 
  | 'sus2' 
  | 'sus4' 
  | 'maj7' 
  | 'min7' 
  | 'dom7' 
  | 'mMaj7' 
  | 'm7b5' 
  | 'dim7' 
  | '6' 
  | 'min6' 
  | 'add9' 
  | 'maj9' 
  | 'min9' 
  | 'dom9';

export interface ChordCandidate {
  root: number; // 0-11
  rootName: string; // "C", "C#", etc.
  type: ChordType;
  typeName: string; // "Major 7", "Minor", etc.
  bass: number; // 0-11
  bassName: string;
  displayName: string; // "Cmaj7", "Am7/G", etc.
  score: number;
  confidence: number; // 0-100%
}

export interface ChordSegment {
  id: string; // e.g. "seg_0", "seg_480"
  startTicks: number;
  endTicks: number;
  startSeconds: number;
  endSeconds: number;
  barIndex: number; // 1-indexed (Bar 1, Bar 2...)
  beatIndex: number; // 1-indexed (Beat 1, Beat 2...)
  root: number; // 0-11
  rootName: string;
  type: ChordType;
  typeName: string;
  bass: number; // 0-11
  bassName: string;
  displayName: string;
  confidence: number; // 0-100%
  candidates: ChordCandidate[];
  manualOverride: boolean;
}

export interface NoteRelation {
  intervalFromRoot: number; // 0-11
  intervalName: string; // "Root", "3rd", "5th", "7th", "9th", "#11", etc.
  degreeName: string; // "1", "b3", "3", "5", "b7", "9", etc.
  isChordTone: boolean;
  isTension: boolean;
  isAlteredTension: boolean;
  isNonChordTone: boolean;
  intervalFromBass: number;
}

export type NonChordToneType = 
  | 'none' 
  | 'passing' 
  | 'chromatic_passing' 
  | 'neighbor' 
  | 'anticipation' 
  | 'suspension';

export interface VoiceCollision {
  otherNoteId: string;
  otherPitch: number;
  otherPitchName: string;
  otherTrackName: string;
  intervalSemitones: number; // 1 (m2), 2 (M2), 13 (m9)
  intervalName: string; // "Minor 2nd", "Major 2nd", "Minor 9th"
  description: string;
}

export interface SuggestedPitch {
  pitch: number; // 0-127
  pitchName: string; // "G4"
  diffSemitones: number; // +1, -2
  relationName: string; // "5th (Chord Tone)", "9th (Tension)"
  score: number; // higher = better
  reason: string;
}

export interface NoteAnalysis {
  noteId: string;
  pitch: number;
  pitchName: string;
  trackId: number;
  trackName: string;
  chordSegmentId: string;
  chordDisplayName: string;
  relation: NoteRelation;
  nonChordTone: NonChordToneType;
  nonChordToneLabel?: string; // "Passing Tone", "Neighbor Tone", etc.
  riskScore: number; // 0-100
  status: RiskLevel;
  reasons: string[];
  suggestions: SuggestedPitch[];
  collisions: VoiceCollision[];
  positionDescription: string; // "Bar 1 Beat 1 (Downbeat)", "Beat 2.5 (Offbeat)"
  durationDescription: string; // "480 ticks (Quarter Note)"
  resolutionDescription: string; // "Stepwise resolution detected", "No resolution detected"
}

export type AnalysisResolution = 
  | '1/4_beat' 
  | '1/2_beat' 
  | '1_beat' 
  | '2_beats' 
  | '1_bar';

export interface AnalysisSettings {
  resolution: AnalysisResolution;
  minDurationTicks: number; // 0 = off, or e.g. ppq/16
  reduceShortNoteInfluence: boolean;
  detectKeyswitches: boolean;
  // Risk weights modifiers
  chordToneBonus: number; // default: -50
  shortDurationBonus: number; // default: -20
  passingToneBonus: number; // default: -40
  neighborToneBonus: number; // default: -40
  weakBeatBonus: number; // default: -10
  strongBeatPenalty: number; // default: +15
  longDurationPenalty: number; // default: +20
  unknownChromaticPenalty: number; // default: +30
  unresolvedPenalty: number; // default: +20
  collisionPenalty: number; // default: +15
}
