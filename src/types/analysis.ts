export type RiskLevel = 'SAFE' | 'INFO' | 'CHECK' | 'WARNING';

export type HarmonySourceType = 'AUTO' | 'GUIDE' | 'MANUAL';

export type HarmonySourceMode = 'auto' | 'chord_guide_preferred' | 'chord_guide_only';

export type SegmentationMode = 'adaptive' | 'fixed_grid';

export type MinSegmentLength = '1/4_beat' | '1/2_beat' | '1_beat';

export type ChordAnalysisSpan =
  | 'auto'
  | 'two_beats'
  | 'half_bar'
  | 'one_bar'
  | 'two_bars'
  | 'four_bars';

export type AnalysisProfile = 'balanced' | 'strict' | 'film_modern' | 'jazz_extended';

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
  | 'dom9'
  | 'nc'
  | 'unknown';

export interface KeyContext {
  root: number; // 0-11
  mode: 'major' | 'minor';
  name: string; // e.g. "C Major", "D Minor"
  confidence: number; // 0-100%
  manualOverride: boolean;
}

export interface ScoreBreakdown {
  primaryHarmony: number;
  supportingHarmony: number;
  bass: number;
  melody: number;
  key: number;
  continuity: number;
  extension: number;
}

export interface ChordChangeEvidence {
  rootChange: boolean;
  bassChange: boolean;
  thirdChange: boolean;
  seventhChange: boolean;
  primaryHarmonyChange: number; // cosine distance: 0 = identical, 1 = completely different
  profileDifference: number;
  confidenceDelta: number;
  isStrongChange: boolean;
}

export interface ChordCandidate {
  root: number; // 0-11
  rootName: string; // "C", "C#", "Db" etc.
  type: ChordType;
  typeName: string; // "Major 7", "Minor", etc.
  bass: number; // 0-11
  bassName: string;
  displayName: string; // "Cmaj7", "Am7/G", etc.
  score: number;
  confidence: number; // 0-100%
  scoreBreakdown?: ScoreBreakdown;
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
  sourceType: HarmonySourceType; // 'AUTO' | 'GUIDE' | 'MANUAL'
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
  | 'suspension'
  | 'appoggiatura'
  | 'escape_tone'
  | 'pedal_point'
  | 'chromatic_approach';

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

export interface CategorizedReasons {
  harmony: string[];
  timing: string[];
  melodic: string[];
  collision: string[];
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
  nonChordToneLabel?: string; // "Passing Tone", "Appoggiatura", etc.
  riskScore: number; // 0-100
  status: RiskLevel;
  reasons: string[];
  categorizedReasons?: CategorizedReasons;
  suggestions: SuggestedPitch[];
  collisions: VoiceCollision[];
  positionDescription: string;
  durationDescription: string;
  resolutionDescription: string;
}

export type AnalysisResolution = 
  | '1/4_beat' 
  | '1/2_beat' 
  | '1_beat' 
  | '2_beats' 
  | '1_bar';

export interface AnalysisSettings {
  profile: AnalysisProfile;
  segmentationMode: SegmentationMode;
  minSegmentLength: MinSegmentLength;
  chordAnalysisSpan?: ChordAnalysisSpan;
  resolution: AnalysisResolution;
  harmonySourceMode: HarmonySourceMode;
  minDurationTicks: number;
  reduceShortNoteInfluence: boolean;
  detectKeyswitches: boolean;
  chordToneBonus: number;
  shortDurationBonus: number;
  passingToneBonus: number;
  neighborToneBonus: number;
  weakBeatBonus: number;
  strongBeatPenalty: number;
  longDurationPenalty: number;
  unknownChromaticPenalty: number;
  unresolvedPenalty: number;
  collisionPenalty: number;
  keyOverride?: { root: number; mode: 'major' | 'minor' } | 'auto';
}
