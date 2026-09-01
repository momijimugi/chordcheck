import { PITCH_NAMES, PITCH_NAMES_FLAT } from '../utils/constants';

export function getPitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function getOctave(pitch: number): number {
  return Math.floor(pitch / 12) - 1; // MIDI 60 is C4 (standard)
}

export function pitchClassToName(pitchClass: number, useFlat: boolean = false): string {
  const pc = ((pitchClass % 12) + 12) % 12;
  return useFlat ? PITCH_NAMES_FLAT[pc] : PITCH_NAMES[pc];
}

export function pitchToName(pitch: number, useFlat: boolean = false): string {
  const pc = getPitchClass(pitch);
  const octave = getOctave(pitch);
  const name = pitchClassToName(pc, useFlat);
  return `${name}${octave}`;
}

export function nameToPitch(name: string): number {
  const match = name.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) return 60; // default C4
  
  let noteStr = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  
  let pc = PITCH_NAMES.indexOf(noteStr as any);
  if (pc === -1) {
    pc = PITCH_NAMES_FLAT.indexOf(noteStr as any);
  }
  if (pc === -1) return 60;
  
  return (octave + 1) * 12 + pc;
}

export function pitchToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function formatDurationTicks(ticks: number, ppq: number): string {
  const quarterTicks = ppq;
  const ratio = ticks / quarterTicks;
  
  if (Math.abs(ratio - 4) < 0.05) return 'Whole Note';
  if (Math.abs(ratio - 2) < 0.05) return 'Half Note';
  if (Math.abs(ratio - 1) < 0.05) return 'Quarter Note';
  if (Math.abs(ratio - 0.5) < 0.05) return '8th Note';
  if (Math.abs(ratio - 0.25) < 0.05) return '16th Note';
  if (Math.abs(ratio - 0.125) < 0.05) return '32nd Note';
  if (Math.abs(ratio - 1.5) < 0.05) return 'Dotted Quarter Note';
  if (Math.abs(ratio - 0.75) < 0.05) return 'Dotted 8th Note';
  if (Math.abs(ratio - 0.375) < 0.05) return 'Dotted 16th Note';
  if (Math.abs(ratio - 0.333) < 0.05) return 'Triplet 8th Note';
  if (Math.abs(ratio - 0.666) < 0.05) return 'Triplet Quarter Note';
  
  return `${ticks} ticks (${ratio.toFixed(2)} beats)`;
}
