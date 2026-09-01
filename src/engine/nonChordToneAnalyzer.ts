import { NonChordToneType, ChordSegment } from '../types/analysis';
import { NoteData } from '../types/midi';
import { evaluateNoteRelation } from '../music/chords';
import { MusicalPosition } from '../music/meter';

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
  prevSegment?: ChordSegment,
  meter?: MusicalPosition,
  allSegments: ChordSegment[] = []
): NonChordToneResult {
  const relation = evaluateNoteRelation(note.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);

  // Check 1: Pedal Point (保続音 / オルゲルプンクト - Phase J)
  // If the note spans across multiple distinct chord segments
  if (allSegments.length > 1 && (note.startTicks < currentSegment.startTicks || note.endTicks > currentSegment.endTicks)) {
    const overlappingSegments = allSegments.filter(
      seg => seg.startTicks < note.endTicks && seg.endTicks > note.startTicks
    );
    const distinctChords = new Set(overlappingSegments.map(s => `${s.root}_${s.type}`));
    if (overlappingSegments.length >= 2 && distinctChords.size >= 2) {
      return {
        type: 'pedal_point',
        label: '保続音 (Pedal Point)',
        isResolved: true,
        resolutionDescription: `${overlappingSegments.length}個の異なる和音区間にわたり持続・維持`,
        reasons: ['コード進行をまたぐ保続音 (Pedal Point)'],
      };
    }
  }

  // If chord tone, return chord tone resolution (unless it was a pedal point across multiple chords)
  if (relation.isChordTone) {
    return {
      type: 'none',
      isResolved: true,
      resolutionDescription: 'コード構成音',
      reasons: [`コード構成音 (${relation.intervalName})`],
    };
  }

  // If track is heavily polyphonic (dense chords/pads with low melodic confidence),
  // suppress linear voice leading passing/neighbor deduction
  if (melodicConfidence < 0.35) {
    return {
      type: 'none',
      isResolved: false,
      resolutionDescription: 'ポリフォニック和音トラック（声部線形解決を抑制）',
      reasons: ['ポリフォニック和音テクスチャ'],
    };
  }

  // Filter sequential notes
  const sequentialNotes = trackNotes
    .filter(n => Math.abs(n.startTicks - note.startTicks) > 20 || n.id === note.id)
    .sort((a, b) => a.startTicks - b.startTicks);

  const currentIndex = sequentialNotes.findIndex(n => n.id === note.id);
  const prevNote = currentIndex > 0 ? sequentialNotes[currentIndex - 1] : undefined;
  const nextNote = currentIndex >= 0 && currentIndex < sequentialNotes.length - 1 ? sequentialNotes[currentIndex + 1] : undefined;

  const reasons: string[] = [];

  // Check 2: Neighbor Tone (刺繍音: E -> F -> E)
  if (prevNote && nextNote) {
    const diffPrev = note.pitch - prevNote.pitch;
    const diffNext = nextNote.pitch - note.pitch;
    
    if (prevNote.pitch === nextNote.pitch && (Math.abs(diffPrev) === 1 || Math.abs(diffPrev) === 2)) {
      const neighborLabel = Math.abs(diffPrev) === 1 ? '半音階刺繍音 (Chromatic Neighbor)' : '刺繍音 (Neighbor Tone)';
      reasons.push(`${neighborLabel} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: 'neighbor',
        label: neighborLabel,
        isResolved: true,
        resolutionDescription: `次音 ${nextNote.name} へ順次進行して解決`,
        reasons,
      };
    }

    // Check 3: Passing Tone (経過音: E -> F -> G)
    const isStepwisePrev = Math.abs(diffPrev) === 1 || Math.abs(diffPrev) === 2;
    const isStepwiseNext = Math.abs(diffNext) === 1 || Math.abs(diffNext) === 2;
    const isSameDirection = (diffPrev > 0 && diffNext > 0) || (diffPrev < 0 && diffNext < 0);

    if (isStepwisePrev && isStepwiseNext && isSameDirection) {
      const isChromatic = Math.abs(diffPrev) === 1 && Math.abs(diffNext) === 1;
      const passingType: NonChordToneType = isChromatic ? 'chromatic_passing' : 'passing';
      const label = isChromatic ? '半音階経過音 (Chromatic Passing)' : '経過音 (Passing Tone)';
      reasons.push(`${label} (${prevNote.name} → ${note.name} → ${nextNote.name})`);
      return {
        type: passingType,
        label,
        isResolved: true,
        resolutionDescription: `次音 ${nextNote.name} へ順次進行して解決`,
        reasons,
      };
    }

    // Check 4: Escape Tone (逸音 / エスケープトーン)
    const prevRelation = evaluateNoteRelation(prevNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    const nextRelation = evaluateNoteRelation(nextNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    const isOppositeDirection = (diffPrev > 0 && diffNext < 0) || (diffPrev < 0 && diffNext > 0);
    const isLeapNext = Math.abs(diffNext) >= 3;

    if (prevRelation.isChordTone && isStepwisePrev && isOppositeDirection && isLeapNext && nextRelation.isChordTone) {
      return {
        type: 'escape_tone',
        label: '逸音 (Escape Tone)',
        isResolved: true,
        resolutionDescription: `${prevNote.name}から順次進行後、反対方向 ${nextNote.name} へ跳躍解決`,
        reasons: [`逸音 (Escape Tone: ${prevNote.name} → ${note.name} → ${nextNote.name})`],
      };
    }
  }

  // Check 5: Chromatic Approach (半音アプローチ: D# -> E)
  if (nextNote && (note.durationTicks <= 360 || (meter && !meter.isDownbeat))) {
    const semitoneDiff = Math.abs(note.pitch - nextNote.pitch);
    const nextRelation = evaluateNoteRelation(nextNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    if (semitoneDiff === 1 && nextRelation.isChordTone) {
      const approachDesc = note.pitch < nextNote.pitch ? '下からの半音アプローチ' : '上からの半音アプローチ';
      return {
        type: 'chromatic_approach',
        label: `半音アプローチ (${approachDesc})`,
        isResolved: true,
        resolutionDescription: `次音 ${nextNote.name} (${nextRelation.intervalName}) へ半音アプローチ`,
        reasons: [`半音アプローチ (${note.name} → ${nextNote.name})`],
      };
    }
  }

  // Check 6: Appoggiatura (強拍倚音)
  if (meter && (meter.isDownbeat || meter.isStrongBeat) && nextNote) {
    const stepDiff = Math.abs(note.pitch - nextNote.pitch);
    const nextRelation = evaluateNoteRelation(nextNote.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    if ((stepDiff === 1 || stepDiff === 2) && nextRelation.isChordTone) {
      return {
        type: 'appoggiatura',
        label: '倚音 (Appoggiatura)',
        isResolved: true,
        resolutionDescription: `強拍上で発音され、次音 ${nextNote.name} (${nextRelation.intervalName}) へ順次解決`,
        reasons: [`強拍倚音 (Appoggiatura: ${note.name} → ${nextNote.name})`],
      };
    }
  }

  // Check 7: Anticipation (先行動音)
  if (nextSegment && nextSegment.id !== currentSegment.id) {
    const ticksUntilNextChord = nextSegment.startTicks - note.startTicks;
    const isCloseToChordChange = ticksUntilNextChord <= (note.durationTicks * 2.0);

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

  // Check 8: Suspension (掛留音)
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
