import { RangePreset, TrackData } from '../types/midi';
import { pitchToName } from '../music/pitch';

export function getPitchRangeForPreset(preset: RangePreset): { min: number; max: number } {
  switch (preset) {
    case 'ignore_below_c0': return { min: 12, max: 127 }; // C0 = 12
    case 'ignore_below_c1': return { min: 24, max: 127 }; // C1 = 24
    case 'ignore_below_c2': return { min: 36, max: 127 }; // C2 = 36
    case 'all':
    default:
      return { min: 0, max: 127 };
  }
}

export interface KeyswitchDetectionResult {
  hasSuspiciousKeyswitches: boolean;
  suggestedPreset: RangePreset;
  suggestedMinPitch: number;
  count: number;
  message: string;
}

export function detectTrackKeyswitches(track: TrackData): KeyswitchDetectionResult {
  if (track.notes.length === 0) {
    return {
      hasSuspiciousKeyswitches: false,
      suggestedPreset: 'all',
      suggestedMinPitch: 0,
      count: 0,
      message: '',
    };
  }

  // Find notes below C2 (pitch 36)
  const lowNotes = track.notes.filter(n => n.pitch < 36);
  const normalNotes = track.notes.filter(n => n.pitch >= 36);

  if (lowNotes.length === 0 || normalNotes.length === 0) {
    return {
      hasSuspiciousKeyswitches: false,
      suggestedPreset: 'all',
      suggestedMinPitch: 0,
      count: 0,
      message: '',
    };
  }

  const maxLowPitch = Math.max(...lowNotes.map(n => n.pitch));
  const minNormalPitch = Math.min(...normalNotes.map(n => n.pitch));
  const pitchGap = minNormalPitch - maxLowPitch;

  // If there is a large gap (e.g. >= 14 semitones) between low notes and normal notes
  if (pitchGap >= 14 && lowNotes.length >= 2) {
    let suggestedPreset: RangePreset = 'ignore_below_c1';
    let suggestedMin = 24;

    if (maxLowPitch < 12) {
      suggestedPreset = 'ignore_below_c0';
      suggestedMin = 12;
    } else if (maxLowPitch < 24) {
      suggestedPreset = 'ignore_below_c1';
      suggestedMin = 24;
    } else if (maxLowPitch < 36) {
      suggestedPreset = 'ignore_below_c2';
      suggestedMin = 36;
    }

    const noteNames = Array.from(new Set(lowNotes.map(n => pitchToName(n.pitch)))).slice(0, 4).join(', ');

    return {
      hasSuspiciousKeyswitches: true,
      suggestedPreset,
      suggestedMinPitch: suggestedMin,
      count: lowNotes.length,
      message: `Possible keyswitch notes detected (${lowNotes.length} notes: ${noteNames}). Register gap is ${pitchGap} semitones. Suggested: Ignore below ${pitchToName(suggestedMin)}.`,
    };
  }

  return {
    hasSuspiciousKeyswitches: false,
    suggestedPreset: 'all',
    suggestedMinPitch: 0,
    count: 0,
    message: '',
  };
}
