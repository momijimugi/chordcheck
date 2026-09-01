import { AnalysisResolution, AnalysisSettings, ChordCandidate, ChordSegment, ChordType, HarmonySourceType } from '../types/analysis';
import { NoteData, TrackData, TimeSignatureInfo } from '../types/midi';
import { CHORD_DEFINITIONS, ALL_CHORD_TYPES, formatChordName } from '../music/chords';
import { CHORD_TEMPLATES } from './chordTemplates';
import { pitchClassToName, getPitchClass } from '../music/pitch';
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
    case 'chord_guide': return 0; // Chord Guide is evaluated directly, not mixed into general profile
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

  // Check for Chord Guide track (Section 22 - 28)
  const chordGuideTrack = tracks.find(t => t.settings.role === 'chord_guide' && t.notes.length > 0);
  const useChordGuide = (settings.harmonySourceMode === 'chord_guide_only' || settings.harmonySourceMode === 'chord_guide_preferred') && chordGuideTrack;

  const segments: ChordSegment[] = [];
  const maxTicks = Math.max(totalDurationTicks, ppq * 4);

  // If Chord Guide track is active, generate segments directly from Chord Guide events
  if (useChordGuide && chordGuideTrack) {
    // Cluster Chord Guide notes into distinct event boundaries
    const guideNotes = [...chordGuideTrack.notes].sort((a, b) => a.startTicks - b.startTicks);
    const timePoints = new Set<number>();
    timePoints.add(0);

    guideNotes.forEach(n => {
      timePoints.add(n.startTicks);
      timePoints.add(n.endTicks);
    });
    timePoints.add(maxTicks);

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const startTicks = sortedPoints[i];
      const endTicks = sortedPoints[i + 1];
      if (endTicks - startTicks < ppq / 4) continue; // skip micro slices

      const segKey = `${startTicks}_${endTicks}`;
      const meter = getMeterPosition(startTicks, ppq, timeSignatures);

      // Check manual override
      const manualSeg = overrideMap.get(segKey);
      if (manualSeg) {
        segments.push({
          ...manualSeg,
          barIndex: meter.bar,
          beatIndex: meter.beat,
          sourceType: 'MANUAL',
        });
        continue;
      }

      // Find active notes in Chord Guide track
      const activeGuideNotes = guideNotes.filter(n => Math.max(startTicks, n.startTicks) < Math.min(endTicks, n.endTicks));

      if (activeGuideNotes.length > 0) {
        const profile = new Array(12).fill(0);
        let lowestPitch = 999;
        let lowestPc = -1;

        activeGuideNotes.forEach(n => {
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
          confidence: 98, // Direct high confidence for Chord Guide
          candidates,
          manualOverride: false,
          sourceType: 'GUIDE',
        });
      } else if (settings.harmonySourceMode === 'chord_guide_preferred') {
        // Fallback to auto-detect for gap
        // Build slice profile from all other tracks
        const profile = new Array(12).fill(0);
        let lowestBassPitch = 999;
        let lowestBassPc = -1;

        for (const note of notes) {
          const trk = trackMap.get(note.trackId);
          if (trk?.settings.ignore || trk?.settings.role === 'chord_guide' || trk?.settings.role === 'percussion') continue;
          if (Math.max(startTicks, note.startTicks) < Math.min(endTicks, note.endTicks)) {
            profile[note.pitchClass] += 1.0;
            if (note.pitch < lowestBassPitch) {
              lowestBassPitch = note.pitch;
              lowestBassPc = note.pitchClass;
            }
          }
        }

        const candidates = scoreChordCandidates(profile, lowestBassPc);
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
          confidence: best.confidence,
          candidates,
          manualOverride: false,
          sourceType: 'AUTO',
        });
      }
    }

    if (segments.length > 0) {
      return segments;
    }
  }

  // Standard Auto-Detect Grid Mode
  let currentTicks = 0;
  let prevSegmentRoot: number | null = null;
  let prevSegmentType: ChordType | null = null;

  while (currentTicks < maxTicks) {
    const timeSig = getTimeSignatureAtTicks(currentTicks, timeSignatures);
    const segTicks = getTicksPerSegment(settings.resolution, ppq, timeSig);
    const startTicks = currentTicks;
    const endTicks = currentTicks + segTicks;
    const segKey = `${startTicks}_${endTicks}`;

    const meter = getMeterPosition(startTicks, ppq, timeSignatures);

    // Check manual override
    const manualSeg = overrideMap.get(segKey);
    if (manualSeg) {
      segments.push({
        ...manualSeg,
        barIndex: meter.bar,
        beatIndex: meter.beat,
        sourceType: 'MANUAL',
      });
      prevSegmentRoot = manualSeg.root;
      prevSegmentType = manualSeg.type;
      currentTicks = endTicks;
      continue;
    }

    // Aggregate Weighted Pitch Class Profile
    const pitchProfile = new Array(12).fill(0);
    let lowestBassPitch = 999;
    let lowestBassPc = -1;
    let totalWeight = 0;

    for (const note of notes) {
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
      const overlapRatio = overlapTicks / segTicks;

      let durWeight = getDurationWeight(note.durationTicks, ppq);
      if (settings.minDurationTicks > 0 && note.durationTicks < settings.minDurationTicks) {
        continue;
      }
      if (!settings.reduceShortNoteInfluence) {
        durWeight = 1.0;
      }

      const roleWeight = getRoleWeight(track);
      if (roleWeight <= 0) continue;

      const velWeight = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity));
      const noteMeter = getMeterPosition(note.startTicks, ppq, timeSignatures);
      const metricWeight = noteMeter.metricWeight;

      const noteWeight = durWeight * velWeight * metricWeight * roleWeight * overlapRatio;
      const pc = note.pitchClass;
      pitchProfile[pc] += noteWeight;
      totalWeight += noteWeight;

      const isBassTrack = track?.settings.role === 'bass' || track?.settings.detectedRole === 'bass';
      if (isBassTrack) {
        if (note.pitch < lowestBassPitch) {
          lowestBassPitch = note.pitch;
          lowestBassPc = pc;
        }
      } else if (lowestBassPitch === 999 || note.pitch < lowestBassPitch) {
        lowestBassPitch = note.pitch;
        lowestBassPc = pc;
      }
    }

    if (totalWeight < 0.001) {
      const prevSeg = segments[segments.length - 1];
      const root = prevSeg ? prevSeg.root : 0;
      const type = prevSeg ? prevSeg.type : 'maj';
      const bass = prevSeg ? prevSeg.bass : root;
      const rootName = pitchClassToName(root);
      const bassName = pitchClassToName(bass);
      const displayName = formatChordName(root, type, bass);

      segments.push({
        id: `seg_${startTicks}`,
        startTicks,
        endTicks,
        startSeconds: startTicks / ppq * 0.5,
        endSeconds: endTicks / ppq * 0.5,
        barIndex: meter.bar,
        beatIndex: meter.beat,
        root,
        rootName,
        type,
        typeName: CHORD_DEFINITIONS[type].name,
        bass,
        bassName,
        displayName,
        confidence: 0,
        candidates: [{
          root,
          rootName,
          type,
          typeName: CHORD_DEFINITIONS[type].name,
          bass,
          bassName,
          displayName,
          score: 0,
          confidence: 0,
        }],
        manualOverride: false,
        sourceType: 'AUTO',
      });
      currentTicks = endTicks;
      continue;
    }

    const top5 = scoreChordCandidates(pitchProfile, lowestBassPc, prevSegmentRoot, prevSegmentType);
    const best = top5[0];

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
      confidence: best.confidence,
      candidates: top5,
      manualOverride: false,
      sourceType: 'AUTO',
    });

    prevSegmentRoot = best.root;
    prevSegmentType = best.type;
    currentTicks = endTicks;
  }

  return segments;
}
