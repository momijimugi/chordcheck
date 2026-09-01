export interface IntervalDetail {
  semitones: number;
  name: string;
  degree: string;
  isConsonant: boolean;
  isSharpDissonant: boolean;
  isMildDissonant: boolean;
}

export const INTERVAL_DETAILS: Record<number, IntervalDetail> = {
  0: { semitones: 0, name: 'Root / Unison', degree: '1', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  1: { semitones: 1, name: 'Minor 2nd / b9', degree: 'b9', isConsonant: false, isSharpDissonant: true, isMildDissonant: false },
  2: { semitones: 2, name: 'Major 2nd / 9th', degree: '9', isConsonant: false, isSharpDissonant: false, isMildDissonant: true },
  3: { semitones: 3, name: 'Minor 3rd / #9', degree: 'b3', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  4: { semitones: 4, name: 'Major 3rd', degree: '3', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  5: { semitones: 5, name: 'Perfect 4th / 11th', degree: '11', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  6: { semitones: 6, name: 'Tritone / #11', degree: '#11', isConsonant: false, isSharpDissonant: true, isMildDissonant: false },
  7: { semitones: 7, name: 'Perfect 5th', degree: '5', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  8: { semitones: 8, name: 'Minor 6th / b13', degree: 'b13', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  9: { semitones: 9, name: 'Major 6th / 13th', degree: '13', isConsonant: true, isSharpDissonant: false, isMildDissonant: false },
  10: { semitones: 10, name: 'Minor 7th', degree: 'b7', isConsonant: false, isSharpDissonant: false, isMildDissonant: true },
  11: { semitones: 11, name: 'Major 7th', degree: '7', isConsonant: false, isSharpDissonant: true, isMildDissonant: false },
};

export function getIntervalSemitones(fromPitch: number, toPitch: number): number {
  return ((toPitch - fromPitch) % 12 + 12) % 12;
}

export function getIntervalDetail(semitones: number): IntervalDetail {
  const normalized = ((semitones % 12) + 12) % 12;
  return INTERVAL_DETAILS[normalized];
}

export function isSemitoneClash(p1: number, p2: number): boolean {
  const diff = Math.abs(p1 - p2);
  // Minor 2nd (1 semitone) or Minor 9th (13 semitones)
  return diff === 1 || diff === 13;
}

export function isWholeToneClash(p1: number, p2: number): boolean {
  const diff = Math.abs(p1 - p2);
  // Major 2nd (2 semitones) or Major 9th (14 semitones)
  return diff === 2 || diff === 14;
}
