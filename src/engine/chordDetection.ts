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
import { ChordAnalysisRole, NoteData, TimeSignatureInfo, TrackData } from '../types/midi';
import {
  buildMeterMap,
  getBarStartTicks,
  getMeterPosition,
  getMusicalBeatTicks,
  getTimeSignatureAtTicks,
  MeterRegion,
  ticksToMusicalPosition,
} from '../music/meter';
import { getKeyCompatibilityBonus } from '../music/keyDetection';
import { DEFAULT_ANALYSIS_SETTINGS } from '../utils/constants';

export function getEffectiveChordRole(track?: TrackData): ChordAnalysisRole {
  if (!track) return 'primary_harmony';

  // 1. Manual user override for chord analysis role (β0.4.2 Phase N / Section 36-37)
  if (track.settings.chordAnalysisRoleSource === 'manual' && track.settings.chordAnalysisRole && track.settings.chordAnalysisRole !== 'auto') {
    return track.settings.chordAnalysisRole;
  }

  // 2. Auto-suggested chord analysis role
  if (track.settings.chordAnalysisRole === 'auto' && track.settings.detectedChordAnalysisRole) {
    return track.settings.detectedChordAnalysisRole;
  }

  if (track.settings.chordAnalysisRole && track.settings.chordAnalysisRole !== 'auto') {
    return track.settings.chordAnalysisRole;
  }

  // 3. Generic Track Role fallback
  const role = track.settings.role;
  if (role === 'chord_guide') return 'primary_harmony';
  if (role === 'bass') return 'bass_anchor';
  if (role === 'harmony') return 'primary_harmony';
  if (role === 'melody') return 'melody';
  if (role === 'percussion' || role === 'keyswitch' || role === 'ignore') return 'exclude';

  // 4. Detected generic role
  const detRole = track.settings.detectedRole;
  if (detRole === 'chord_guide') return 'primary_harmony';
  if (detRole === 'bass') return 'bass_anchor';
  if (detRole === 'harmony') return 'primary_harmony';
  if (detRole === 'melody') return 'melody';
  if (detRole === 'percussion' || detRole === 'keyswitch' || detRole === 'ignore') return 'exclude';

  if (track.settings.classification?.suggestedChordRole) {
    return track.settings.classification.suggestedChordRole;
  }

  return 'primary_harmony';
}

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
  totalDurationTicks: number,
  span: ChordAnalysisSpan,
  ppq: number = 480
): SpanWindow[] {
  const windows: SpanWindow[] = [];
  const maxTicks = totalDurationTicks > 0 ? totalDurationTicks : ppq * 4;

  // Group into bars first
  interface BarInfo {
    barIndex: number;
    startTicks: number;
    endTicks: number;
    ticksPerBar: number;
    ticksPerBeat: number;
    numerator: number;
    denominator: number;
  }
  const bars: BarInfo[] = [];

  meterMap.forEach(region => {
    let tick = region.startTicks;
    let b = region.startBar;
    while (tick < region.endTicks && tick < maxTicks) {
      const barEnd = Math.min(region.endTicks, tick + region.ticksPerBar);
      bars.push({
        barIndex: b,
        startTicks: tick,
        endTicks: barEnd,
        ticksPerBar: region.ticksPerBar,
        ticksPerBeat: region.ticksPerBeat,
        numerator: region.numerator,
        denominator: region.denominator,
      });
      tick += region.ticksPerBar;
      b++;
    }
  });

  if (bars.length === 0) {
    return [{ startTicks: 0, endTicks: maxTicks, barIndex: 1, beatIndex: 1 }];
  }

  if (span === 'two_beats') {
    bars.forEach(bar => {
      // Compound Meter aware (Phase F, G, H, I): 1 musical beat in 6/8, 9/8, 12/8 is 1.5 ppq (dotted quarter)
      const musicalBeatTicks = getMusicalBeatTicks(bar.numerator, bar.denominator, ppq);
      const twoBeatsTicks = Math.round(musicalBeatTicks * 2);

      let currentTick = bar.startTicks;
      let beatIdx = 1;
      while (currentTick < bar.endTicks) {
        const nextTick = Math.min(bar.endTicks, currentTick + twoBeatsTicks);
        windows.push({
          startTicks: currentTick,
          endTicks: nextTick,
          barIndex: bar.barIndex,
          beatIndex: beatIdx,
        });
        currentTick = nextTick;
        beatIdx += 2;
      }
    });
  } else if (span === 'half_bar') {
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
 * Evaluates candidate chords using Two-Pass Harmony Analysis:
 * Pass 1: Identifies Core Harmony (Root, 3rd, 5th, 7th, Bass) using Primary Harmony & Bass evidence
 * Pass 2: Enriches extensions and tensions (9, 11, 13, alterated dominant) using Supporting Harmony & Melody
 */
export function scoreChordCandidates(
  pitchProfile: number[],
  lowestBassPc: number,
  prevRoot: number | null = null,
  prevType: ChordType | null = null,
  keyContext?: KeyContext,
  profiles?: {
    primary: number[];
    supporting: number[];
    melody: number[];
  }
): ChordCandidate[] {
  let coreProfile = pitchProfile;
  let fullProfile = pitchProfile;

  if (profiles) {
    // Pass 1 Core Profile: Primary Harmony (1.0) + Supporting Harmony (0.45)
    coreProfile = profiles.primary.map((p, i) => p + 0.45 * profiles.supporting[i]);
    const hasCore = coreProfile.some(v => v > 0.001);
    if (!hasCore) {
      // Fallback for unaccompanied melody songs
      coreProfile = profiles.melody.slice();
    }
    // Pass 2 Full Profile: Primary Harmony (1.0) + Supporting Harmony (0.45) + Melody (0.15)
    fullProfile = profiles.primary.map((p, i) => p + 0.45 * profiles.supporting[i] + 0.15 * profiles.melody[i]);
  }

  // -------------------------------------------------------------
  // PASS 1: Core Harmony Detection (Root, Quality, Bass Anchor)
  // -------------------------------------------------------------
  const CORE_TYPES: ChordType[] = [
    'maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'mMaj7', 'm7b5', 'dim7', 'sus2', 'sus4', '6', 'min6'
  ];

  let bestCoreRoot = 0;
  let bestCoreType: ChordType = 'maj';
  let bestCoreScore = -9999;

  const activeRoots: number[] = [];
  for (let r = 0; r < 12; r++) {
    if (coreProfile[r] > 0.01 || coreProfile[(r + 3) % 12] > 0.01 || coreProfile[(r + 4) % 12] > 0.01 || r === lowestBassPc || r === prevRoot) {
      activeRoots.push(r);
    }
  }
  if (activeRoots.length === 0) activeRoots.push(0);

  for (let rIdx = 0; rIdx < activeRoots.length; rIdx++) {
    const root = activeRoots[rIdx];
    for (const chordType of CORE_TYPES) {
      const def = CHORD_DEFINITIONS[chordType];
      const template = CHORD_TEMPLATES[chordType];
      let score = 0;

      // 1. Template matching with core pitch profile
      for (let interval = 0; interval < 12; interval++) {
        const pc = (root + interval) % 12;
        const pcWeight = coreProfile[pc];
        if (pcWeight > 0) {
          score += pcWeight * template.weights[interval];
        }
      }

      // Penalty for missing essential chord tones in core profile
      for (const interval of def.intervals) {
        const pc = (root + interval) % 12;
        if (coreProfile[pc] <= 0.01) {
          score -= (interval === 3 || interval === 4) ? 1.4 : 0.8;
        }
      }

      // Root presence bonus
      if (coreProfile[root] > 0) {
        score += coreProfile[root] * 1.5;
      }

      // Bass anchor evidence (PHASE D / Section 7-8)
      if (lowestBassPc >= 0) {
        if (lowestBassPc === root) {
          score += 2.0;
        } else {
          const bassInterval = ((lowestBassPc - root) % 12 + 12) % 12;
          if (def.intervals.includes(bassInterval)) {
            score += 1.0;
          } else if (bassInterval === 2 || bassInterval === 5 || bassInterval === 9) {
            // Slash chord evidence (e.g. C/D, Cmaj7/D)
            score += 0.5;
          } else {
            score -= 1.8;
          }
        }
      }

      // Persistence bonus
      if (prevRoot !== null && prevRoot === root && prevType === chordType) {
        score += 0.8;
      }

      // Key compatibility bonus
      if (keyContext) {
        score += getKeyCompatibilityBonus(root, chordType, keyContext);
      }

      if (score > bestCoreScore) {
        bestCoreScore = score;
        bestCoreRoot = root;
        bestCoreType = chordType;
      }
    }
  }

  // -------------------------------------------------------------
  // PASS 2: Full Evaluation & Extension / Tension Enrichment
  // -------------------------------------------------------------
  interface ScoredCandidate {
    root: number;
    type: ChordType;
    bass: number;
    score: number;
    bassScore: number;
    keyScore: number;
    continuityScore: number;
    extScore: number;
  }
  const candidates: ScoredCandidate[] = [];
  const activePass2Roots: number[] = [];
  for (let r = 0; r < 12; r++) {
    if (fullProfile[r] > 0.01 || fullProfile[(r + 3) % 12] > 0.01 || fullProfile[(r + 4) % 12] > 0.01 || r === lowestBassPc || r === bestCoreRoot || r === prevRoot) {
      activePass2Roots.push(r);
    }
  }
  if (activePass2Roots.length === 0) activePass2Roots.push(bestCoreRoot);

  for (let rIdx = 0; rIdx < activePass2Roots.length; rIdx++) {
    const root = activePass2Roots[rIdx];
    const isCoreRoot = root === bestCoreRoot;

    const typesToEvaluate: ChordType[] = isCoreRoot
      ? ALL_CHORD_TYPES
      : (root === lowestBassPc ? ['maj', 'min', 'dim', 'dom7', 'min7', 'maj7'] : ['maj', 'min', 'dim']);

    for (const chordType of typesToEvaluate) {
      const def = CHORD_DEFINITIONS[chordType];
      const template = CHORD_TEMPLATES[chordType];
      let score = 0;

      // 1. Template matching with full pitch profile
      for (let interval = 0; interval < 12; interval++) {
        const pc = (root + interval) % 12;
        const pcWeight = fullProfile[pc];
        if (pcWeight > 0) {
          score += pcWeight * template.weights[interval];
        }
      }

      // Missing essential chord tones penalty
      for (const interval of def.intervals) {
        const pc = (root + interval) % 12;
        if (fullProfile[pc] <= 0.01) {
          score -= (interval === 3 || interval === 4) ? 1.4 : 0.8;
        }
      }

      // Root presence bonus
      const rootWeight = fullProfile[root];
      if (rootWeight > 0) {
        score += rootWeight * 1.5;
      }

      // Core Root Anchor Bonus (PHASE E & F: Melody notes cannot swing core root)
      if (isCoreRoot) {
        score += 2.5;
      }

      // Bass alignment bonus
      let chosenBass = root;
      let bassScore = 0;
      if (lowestBassPc >= 0) {
        chosenBass = lowestBassPc;
        if (lowestBassPc === root) {
          bassScore = 2.0;
        } else {
          const bassInterval = ((lowestBassPc - root) % 12 + 12) % 12;
          if (def.intervals.includes(bassInterval)) {
            bassScore = 1.0;
          } else if (bassInterval === 2 || bassInterval === 5 || bassInterval === 9) {
            bassScore = 0.5; // Slash chord
          } else {
            bassScore = -1.8;
          }
        }
      }
      score += bassScore;

      // Persistence
      let continuityScore = 0;
      if (prevRoot !== null && prevRoot === root && prevType === chordType) {
        continuityScore = 0.8;
        score += continuityScore;
      }

      // Key compatibility
      let keyScore = 0;
      if (keyContext) {
        keyScore = getKeyCompatibilityBonus(root, chordType, keyContext);
        score += keyScore;
      }

      // Extension / Alteration Evaluation (Pass 2)
      let extScore = 0;
      const extensionIntervals = def.intervals.filter(inv => inv !== 0 && inv !== 3 && inv !== 4 && inv !== 6 && inv !== 7 && inv !== 8);
      if (extensionIntervals.length > 0) {
        const hasAllExtensions = extensionIntervals.every(inv => fullProfile[(root + inv) % 12] > 0.08);
        if (hasAllExtensions) {
          extScore += 0.8;
          score += 0.8;
        } else {
          score -= 1.8;
        }
      }

      // Altered Dominant Special Handling (PHASE F / Section 14)
      if (chordType === 'dom7' || chordType === 'dom9') {
        const b9 = fullProfile[(root + 1) % 12];
        const sharp9 = fullProfile[(root + 3) % 12];
        const sharp11 = fullProfile[(root + 6) % 12];
        const b13 = fullProfile[(root + 8) % 12];
        const alterationWeight = b9 + sharp9 + sharp11 + b13;
        if (alterationWeight > 0.2) {
          score += alterationWeight * 1.2;
          extScore += alterationWeight * 1.2;
        }
      }

      if (chordType === 'sus2' || chordType === 'sus4') {
        score -= 0.6;
      } else if (chordType === 'dim' || chordType === 'aug') {
        score -= 0.4;
      }

      candidates.push({
        root,
        type: chordType,
        bass: chosenBass,
        score,
        bassScore,
        keyScore,
        continuityScore,
        extScore,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const topScore = candidates.length > 0 ? candidates[0].score : 0;
  const secondScore = candidates.length > 1 ? candidates[1].score : 0;
  const diff = topScore - secondScore;
  
  let confidence = 75;
  if (topScore > 0) {
    confidence = Math.round(60 + (diff / (Math.abs(topScore) + 0.1)) * 38);
    confidence = Math.max(40, Math.min(98, confidence));
  }

  const top5: ChordCandidate[] = candidates.slice(0, 5).map((c, idx) => {
    const rootName = pitchClassToName(c.root);
    const bassName = pitchClassToName(c.bass);
    const displayName = formatChordName(c.root, c.type, c.bass);
    const typeName = CHORD_DEFINITIONS[c.type].name;
    const candConfidence = idx === 0 ? confidence : Math.max(10, Math.min(90, Math.round(confidence * Math.max(0, (c.score / Math.max(0.1, topScore))))));

    return {
      root: c.root,
      rootName,
      type: c.type,
      typeName,
      bass: c.bass,
      bassName,
      displayName,
      score: c.score,
      confidence: candConfidence,
      scoreBreakdown: {
        primaryHarmony: 0,
        supportingHarmony: 0,
        bass: c.bassScore,
        melody: 0,
        key: c.keyScore,
        continuity: c.continuityScore,
        extension: c.extScore,
      },
    };
  });

  // Compute breakdown for top 5 candidates only (Phase Performance)
  if (profiles) {
    for (const c of top5) {
      const template = CHORD_TEMPLATES[c.type];
      let pScore = 0;
      let sScore = 0;
      let mScore = 0;
      for (let interval = 0; interval < 12; interval++) {
        const pc = (c.root + interval) % 12;
        const tw = template.weights[interval];
        if (tw > 0) {
          if (profiles.primary[pc] > 0) pScore += profiles.primary[pc] * tw;
          if (profiles.supporting[pc] > 0) sScore += profiles.supporting[pc] * tw * 0.45;
          if (profiles.melody[pc] > 0) mScore += profiles.melody[pc] * tw * 0.15;
        }
      }
      if (c.scoreBreakdown) {
        c.scoreBreakdown.primaryHarmony = pScore;
        c.scoreBreakdown.supportingHarmony = sScore;
        c.scoreBreakdown.melody = mScore;
      }
    }
  }

  return top5;
}

export function detectChords(
  notes: NoteData[],
  tracks: TrackData[] = [],
  ppq: number = 480,
  totalDurationTicks: number = 0,
  timeSignatures: TimeSignatureInfo[] = [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
  settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS,
  existingSegments: ChordSegment[] = [],
  keyContext?: KeyContext
): ChordSegment[] {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const trackMap = new Map<number, TrackData>();
  const trackEffectiveRoleMap = new Map<number, ChordAnalysisRole>();

  for (const t of safeTracks) {
    trackMap.set(t.id, t);
    trackEffectiveRoleMap.set(t.id, getEffectiveChordRole(t));
  }

  // Preserve manual overrides
  const overrideMap = new Map<string, ChordSegment>();
  for (const seg of existingSegments) {
    if (seg.manualOverride) {
      overrideMap.set(`${seg.startTicks}_${seg.endTicks}`, seg);
    }
  }

  const chordGuideTrack = safeTracks.find(t => t.settings.role === 'chord_guide' && t.notes.length > 0);
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

  // Pre-filter harmonic notes (β0.4.2 Phase A & C: Exclude tracks with role 'exclude')
  const harmonicNotes = notes.filter(n => {
    const trk = trackMap.get(n.trackId);
    if (!trk || trk.settings.ignore) return false;
    const effectiveChordRole = trackEffectiveRoleMap.get(n.trackId) || 'primary_harmony';
    if (effectiveChordRole === 'exclude') return false;
    if (trk.settings.role === 'chord_guide') return false;
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

  // Helper for analyzing an arbitrary non-manual slice using Two-Pass Harmony Analysis
  const analyzeSlice = (
    startTicks: number,
    endTicks: number,
    curPrevRoot: number | null,
    curPrevType: ChordType | null
  ): { segment: ChordSegment; bestRoot: number; bestType: ChordType } => {
    const winTicks = endTicks - startTicks;
    const meter = ticksToMusicalPosition(startTicks, meterMap, ppq);

    if (winTicks <= 0) {
      const root = curPrevRoot !== null ? curPrevRoot : 0;
      const type = curPrevType !== null ? curPrevType : 'maj';
      const rootName = pitchClassToName(root);
      return {
        segment: {
          id: `seg_${startTicks}`,
          startTicks,
          endTicks,
          startSeconds: (startTicks / ppq) * 0.5,
          endSeconds: (endTicks / ppq) * 0.5,
          barIndex: meter.bar,
          beatIndex: meter.beat,
          root,
          rootName,
          type,
          typeName: CHORD_DEFINITIONS[type].name,
          bass: root,
          bassName: rootName,
          displayName: formatChordName(root, type),
          confidence: 0,
          candidates: [],
          manualOverride: false,
          sourceType: 'AUTO',
        },
        bestRoot: root,
        bestType: type,
      };
    }

    const primaryProfile = new Array(12).fill(0);
    const supportingProfile = new Array(12).fill(0);
    const melodyProfile = new Array(12).fill(0);
    let lowestBassPitch = 999;
    let lowestBassPc = -1;
    let maxBassWeight = 0;
    let totalWeight = 0;

    const startBucket = Math.floor(startTicks / harmonicBucketSize);
    const endBucket = Math.floor(endTicks / harmonicBucketSize);
    const windowNotesSeen = new Set<string>();

    for (let b = startBucket; b <= endBucket; b++) {
      const bucketNotes = harmonicBuckets.get(b);
      if (!bucketNotes) continue;

      for (let k = 0; k < bucketNotes.length; k++) {
        const note = bucketNotes[k];
        if (windowNotesSeen.has(note.id)) continue;
        windowNotesSeen.add(note.id);

        const overlapStart = Math.max(startTicks, note.startTicks);
        const overlapEnd = Math.min(endTicks, note.endTicks);
        if (overlapEnd <= overlapStart) continue;

        const effectiveRole = trackEffectiveRoleMap.get(note.trackId) || 'primary_harmony';
        if (effectiveRole === 'exclude') continue;

        const overlapTicks = overlapEnd - overlapStart;
        const overlapRatio = overlapTicks / winTicks;

        let durWeight = getDurationWeight(note.durationTicks, ppq);
        if (!settings.reduceShortNoteInfluence) durWeight = 1.0;

        const velWeight = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity));
        const noteMeter = ticksToMusicalPosition(note.startTicks, meterMap, ppq);
        const baseWeight = durWeight * velWeight * noteMeter.metricWeight * overlapRatio;

        if (effectiveRole === 'primary_harmony') {
          primaryProfile[note.pitchClass] += baseWeight;
          totalWeight += baseWeight;
        } else if (effectiveRole === 'supporting_harmony') {
          supportingProfile[note.pitchClass] += baseWeight;
          totalWeight += baseWeight * 0.45;
        } else if (effectiveRole === 'melody') {
          melodyProfile[note.pitchClass] += baseWeight;
          totalWeight += baseWeight * 0.15;
        } else if (effectiveRole === 'bass_anchor') {
          const bassWeight = baseWeight * (note.pitch < 48 ? 1.5 : 1.0);
          if (bassWeight > maxBassWeight || (bassWeight >= maxBassWeight * 0.8 && note.pitch < lowestBassPitch)) {
            maxBassWeight = bassWeight;
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        }

        // Structural bass fallback if no bass_anchor note has matched
        if (lowestBassPc === -1 || (lowestBassPitch === 999 && note.pitch < lowestBassPitch)) {
          if (note.pitch < lowestBassPitch) {
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        }
      }
    }

    const pitchProfile = primaryProfile.map(
      (p, i) => p + 0.45 * supportingProfile[i] + 0.15 * melodyProfile[i]
    );

    if (totalWeight < 0.001) {
      const fallbackRoot = curPrevRoot !== null ? curPrevRoot : 0;
      const fallbackType = curPrevType !== null ? curPrevType : 'maj';
      const rootName = pitchClassToName(fallbackRoot);
      const displayName = formatChordName(fallbackRoot, fallbackType);

      return {
        segment: {
          id: `seg_${startTicks}`,
          startTicks,
          endTicks,
          startSeconds: (startTicks / ppq) * 0.5,
          endSeconds: (endTicks / ppq) * 0.5,
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
        },
        bestRoot: fallbackRoot,
        bestType: fallbackType,
      };
    }

    const top5 = scoreChordCandidates(
      pitchProfile,
      lowestBassPc,
      curPrevRoot,
      curPrevType,
      keyContext,
      {
        primary: primaryProfile,
        supporting: supportingProfile,
        melody: melodyProfile,
      }
    );
    let best = top5[0];

    // Harmonic Smoothing
    if (curPrevRoot !== null && curPrevType !== null && (best.root !== curPrevRoot || best.type !== curPrevType)) {
      const prevCand = top5.find(c => c.root === curPrevRoot && c.type === curPrevType);
      if (prevCand) {
        const scoreDiff = best.score - prevCand.score;
        const sameRoot = best.root === curPrevRoot;
        const sameBass = best.bass === prevCand.bass;

        if (scoreDiff < 1.6 && (sameRoot || (sameBass && scoreDiff < 1.2))) {
          best = prevCand;
        }
      }
    }

    return {
      segment: {
        id: `seg_${startTicks}`,
        startTicks,
        endTicks,
        startSeconds: (startTicks / ppq) * 0.5,
        endSeconds: (endTicks / ppq) * 0.5,
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
      },
      bestRoot: best.root,
      bestType: best.type,
    };
  };

  const manualSegments = existingSegments
    .filter(s => s.manualOverride || s.sourceType === 'MANUAL')
    .sort((a, b) => a.startTicks - b.startTicks);

  // -------------------------------------------------------------
  // Priority 2: Manual Span Mode (two_beats, half_bar, one_bar, two_bars, four_bars)
  // -------------------------------------------------------------
  if (spanMode !== 'auto') {
    const spanWindows = generateSpanWindows(meterMap, maxTicks, spanMode, ppq);
    const spanSegments: ChordSegment[] = [];
    const insertedManualIds = new Set<string>();
    let prevRoot: number | null = null;
    let prevType: ChordType | null = null;

    for (let i = 0; i < spanWindows.length; i++) {
      const win = spanWindows[i];
      const winTicks = win.endTicks - win.startTicks;
      if (winTicks <= 0) continue;

      // Find overlapping manual segments (Phase C & D: Never stretch manual segments!)
      const overlappingManuals = manualSegments.filter(
        m => m.startTicks < win.endTicks && m.endTicks > win.startTicks
      );

      if (overlappingManuals.length === 0) {
        // Case A: No manual override in this window -> Full Auto Analysis
        const res = analyzeSlice(win.startTicks, win.endTicks, prevRoot, prevType);
        spanSegments.push(res.segment);
        prevRoot = res.bestRoot;
        prevType = res.bestType;
      } else {
        // Case B & C: Window has one or more manual segments -> Non-destructive window splitting
        let curTick = win.startTicks;

        for (let mIdx = 0; mIdx < overlappingManuals.length; mIdx++) {
          const m = overlappingManuals[mIdx];

          // If there's an auto sub-interval before this manual segment
          if (curTick < m.startTicks) {
            const autoEnd = Math.min(win.endTicks, m.startTicks);
            const res = analyzeSlice(curTick, autoEnd, prevRoot, prevType);
            spanSegments.push(res.segment);
            prevRoot = res.bestRoot;
            prevType = res.bestType;
            curTick = autoEnd;
          }

          // Insert manual segment at its exact original tick boundaries
          if (!insertedManualIds.has(m.id)) {
            const meter = getMeterPosition(m.startTicks, ppq, timeSignatures);
            spanSegments.push({
              ...m,
              startTicks: m.startTicks,
              endTicks: m.endTicks,
              barIndex: meter.bar,
              beatIndex: meter.beat,
              sourceType: 'MANUAL',
              manualOverride: true,
            });
            insertedManualIds.add(m.id);
            prevRoot = m.root;
            prevType = m.type;
          }

          curTick = Math.max(curTick, m.endTicks);
        }

        // If there's an auto sub-interval after the last manual segment in this window
        if (curTick < win.endTicks) {
          const res = analyzeSlice(curTick, win.endTicks, prevRoot, prevType);
          spanSegments.push(res.segment);
          prevRoot = res.bestRoot;
          prevType = res.bestType;
        }
      }
    }

    return spanSegments;
  }

  // -------------------------------------------------------------
  // Priority 3: Adaptive / Grid Mode with Harmonic Smoothing & Multi-Resolution
  // -------------------------------------------------------------
  const minSegmentTicks = settings.minSegmentLength === '1/4_beat'
    ? Math.round(ppq / 4)
    : settings.minSegmentLength === '1_beat'
    ? ppq
    : Math.round(ppq / 2);

  const changePointsSet = new Set<number>();
  changePointsSet.add(0);

  // Guarantee manual segment boundaries are never crossed or merged
  manualSegments.forEach(m => {
    changePointsSet.add(m.startTicks);
    changePointsSet.add(m.endTicks);
  });

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

    // Phase H / Section 21: Auto Mode adds 2-beat candidate points from meterMap
    const span2Beats = generateSpanWindows(meterMap, maxTicks, 'two_beats', ppq);
    span2Beats.forEach(w => {
      changePointsSet.add(w.startTicks);
      changePointsSet.add(w.endTicks);
    });
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
    primaryProfile: number[];
    supportingProfile: number[];
    melodyProfile: number[];
    lowestBassPc: number;
    primaryWeight: number;
    totalWeight: number;
  }[] = [];

  const multiBucketSeen = new Set<string>();

  for (let i = 0; i < changePoints.length - 1; i++) {
    const startTicks = changePoints[i];
    const endTicks = changePoints[i + 1];
    if (endTicks - startTicks < Math.min(120, minSegmentTicks)) continue;

    const sliceTicks = endTicks - startTicks;
    const primaryProfile = new Array(12).fill(0);
    const supportingProfile = new Array(12).fill(0);
    const melodyProfile = new Array(12).fill(0);
    let lowestBassPitch = 999;
    let lowestBassPc = -1;
    let maxBassWeight = 0;
    let primaryWeight = 0;
    let totalWeight = 0;

    const startBucket = Math.floor(startTicks / harmonicBucketSize);
    const endBucket = Math.floor(endTicks / harmonicBucketSize);
    const isSingleBucket = startBucket === endBucket;
    if (!isSingleBucket) multiBucketSeen.clear();

    const sliceMeterWeight = ticksToMusicalPosition(startTicks, meterMap, ppq).metricWeight;

    for (let b = startBucket; b <= endBucket; b++) {
      const bucketNotes = harmonicBuckets.get(b);
      if (!bucketNotes) continue;

      for (let k = 0; k < bucketNotes.length; k++) {
        const note = bucketNotes[k];
        if (!isSingleBucket) {
          if (multiBucketSeen.has(note.id)) continue;
          multiBucketSeen.add(note.id);
        }

        const overlapStart = Math.max(startTicks, note.startTicks);
        const overlapEnd = Math.min(endTicks, note.endTicks);
        if (overlapEnd <= overlapStart) continue;

        const effectiveRole = trackEffectiveRoleMap.get(note.trackId) || 'primary_harmony';
        if (effectiveRole === 'exclude') continue;

        const overlapTicks = overlapEnd - overlapStart;
        const overlapRatio = overlapTicks / sliceTicks;

        let durWeight = getDurationWeight(note.durationTicks, ppq);
        if (!settings.reduceShortNoteInfluence) durWeight = 1.0;

        const velWeight = 0.3 + 0.7 * Math.max(0, Math.min(1, note.velocity));
        const metricWeight = note.startTicks === startTicks ? sliceMeterWeight : ticksToMusicalPosition(note.startTicks, meterMap, ppq).metricWeight;
        const baseWeight = durWeight * velWeight * metricWeight * overlapRatio;

        if (effectiveRole === 'primary_harmony') {
          primaryProfile[note.pitchClass] += baseWeight;
          primaryWeight += baseWeight;
          totalWeight += baseWeight;
        } else if (effectiveRole === 'supporting_harmony') {
          supportingProfile[note.pitchClass] += baseWeight;
          totalWeight += baseWeight * 0.45;
        } else if (effectiveRole === 'melody') {
          melodyProfile[note.pitchClass] += baseWeight;
          totalWeight += baseWeight * 0.15;
        } else if (effectiveRole === 'bass_anchor') {
          const bassWeight = baseWeight * (note.pitch < 48 ? 1.5 : 1.0);
          if (bassWeight > maxBassWeight || (bassWeight >= maxBassWeight * 0.8 && note.pitch < lowestBassPitch)) {
            maxBassWeight = bassWeight;
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        }

        if (lowestBassPc === -1 || (lowestBassPitch === 999 && note.pitch < lowestBassPitch)) {
          if (note.pitch < lowestBassPitch) {
            lowestBassPitch = note.pitch;
            lowestBassPc = note.pitchClass;
          }
        }
      }
    }

    const pitchProfile = primaryProfile.map(
      (p, i) => p + 0.45 * supportingProfile[i] + 0.15 * melodyProfile[i]
    );

    rawSegments.push({
      startTicks,
      endTicks,
      profile: pitchProfile,
      primaryProfile,
      supportingProfile,
      melodyProfile,
      lowestBassPc,
      primaryWeight,
      totalWeight,
    });
  }

  // Merge Similar Slices using Harmonic Similarity & Chord Change Evidence (Phase I & J)
  const mergedSegments: typeof rawSegments = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const curr = rawSegments[i];
    if (mergedSegments.length === 0) {
      mergedSegments.push({ ...curr });
      continue;
    }

    const prev = mergedSegments[mergedSegments.length - 1];
    const isPrevManual = manualSegments.some(m => m.startTicks <= prev.startTicks && m.endTicks >= prev.endTicks);
    const isCurrManual = manualSegments.some(m => m.startTicks <= curr.startTicks && m.endTicks >= curr.endTicks);

    const similarity = cosineSimilarity(prev.profile, curr.profile);
    const primarySimilarity = cosineSimilarity(prev.primaryProfile, curr.primaryProfile);
    const bassChanged = prev.lowestBassPc !== curr.lowestBassPc && prev.lowestBassPc >= 0 && curr.lowestBassPc >= 0;

    // Strong Change: Don't merge if Primary Harmony shifted significantly or Bass shifted with distinct profile
    const hasStrongChange = (primarySimilarity < 0.75 && (prev.primaryWeight > 0.1 || curr.primaryWeight > 0.1)) ||
      (bassChanged && primarySimilarity < 0.85);

    if (!isPrevManual && !isCurrManual && !hasStrongChange && (similarity > 0.85 || curr.totalWeight < 0.05)) {
      prev.endTicks = curr.endTicks;
      for (let p = 0; p < 12; p++) {
        prev.profile[p] += curr.profile[p];
        prev.primaryProfile[p] += curr.primaryProfile[p];
        prev.supportingProfile[p] += curr.supportingProfile[p];
        prev.melodyProfile[p] += curr.melodyProfile[p];
      }
      prev.totalWeight += curr.totalWeight;
      prev.primaryWeight += curr.primaryWeight;
      if (prev.lowestBassPc < 0 && curr.lowestBassPc >= 0) {
        prev.lowestBassPc = curr.lowestBassPc;
      }
    } else {
      mergedSegments.push({ ...curr });
    }
  }

  const finalSegments: ChordSegment[] = [];
  const insertedAdaptiveManualIds = new Set<string>();
  let prevRoot: number | null = null;
  let prevType: ChordType | null = null;

  for (let i = 0; i < mergedSegments.length; i++) {
    const seg = mergedSegments[i];
    const meter = getMeterPosition(seg.startTicks, ppq, timeSignatures);

    // Check manual override (Phase C & D: Never stretch manual segment boundaries!)
    const manualSeg = manualSegments.find(
      s => (s.startTicks <= seg.startTicks && s.endTicks >= seg.endTicks) ||
           (seg.startTicks <= s.startTicks && seg.endTicks >= s.endTicks) ||
           (s.startTicks === seg.startTicks && s.endTicks === seg.endTicks)
    );

    if (manualSeg) {
      if (!insertedAdaptiveManualIds.has(manualSeg.id)) {
        const mMeter = getMeterPosition(manualSeg.startTicks, ppq, timeSignatures);
        finalSegments.push({
          ...manualSeg,
          startTicks: manualSeg.startTicks,
          endTicks: manualSeg.endTicks,
          barIndex: mMeter.bar,
          beatIndex: mMeter.beat,
          sourceType: 'MANUAL',
          manualOverride: true,
        });
        insertedAdaptiveManualIds.add(manualSeg.id);
        prevRoot = manualSeg.root;
        prevType = manualSeg.type;
      }
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

    const top5 = scoreChordCandidates(
      seg.profile,
      seg.lowestBassPc,
      prevRoot,
      prevType,
      keyContext,
      {
        primary: seg.primaryProfile,
        supporting: seg.supportingProfile,
        melody: seg.melodyProfile,
      }
    );
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
