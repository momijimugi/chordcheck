import { AnalysisResolution, AnalysisSettings, ChordCandidate, ChordSegment, ChordType } from '../types/analysis';
import { NoteData, TrackData, TimeSignatureInfo } from '../types/midi';
import { CHORD_DEFINITIONS, ALL_CHORD_TYPES, formatChordName } from '../music/chords';
import { CHORD_TEMPLATES } from './chordTemplates';
import { pitchClassToName } from '../music/pitch';
import { getMeterPosition, getTimeSignatureAtTicks } from '../music/meter';

export function getDurationWeight(durationTicks: number, ppq: number): number {
  const ratio = durationTicks / ppq;
  if (ratio < 0.0625) return 0.05; // < 1/64
  if (ratio < 0.125) return 0.15;  // 1/32
  if (ratio < 0.25) return 0.35;   // 1/16
  if (ratio < 0.5) return 0.65;    // 1/8
  return 1.0;                      // >= 1/4
}

export function getRoleWeight(track?: TrackData): number {
  if (!track) return 1.0;
  const role = track.settings.role === 'auto' ? (track.settings.detectedRole || 'auto') : track.settings.role;
  
  if (track.settings.ignore) return 0;
  switch (role) {
    case 'bass': return 1.5;
    case 'harmony': return 1.1;
    case 'melody': return 0.6;
    case 'chord_guide': return 0; // Chord Guide is evaluated directly
    case 'percussion': return 0;
    case 'keyswitch': return 0;
    case 'ignore': return 0;
    case 'auto':
    default:
      return 1.0;
  }
}

export function getTicksPerSegment(
  resolution: AnalysisResolution,
  ppq: number,
  timeSig: { numerator: number; denominator: number }
): number {
  const beatTicks = ppq * (4 / timeSig.denominator);
  switch (resolution) {
    case '1/4_beat': return Math.max(1, Math.round(beatTicks / 4));
    case '1/2_beat': return Math.max(1, Math.round(beatTicks / 2));
    case '1_beat': return beatTicks;
    case '2_beats': return beatTicks * 2;
    case '1_bar': return beatTicks * timeSig.numerator;
    default: return beatTicks;
  }
}

export function cosineSimilarity(v1: number[], v2: number[]): number {
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;
  for (let i = 0; i < 12; i++) {
    dot += v1[i] * v2[i];
    mag1 += v1[i] * v1[i];
    mag2 += v2[i] * v2[i];
  }
  if (mag1 === 0 || mag2 === 0) return 0;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Evaluates candidate chords for a given pitch profile and lowest bass pitch
 */
export function scoreChordCandidates(
  pitchProfile: number[],
  lowestBassPc: number,
  prevRoot: number | null = null,
  prevType: ChordType | null = null
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

      // 5. Complexity weighting
      if (chordType === 'sus2' || chordType === 'sus4') {
        score -= 0.6;
      } else if (chordType === 'dim' || chordType === 'aug') {
        score -= 0.4;
      } else if (chordType.length >= 3 && def.intervals.length >= 4) {
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
  existingSegments: ChordSegment[] = []
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

  // -------------------------------------------------------------
  // Phase C: Hardened Chord Guide Processing with Onset Clustering
  // -------------------------------------------------------------
  if (useChordGuide && chordGuideTrack) {
    const sortedGuideNotes = [...chordGuideTrack.notes].sort((a, b) => a.startTicks - b.startTicks);
    const clusterTolerance = Math.max(30, Math.round(ppq / 64)); // ~30 ticks

    // Group guide notes into onset clusters
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
      // Duration spans until next chord onset, or project maxTicks for the last cluster
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

      const candidates = scoreChordCandidates(profile, lowestPc);
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

  // -------------------------------------------------------------
  // Phase G: Adaptive & Fixed Grid Chord Detection
  // -------------------------------------------------------------
  const minSegmentTicks = settings.minSegmentLength === '1/4_beat'
    ? Math.round(ppq / 4)
    : settings.minSegmentLength === '1_beat'
    ? ppq
    : Math.round(ppq / 2); // Default 1/2 beat

  // Collect candidate change points
  const changePointsSet = new Set<number>();
  changePointsSet.add(0);

  if (settings.segmentationMode === 'adaptive') {
    // Multi-track onsets & Bass changes
    const sortedNotes = [...notes]
      .filter(n => {
        const trk = trackMap.get(n.trackId);
        return trk && !trk.settings.ignore && trk.settings.role !== 'percussion' && trk.settings.role !== 'keyswitch';
      })
      .sort((a, b) => a.startTicks - b.startTicks);

    let lastTick = -9999;
    sortedNotes.forEach(n => {
      if (n.startTicks - lastTick >= minSegmentTicks) {
        changePointsSet.add(n.startTicks);
        lastTick = n.startTicks;
      }
    });

    // Also add measure downbeats
    let barTick = 0;
    while (barTick < maxTicks) {
      changePointsSet.add(barTick);
      barTick += ppq * 4;
    }
  } else {
    // Fixed grid
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

    for (let j = 0; j < notes.length; j++) {
      const note = notes[j];
      const track = trackMap.get(note.trackId);
      if (track) {
        if (track.settings.ignore) continue;
        if (track.settings.role === 'ignore' || track.settings.role === 'keyswitch' || track.settings.role === 'percussion' || track.settings.role === 'chord_guide') continue;
        if (note.pitch < track.settings.analysisMinPitch || note.pitch > track.settings.analysisMaxPitch) continue;
      }

      const overlapStart = Math.max(startTicks, note.startTicks);
      const overlapEnd = Math.min(endTicks, note.endTicks);
      if (overlapEnd <= overlapStart) continue;

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

    // If slices have similar harmonic profile (> 0.85) or curr slice has almost no notes, merge into prev
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

    // Check manual override
    const segKey = `${seg.startTicks}_${seg.endTicks}`;
    const manualSeg = overrideMap.get(segKey);
    if (manualSeg) {
      finalSegments.push({
        ...manualSeg,
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

    const top5 = scoreChordCandidates(seg.profile, seg.lowestBassPc, prevRoot, prevType);
    const best = top5[0];

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
