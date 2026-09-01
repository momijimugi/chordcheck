import { NonChordToneType, ChordSegment } from '../types/analysis';
import { NoteData } from '../types/midi';
import { evaluateNoteRelation, CHORD_DEFINITIONS } from '../music/chords';

export interface NonChordToneResult {
  type: NonChordToneType;
  label?: string;
  isResolved: boolean;
  resolutionDescription: string;
  reasons: string[];
}

export function analyzeNonChordTone(
  note: NoteData,
  trackNotes: NoteData[],
  currentSegment: ChordSegment,
  melodicConfidence: number = 1.0,
  nextSegment?: ChordSegment,
  prevSegment?: ChordSegment
): NonChordToneResult {
  const relation = evaluateNoteRelation(note.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
  
  if (relation.isChordTone) {
    return {
      type: 'none',
      isResolved: true,
      resolutionDescription: 'Chord Tone',
      reasons: [`Chord tone (${relation.intervalName})`],
    };
  }

  // If track is heavily polyphonic (piano chords, dense pads with low melodic confidence),
  // suppress linear stepwise passing/neighbor tone deduction to avoid false positive voice leading
  if (melodicConfidence < 0.35) {
    return {
      type: 'none',
      isResolved: false,
      resolutionDescription: 'Polyphonic track - linear resolution suppressed',
      reasons: ['Polyphonic voice texture'],
    };
  }

  // Filter out simultaneous notes (notes sounding at the exact same start tick) to get distinct sequential notes
  const sequentialNotes = trackNotes
    .filter(n => Math.abs(n.startTicks - note.startTicks) > 20 || n.id === note.id)
    .sort((a, b) => a.startTicks - b.startTicks);

  const currentIndex = sequentialNotes.findIndex(n => n.id === note.id);
  const prevNote = currentIndex > 0 ? sequentialNotes[currentIndex - 1] : undefined;
  const nextNote = currentIndex >= 0 && currentIndex < sequentialNotes.length - 1 ? sequentialNotes[currentIndex + 1] : undefined;

  const reasons: string[] = [];

  // 1. Neighbor Tone check: E -> F -> E
  if (prevNote && nextNote) {
    const diffPrev = note.pitch - prevNote.pitch;
    const diffNext = nextNote.pitch - note.pitch;
    
    if (prevNote.pitch === nextNote.pitch && (Math.abs(diffPrev) === 1 || Math.abs(diffPrev) === 2)) {
      const neighborLabel = Math.abs(diffPrev) === 1 ? 'Chromatic Neighbor Tone' : 'Neighbor Tone';
      reasons.push(`${neighborLabel} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: 'neighbor',
        label: neighborLabel,
        isResolved: true,
        resolutionDescription: `Stepwise resolution to ${nextNote.name}`,
        reasons,
      };
    }

    // 2. Passing Tone check: E -> F -> G or G -> F -> E
    const isStepwisePrev = Math.abs(diffPrev) === 1 || Math.abs(diffPrev) === 2;
    const isStepwiseNext = Math.abs(diffNext) === 1 || Math.abs(diffNext) === 2;
    const isSameDirection = (diffPrev > 0 && diffNext > 0) || (diffPrev < 0 && diffNext < 0);

    if (isStepwisePrev && isStepwiseNext && isSameDirection) {
      const isChromatic = Math.abs(diffPrev) === 1 && Math.abs(diffNext) === 1;
      const passingType: NonChordToneType = isChromatic ? 'chromatic_passing' : 'passing';
      const label = isChromatic ? 'Chromatic Passing Tone' : 'Passing Tone';
      reasons.push(`${label} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: passingType,
        label,
        isResolved: true,
        resolutionDescription: `Stepwise passing motion to ${nextNote.name}`,
        reasons,
      };
    }
  }

  // 3. Anticipation check
  if (nextSegment && nextSegment.id !== currentSegment.id) {
    const ticksUntilNextChord = nextSegment.startTicks - note.startTicks;
    const isCloseToChordChange = ticksUntilNextChord <= (note.durationTicks * 1.5);
    
    const nextRelation = evaluateNoteRelation(note.pitch, nextSegment.root, nextSegment.type, nextSegment.bass);
    if (isCloseToChordChange && nextRelation.isChordTone) {
      reasons.push(`Anticipation (anticipates ${nextRelation.intervalName} of upcoming ${nextSegment.displayName})`);
      return {
        type: 'anticipation',
        label: 'Anticipation',
        isResolved: true,
        resolutionDescription: `Anticipates ${nextSegment.displayName}`,
        reasons,
      };
    }
  }

  // 4. Suspension check
  if (prevSegment && prevSegment.id !== currentSegment.id && nextNote) {
    const prevRelation = evaluateNoteRelation(note.pitch, prevSegment.root, prevSegment.type, prevSegment.bass);
    const stepDown = note.pitch - nextNote.pitch;
    const nextRelation = evaluateNoteRelation(nextNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);

    if (prevRelation.isChordTone && (stepDown === 1 || stepDown === 2) && nextRelation.isChordTone) {
      reasons.push(`Suspension (prepared in ${prevSegment.displayName}, resolves down to ${nextNote.name})`);
      return {
        type: 'suspension',
        label: 'Suspension',
        isResolved: true,
        resolutionDescription: `Resolves down stepwise to ${nextNote.name}`,
        reasons,
      };
    }
  }

  if (nextNote) {
    const stepDiff = Math.abs(note.pitch - nextNote.pitch);
    const nextRelation = evaluateNoteRelation(nextNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    if ((stepDiff === 1 || stepDiff === 2) && nextRelation.isChordTone) {
      return {
        type: 'none',
        isResolved: true,
        resolutionDescription: `Stepwise resolution to ${nextNote.name} (${nextRelation.intervalName})`,
        reasons: [`Resolves to ${nextNote.name}`],
      };
    }
  }

  return {
    type: 'none',
    isResolved: false,
    resolutionDescription: 'No stepwise resolution detected',
    reasons: ['No stepwise resolution detected'],
  };
}
