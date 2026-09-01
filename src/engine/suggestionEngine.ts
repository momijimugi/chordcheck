import { SuggestedPitch, ChordSegment } from '../types/analysis';
import { NoteData } from '../types/midi';
import { evaluateNoteRelation, CHORD_DEFINITIONS } from '../music/chords';
import { pitchToName, getPitchClass } from '../music/pitch';

export function generateNoteSuggestions(
  note: NoteData,
  trackNotes: NoteData[],
  currentSegment: ChordSegment
): SuggestedPitch[] {
  const sortedNotes = [...trackNotes].sort((a, b) => a.startTicks - b.startTicks);
  const currentIndex = sortedNotes.findIndex(n => n.id === note.id);
  const prevNote = currentIndex > 0 ? sortedNotes[currentIndex - 1] : undefined;
  const nextNote = currentIndex >= 0 && currentIndex < sortedNotes.length - 1 ? sortedNotes[currentIndex + 1] : undefined;

  const currentPitch = note.pitch;
  const def = CHORD_DEFINITIONS[currentSegment.type] || CHORD_DEFINITIONS.maj;

  // Gather candidate pitch classes (chord tones + acceptable natural tensions)
  const targetPitchClasses: { pc: number; weight: number; label: string }[] = [];
  
  for (const interval of def.intervals) {
    const pc = (currentSegment.root + interval) % 12;
    let label = 'Chord Tone';
    let weight = 100;
    if (interval === 0) { label = 'Root'; weight = 120; }
    else if (interval === 4 || interval === 3) { label = '3rd'; weight = 115; }
    else if (interval === 7) { label = '5th'; weight = 105; }
    else if (interval === 11 || interval === 10 || interval === 9) { label = '7th/6th'; weight = 110; }
    
    targetPitchClasses.push({ pc, weight, label });
  }

  for (const tension of def.tensions) {
    const pc = (currentSegment.root + tension) % 12;
    targetPitchClasses.push({ pc, weight: 80, label: 'Tension' });
  }

  const candidatePitches: Map<number, SuggestedPitch> = new Map();

  // Test pitch offsets from -12 to +12 semitones around current pitch
  for (let offset = -12; offset <= 12; offset++) {
    const testPitch = currentPitch + offset;
    if (testPitch < 12 || testPitch > 120) continue;

    const testPc = getPitchClass(testPitch);
    const target = targetPitchClasses.find(t => t.pc === testPc);
    if (!target) continue;

    const relation = evaluateNoteRelation(testPitch, currentSegment.root, currentSegment.type, currentSegment.bass);
    const diffSemitones = offset;
    const absDiff = Math.abs(diffSemitones);

    // Scoring components:
    // Base score from chord tone weight
    let score = target.weight;

    // Pitch proximity penalty (prefer smaller changes: 0..2 semitones)
    score -= (absDiff * 8);

    // Voice leading smoothness from prev note
    if (prevNote) {
      const prevDiff = Math.abs(testPitch - prevNote.pitch);
      if (prevDiff <= 2) score += 15; // Stepwise motion bonus
      else if (prevDiff <= 4) score += 5;
      else if (prevDiff > 7) score -= 10; // Large jump penalty
    }

    // Voice leading smoothness to next note
    if (nextNote) {
      const nextDiff = Math.abs(testPitch - nextNote.pitch);
      if (nextDiff <= 2) score += 15;
      else if (nextDiff <= 4) score += 5;
      else if (nextDiff > 7) score -= 10;
    }

    // Sign formatted
    const diffSign = diffSemitones > 0 ? `+${diffSemitones}` : `${diffSemitones}`;
    const diffDesc = diffSemitones === 0 ? '現在の音高' : `${diffSign} 半音`;
    const reason = `${relation.intervalName} (${diffDesc})`;

    candidatePitches.set(testPitch, {
      pitch: testPitch,
      pitchName: pitchToName(testPitch),
      diffSemitones,
      relationName: relation.intervalName,
      score,
      reason,
    });
  }

  // Convert map to sorted array
  const suggestions = Array.from(candidatePitches.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return suggestions;
}
