import { ChordType, KeyContext } from '../types/analysis';
import { MidiData, NoteData } from '../types/midi';
import { PITCH_NAMES, PITCH_NAMES_FLAT } from '../utils/constants';

// Krumhansl-Schmuckler Key Profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Flat-preferring root pitch classes
const FLAT_MAJOR_ROOTS = [5, 10, 3, 8, 1]; // F (5), Bb (10), Eb (3), Ab (8), Db (1)
const FLAT_MINOR_ROOTS = [2, 7, 0, 5, 10]; // D (2), G (7), C (0), F (5), Bb (10)

// Diatonic Triads & 7ths offsets from Key Root
// Major: I, ii, iii, IV, V, vi, vii°
const MAJOR_DIATONIC_CHORDS: Array<{ offset: number; types: ChordType[] }> = [
  { offset: 0, types: ['maj', 'maj7', '6', 'add9', 'maj9'] },
  { offset: 2, types: ['min', 'min7', 'min9', 'min6'] },
  { offset: 4, types: ['min', 'min7'] },
  { offset: 5, types: ['maj', 'maj7', '6', 'add9', 'maj9'] },
  { offset: 7, types: ['maj', 'dom7', 'dom9', 'sus4', 'sus2'] },
  { offset: 9, types: ['min', 'min7', 'min9'] },
  { offset: 11, types: ['dim', 'm7b5', 'dim7'] },
];

// Natural Minor: i, ii°, III, iv, v, VI, VII
const MINOR_DIATONIC_CHORDS: Array<{ offset: number; types: ChordType[] }> = [
  { offset: 0, types: ['min', 'min7', 'mMaj7', 'min9', 'min6'] },
  { offset: 2, types: ['dim', 'm7b5'] },
  { offset: 3, types: ['maj', 'maj7', '6', 'add9'] },
  { offset: 5, types: ['min', 'min7', 'min9'] },
  { offset: 7, types: ['min', 'min7', 'dom7', 'maj', 'dom9'] }, // including harmonic minor V7
  { offset: 8, types: ['maj', 'maj7'] },
  { offset: 10, types: ['maj', 'dom7'] },
];

function correlation(v1: number[], v2: number[]): number {
  const n = v1.length;
  const mean1 = v1.reduce((s, x) => s + x, 0) / n;
  const mean2 = v2.reduce((s, x) => s + x, 0) / n;

  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = v1[i] - mean1;
    const d2 = v2[i] - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  }

  if (denom1 === 0 || denom2 === 0) return 0;
  return numerator / Math.sqrt(denom1 * denom2);
}

/**
 * Filter notes suitable for Key Detection (Phase D)
 * Excludes percussion, keyswitch, ignore tracks, and chord guides
 */
export function getNotesForKeyDetection(midiData: MidiData): NoteData[] {
  const trackMap = new Map<number, (typeof midiData.tracks)[0]>();
  midiData.tracks.forEach(t => trackMap.set(t.id, t));

  return midiData.notes.filter(n => {
    const track = trackMap.get(n.trackId);
    if (!track) return false;
    if (track.settings.ignore) return false;
    if (
      track.settings.role === 'percussion' ||
      track.settings.role === 'keyswitch' ||
      track.settings.role === 'ignore' ||
      track.settings.role === 'chord_guide'
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Detects Key from notes with PPQ normalization (Phase E)
 */
export function detectKeyFromNotes(notes: NoteData[], ppq: number = 480): KeyContext {
  if (notes.length === 0) {
    return { root: 0, mode: 'major', name: 'C Major', confidence: 50, manualOverride: false };
  }

  const safePpq = Math.max(1, ppq);

  // Build weighted pitch class histogram using normalized duration (durationTicks / ppq)
  const histogram = new Array(12).fill(0);
  notes.forEach(n => {
    histogram[n.pitchClass] += Math.max(0.1, n.durationTicks / safePpq);
  });

  const candidates: { root: number; mode: 'major' | 'minor'; score: number }[] = [];

  for (let root = 0; root < 12; root++) {
    // Shift histogram to root
    const rotated = new Array(12);
    for (let i = 0; i < 12; i++) {
      rotated[i] = histogram[(root + i) % 12];
    }

    const majorScore = correlation(rotated, MAJOR_PROFILE);
    const minorScore = correlation(rotated, MINOR_PROFILE);

    candidates.push({ root, mode: 'major', score: majorScore });
    candidates.push({ root, mode: 'minor', score: minorScore });
  }

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];
  const margin = Math.max(0, best.score - (second ? second.score : 0));
  const confidence = Math.max(40, Math.min(98, Math.round(50 + best.score * 30 + margin * 40)));

  const useFlat = best.mode === 'major' ? FLAT_MAJOR_ROOTS.includes(best.root) : FLAT_MINOR_ROOTS.includes(best.root);
  const rootStr = useFlat ? PITCH_NAMES_FLAT[best.root] : PITCH_NAMES[best.root];
  const modeStr = best.mode === 'major' ? 'Major' : 'Minor';

  return {
    root: best.root,
    mode: best.mode,
    name: `${rootStr} ${modeStr}`,
    confidence,
    manualOverride: false,
  };
}

/**
 * Key Compatibility Bonus for chord scoring (Phase H)
 * Gentle tie-breaker (+0.2 ~ +0.4) that does NOT exclude chromatic or borrowed chords
 */
export function getKeyCompatibilityBonus(root: number, type: ChordType, keyContext?: KeyContext): number {
  if (!keyContext) return 0;

  const rootDiff = ((root - keyContext.root) % 12 + 12) % 12;
  const chordSet = keyContext.mode === 'major' ? MAJOR_DIATONIC_CHORDS : MINOR_DIATONIC_CHORDS;

  const match = chordSet.find(c => c.offset === rootDiff);
  if (match && match.types.includes(type)) {
    // Primary tonic or dominant triad gets slightly higher bonus
    if (rootDiff === 0 || rootDiff === 7) return 0.4;
    return 0.25;
  }

  return 0;
}

/**
 * Key-aware Pitch Formatter for all UI components (Phase G)
 */
export function formatPitchName(pitch: number, keyContext?: KeyContext): string {
  return getEnharmonicPitchName(pitch, keyContext);
}

export function getEnharmonicPitchName(pitch: number, keyContext?: KeyContext): string {
  const pc = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;

  let useFlat = false;
  if (keyContext) {
    if (keyContext.mode === 'major') {
      useFlat = FLAT_MAJOR_ROOTS.includes(keyContext.root);
    } else {
      useFlat = FLAT_MINOR_ROOTS.includes(keyContext.root);
    }
  }

  const name = useFlat ? PITCH_NAMES_FLAT[pc] : PITCH_NAMES[pc];
  return `${name}${octave}`;
}
