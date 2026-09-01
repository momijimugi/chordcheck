import { NonChordToneType, ChordSegment } from '../types/analysis';
import { NoteData } from '../types/midi';
import { evaluateNoteRelation } from '../music/chords';

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
      resolutionDescription: 'コードトーン',
      reasons: [`コードトーン (${relation.intervalName})`],
    };
  }

  // If track is heavily polyphonic (piano chords, dense pads with low melodic confidence),
  // suppress linear stepwise passing/neighbor tone deduction to avoid false positive voice leading
  if (melodicConfidence < 0.35) {
    return {
      type: 'none',
      isResolved: false,
      resolutionDescription: 'ポリフォニック和音トラック（声部線形解決を抑制）',
      reasons: ['ポリフォニック和音テクスチャ'],
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
      const neighborLabel = Math.abs(diffPrev) === 1 ? '半音階刺繍音 (Chromatic Neighbor Tone)' : '刺繍音 (Neighbor Tone)';
      reasons.push(`${neighborLabel} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: 'neighbor',
        label: neighborLabel,
        isResolved: true,
        resolutionDescription: `次音 ${nextNote.name} へ順次進行して解決`,
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
      const label = isChromatic ? '半音階経過音 (Chromatic Passing Tone)' : '経過音 (Passing Tone)';
      reasons.push(`${label} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: passingType,
        label,
        isResolved: true,
        resolutionDescription: `次音 ${nextNote.name} へ順次進行して解決`,
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
      reasons.push(`先行動音 (次コード ${nextSegment.displayName} の ${nextRelation.intervalName} を先行発音)`);
      return {
        type: 'anticipation',
        label: '先行動音 (Anticipation)',
        isResolved: true,
        resolutionDescription: `次コード ${nextSegment.displayName} を先取り`,
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
      reasons.push(`掛留音 (前コード ${prevSegment.displayName} から保持され、${nextNote.name} へ下行解決)`);
      return {
        type: 'suspension',
        label: '掛留音 (Suspension)',
        isResolved: true,
        resolutionDescription: `${nextNote.name} へ下行順次解決`,
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
        resolutionDescription: `次音 ${nextNote.name} (${nextRelation.intervalName}) へ順次進行`,
        reasons: [`${nextNote.name} へ解決`],
      };
    }
  }

  return {
    type: 'none',
    isResolved: false,
    resolutionDescription: '順次進行による解決が見当たりません（跳躍進行）',
    reasons: ['順次解決が検出されません'],
  };
}
