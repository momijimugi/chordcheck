import { AnalysisSettings, ChordSegment, NoteAnalysis, RiskLevel } from '../types/analysis';
import { MidiData, NoteData, TrackData } from '../types/midi';
import { detectChords } from './chordDetection';
import { calculateNoteRisk } from './riskScoring';
import { generateNoteSuggestions } from './suggestionEngine';

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

  const analyses = new Map<string, NoteAnalysis>();
  const statusCounts = {
    SAFE: 0,
    INFO: 0,
    CHECK: 0,
    WARNING: 0,
    TOTAL: 0,
  };

  const trackMap = new Map<number, TrackData>();
  for (const t of midiData.tracks) trackMap.set(t.id, t);

  // 2. Map notes to segments and evaluate risk
  for (const note of midiData.notes) {
    const track = trackMap.get(note.trackId);
    if (!track) continue;

    // Find the chord segment that covers the start of this note
    const segmentIndex = segments.findIndex(
      s => note.startTicks >= s.startTicks && note.startTicks < s.endTicks
    );
    const currentSegment = segmentIndex >= 0 ? segments[segmentIndex] : segments[0];
    const prevSegment = segmentIndex > 0 ? segments[segmentIndex - 1] : undefined;
    const nextSegment = segmentIndex >= 0 && segmentIndex < segments.length - 1 ? segments[segmentIndex + 1] : undefined;

    if (!currentSegment) continue;

    // If track is ignored or keyswitch role, classify as SAFE with ignore reason
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
        reasons: [`Track '${track.name}' is set to ${track.settings.role} (Ignored from harmony check)`],
        suggestions: [],
        collisions: [],
        positionDescription: `Bar ${currentSegment.barIndex} Beat ${currentSegment.beatIndex}`,
        durationDescription: `${note.durationTicks} ticks`,
        resolutionDescription: 'Ignored',
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
        reasons: [`Pitch ${note.name} outside active analysis range (${track.settings.analysisMinPitch}-${track.settings.analysisMaxPitch})`],
        suggestions: [],
        collisions: [],
        positionDescription: `Bar ${currentSegment.barIndex} Beat ${currentSegment.beatIndex}`,
        durationDescription: `${note.durationTicks} ticks`,
        resolutionDescription: 'Excluded by range filter',
      });
      statusCounts.SAFE++;
      statusCounts.TOTAL++;
      continue;
    }

    // Evaluate risk
    const noteAnalysis = calculateNoteRisk(
      note,
      track,
      midiData.notes,
      midiData.tracks,
      currentSegment,
      midiData.ppq,
      midiData.timeSignatures,
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
