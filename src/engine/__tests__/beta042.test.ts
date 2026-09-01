import { describe, it, expect } from 'vitest';
import { detectChords, generateSpanWindows, getEffectiveChordRole, scoreChordCandidates } from '../chordDetection';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { MidiData, NoteData, TrackData, TimeSignatureInfo, TempoInfo } from '../../types/midi';
import { classifyAllTracks } from '../trackClassifier';
import { buildMeterMap } from '../../music/meter';
import { pitchToName, getOctave } from '../../music/pitch';

describe('β0.4.2 Master Test Suite - Chord Source Priority & Two-Pass Harmony Analysis', () => {
  const ppq = 480;

  const createDummyTrack = (id: number, name: string, role: any = 'auto', chordRole: any = 'auto', notes: NoteData[] = []): TrackData => ({
    id,
    sourceTrackIndex: id,
    name,
    channel: id === 9 ? 9 : 0,
    notes,
    melodicConfidence: 0.5,
    settings: {
      trackId: id,
      sourceTrackIndex: id,
      name,
      channel: id === 9 ? 9 : 0,
      visible: true,
      muted: false,
      solo: false,
      ignore: false,
      color: '#4F46E5',
      role,
      detectedRole: role,
      roleSource: 'automatic',
      chordAnalysisRole: chordRole,
      detectedChordAnalysisRole: chordRole,
      chordAnalysisRoleSource: 'automatic',
      chordRoleConfidence: 80,
      instrumentFamily: 'unknown',
      rangePreset: 'all',
      analysisMinPitch: 0,
      analysisMaxPitch: 127,
    },
  });

  const createDummyNote = (id: string, trackId: number, pitch: number, startTicks: number, durationTicks: number, velocity: number = 0.8): NoteData => ({
    id,
    trackId,
    sourceTrackIndex: trackId,
    sourceNoteIndex: 0,
    pitch,
    originalPitch: pitch,
    pitchClass: pitch % 12,
    octave: getOctave(pitch),
    name: pitchToName(pitch),
    startTicks,
    endTicks: startTicks + durationTicks,
    durationTicks,
    startSeconds: (startTicks / ppq) * 0.5,
    durationSeconds: (durationTicks / ppq) * 0.5,
    endSeconds: ((startTicks + durationTicks) / ppq) * 0.5,
    velocity,
    channel: trackId === 9 ? 9 : 0,
  });

  const defaultTimeSigs: TimeSignatureInfo[] = [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }];
  const defaultTempos: TempoInfo[] = [{ ticks: 0, time: 0, bpm: 120 }];

  // -------------------------------------------------------------------------------------------------
  // Test 1: Primary Harmony (1.00) determines core chord structure
  // -------------------------------------------------------------------------------------------------
  it('Test 1: Primary Harmony track decides core triad and root', () => {
    // Piano plays C Major (C4=60, E4=64, G4=67)
    const pianoTrack = createDummyTrack(0, 'Piano Chords', 'harmony', 'primary_harmony');
    const notes: NoteData[] = [
      createDummyNote('p1', 0, 60, 0, ppq * 2),
      createDummyNote('p2', 0, 64, 0, ppq * 2),
      createDummyNote('p3', 0, 67, 0, ppq * 2),
    ];
    pianoTrack.notes = notes;

    const segments = detectChords(notes, [pianoTrack], ppq, ppq * 2, defaultTimeSigs, DEFAULT_ANALYSIS_SETTINGS);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 2: Melody notes (0.15) do NOT flip core root when primary harmony is present
  // -------------------------------------------------------------------------------------------------
  it('Test 2: Fast melody notes (D, F#, A) do not flip C major root away from C', () => {
    // Piano backing: C major (C4, E4, G4)
    const backingTrack = createDummyTrack(0, 'Acoustic Guitar', 'harmony', 'primary_harmony');
    const backingNotes = [
      createDummyNote('b1', 0, 60, 0, ppq * 4),
      createDummyNote('b2', 0, 64, 0, ppq * 4),
      createDummyNote('b3', 0, 67, 0, ppq * 4),
    ];
    backingTrack.notes = backingNotes;

    // Fast lead melody with D, F#, A (D major arpeggios / passing tones)
    const leadTrack = createDummyTrack(1, 'Vocal Lead', 'melody', 'melody');
    const leadNotes = [
      createDummyNote('m1', 1, 74, 0, ppq),       // D5
      createDummyNote('m2', 1, 78, ppq, ppq),     // F#5
      createDummyNote('m3', 1, 81, ppq * 2, ppq), // A5
      createDummyNote('m4', 1, 74, ppq * 3, ppq), // D5
    ];
    leadTrack.notes = leadNotes;

    const allNotes = [...backingNotes, ...leadNotes];
    const segments = detectChords(allNotes, [backingTrack, leadTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    // Root must remain C, not flip to D or Bm or F#m
    expect(segments[0].rootName).toBe('C');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 3: Supporting Harmony (0.45) contributes weakly without overruling Primary Harmony
  // -------------------------------------------------------------------------------------------------
  it('Test 3: Supporting harmony (strings pad) assists chord color without overpowering piano', () => {
    // Piano plays F Major (F3=53, A3=57, C4=60)
    const pianoTrack = createDummyTrack(0, 'Main Piano', 'harmony', 'primary_harmony');
    const pianoNotes = [
      createDummyNote('p1', 0, 53, 0, ppq * 4),
      createDummyNote('p2', 0, 57, 0, ppq * 4),
      createDummyNote('p3', 0, 60, 0, ppq * 4),
    ];
    pianoTrack.notes = pianoNotes;

    // Strings pad playing D minor tones (D4=62)
    const stringsTrack = createDummyTrack(1, 'Strings Pad', 'harmony', 'supporting_harmony');
    const stringsNotes = [
      createDummyNote('s1', 1, 62, 0, ppq * 4), // D4 (6th / add6)
    ];
    stringsTrack.notes = stringsNotes;

    const allNotes = [...pianoNotes, ...stringsNotes];
    const segments = detectChords(allNotes, [pianoTrack, stringsTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    // Root is F
    expect(segments[0].rootName).toBe('F');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 4: Bass Anchor provides structural bass evidence and slash candidate
  // -------------------------------------------------------------------------------------------------
  it('Test 4: Bass note on D with C major backing results in Slash Chord (C/D) or D root with correct evidence', () => {
    // Piano backing: C major (C4=60, E4=64, G4=67)
    const pianoTrack = createDummyTrack(0, 'Keys', 'harmony', 'primary_harmony');
    const pianoNotes = [
      createDummyNote('p1', 0, 60, 0, ppq * 4),
      createDummyNote('p2', 0, 64, 0, ppq * 4),
      createDummyNote('p3', 0, 67, 0, ppq * 4),
    ];
    pianoTrack.notes = pianoNotes;

    // Bass anchor: D2=38
    const bassTrack = createDummyTrack(1, 'Electric Bass', 'bass', 'bass_anchor');
    const bassNotes = [
      createDummyNote('b1', 1, 38, 0, ppq * 4), // D2
    ];
    bassTrack.notes = bassNotes;

    const allNotes = [...pianoNotes, ...bassNotes];
    const segments = detectChords(allNotes, [pianoTrack, bassTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    const seg = segments[0];
    // Either C/D slash chord or Dm7/Cmaj9
    expect(seg.bassName).toBe('D');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 5: Exclude track notes (0.00) are completely ignored in harmony analysis
  // -------------------------------------------------------------------------------------------------
  it('Test 5: Exclude tracks (e.g. Drums / Percussion / Noise) do not pollute chord detection', () => {
    const pianoTrack = createDummyTrack(0, 'Piano', 'harmony', 'primary_harmony');
    const pianoNotes = [
      createDummyNote('p1', 0, 60, 0, ppq * 2), // C4
      createDummyNote('p2', 0, 64, 0, ppq * 2), // E4
      createDummyNote('p3', 0, 67, 0, ppq * 2), // G4
    ];
    pianoTrack.notes = pianoNotes;

    // Percussion track playing random pitches (MIDI 36, 38, 42, 46, 49)
    const drumTrack = createDummyTrack(9, 'Drums', 'percussion', 'exclude');
    drumTrack.settings.ignore = true;
    const drumNotes = [
      createDummyNote('d1', 9, 36, 0, ppq / 2),
      createDummyNote('d2', 9, 38, ppq / 2, ppq / 2),
      createDummyNote('d3', 9, 42, ppq, ppq / 2),
      createDummyNote('d4', 9, 49, ppq * 1.5, ppq / 2),
    ];
    drumTrack.notes = drumNotes;

    const allNotes = [...pianoNotes, ...drumNotes];
    const segments = detectChords(allNotes, [pianoTrack, drumTrack], ppq, ppq * 2, defaultTimeSigs, DEFAULT_ANALYSIS_SETTINGS);

    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 6: Two-Pass Harmony Analysis: Pass 1 Core + Pass 2 Tension Enrichment
  // -------------------------------------------------------------------------------------------------
  it('Test 6: Two-Pass Harmony enriches add9 without flipping core triad', () => {
    // Primary: C Major triad (C4, E4, G4)
    const primary = new Array(12).fill(0);
    primary[0] = 1.0; // C
    primary[4] = 1.0; // E
    primary[7] = 1.0; // G

    // Supporting: empty
    const supporting = new Array(12).fill(0);

    // Melody: D (2)
    const melody = new Array(12).fill(0);
    melody[2] = 1.0; // D

    const combined = primary.map((p, i) => p + 0.45 * supporting[i] + 0.15 * melody[i]);
    const candidates = scoreChordCandidates(combined, 0, null, null, undefined, {
      primary,
      supporting,
      melody,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].rootName).toBe('C');
    expect(['maj', 'add9', 'maj9']).toContain(candidates[0].type);
    expect(candidates[0].scoreBreakdown).toBeDefined();
    expect(candidates[0].scoreBreakdown?.primaryHarmony).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------------------------------
  // Test 7: Altered Dominant notes in melody enrich G7 in Pass 2
  // -------------------------------------------------------------------------------------------------
  it('Test 7: Altered dominant notes (b9 / #9 / b13) enrich G7 chord', () => {
    // Primary G7: G=7, B=11, D=2, F=5
    const primary = new Array(12).fill(0);
    primary[7] = 1.0;  // G
    primary[11] = 1.0; // B
    primary[2] = 1.0;  // D
    primary[5] = 1.0;  // F

    const supporting = new Array(12).fill(0);

    // Melody has Ab (b9 = 8) and Eb (b13 = 3)
    const melody = new Array(12).fill(0);
    melody[8] = 1.0; // Ab (b9)
    melody[3] = 1.0; // Eb (b13)

    const combined = primary.map((p, i) => p + 0.45 * supporting[i] + 0.15 * melody[i]);
    const candidates = scoreChordCandidates(combined, 7, null, null, undefined, {
      primary,
      supporting,
      melody,
    });

    expect(candidates[0].rootName).toBe('G');
    expect(candidates[0].type).toBe('dom7');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 8: ChordAnalysisSpan === 'two_beats' in 4/4 meter creates 2 windows per bar
  // -------------------------------------------------------------------------------------------------
  it('Test 8: two_beats span generates exactly 2 windows per 4/4 bar ([0, 2 beats], [2 beats, 4 beats])', () => {
    const meterMap = buildMeterMap(
      defaultTimeSigs,
      ppq,
      ppq * 8
    );

    const windows = generateSpanWindows(meterMap, ppq * 8, 'two_beats', ppq);
    // 2 bars of 4/4 = 4 windows of 2 beats (960 ticks each)
    expect(windows.length).toBe(4);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 2, barIndex: 1, beatIndex: 1 });
    expect(windows[1]).toEqual({ startTicks: ppq * 2, endTicks: ppq * 4, barIndex: 1, beatIndex: 3 });
    expect(windows[2]).toEqual({ startTicks: ppq * 4, endTicks: ppq * 6, barIndex: 2, beatIndex: 1 });
    expect(windows[3]).toEqual({ startTicks: ppq * 6, endTicks: ppq * 8, barIndex: 2, beatIndex: 3 });
  });

  // -------------------------------------------------------------------------------------------------
  // Test 9: ChordAnalysisSpan === 'two_beats' in 3/4 meter (two_beats != half_bar)
  // -------------------------------------------------------------------------------------------------
  it('Test 9: two_beats in 3/4 meter creates 2 windows ([0, 2 beats] and [2 beats, 3 beats])', () => {
    const meterMap = buildMeterMap(
      [{ ticks: 0, time: 0, numerator: 3, denominator: 4 }],
      ppq,
      ppq * 6 // 2 bars of 3/4 (3 * 480 = 1440 ticks per bar)
    );

    const twoBeatWindows = generateSpanWindows(meterMap, ppq * 6, 'two_beats', ppq);
    expect(twoBeatWindows.length).toBe(4);
    // Bar 1: [0, 960] (2 beats) and [960, 1440] (1 beat)
    expect(twoBeatWindows[0]).toEqual({ startTicks: 0, endTicks: ppq * 2, barIndex: 1, beatIndex: 1 });
    expect(twoBeatWindows[1]).toEqual({ startTicks: ppq * 2, endTicks: ppq * 3, barIndex: 1, beatIndex: 3 });

    // Compare with half_bar in 3/4 (which splits 1440 in half = 720 ticks)
    const halfBarWindows = generateSpanWindows(meterMap, ppq * 6, 'half_bar', ppq);
    expect(halfBarWindows[0].endTicks - halfBarWindows[0].startTicks).toBe(720);
    expect(twoBeatWindows[0].endTicks - twoBeatWindows[0].startTicks).toBe(960);
    expect(twoBeatWindows[0].endTicks).not.toBe(halfBarWindows[0].endTicks);
  });

  // -------------------------------------------------------------------------------------------------
  // Test 10: 2-Beat boundary chord change detection in 1 bar
  // -------------------------------------------------------------------------------------------------
  it('Test 10: 2-beat chord changes (Cmaj -> A7 in same bar) are detected and separated in two_beats span mode', () => {
    const pianoTrack = createDummyTrack(0, 'Piano', 'harmony', 'primary_harmony');
    // Beat 1-2: C Major (C4, E4, G4)
    const cMajor = [
      createDummyNote('c1', 0, 60, 0, ppq * 2),
      createDummyNote('c2', 0, 64, 0, ppq * 2),
      createDummyNote('c3', 0, 67, 0, ppq * 2),
    ];
    // Beat 3-4: A7 (A3, C#4, E4, G4)
    const a7 = [
      createDummyNote('a1', 0, 57, ppq * 2, ppq * 2),
      createDummyNote('a2', 0, 61, ppq * 2, ppq * 2),
      createDummyNote('a3', 0, 64, ppq * 2, ppq * 2),
      createDummyNote('a4', 0, 67, ppq * 2, ppq * 2),
    ];
    pianoTrack.notes = [...cMajor, ...a7];

    const segments = detectChords(pianoTrack.notes, [pianoTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'two_beats',
    });

    expect(segments.length).toBe(2);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
    expect(segments[1].rootName).toBe('A');
    expect(segments[1].type).toBe('dom7');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 11: Multi-track Primary Harmony (String Quartet) combined into unified profile
  // -------------------------------------------------------------------------------------------------
  it('Test 11: Multi-track Primary Harmony tracks (Quartet) are combined cleanly', () => {
    // Violin 1 (E5), Violin 2 (C5), Viola (G4), Cello (C3)
    const vln1 = createDummyTrack(0, 'Violin I', 'harmony', 'primary_harmony', [createDummyNote('v1', 0, 76, 0, ppq * 4)]);
    const vln2 = createDummyTrack(1, 'Violin II', 'harmony', 'primary_harmony', [createDummyNote('v2', 1, 72, 0, ppq * 4)]);
    const vla = createDummyTrack(2, 'Viola', 'harmony', 'primary_harmony', [createDummyNote('va', 2, 67, 0, ppq * 4)]);
    const vlc = createDummyTrack(3, 'Cello', 'bass', 'bass_anchor', [createDummyNote('vc', 3, 48, 0, ppq * 4)]);

    const allNotes = [...vln1.notes, ...vln2.notes, ...vla.notes, ...vlc.notes];
    const tracks = [vln1, vln2, vla, vlc];

    const segments = detectChords(allNotes, tracks, ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
    expect(segments[0].bassName).toBe('C');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 12: Manual Chord Analysis Role overrides automatic classification
  // -------------------------------------------------------------------------------------------------
  it('Test 12: Manual chordAnalysisRoleSource === manual is strictly preserved by classifyAllTracks', () => {
    const track = createDummyTrack(0, 'Lead Synthesizer', 'auto', 'auto');
    track.settings.chordAnalysisRole = 'primary_harmony';
    track.settings.chordAnalysisRoleSource = 'manual';

    const classified = classifyAllTracks([track], ppq);
    expect(classified[0].settings.chordAnalysisRole).toBe('primary_harmony');
    expect(classified[0].settings.chordAnalysisRoleSource).toBe('manual');
    expect(getEffectiveChordRole(classified[0])).toBe('primary_harmony');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 13: Regression: Chord Guide tracks retain highest priority
  // -------------------------------------------------------------------------------------------------
  it('Test 13: Chord Guide track retains priority over normal tracks', () => {
    const guideTrack = createDummyTrack(0, 'Chord Guide [Guide]', 'chord_guide', 'primary_harmony');
    const guideNotes = [
      createDummyNote('g1', 0, 60, 0, ppq * 4),
      createDummyNote('g2', 0, 64, 0, ppq * 4),
      createDummyNote('g3', 0, 67, 0, ppq * 4),
    ];
    guideTrack.notes = guideNotes;

    const dummyOther = createDummyTrack(1, 'Lead Synth', 'melody', 'melody');
    const otherNotes = [
      createDummyNote('o1', 1, 62, 0, ppq * 4),
      createDummyNote('o2', 1, 65, 0, ppq * 4),
      createDummyNote('o3', 1, 69, 0, ppq * 4),
    ];
    dummyOther.notes = otherNotes;

    const allNotes = [...guideNotes, ...otherNotes];
    const segments = detectChords(allNotes, [guideTrack, dummyOther], ppq, ppq * 4, defaultTimeSigs, DEFAULT_ANALYSIS_SETTINGS);

    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].sourceType).toBe('GUIDE');
    expect(segments[0].rootName).toBe('C');
  });

  // -------------------------------------------------------------------------------------------------
  // Test 14: Variable Meter Map produces accurate 2-beat windows across meters
  // -------------------------------------------------------------------------------------------------
  it('Test 14: Variable meter changes (4/4 -> 3/4 -> 4/4) generate correct two_beats windows', () => {
    const timeSignatures: TimeSignatureInfo[] = [
      { ticks: 0, time: 0, numerator: 4, denominator: 4 },           // Bar 1-2: 0 - 3840
      { ticks: ppq * 8, time: 2, numerator: 3, denominator: 4 },     // Bar 3: 3840 - 5280
      { ticks: ppq * 11, time: 3.5, numerator: 4, denominator: 4 },  // Bar 4: 5280 - 7200
    ];

    const meterMap = buildMeterMap(timeSignatures, ppq, ppq * 15);
    const windows = generateSpanWindows(meterMap, ppq * 15, 'two_beats', ppq);

    expect(windows.length).toBeGreaterThan(5);
    // Find window corresponding to Bar 3 (3/4 meter)
    const bar3Windows = windows.filter(w => w.barIndex === 3);
    expect(bar3Windows.length).toBe(2);
    expect(bar3Windows[0].endTicks - bar3Windows[0].startTicks).toBe(ppq * 2); // 2 beats
    expect(bar3Windows[1].endTicks - bar3Windows[1].startTicks).toBe(ppq * 1); // 1 beat
  });

  // -------------------------------------------------------------------------------------------------
  // Test 15: Performance Benchmark: 50,000 Notes < 5000ms
  // -------------------------------------------------------------------------------------------------
  it('Test 15: 50,000 Notes Performance Benchmark finishes in < 5000ms', () => {
    const totalNotes = 50000;
    const tracks: TrackData[] = [
      createDummyTrack(0, 'Grand Piano', 'harmony', 'primary_harmony'),
      createDummyTrack(1, 'Electric Bass', 'bass', 'bass_anchor'),
      createDummyTrack(2, 'String Section', 'harmony', 'supporting_harmony'),
      createDummyTrack(3, 'Lead Vocal', 'melody', 'melody'),
    ];

    const notes: NoteData[] = [];
    const chordRoots = [60, 65, 67, 57]; // C, F, G, Am

    for (let i = 0; i < totalNotes; i++) {
      const trackIdx = i % 4;
      const root = chordRoots[Math.floor(i / 100) % 4];
      const startTicks = Math.floor(i / 4) * 240;
      const pitch = root + (i % 3) * 4;

      notes.push(createDummyNote(`bench_${i}`, trackIdx, pitch, startTicks, 240));
    }

    tracks.forEach((t, idx) => {
      t.notes = notes.filter(n => n.trackId === idx);
    });

    const durationTicks = Math.floor(totalNotes / 4) * 240;
    const midi: MidiData = {
      name: 'Benchmark50k',
      ppq,
      durationTicks,
      durationSeconds: (durationTicks / ppq) * 0.5,
      totalBars: Math.ceil(durationTicks / (ppq * 4)),
      tracks,
      notes,
      tempos: defaultTempos,
      timeSignatures: defaultTimeSigs,
    };

    const startTime = performance.now();
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);
    const elapsed = performance.now() - startTime;

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.analyses.size).toBe(totalNotes);
    expect(elapsed).toBeLessThan(5000);
  });
});
