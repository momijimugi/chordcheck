import { ChordType, NoteRelation } from '../types/analysis';
import { getPitchClass, pitchClassToName } from './pitch';

export interface ChordDefinition {
  type: ChordType;
  name: string;
  shortName: string;
  intervals: number[]; // relative semitones from root (e.g. [0, 4, 7] for maj)
  tensions: number[]; // acceptable natural tensions
  alteredTensions: number[]; // acceptable altered tensions
  avoidTones?: number[];
}

export const CHORD_DEFINITIONS: Record<ChordType, ChordDefinition> = {
  maj: {
    type: 'maj',
    name: 'Major',
    shortName: '',
    intervals: [0, 4, 7],
    tensions: [2, 9], // 9, 13
    alteredTensions: [],
    avoidTones: [5], // 11
  },
  min: {
    type: 'min',
    name: 'Minor',
    shortName: 'm',
    intervals: [0, 3, 7],
    tensions: [2, 5], // 9, 11
    alteredTensions: [],
    avoidTones: [8], // b13
  },
  dim: {
    type: 'dim',
    name: 'Diminished',
    shortName: 'dim',
    intervals: [0, 3, 6],
    tensions: [2, 5, 8],
    alteredTensions: [],
  },
  aug: {
    type: 'aug',
    name: 'Augmented',
    shortName: 'aug',
    intervals: [0, 4, 8],
    tensions: [2, 6],
    alteredTensions: [],
  },
  sus2: {
    type: 'sus2',
    name: 'Suspended 2nd',
    shortName: 'sus2',
    intervals: [0, 2, 7],
    tensions: [9],
    alteredTensions: [],
  },
  sus4: {
    type: 'sus4',
    name: 'Suspended 4th',
    shortName: 'sus4',
    intervals: [0, 5, 7],
    tensions: [2, 9, 10],
    alteredTensions: [],
  },
  maj7: {
    type: 'maj7',
    name: 'Major 7th',
    shortName: 'maj7',
    intervals: [0, 4, 7, 11],
    tensions: [2, 6, 9], // 9, #11, 13
    alteredTensions: [],
    avoidTones: [5], // 11
  },
  min7: {
    type: 'min7',
    name: 'Minor 7th',
    shortName: 'm7',
    intervals: [0, 3, 7, 10],
    tensions: [2, 5, 9], // 9, 11, 13
    alteredTensions: [],
  },
  dom7: {
    type: 'dom7',
    name: 'Dominant 7th',
    shortName: '7',
    intervals: [0, 4, 7, 10],
    tensions: [2, 6, 9], // 9, #11, 13
    alteredTensions: [1, 3, 8], // b9, #9, b13
    avoidTones: [5], // natural 11
  },
  mMaj7: {
    type: 'mMaj7',
    name: 'Minor Major 7th',
    shortName: 'm(maj7)',
    intervals: [0, 3, 7, 11],
    tensions: [2, 5], // 9, 11
    alteredTensions: [],
  },
  m7b5: {
    type: 'm7b5',
    name: 'Half Diminished 7th',
    shortName: 'm7(b5)',
    intervals: [0, 3, 6, 10],
    tensions: [5, 8], // 11, b13
    alteredTensions: [2], // 9
  },
  dim7: {
    type: 'dim7',
    name: 'Diminished 7th',
    shortName: 'dim7',
    intervals: [0, 3, 6, 9],
    tensions: [2, 5, 11],
    alteredTensions: [],
  },
  '6': {
    type: '6',
    name: 'Major 6th',
    shortName: '6',
    intervals: [0, 4, 7, 9],
    tensions: [2, 6], // 9, #11
    alteredTensions: [],
  },
  min6: {
    type: 'min6',
    name: 'Minor 6th',
    shortName: 'm6',
    intervals: [0, 3, 7, 9],
    tensions: [2, 5], // 9, 11
    alteredTensions: [],
  },
  add9: {
    type: 'add9',
    name: 'Add 9th',
    shortName: 'add9',
    intervals: [0, 4, 7, 2],
    tensions: [9],
    alteredTensions: [],
  },
  maj9: {
    type: 'maj9',
    name: 'Major 9th',
    shortName: 'maj9',
    intervals: [0, 2, 4, 7, 11],
    tensions: [6, 9], // #11, 13
    alteredTensions: [],
  },
  min9: {
    type: 'min9',
    name: 'Minor 9th',
    shortName: 'm9',
    intervals: [0, 2, 3, 7, 10],
    tensions: [5, 9], // 11, 13
    alteredTensions: [],
  },
  dom9: {
    type: 'dom9',
    name: 'Dominant 9th',
    shortName: '9',
    intervals: [0, 2, 4, 7, 10],
    tensions: [6, 9], // #11, 13
    alteredTensions: [1, 3, 8],
  },
  nc: {
    type: 'nc',
    name: 'No Chord',
    shortName: 'N.C.',
    intervals: [],
    tensions: [],
    alteredTensions: [],
  },
  unknown: {
    type: 'unknown',
    name: 'Unknown',
    shortName: '?',
    intervals: [],
    tensions: [],
    alteredTensions: [],
  },
};

export const ALL_CHORD_TYPES: ChordType[] = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
  'maj7', 'min7', 'dom7', 'mMaj7', 'm7b5', 'dim7',
  '6', 'min6', 'add9', 'maj9', 'min9', 'dom9'
];

export function formatChordName(root: number, type: ChordType, bass?: number): string {
  if (type === 'nc') return 'N.C.';
  if (type === 'unknown') return '?';
  const rootStr = pitchClassToName(root);
  const def = CHORD_DEFINITIONS[type];
  const short = def ? def.shortName : '';
  const chordBase = `${rootStr}${short}`;
  
  if (bass !== undefined && bass !== root) {
    const bassStr = pitchClassToName(bass);
    return `${chordBase}/${bassStr}`;
  }
  return chordBase;
}

export function evaluateNoteRelation(
  notePitch: number,
  chordRoot: number,
  chordType: ChordType,
  chordBass: number
): NoteRelation {
  const pc = getPitchClass(notePitch);
  const intervalFromRoot = ((pc - chordRoot) % 12 + 12) % 12;
  const intervalFromBass = ((pc - chordBass) % 12 + 12) % 12;
  
  const def = CHORD_DEFINITIONS[chordType] || CHORD_DEFINITIONS.maj;
  const isChordTone = def.intervals.includes(intervalFromRoot);
  const isTension = def.tensions.includes(intervalFromRoot);
  const isAlteredTension = def.alteredTensions.includes(intervalFromRoot);
  const isNonChordTone = !isChordTone && !isTension && !isAlteredTension;
  
  let degreeName = 'Non-Chord';
  let intervalName = 'Chromatic Tone';
  
  switch (intervalFromRoot) {
    case 0:
      degreeName = '1';
      intervalName = 'Root';
      break;
    case 1:
      degreeName = 'b9';
      intervalName = isAlteredTension ? 'b9 (Altered Tension)' : 'Minor 2nd / b9';
      break;
    case 2:
      degreeName = '9';
      intervalName = isChordTone ? '2nd / 9th' : '9th (Tension)';
      break;
    case 3:
      degreeName = '#9 / b3';
      intervalName = isChordTone ? 'Minor 3rd' : (isAlteredTension ? '#9 (Altered Tension)' : 'Minor 3rd / #9');
      break;
    case 4:
      degreeName = '3';
      intervalName = 'Major 3rd';
      break;
    case 5:
      degreeName = '11';
      intervalName = isChordTone ? '4th' : (isTension ? '11th (Tension)' : 'Perfect 4th / 11th');
      break;
    case 6:
      degreeName = '#11 / b5';
      intervalName = isChordTone ? 'Flat 5th' : (isTension ? '#11 (Tension)' : 'Tritone / #11');
      break;
    case 7:
      degreeName = '5';
      intervalName = 'Perfect 5th';
      break;
    case 8:
      degreeName = 'b13 / #5';
      intervalName = isChordTone ? 'Augmented 5th' : (isAlteredTension || isTension ? 'b13 (Tension)' : 'Minor 6th / b13');
      break;
    case 9:
      degreeName = '13 / 6';
      intervalName = isChordTone ? '6th / bb7' : (isTension ? '13th (Tension)' : 'Major 6th / 13th');
      break;
    case 10:
      degreeName = 'b7';
      intervalName = 'Minor 7th';
      break;
    case 11:
      degreeName = '7';
      intervalName = 'Major 7th';
      break;
  }
  
  return {
    intervalFromRoot,
    intervalName,
    degreeName,
    isChordTone,
    isTension,
    isAlteredTension,
    isNonChordTone,
    intervalFromBass
  };
}
