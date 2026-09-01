import {
  ALL_CHORD_TYPES,
  CHORD_DEFINITIONS,
  formatChordName,
} from '../music/chords';
import { CHORD_TEMPLATES } from './chordTemplates';
import { pitchClassToName } from '../music/pitch';
import {
  AnalysisResolution,
  AnalysisSettings,
  ChordAnalysisSpan,
  ChordCandidate,
  ChordSegment,
  ChordType,
  KeyContext,
} from '../types/analysis';
import { NoteData, TimeSignatureInfo, TrackData } from '../types/midi';
import {
  buildMeterMap,
  getBarStartTicks,
  getMeterPosition,
  getTimeSignatureAtTicks,
  MeterRegion,
} from '../music/meter';
import { getKeyCompatibilityBonus } from '../music/keyDetection';

function getDurationWeight(durationTicks: number, ppq: number): number {
  const beats = durationTicks / ppq;
  if (beats < 0.25) return 0.2; // 16th note or shorter
  if (beats < 0.5) return 0.5; // 8th note
  if (beats < 1.0) return 0.8; // dotted 8th / quarter
  if (beats <= 2.0) return 1.0; // 1-2 beats
  return 1.2; // sustained chord
}

function getRoleWeight(track?: TrackData): number {
  if (!track) return 1.0;
  const role = track.settings.role;
  if (role === 'chord_guide') return 2.0;
  if (role === 'bass') return 1.2;
  if (role === 'harmony') return 1.1;
  if (role === 'melody') return 0.9;
  if (role === 'percussion' || role === 'keyswitch' || role === 'ignore') return 0;
  return 1.0;
}

function getTicksPerSegment(resolution: AnalysisResolution, ppq: number, timeSignature: { numerator: number; denominator: number }): number {
  switch (resolution) {
    case '1/4_beat':
      return Math.round(ppq / 4);
    case '1/2_beat':
      return Math.round(ppq / 2);
    case '1_beat':
      return ppq;
    case '2_beats':
      return ppq * 2;
    case '1_bar':
      return ppq * (4 / timeSignature.denominator) * timeSignature.numerator;
    default:
      return ppq;
  }
}

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;
  for (let i = 0; i < 12; i++) {
    dot += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  if (mag1 === 0 || mag2 === 0) return 0;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

export interface SpanWindow {
  startTicks: number;
  endTicks: number;
  barIndex: number;
  beatIndex: number;
}

/**
 * Generates exact musical windows according to MeterMap (variable time signature aware)
 */
export function generateSpanWindows(
  meterMap: MeterRegion[],
  maxTicks: number,
  span: ChordAnalysisSpan,
  ppq: number
): SpanWindow[] {
  const windows: SpanWindow[] = [];
  if (!meterMap || meterMap.length === 0) {
    const barTicks = ppq * 4;
    let t = 0;
    while (t < maxTicks) {
      windows.push({ startTicks: t, endTicks: Math.min(maxTicks, t + barTicks), barIndex: Math.floor(t / barTicks) + 1, beatIndex: 1 });
      t += barTicks;
    }
    return windows;
  }

  interface BarInfo {
    barIndex: number;
    startTicks: number;
    endTicks: number;
    numerator: number;
    denominator: number;
    ticksPerBeat: number;
    ticksPerBar: number;
  }

  const bars: BarInfo[] = [];
  meterMap.forEach(region => {
    let tick = region.startTicks;
    let b = 0;
    while (tick < region.endTicks && tick < maxTicks) {
      const bEnd = Math.min(region.endTicks, tick + region.ticksPerBar);
      bars.push({
        barIndex: region.startBar + b,
        startTicks: tick,
        endTicks: bEnd,
        numerator: region.numerator,
        denominator: region.denominator,
        ticksPerBeat: region.ticksPerBeat,
        ticksPerBar: region.ticksPerBar,
      });
      tick += region.ticksPerBar;
      b++;
    }
  });

  if (bars.length === 0) {
    return [{ startTicks: 0, endTicks: maxTicks, barIndex: 1, beatIndex: 1 }];
  }

  if (span === 'half_bar') {
    bars.forEach(bar => {
      const halfTicks = Math.round(bar.ticksPerBar / 2);
      const mid = bar.startTicks + halfTicks;
      if (mid < bar.endTicks) {
        windows.push({ startTicks: bar.startTicks, endTicks: mid, barIndex: bar.barIndex, beatIndex: 1 });
        const midBeat = Math.floor(bar.numerator / 2) + 1;
        windows.push({ startTicks: mid, endTicks: bar.endTicks, barIndex: bar.barIndex, beatIndex: midBeat });
      } else {
        windows.push({ startTicks: bar.startTicks, endTicks: bar.endTicks, barIndex: bar.barIndex, beatIndex: 1 });
      }
    });
  } else if (span === 'one_bar') {
    bars.forEach(bar => {
      windows.push({ startTicks: bar.startTicks, endTicks: bar.endTicks, barIndex: bar.barIndex, beatIndex: 1 });
    });
  } else if (span === 'two_bars') {
    for (let i = 0; i < bars.length; i += 2) {
      const b1 = bars[i];
      const b2 = (i + 1 < bars.length) ? bars[i + 1] : b1;
      windows.push({
        startTicks: b1.startTicks,
        endTicks: b2.endTicks,
        barIndex: b1.barIndex,
        beatIndex: 1,
      });
    }
  } else if (span === 'four_bars') {
    for (let i = 0; i < bars.length; i += 4) {
      const b1 = bars[i];
      const lastBarIdx = Math.min(bars.length - 1, i + 3);
      const bEnd = bars[lastBarIdx];
      windows.push({
        startTicks: b1.startTicks,
        endTicks: bEnd.endTicks,
        barIndex: b1.barIndex,
        beatIndex: 1,
      });
    }
  }

  return windows;
}

/**
 * Evaluates candidate chords for a given pitch profile, lowest bass pitch, and key context
 */
export function scoreChordCandidates(
  pitchProfile: number[],
  lowestBassPc: number,
  prevRoot: number | null = null,
  prevType: ChordType | null = null,
  keyContext?: KeyContext
): ChordCandidate[] {
  const candidates: ChordCandidate[] = [];

  for (let root = 0; root < 12; root++) {
    const rootName = pitchClassToName(root);

    for (const chordType of ALL_CHORD_TYPES) {
      const def = CHORD_DEFINITIONS[chordType];
      const template = CHORD_TEMPLATES[chordType];
      let score = 0;

      // 1. Template matching with weighted pitch profile
      for (let interval = 0; interval < 12; interval++) {
        const pc = (root + interval) % 12;
        const pcWeight = pitchProfile[pc];
        const templateWeight = template.weights[interval];

        if (pcWeight > 0) {
          score += pcWeight * templateWeight;
        }
      }

      // Penalty for missing essential chord tones
      for (const interval of def.intervals) {
        const pc = (root + interval) % 12;
        if (pitchProfile[pc] <= 0.01) {
          score -= (interval === 3 || interval === 4) ? 1.4 : 0.8;
        }
      }

      // 2. Root presence bonus
      const rootWeight = pitchProfile[root];
      if (rootWeight > 0) {
        score += rootWeight * 1.5;
      }

      // 3. Bass alignment bonus
      let chosenBass = root;
      if (lowestBassPc >= 0) {
        chosenBass = lowestBassPc;
        if (lowestBassPc === root) {
          score += 2.0;
        } else {
          const bassInterval = ((lowestBassPc - root) % 12 + 12) % 12;
          if (def.intervals.includes(bassInterval)) {
            score += 1.0;
          } else {
            score -= 1.8;
          }
        }
      }

      // 4. Harmonic stability / persistence bonus
      if (prevRoot !== null && prevRoot === root && prevType === chordType) {
        score += 0.8;
      }

      // 5. Key compatibility tie-breaker bonus
      if (keyContext) {
        score += getKeyCompatibilityBonus(root, chordType, keyContext);
      }

      // 6. Complexity weighting
      if (chordType === 'sus2' || chordType === 'sus4') {
        score -= 0.6;
      } else if (chordType === 'dim' || chordType === 'aug') {
        score -= 0.4;
      } else if (def.intervals.length >= 4) {
        const hasExtension = def.intervals.slice(3).some(inv => pitchProfile[(root + inv) % 12] > 0.1);
        if (!hasExtension) {
          score -= 1.2;
        }
      }

      const bassName = pitchClassToName(chosenBass);
      const displayName = formatChordName(root, chordType, chosenBass);

      candidates.push({
        root,
        rootName,
        type: chordType,
        typeName: def.name,
        bass: chosenBass,
        bassName,
        displayName,
        score,
        confidence: 0,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const topScore = candidates[0].score;
  const secondScore = candidates.length > 1 ? candidates[1].score : 0;
  const diff = topScore - secondScore;
  
  let confidence = 75;
  if (topScore > 0) {
    confidence = Math.round(60 + (diff / (Math.abs(topScore) + 0.1)) * 38);
    confidence = Math.max(40, Math.min(98, confidence));
  }

  return candidates.slice(0, 5).map((c, idx) => ({
    ...c,
    confidence: idx === 0 ? confidence : Math.max(10, Math.min(90, Math.round(confidence * Math.max(0, (c.score / Math.max(0.1, topScore)))))),
  }));
}

export function detectChords(
  notes: NoteData[],
  tracks: TrackData[],
  ppq: number,
  totalDurationTicks: number,
  timeSignatures: TimeSignatureInfo[],
  settings: AnalysisSettings,
  existingSegments: ChordSegment[] = [],
  keyContext?: KeyContext
): ChordSegment[] {
  const trackMap = new Map<number, TrackData>();
  for (const t of tracks) {
    trackMap.set(t.id, t);
  }

  // Preserve manual overrides
  const overrideMap = new Map<string, ChordSegment>();
  for (const seg of existingSegments) {
    if (seg.manualOverride) {
      overrideMap.set(`${seg.startTicks}_${seg.endTicks}`, seg);
    }
  }

  const chordGuideTrack = tracks.find(t => t.settings.role === 'chord_guide' && t.notes.length > 0);
  const useChordGuide = (settings.harmonySourceMode === 'chord_guide_only' || settings.harmonySourceMode === 'chord_guide_preferred') && chordGuideTrack;
  const maxTicks = Math.max(totalDurationTicks, ppq * 4);
  const meterMap = buildMeterMap(timeSignatures, ppq, maxTicks);

  // -------------------------------------------------------------
  // Priority 1: Chord Guide Processing with Onset Clustering (Phase C)
  // -------------------------------------------------------------
  if (useChordGuide && chordGuideTrack) {
    const sortedGuideNotes = [...chordGuideTrack.notes].sort((a, b) => a.startTicks - b.startTicks);
    const clusterTolerance = Math.max(30, Math.round(ppq / 64)); // ~30 ticks

    interface ChordCluster {
      startTicks: number;
      endTicks: number;
      notes: NoteData[];
    }

    const clusters: ChordCluster[] = [];
    let currentClusterNotes: NoteData[] = [];
    let clusterAnchorTick = -1;

    sortedGuideNotes.forEach(note => {
      if (clusterAnchorTick === -1) {
        clusterAnchorTick = note.startTicks;
        currentClusterNotes = [note];
      } else if (Math.abs(note.startTicks - clusterAnchorTick) <= clusterTolerance) {
        currentClusterNotes.push(note);
      } else {
        // Finalize previous cluster
        clusters.push({
          startTicks: clusterAnchorTick,
          endTicks: currentClusterNotes.reduce((max, n) => Math.max(max, n.endTicks), clusterAnchorTick + ppq),
          notes: currentClusterNotes,
        });
        clusterAnchorTick = note.startTicks;
        currentClusterNotes = [note];
      }
    });

    if (currentClusterNotes.length > 0) {
      clusters.push({
        startTicks: clusterAnchorTick,
        endTicks: currentClusterNotes.reduce((max, n) => Math.max(max, n.endTicks), clusterAnchorTick + ppq),
        notes: currentClusterNotes,
      });
    }

    // Build contiguous segments spanning until the next cluster onset
    const segments: ChordSegment[] = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const startTicks = cluster.startTicks;
      const nextClusterStart = (i < clusters.length - 1) ? clusters[i + 1].startTicks : maxTicks;
      const endTicks = Math.max(startTicks + Math.round(ppq / 2), nextClusterStart);

      // Fill gap before first cluster if needed
      if (i === 0 && startTicks > 0) {
        const gapMeter = getMeterPosition(0, ppq, timeSignatures);
        if (settings.harmonySourceMode === 'chord_guide_only') {
          segments.push({
            id: `seg_0`,
            startTicks: 0,
            endTicks: startTicks,
            startSeconds: 0,
            endSeconds: startTicks / ppq * 0.5,
            barIndex: gapMeter.bar,
            beatIndex: gapMeter.beat,
            root: 0,
            rootName: 'N.C.',
            type: 'nc',
            typeName: 'No Chord',
            bass: 0,
            bassName: 'N.C.',
            displayName: 'N.C.',
            confidence: 0,
            candidates: [],
            manualOverride: false,
            sourceType: 'GUIDE',
          });
        }
      }

      const meter = getMeterPosition(startTicks, ppq, timeSignatures);
      const profile = new Array(12).fill(0);
      let lowestPitch = 999;
      let lowestPc = -1;

      cluster.notes.forEach(n => {
        profile[n.pitchClass] += 1.0;
        if (n.pitch < lowestPitch) {
          lowestPitch = n.pitch;
          lowestPc = n.pitchClass;
        }
      });

      const candidates = scoreChordCandidates(profile, lowestPc, null, null, keyContext);
      const best = candidates[0];

      segments.push({
        id: `seg_${startTicks}`,
        startTicks,
        endTicks,
        startSeconds: startTicks / ppq * 0.5,
        endSeconds: endTicks / ppq * 0.5,
        barIndex: meter.bar,
        beatIndex: meter.beat,
        root: best.root,
        rootName: best.rootName,
        type: best.type,
        typeName: best.typeName,
        bass: best.bass,
        bassName: best.bassName,
        displayName: best.displayName,
        confidence: 98,
        candidates,
        manualOverride: false,
        sourceType: 'GUIDE',
      });
    }

    if (segments.length > 0) {
      return segments;
    }
  }

  // Pre-filter harmonic notes
  const harmonicNotes = notes.filter(n => {
    const trk = trackMap.get(n.trackId);
    if (!trk || trk.settings.ignore) return false;
    if (
      trk.settings.role === 'ignore' ||
      trk.settings.role === 'keyswitch' ||
      trk.settings.role === 'percussion' ||
      trk.settings.role === 'chord_guide'
    ) {
      return false;
    }
    if (n.pitch < trk.settings.analysisMinPitch || n.pitch > trk.settings.analysisMaxPitch) {
      return false;
    }
    return true;
  });

  // Build temporal bucket index for harmonic notes (1 bucket = 1/2 beat)
  const harmonicBucketSize = Math.max(120, Math.round(ppq / 2));
  const harmonicBuckets = new Map<number, NoteData[]>();

  harmonicNotes.forEach(n => {
    const sb = Math.floor(n.startTicks / harmonicBucketSize);
    const eb = Math.floor(n.endTicks / harmonicBucketSize);
    for (let b = sb; b <= eb; b++) {
      if (!harmonicBuckets.has(b)) harmonicBuckets.set(b, []);
      harmonicBuckets.get(b)!.push(n);
    }
  });

  const spanMode = settings.chordAnalysisSpan || 'auto';

  // -------------------------------------------------------------
  // Priority 2: Manual Span Mode (half_bar, one_bar, two_bars, four_bars)
  // -------------------------------------------------------------
  if (spanMode !== 'auto') {
    const spanWindows = generateSpanWindows(meterMap, maxTicks, spanMode, ppq);
    const spanSegments: ChordSegment[] = [];
    let prevRoot: number | null = null;
    let prevType: ChordType | null = null;

    for (let i = 0; i < spanWindows.length; i++) {
      const win = spanWindows[i];
      const winTicks = win.endTicks - win.startTicks;
      if (winTicks <= 0) continue;

      // Check manual override (Phase G / Section 24)
      const segKey = `${win.startTicks}_${win.endTicks}`;
      const manualSeg = overrideMap.get(segKey) || existingSegments.find(
        s => s.manualOverride &&
             ((s.startTicks <= win.startTicks && s.endTicks >= win.endTicks) ||
              (win.startTicks <= s.startTicks && win.endTicks >= s.endTicks) ||
              Math.abs(s.startTicks - win.startTicks) <= 60)
      );

      if (manualSeg) {
        spanSegments.push({
          ...manualSeg,
          startTicks: win.startTicks,
          endTicks: win.endTicks,
          barIndex: win.barIndex,
          beatIndex: win.beatIndex,
          sourceType: 'MANUAL',
        });
        prevRoot = manualSeg.root;
        prevType = manualSeg.type;
        continue;
      }

      const pitchProfile = new Array(12).fill(0);
      let lowestBassPitch = 999;
      let lowestBassPc = -1;
      let totalWeight = 0;

      const startBucket = Math.floor(win.startTicks / harmonicBucketSize);
      const endBucket = Math.floor(win.endTicks / harmonicBucketSize);
      const windowNotesSeen = new Set<string>();

      for (let b = startBucket; b <= endBucket; b++) {
        const bucketNotes = harmonicBuckets.get(b);
        if (!bucketNotes) continue;

        for (let k = 0; k < bucketNotes.length; k++) {
          const note = bucketNotes[k];
          if (windowNotesSeen.has(note.id)) continue;
          windowNotesSeen.add(note.id);

          const overlapStart = Math.max(win.startTicks, note.startTicks);
          const overlapEnd = Math.min(win.endTicks, note.endTicks);
          if (overlapEnd <= overlapStart) continue;

          const track = trackMap.get(note.trackId);
          const overlapTicks = overlapEnd - overlapStart;
          const overlapRatio = overlapTicks / winTicks;

          let durWeight = getDurationWeight(note.durationTicks, ppq);
          if (!settings.reduceShortNoteInfluence) durWeight = 1.0;

          const roleWeight = getRoleWeight(track);
          if (roleWeight <= 0) continue;

          const velWeight = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity));
          const noteMeter = getMeterPosition(note.startTicks, ppq, timeSignatures);
          const noteWeight = durWeight * velWeight * noteMeter.metricWeight * roleWeight * overlapRatio;

          pitchProfile[note.pitchClass] += noteWeight;
          totalWeight += noteWeight;

          const isBassTrack = track?.settings.role === 'bass' || track?.settings.detectedRole === 'bass';
          if (isBassTrack) {
            if (note.pitch < lowestBassPitch) {
              lowestBassPitch = note.pitch;
              lowestBassPc = note.pitchClass;
            }
          } else if (lowestBassPitch === 999 || note.pitch < lowestBassPitch) {
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        }
      }

      if (totalWeight < 0.001) {
        const fallbackRoot = prevRoot !== null ? prevRoot : 0;
        const fallbackType = prevType !== null ? prevType : 'maj';
        const rootName = pitchClassToName(fallbackRoot);
        const displayName = formatChordName(fallbackRoot, fallbackType);

        spanSegments.push({
          id: `seg_${win.startTicks}`,
          startTicks: win.startTicks,
          endTicks: win.endTicks,
          startSeconds: win.startTicks / ppq * 0.5,
          endSeconds: win.endTicks / ppq * 0.5,
          barIndex: win.barIndex,
          beatIndex: win.beatIndex,
          root: fallbackRoot,
          rootName,
          type: fallbackType,
          typeName: CHORD_DEFINITIONS[fallbackType].name,
          bass: fallbackRoot,
          bassName: rootName,
          displayName,
          confidence: 0,
          candidates: [],
          manualOverride: false,
          sourceType: 'AUTO',
        });
        continue;
      }

      const top5 = scoreChordCandidates(pitchProfile, lowestBassPc, prevRoot, prevType, keyContext);
      const best = top5[0];

      spanSegments.push({
        id: `seg_${win.startTicks}`,
        startTicks: win.startTicks,
        endTicks: win.endTicks,
        startSeconds: win.startTicks / ppq * 0.5,
        endSeconds: win.endTicks / ppq * 0.5,
        barIndex: win.barIndex,
        beatIndex: win.beatIndex,
        root: best.root,
        rootName: best.rootName,
        type: best.type,
        typeName: best.typeName,
        bass: best.bass,
        bassName: best.bassName,
        displayName: best.displayName,
        confidence: best.confidence,
        candidates: top5,
        manualOverride: false,
        sourceType: 'AUTO',
      });

      prevRoot = best.root;
      prevType = best.type;
    }

    return spanSegments;
  }

  // -------------------------------------------------------------
  // Priority 3: Adaptive / Grid Mode with Harmonic Smoothing
  // -------------------------------------------------------------
  const minSegmentTicks = settings.minSegmentLength === '1/4_beat'
    ? Math.round(ppq / 4)
    : settings.minSegmentLength === '1_beat'
    ? ppq
    : Math.round(ppq / 2);

  const changePointsSet = new Set<number>();
  changePointsSet.add(0);

  if (settings.segmentationMode === 'adaptive') {
    const sortedHarmonic = [...harmonicNotes].sort((a, b) => a.startTicks - b.startTicks);
    let lastTick = -9999;
    sortedHarmonic.forEach(n => {
      if (n.startTicks - lastTick >= minSegmentTicks) {
        changePointsSet.add(n.startTicks);
        lastTick = n.startTicks;
      }
    });

    const barStarts = getBarStartTicks(meterMap, maxTicks);
    barStarts.forEach(tick => changePointsSet.add(tick));
  } else {
    let gridTick = 0;
    while (gridTick < maxTicks) {
      const timeSig = getTimeSignatureAtTicks(gridTick, timeSignatures);
      const segTicks = getTicksPerSegment(settings.resolution, ppq, timeSig);
      changePointsSet.add(gridTick);
      gridTick += segTicks;
    }
  }

  changePointsSet.add(maxTicks);
  const changePoints = Array.from(changePointsSet).sort((a, b) => a - b);

  const rawSegments: {
    startTicks: number;
    endTicks: number;
    profile: number[];
    lowestBassPc: number;
    totalWeight: number;
  }[] = [];

  for (let i = 0; i < changePoints.length - 1; i++) {
    const startTicks = changePoints[i];
    const endTicks = changePoints[i + 1];
    if (endTicks - startTicks < Math.min(120, minSegmentTicks)) continue;

    const sliceTicks = endTicks - startTicks;
    const pitchProfile = new Array(12).fill(0);
    let lowestBassPitch = 999;
    let lowestBassPc = -1;
    let totalWeight = 0;

    const startBucket = Math.floor(startTicks / harmonicBucketSize);
    const endBucket = Math.floor(endTicks / harmonicBucketSize);
    const sliceNotesSeen = new Set<string>();

    for (let b = startBucket; b <= endBucket; b++) {
      const bucketNotes = harmonicBuckets.get(b);
      if (!bucketNotes) continue;

      for (let k = 0; k < bucketNotes.length; k++) {
        const note = bucketNotes[k];
        if (sliceNotesSeen.has(note.id)) continue;
        sliceNotesSeen.add(note.id);

        const overlapStart = Math.max(startTicks, note.startTicks);
        const overlapEnd = Math.min(endTicks, note.endTicks);
        if (overlapEnd <= overlapStart) continue;

        const track = trackMap.get(note.trackId);
        const overlapTicks = overlapEnd - overlapStart;
        const overlapRatio = overlapTicks / sliceTicks;

        let durWeight = getDurationWeight(note.durationTicks, ppq);
        if (!settings.reduceShortNoteInfluence) durWeight = 1.0;

        const roleWeight = getRoleWeight(track);
        if (roleWeight <= 0) continue;

        const velWeight = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity));
        const noteMeter = getMeterPosition(note.startTicks, ppq, timeSignatures);
        const noteWeight = durWeight * velWeight * noteMeter.metricWeight * roleWeight * overlapRatio;

        pitchProfile[note.pitchClass] += noteWeight;
        totalWeight += noteWeight;

        const isBassTrack = track?.settings.role === 'bass' || track?.settings.detectedRole === 'bass';
        if (isBassTrack) {
          if (note.pitch < lowestBassPitch) {
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        } else if (lowestBassPitch === 999 || note.pitch < lowestBassPitch) {
          lowestBassPitch = note.pitch;
          lowestBassPc = note.pitchClass;
        }
      }
    }

    rawSegments.push({
      startTicks,
      endTicks,
      profile: pitchProfile,
      lowestBassPc,
      totalWeight,
    });
  }

  // Merge Similar Slices using Harmonic Similarity & Hysteresis
  const mergedSegments: typeof rawSegments = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const curr = rawSegments[i];
    if (mergedSegments.length === 0) {
      mergedSegments.push({ ...curr });
      continue;
    }

    const prev = mergedSegments[mergedSegments.length - 1];
    const similarity = cosineSimilarity(prev.profile, curr.profile);

    if (similarity > 0.85 || curr.totalWeight < 0.05) {
      prev.endTicks = curr.endTicks;
      for (let p = 0; p < 12; p++) {
        prev.profile[p] += curr.profile[p];
      }
      prev.totalWeight += curr.totalWeight;
      if (prev.lowestBassPc < 0 && curr.lowestBassPc >= 0) {
        prev.lowestBassPc = curr.lowestBassPc;
      }
    } else {
      mergedSegments.push({ ...curr });
    }
  }

  const finalSegments: ChordSegment[] = [];
  let prevRoot: number | null = null;
  let prevType: ChordType | null = null;

  for (let i = 0; i < mergedSegments.length; i++) {
    const seg = mergedSegments[i];
    const meter = getMeterPosition(seg.startTicks, ppq, timeSignatures);

    // Check manual override (Phase G / Section 24)
    const segKey = `${seg.startTicks}_${seg.endTicks}`;
    const manualSeg = overrideMap.get(segKey) || existingSegments.find(
      s => s.manualOverride &&
           ((s.startTicks <= seg.startTicks && s.endTicks >= seg.endTicks) ||
            (seg.startTicks <= s.startTicks && seg.endTicks >= s.endTicks) ||
            Math.abs(s.startTicks - seg.startTicks) <= 60)
    );

    if (manualSeg) {
      finalSegments.push({
        ...manualSeg,
        startTicks: seg.startTicks,
        endTicks: seg.endTicks,
        barIndex: meter.bar,
        beatIndex: meter.beat,
        sourceType: 'MANUAL',
      });
      prevRoot = manualSeg.root;
      prevType = manualSeg.type;
      continue;
    }

    if (seg.totalWeight < 0.001) {
      const fallbackRoot = prevRoot !== null ? prevRoot : 0;
      const fallbackType = prevType !== null ? prevType : 'maj';
      const rootName = pitchClassToName(fallbackRoot);
      const displayName = formatChordName(fallbackRoot, fallbackType);

      finalSegments.push({
        id: `seg_${seg.startTicks}`,
        startTicks: seg.startTicks,
        endTicks: seg.endTicks,
        startSeconds: seg.startTicks / ppq * 0.5,
        endSeconds: seg.endTicks / ppq * 0.5,
        barIndex: meter.bar,
        beatIndex: meter.beat,
        root: fallbackRoot,
        rootName,
        type: fallbackType,
        typeName: CHORD_DEFINITIONS[fallbackType].name,
        bass: fallbackRoot,
        bassName: rootName,
        displayName,
        confidence: 0,
        candidates: [],
        manualOverride: false,
        sourceType: 'AUTO',
      });
      continue;
    }

    const top5 = scoreChordCandidates(seg.profile, seg.lowestBassPc, prevRoot, prevType, keyContext);
    let best = top5[0];

    // Harmonic Smoothing (Phase E & F: Core tone stability vs transient tension/melody notes)
    if (prevRoot !== null && prevType !== null && (best.root !== prevRoot || best.type !== prevType)) {
      const prevCand = top5.find(c => c.root === prevRoot && c.type === prevType);
      if (prevCand) {
        const scoreDiff = best.score - prevCand.score;
        const sameRoot = best.root === prevRoot;
        const sameBass = best.bass === prevCand.bass;

        // If score difference is marginal (< 1.6) and root/bass has not distinctly shifted to a new functional harmony
        if (scoreDiff < 1.6 && (sameRoot || (sameBass && scoreDiff < 1.2))) {
          best = prevCand;
        }
      }
    }

    finalSegments.push({
      id: `seg_${seg.startTicks}`,
      startTicks: seg.startTicks,
      endTicks: seg.endTicks,
      startSeconds: seg.startTicks / ppq * 0.5,
      endSeconds: seg.endTicks / ppq * 0.5,
      barIndex: meter.bar,
      beatIndex: meter.beat,
      root: best.root,
      rootName: best.rootName,
      type: best.type,
      typeName: best.typeName,
      bass: best.bass,
      bassName: best.bassName,
      displayName: best.displayName,
      confidence: best.confidence,
      candidates: top5,
      manualOverride: false,
      sourceType: 'AUTO',
    });

    prevRoot = best.root;
    prevType = best.type;
  }

  return finalSegments;
}
