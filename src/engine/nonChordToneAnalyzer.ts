import { NonChordToneType, ChordSegment } from '../types/analysis';
import { NoteData } from '../types/midi';
import { evaluateNoteRelation, CHORD_DEFINITIONS } from '../music/chords';
import { getPitchClass } from '../music/pitch';

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

  // Find preceding and succeeding notes on the same track
  const sortedTrackNotes = [...trackNotes].sort((a, b) => a.startTicks - b.startTicks);
  const currentIndex = sortedTrackNotes.findIndex(n => n.id === note.id);
  
  const prevNote = currentIndex > 0 ? sortedTrackNotes[currentIndex - 1] : undefined;
  const nextNote = currentIndex >= 0 && currentIndex < sortedTrackNotes.length - 1 ? sortedTrackNotes[currentIndex + 1] : undefined;

  const reasons: string[] = [];

  // 1. Neighbor Tone check: E -> F -> E (step away and return)
  if (prevNote && nextNote) {
    const diffPrev = note.pitch - prevNote.pitch;
    const diffNext = nextNote.pitch - note.pitch;
    
    // Neighbor: moves by 1 or 2 semitones from prev, then returns back to same pitch
    if (prevNote.pitch === nextNote.pitch && (Math.abs(diffPrev) === 1 || Math.abs(diffPrev) === 2)) {
      const neighborLabel = Math.abs(diffPrev) === 1 ? 'Chromatic Neighbor Tone' : 'Neighbor Tone';
      reasons.push(`${neighborLabel} (moves to ${note.name} and returns to ${nextNote.name})`);
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

  // 3. Anticipation check: note occurs right before next chord segment, and is a Chord Tone of that next segment
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

  // 4. Suspension check: note held from previous segment where it was a Chord Tone, resolving down stepwise
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

  // If next note exists and is stepwise resolution to a chord tone
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
