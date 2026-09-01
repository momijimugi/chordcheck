import { AnalysisProfile, AnalysisSettings, RiskLevel } from '../types/analysis';

export const PITCH_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B'
] as const;

export const PITCH_NAMES_FLAT = [
  'C', 'Db', 'D', 'Eb', 'E', 'F',
  'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
] as const;

export const ANALYSIS_PROFILES: Record<AnalysisProfile, Partial<AnalysisSettings>> = {
  balanced: {
    profile: 'balanced',
    chordToneBonus: -50,
    shortDurationBonus: -20,
    passingToneBonus: -40,
    neighborToneBonus: -40,
    weakBeatBonus: -10,
    strongBeatPenalty: 15,
    longDurationPenalty: 20,
    unknownChromaticPenalty: 30,
    unresolvedPenalty: 20,
    collisionPenalty: 15,
  },
  strict: {
    profile: 'strict',
    chordToneBonus: -60,
    shortDurationBonus: -10,
    passingToneBonus: -25,
    neighborToneBonus: -25,
    weakBeatBonus: -5,
    strongBeatPenalty: 25,
    longDurationPenalty: 30,
    unknownChromaticPenalty: 45,
    unresolvedPenalty: 30,
    collisionPenalty: 25,
  },
  film_modern: {
    profile: 'film_modern',
    chordToneBonus: -40,
    shortDurationBonus: -25,
    passingToneBonus: -50,
    neighborToneBonus: -50,
    weakBeatBonus: -15,
    strongBeatPenalty: 10,
    longDurationPenalty: 10,
    unknownChromaticPenalty: 20,
    unresolvedPenalty: 10,
    collisionPenalty: 10,
  },
  jazz_extended: {
    profile: 'jazz_extended',
    chordToneBonus: -50,
    shortDurationBonus: -20,
    passingToneBonus: -40,
    neighborToneBonus: -40,
    weakBeatBonus: -15,
    strongBeatPenalty: 10,
    longDurationPenalty: 15,
    unknownChromaticPenalty: 20,
    unresolvedPenalty: 15,
    collisionPenalty: 10,
  },
};

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  profile: 'balanced',
  segmentationMode: 'adaptive',
  minSegmentLength: '1/2_beat',
  resolution: '1_beat',
  harmonySourceMode: 'chord_guide_preferred',
  minDurationTicks: 0,
  reduceShortNoteInfluence: true,
  detectKeyswitches: true,
  chordToneBonus: -50,
  shortDurationBonus: -20,
  passingToneBonus: -40,
  neighborToneBonus: -40,
  weakBeatBonus: -10,
  strongBeatPenalty: 15,
  longDurationPenalty: 20,
  unknownChromaticPenalty: 30,
  unresolvedPenalty: 20,
  collisionPenalty: 15,
};

export const RISK_THRESHOLDS = {
  SAFE_MAX: 19,
  INFO_MAX: 39,
  CHECK_MAX: 64,
  WARNING_MIN: 65,
};

export const RISK_COLORS: Record<RiskLevel, {
  bg: string;
  text: string;
  border: string;
  badge: string;
  badgeText: string;
  hex: string;
}> = {
  SAFE: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/50',
    badge: 'bg-emerald-500/30 border-emerald-500/40 text-emerald-300',
    badgeText: 'text-emerald-400',
    hex: '#10b981',
  },
  INFO: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-400',
    border: 'border-sky-500/50',
    badge: 'bg-sky-500/30 border-sky-500/40 text-sky-300',
    badgeText: 'text-sky-400',
    hex: '#0ea5e9',
  },
  CHECK: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/50',
    badge: 'bg-amber-500/30 border-amber-500/40 text-amber-300',
    badgeText: 'text-amber-400',
    hex: '#f59e0b',
  },
  WARNING: {
    bg: 'bg-rose-500/25',
    text: 'text-rose-400',
    border: 'border-rose-500/60',
    badge: 'bg-rose-500/30 border-rose-500/50 text-rose-300',
    badgeText: 'text-rose-400',
    hex: '#ef4444',
  },
};

export const TRACK_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#14b8a6', // teal
  '#a855f7', // violet
  '#e11d48', // rose
  '#6366f1', // indigo
];
