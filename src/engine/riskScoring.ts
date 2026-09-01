import { NoteAnalysis, RiskLevel, SuggestedPitch, VoiceCollision, AnalysisSettings, ChordSegment } from '../types/analysis';
import { NoteData, TrackData, TimeSignatureInfo } from '../types/midi';
import { evaluateNoteRelation, CHORD_DEFINITIONS } from '../music/chords';
import { getMeterPosition } from '../music/meter';
import { formatDurationTicks, pitchToName, getPitchClass } from '../music/pitch';
import { isSemitoneClash, isWholeToneClash } from '../music/interval';
import { analyzeNonChordTone } from './nonChordToneAnalyzer';
import { RISK_THRESHOLDS } from '../utils/constants';

export function calculateNoteRisk(
  note: NoteData,
  track: TrackData,
  allNotes: NoteData[],
  allTracks: TrackData[],
  currentSegment: ChordSegment,
  ppq: number,
  timeSignatures: TimeSignatureInfo[],
  settings: AnalysisSettings,
  nextSegment?: ChordSegment,
  prevSegment?: ChordSegment
): NoteAnalysis {
  const reasons: string[] = [];
  let score = 0; // Starts from 0 according to formula in Section 18

  const relation = evaluateNoteRelation(note.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
  const meter = getMeterPosition(note.startTicks, ppq, timeSignatures);
  const durationDesc = formatDurationTicks(note.durationTicks, ppq);
  const durationRatio = note.durationTicks / ppq; // in quarter beats

  const nctResult = analyzeNonChordTone(
    note,
    track.notes,
    currentSegment,
    nextSegment,
    prevSegment
  );

  // 1. Harmony Relation Evaluation
  if (relation.isChordTone) {
    score += settings.chordToneBonus; // -50
    reasons.push(`Chord tone (${relation.intervalName}) in ${currentSegment.displayName}`);
  } else if (relation.isTension) {
    score -= 20;
    reasons.push(`Permissible tension (${relation.intervalName}) in ${currentSegment.displayName}`);
  } else if (relation.isAlteredTension) {
    score += 15;
    reasons.push(`Altered tension (${relation.intervalName}) in ${currentSegment.displayName}`);
  } else {
    // Non-chord tone / Chromatic tone
    score += settings.unknownChromaticPenalty; // +30
    reasons.push(`Non-chord tone (${relation.intervalName}) against ${currentSegment.displayName}`);
  }

  // 2. Non-chord tone melodic resolution
  if (nctResult.type === 'passing') {
    score += settings.passingToneBonus; // -40
    reasons.push(nctResult.label || 'Passing tone');
  } else if (nctResult.type === 'chromatic_passing') {
    score += (settings.passingToneBonus + 5); // -35
    reasons.push(nctResult.label || 'Chromatic passing tone');
  } else if (nctResult.type === 'neighbor') {
    score += settings.neighborToneBonus; // -40
    reasons.push(nctResult.label || 'Neighbor tone');
  } else if (nctResult.type === 'anticipation') {
    score -= 30;
    reasons.push(nctResult.label || 'Anticipation');
  } else if (nctResult.type === 'suspension') {
    score -= 30;
    reasons.push(nctResult.label || 'Suspension');
  } else if (!relation.isChordTone && !relation.isTension) {
    if (!nctResult.isResolved) {
      score += settings.unresolvedPenalty; // +20
      reasons.push('Unresolved non-chord tone (no stepwise resolution)');
    }
  }

  // 3. Metric Position
  if (meter.isDownbeat) {
    if (!relation.isChordTone) {
      score += settings.strongBeatPenalty; // +15
      reasons.push('Occurs on downbeat (Bar start)');
    }
  } else if (meter.isStrongBeat) {
    if (!relation.isChordTone) {
      score += (settings.strongBeatPenalty - 5); // +10
      reasons.push('Occurs on strong beat');
    }
  } else if (meter.isOffbeat || meter.isOffgrid) {
    score += settings.weakBeatBonus; // -10
  }

  // 4. Duration
  if (durationRatio >= 1.0) {
    if (!relation.isChordTone && !relation.isTension) {
      score += settings.longDurationPenalty; // +20
      reasons.push(`Long duration (${durationDesc})`);
    }
  } else if (durationRatio <= 0.5) {
    // 8th note or shorter
    score += settings.shortDurationBonus; // -20
    if (!relation.isChordTone) {
      reasons.push(`Short duration (${durationDesc})`);
    }
  }

  // 5. Multi-voice Collision Detection
  const collisions: VoiceCollision[] = [];
  const trackMap = new Map<number, TrackData>();
  for (const t of allTracks) trackMap.set(t.id, t);

  for (const otherNote of allNotes) {
    if (otherNote.trackId === note.trackId) continue;
    
    const otherTrack = trackMap.get(otherNote.trackId);
    if (otherTrack && (otherTrack.settings.ignore || otherTrack.settings.role === 'percussion' || otherTrack.settings.role === 'keyswitch')) {
      continue;
    }

    const overlapStart = Math.max(note.startTicks, otherNote.startTicks);
    const overlapEnd = Math.min(note.endTicks, otherNote.endTicks);
    const overlapTicks = overlapEnd - overlapStart;

    if (overlapTicks > ppq / 8) {
      if (isSemitoneClash(note.pitch, otherNote.pitch)) {
        const intervalName = Math.abs(note.pitch - otherNote.pitch) === 1 ? 'Minor 2nd' : 'Minor 9th';
        const otherTrackName = otherTrack ? otherTrack.name : `Track ${otherNote.trackId}`;
        const clashDesc = `Clashes with ${otherTrackName} (${otherNote.name}) via ${intervalName}`;
        
        collisions.push({
          otherNoteId: otherNote.id,
          otherPitch: otherNote.pitch,
          otherPitchName: otherNote.name,
          otherTrackName,
          intervalSemitones: Math.abs(note.pitch - otherNote.pitch),
          intervalName,
          description: clashDesc,
        });

        // Only add collision penalty if note is not already an authorized passing/neighbor tone
        if (nctResult.type === 'none' && !relation.isChordTone) {
          score += settings.collisionPenalty;
        }
        reasons.push(clashDesc);
      }
    }
  }

  // Clamping (0 - 100)
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  let status: RiskLevel = 'SAFE';
  if (clampedScore <= RISK_THRESHOLDS.SAFE_MAX) {
    status = 'SAFE';
  } else if (clampedScore <= RISK_THRESHOLDS.INFO_MAX) {
    status = 'INFO';
  } else if (clampedScore <= RISK_THRESHOLDS.CHECK_MAX) {
    status = 'CHECK';
  } else {
    status = 'WARNING';
  }

  return {
    noteId: note.id,
    pitch: note.pitch,
    pitchName: note.name,
    trackId: note.trackId,
    trackName: track.name,
    chordSegmentId: currentSegment.id,
    chordDisplayName: currentSegment.displayName,
    relation,
    nonChordTone: nctResult.type,
    nonChordToneLabel: nctResult.label,
    riskScore: clampedScore,
    status,
    reasons,
    suggestions: [],
    collisions,
    positionDescription: meter.description,
    durationDescription: durationDesc,
    resolutionDescription: nctResult.resolutionDescription,
  };
}
