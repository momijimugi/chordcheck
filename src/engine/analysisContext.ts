import { ChordSegment } from '../types/analysis';
import { NoteData, TrackData, TimeSignatureInfo } from '../types/midi';
import { MeterRegion, buildMeterMap } from '../music/meter';

export interface AnalysisContext {
  ppq: number;
  timeSignatures: TimeSignatureInfo[];
  meterMap: MeterRegion[];
  trackMap: Map<number, TrackData>;
  sortedTrackNotes: Map<number, NoteData[]>;
  noteToTrackIndex: Map<string, number>;
  temporalNoteBuckets: Map<number, NoteData[]>; // bucket index: Math.floor(ticks / ppq)
  segments: ChordSegment[];
}

export function buildAnalysisContext(
  midiTracks: TrackData[],
  allNotes: NoteData[],
  segments: ChordSegment[],
  ppq: number,
  timeSignatures: TimeSignatureInfo[]
): AnalysisContext {
  const durationTicks = allNotes.reduce((max, n) => Math.max(max, n.endTicks), 0);
  const meterMap = buildMeterMap(timeSignatures, ppq, durationTicks);

  const trackMap = new Map<number, TrackData>();
  const sortedTrackNotes = new Map<number, NoteData[]>();
  const noteToTrackIndex = new Map<string, number>();

  midiTracks.forEach(track => {
    trackMap.set(track.id, track);
    // Sort track notes once
    const sorted = [...track.notes].sort((a, b) => a.startTicks - b.startTicks);
    sortedTrackNotes.set(track.id, sorted);

    sorted.forEach((note, idx) => {
      noteToTrackIndex.set(note.id, idx);
    });
  });

  // Spatial Temporal Buckets (1 bucket = 1 beat / PPQ ticks)
  const bucketSize = Math.max(120, ppq);
  const temporalNoteBuckets = new Map<number, NoteData[]>();

  allNotes.forEach(note => {
    const startBucket = Math.floor(note.startTicks / bucketSize);
    const endBucket = Math.floor(note.endTicks / bucketSize);

    for (let b = startBucket; b <= endBucket; b++) {
      if (!temporalNoteBuckets.has(b)) {
        temporalNoteBuckets.set(b, []);
      }
      temporalNoteBuckets.get(b)!.push(note);
    }
  });

  return {
    ppq,
    timeSignatures,
    meterMap,
    trackMap,
    sortedTrackNotes,
    noteToTrackIndex,
    temporalNoteBuckets,
    segments: [...segments].sort((a, b) => a.startTicks - b.startTicks),
  };
}

/**
 * Fast O(1) average lookup for overlapping notes using temporal spatial buckets
 */
export function getOverlappingNotesFast(
  context: AnalysisContext,
  startTicks: number,
  endTicks: number
): NoteData[] {
  const bucketSize = Math.max(120, context.ppq);
  const startBucket = Math.floor(startTicks / bucketSize);
  const endBucket = Math.floor(endTicks / bucketSize);

  const candidateSet = new Set<string>();
  const results: NoteData[] = [];

  for (let b = startBucket; b <= endBucket; b++) {
    const bucketNotes = context.temporalNoteBuckets.get(b);
    if (!bucketNotes) continue;

    for (let i = 0; i < bucketNotes.length; i++) {
      const note = bucketNotes[i];
      if (candidateSet.has(note.id)) continue;
      candidateSet.add(note.id);

      // Check overlap
      if (note.startTicks < endTicks && note.endTicks > startTicks) {
        results.push(note);
      }
    }
  }

  return results;
}

/**
 * Fast Binary Search for chord segment at a given tick
 */
export function findSegmentAtTicksFast(
  context: AnalysisContext,
  ticks: number
): ChordSegment | undefined {
  const segments = context.segments;
  if (segments.length === 0) return undefined;

  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const seg = segments[mid];

    if (ticks >= seg.startTicks && ticks < seg.endTicks) {
      return seg;
    }

    if (ticks < seg.startTicks) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Fallback to nearest segment
  if (ticks < segments[0].startTicks) return segments[0];
  return segments[segments.length - 1];
}

/**
 * Fast O(1) lookup for sequential previous and next notes on the same track
 */
export function getSequentialTrackNotesFast(
  context: AnalysisContext,
  note: NoteData
): { prevNote?: NoteData; nextNote?: NoteData } {
  const trackNotes = context.sortedTrackNotes.get(note.trackId);
  if (!trackNotes) return {};

  const idx = context.noteToTrackIndex.get(note.id);
  if (idx === undefined) return {};

  const prevNote = idx > 0 ? trackNotes[idx - 1] : undefined;
  const nextNote = idx < trackNotes.length - 1 ? trackNotes[idx + 1] : undefined;

  return { prevNote, nextNote };
}
