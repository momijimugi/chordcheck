import { NoteAnalysis, RiskLevel, SuggestedPitch, VoiceCollision, AnalysisSettings, ChordSegment, CategorizedReasons } from '../types/analysis';
import { NoteData, TrackData, TimeSignatureInfo } from '../types/midi';
import { evaluateNoteRelation } from '../music/chords';
import { getMeterPosition, ticksToMusicalPosition } from '../music/meter';
import { formatDurationTicks } from '../music/pitch';
import { analyzeNonChordTone } from './nonChordToneAnalyzer';
import { RISK_THRESHOLDS } from '../utils/constants';
import { AnalysisContext, getOverlappingNotesFast } from './analysisContext';

export function calculateNoteRisk(
  note: NoteData,
  track: TrackData,
  context: AnalysisContext,
  currentSegment: ChordSegment,
  settings: AnalysisSettings,
  nextSegment?: ChordSegment,
  prevSegment?: ChordSegment
): NoteAnalysis {
  const reasons: string[] = [];
  const categorized: CategorizedReasons = {
    harmony: [],
    timing: [],
    melodic: [],
    collision: [],
  };

  let score = 0;

  const relation = evaluateNoteRelation(note.pitch, currentSegment.root, currentSegment.type, currentSegment.bass);
  const meter = ticksToMusicalPosition(note.startTicks, context.meterMap, context.ppq);
  const durationDesc = formatDurationTicks(note.durationTicks, context.ppq);
  const durationRatio = note.durationTicks / context.ppq;

  const trackNotes = context.sortedTrackNotes.get(note.trackId) || track.notes;
  const nctResult = analyzeNonChordTone(
    note,
    trackNotes,
    currentSegment,
    track.melodicConfidence,
    nextSegment,
    prevSegment,
    meter,
    context.segments
  );

  // 1. 和声関係の評価 (Harmony Relation)
  if (currentSegment.type === 'nc' || currentSegment.type === 'unknown') {
    const r = '和声情報なし (N.C. / 不明区間)';
    reasons.push(r);
    categorized.harmony.push(r);
  } else if (relation.isChordTone) {
    score += settings.chordToneBonus;
    const r = `コード構成音 (${relation.intervalName}) - コード: ${currentSegment.displayName}`;
    reasons.push(r);
    categorized.harmony.push(r);
  } else if (relation.isTension) {
    score -= 20;
    const r = `許容テンション (${relation.intervalName}) - コード: ${currentSegment.displayName}`;
    reasons.push(r);
    categorized.harmony.push(r);
  } else if (relation.isAlteredTension) {
    score += (settings.profile === 'jazz_extended' ? -15 : 15);
    const r = `オルタードテンション (${relation.intervalName}) - コード: ${currentSegment.displayName}`;
    reasons.push(r);
    categorized.harmony.push(r);
  } else {
    score += settings.unknownChromaticPenalty;
    const r = `コード外音 (${relation.intervalName}) - コード: ${currentSegment.displayName}`;
    reasons.push(r);
    categorized.harmony.push(r);
  }

  // 2. 旋律・声部連結 (Melodic Context & Phase J Advanced NCTs)
  if (nctResult.type === 'pedal_point') {
    score = Math.min(score, 10);
    const r = nctResult.label || '保続音 (Pedal Point)';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'chromatic_approach') {
    score -= 35;
    const r = nctResult.label || '半音アプローチ';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'escape_tone') {
    score -= 20;
    const r = nctResult.label || '逸音 (Escape Tone)';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'appoggiatura') {
    score = Math.max(25, Math.min(50, score + 10));
    const r = nctResult.label || '倚音 (Appoggiatura)';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'passing') {
    score += settings.passingToneBonus;
    const r = nctResult.label || '経過音';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'chromatic_passing') {
    score += (settings.passingToneBonus + 5);
    const r = nctResult.label || '半音階経過音';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'neighbor') {
    score += settings.neighborToneBonus;
    const r = nctResult.label || '刺繍音';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'anticipation') {
    score -= 30;
    const r = nctResult.label || '先行動音';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (nctResult.type === 'suspension') {
    score -= 30;
    const r = nctResult.label || '掛留音';
    reasons.push(r);
    categorized.melodic.push(r);
  } else if (!relation.isChordTone && !relation.isTension) {
    if (!nctResult.isResolved) {
      score += settings.unresolvedPenalty;
      const r = '未解決のコード外音（順次解決なし）';
      reasons.push(r);
      categorized.melodic.push(r);
    }
  }

  // 3. タイミング・拍 (Timing & Metric)
  if (meter.isDownbeat) {
    if (!relation.isChordTone && nctResult.type !== 'pedal_point') {
      score += settings.strongBeatPenalty;
      const r = '小節頭拍（最も強い拍）に配置';
      reasons.push(r);
      categorized.timing.push(r);
    }
  } else if (meter.isStrongBeat) {
    if (!relation.isChordTone && nctResult.type !== 'pedal_point') {
      score += (settings.strongBeatPenalty - 5);
      const r = '強拍に配置';
      reasons.push(r);
      categorized.timing.push(r);
    }
  } else if (meter.isOffbeat || meter.isOffgrid) {
    score += settings.weakBeatBonus;
  }

  // 4. 音長 (Duration)
  if (durationRatio >= 1.0) {
    if (!relation.isChordTone && !relation.isTension && nctResult.type !== 'pedal_point') {
      score += settings.longDurationPenalty;
      const r = `長い音長 (${durationDesc}) でコード外音が鳴存`;
      reasons.push(r);
      categorized.timing.push(r);
    }
  } else if (durationRatio <= 0.5) {
    score += settings.shortDurationBonus;
    if (!relation.isChordTone) {
      const r = `短い音長 (${durationDesc})`;
      reasons.push(r);
      categorized.timing.push(r);
    }
  }

  // 5. 高速空間バケットによる他声部衝突判定 (O(1) Spatial Collision Detection)
  const collisions: VoiceCollision[] = [];
  const overlappingCandidates = getOverlappingNotesFast(context, note.startTicks, note.endTicks);

  for (let i = 0; i < overlappingCandidates.length; i++) {
    const otherNote = overlappingCandidates[i];
    if (otherNote.trackId === note.trackId) continue;

    const otherTrack = context.trackMap.get(otherNote.trackId);
    if (otherTrack && (otherTrack.settings.ignore || otherTrack.settings.role === 'percussion' || otherTrack.settings.role === 'keyswitch' || otherTrack.settings.role === 'chord_guide')) {
      continue;
    }

    const overlapStart = Math.max(note.startTicks, otherNote.startTicks);
    const overlapEnd = Math.min(note.endTicks, otherNote.endTicks);
    const overlapTicks = overlapEnd - overlapStart;

    if (overlapTicks > context.ppq / 8) {
      const semitoneDist = Math.abs(note.pitch - otherNote.pitch);

      if (semitoneDist === 1 || semitoneDist === 13) {
        const intervalName = semitoneDist === 1 ? '短2度 (半音差)' : '短9度';
        const otherTrackName = otherTrack ? otherTrack.name : `トラック ${otherNote.trackId}`;
        const clashDesc = `トラック「${otherTrackName}」(${otherNote.name}) と ${intervalName} で衝突`;

        collisions.push({
          otherNoteId: otherNote.id,
          otherPitch: otherNote.pitch,
          otherPitchName: otherNote.name,
          otherTrackName,
          intervalSemitones: semitoneDist,
          intervalName,
          description: clashDesc,
        });

        if (nctResult.type === 'none' && !relation.isChordTone) {
          score += settings.collisionPenalty;
        }
        reasons.push(clashDesc);
        categorized.collision.push(clashDesc);
      }
    }
  }

  let clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // 6. 不確実性の伝播 (Uncertainty Propagation - Phase I)
  // If Chord Confidence < 50% or N.C. / UNKNOWN, cap warning at CHECK
  const isLowConfidence = currentSegment.confidence < 50 || currentSegment.type === 'nc' || currentSegment.type === 'unknown';
  if (isLowConfidence && clampedScore >= RISK_THRESHOLDS.WARNING_MIN) {
    clampedScore = RISK_THRESHOLDS.CHECK_MAX;
    const r = 'コード推定自体の確信度が低いため要確認 (Uncertain Harmony Context)';
    reasons.push(r);
    categorized.harmony.push(r);
  }

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
    categorizedReasons: categorized,
    suggestions: [],
    collisions,
    positionDescription: meter.description,
    durationDescription: durationDesc,
    resolutionDescription: nctResult.resolutionDescription,
  };
}
