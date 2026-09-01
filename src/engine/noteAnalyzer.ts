import { AnalysisSettings, ChordSegment, NoteAnalysis } from '../types/analysis';
import { MidiData } from '../types/midi';
import { detectChords } from './chordDetection';
import { calculateNoteRisk } from './riskScoring';
import { generateNoteSuggestions } from './suggestionEngine';
import { buildAnalysisContext, findSegmentAtTicksFast } from './analysisContext';

export interface FullAnalysisResult {
  segments: ChordSegment[];
  analyses: Map<string, NoteAnalysis>;
  statusCounts: {
    SAFE: number;
    INFO: number;
    CHECK: number;
    WARNING: number;
    TOTAL: number;
  };
}

export function analyzeMidi(
  midiData: MidiData,
  settings: AnalysisSettings,
  existingSegments: ChordSegment[] = []
): FullAnalysisResult {
  // 1. Detect chords across timeline
  const segments = detectChords(
    midiData.notes,
    midiData.tracks,
    midiData.ppq,
    midiData.durationTicks,
    midiData.timeSignatures,
    settings,
    existingSegments
  );

  // 2. Build High-Performance AnalysisContext
  const context = buildAnalysisContext(
    midiData.tracks,
    midiData.notes,
    segments,
    midiData.ppq,
    midiData.timeSignatures
  );

  const analyses = new Map<string, NoteAnalysis>();
  const statusCounts = {
    SAFE: 0,
    INFO: 0,
    CHECK: 0,
    WARNING: 0,
    TOTAL: 0,
  };

  // 3. Map notes to segments and evaluate risk
  for (let i = 0; i < midiData.notes.length; i++) {
    const note = midiData.notes[i];
    const track = context.trackMap.get(note.trackId);
    if (!track) continue;

    // Phase C: Chord Guide track is the source of truth, excluded from warnings and statusCounts
    if (track.settings.role === 'chord_guide') {
      continue;
    }

    const currentSegment = findSegmentAtTicksFast(context, note.startTicks) || segments[0];
    if (!currentSegment) continue;

    // If track is ignored or percussion/keyswitch role, classify as SAFE
    if (track.settings.ignore || track.settings.role === 'ignore' || track.settings.role === 'percussion' || track.settings.role === 'keyswitch') {
      analyses.set(note.id, {
        noteId: note.id,
        pitch: note.pitch,
        pitchName: note.name,
        trackId: note.trackId,
        trackName: track.name,
        chordSegmentId: currentSegment.id,
        chordDisplayName: currentSegment.displayName,
        relation: {
          intervalFromRoot: 0,
          intervalName: 'Ignored',
          degreeName: '-',
          isChordTone: true,
          isTension: false,
          isAlteredTension: false,
          isNonChordTone: false,
          intervalFromBass: 0,
        },
        nonChordTone: 'none',
        riskScore: 0,
        status: 'SAFE',
        reasons: [`トラック「${track.name}」は${track.settings.role}に設定されているため和声判定から除外`],
        suggestions: [],
        collisions: [],
        positionDescription: `第${currentSegment.barIndex}小節 第${currentSegment.beatIndex}拍`,
        durationDescription: `${note.durationTicks} ticks`,
        resolutionDescription: '除外',
      });
      statusCounts.SAFE++;
      statusCounts.TOTAL++;
      continue;
    }

    // Check if note is out of analysis pitch range
    if (note.pitch < track.settings.analysisMinPitch || note.pitch > track.settings.analysisMaxPitch) {
      analyses.set(note.id, {
        noteId: note.id,
        pitch: note.pitch,
        pitchName: note.name,
        trackId: note.trackId,
        trackName: track.name,
        chordSegmentId: currentSegment.id,
        chordDisplayName: currentSegment.displayName,
        relation: {
          intervalFromRoot: 0,
          intervalName: 'Out of Range',
          degreeName: '-',
          isChordTone: true,
          isTension: false,
          isAlteredTension: false,
          isNonChordTone: false,
          intervalFromBass: 0,
        },
        nonChordTone: 'none',
        riskScore: 0,
        status: 'SAFE',
        reasons: [`音高 ${note.name} は解析音域外 (${track.settings.analysisMinPitch}-${track.settings.analysisMaxPitch}) のため除外`],
        suggestions: [],
        collisions: [],
        positionDescription: `第${currentSegment.barIndex}小節 第${currentSegment.beatIndex}拍`,
        durationDescription: `${note.durationTicks} ticks`,
        resolutionDescription: '音域フィルタにより除外',
      });
      statusCounts.SAFE++;
      statusCounts.TOTAL++;
      continue;
    }

    const segIndex = segments.findIndex(s => s.id === currentSegment.id);
    const prevSegment = segIndex > 0 ? segments[segIndex - 1] : undefined;
    const nextSegment = segIndex >= 0 && segIndex < segments.length - 1 ? segments[segIndex + 1] : undefined;

    // Evaluate risk with O(1) context
    const noteAnalysis = calculateNoteRisk(
      note,
      track,
      context,
      currentSegment,
      settings,
      nextSegment,
      prevSegment
    );

    // Generate pitch suggestions
    noteAnalysis.suggestions = generateNoteSuggestions(note, track.notes, currentSegment);

    analyses.set(note.id, noteAnalysis);
    statusCounts[noteAnalysis.status]++;
    statusCounts.TOTAL++;
  }

  return {
    segments,
    analyses,
    statusCounts,
  };
}
