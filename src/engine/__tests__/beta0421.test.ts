import { describe, it, expect } from 'vitest';
import { detectChords, generateSpanWindows, getEffectiveChordRole, scoreChordCandidates } from '../chordDetection';
import { classifyTrack, classifyAllTracks } from '../trackClassifier';
import { buildMeterMap, getMusicalBeatTicks } from '../../music/meter';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { MidiData, NoteData, TrackData, TimeSignatureInfo, TempoInfo } from '../../types/midi';
import { pitchToName, getOctave } from '../../music/pitch';

describe('β0.4.2.1 Hotfix Master Test Suite - Chord Role Consistency, Compound Meter & Regression Protection', () => {
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

  // =========================================================================
  // PHASE K: Classifier Early Return Tests (Tests 1 ~ 5)
  // =========================================================================
  it('Test 1: Drum classification returns suggestedRole=percussion and suggestedChordRole=exclude', () => {
    const drumTrack = { id: 0, name: 'Standard Drums', channel: 9, notes: [] };
    const res = classifyTrack(drumTrack, ppq);
    expect(res.suggestedRole).toBe('percussion');
    expect(res.suggestedChordRole).toBe('exclude');
    expect(res.chordRoleConfidence).toBeGreaterThanOrEqual(80);
  });

  it('Test 2: Bass classification returns suggestedRole=bass and suggestedChordRole=bass_anchor', () => {
    const bassTrack = { id: 1, name: 'Electric Bass Finger', channel: 0, notes: [] };
    const res = classifyTrack(bassTrack, ppq);
    expect(res.suggestedRole).toBe('bass');
    expect(res.suggestedChordRole).toBe('bass_anchor');
    expect(res.chordRoleConfidence).toBe(92);
  });

  it('Test 3: Chord Guide classification returns suggestedRole=chord_guide and suggestedChordRole=primary_harmony', () => {
    const guideTrack = { id: 2, name: 'Chord Guide [Guide]', channel: 0, notes: [] };
    const res = classifyTrack(guideTrack, ppq);
    expect(res.suggestedRole).toBe('chord_guide');
    expect(res.suggestedChordRole).toBe('primary_harmony');
    expect(res.chordRoleConfidence).toBe(100);
  });

  it('Test 4: Piano classification returns suggestedChordRole=primary_harmony', () => {
    const pianoTrack = { id: 3, name: 'Acoustic Grand Piano', channel: 0, notes: [] };
    const res = classifyTrack(pianoTrack, ppq);
    expect(res.suggestedChordRole).toBe('primary_harmony');
  });

  it('Test 5: Vocal classification returns suggestedChordRole=melody', () => {
    const vocalTrack = { id: 4, name: 'Main Vocal Lead', channel: 0, notes: [] };
    const res = classifyTrack(vocalTrack, ppq);
    expect(res.suggestedChordRole).toBe('melody');
  });

  // =========================================================================
  // PHASE L: MIDI Parser Metadata Tests (Tests 6 ~ 8)
  // =========================================================================
  it('Test 6: ClassifyAllTracks sets chordAnalysisRole=auto and detectedChordAnalysisRole=primary_harmony for piano', () => {
    const pianoTrack = createDummyTrack(0, 'Grand Piano', 'harmony', 'auto');
    const [classified] = classifyAllTracks([pianoTrack], ppq);
    expect(classified.settings.chordAnalysisRole).toBe('auto');
    expect(classified.settings.detectedChordAnalysisRole).toBe('primary_harmony');
    expect(classified.settings.chordAnalysisRoleSource).toBe('automatic');
    expect(getEffectiveChordRole(classified)).toBe('primary_harmony');
  });

  it('Test 7: ClassifyAllTracks sets detectedChordAnalysisRole=bass_anchor for bass', () => {
    const bassTrack = createDummyTrack(1, 'Electric Bass', 'bass', 'auto');
    const [classified] = classifyAllTracks([bassTrack], ppq);
    expect(classified.settings.detectedChordAnalysisRole).toBe('bass_anchor');
    expect(getEffectiveChordRole(classified)).toBe('bass_anchor');
  });

  it('Test 8: ClassifyAllTracks sets detectedChordAnalysisRole=exclude for drums', () => {
    const drumTrack = createDummyTrack(9, 'Drum Kit', 'percussion', 'auto');
    const [classified] = classifyAllTracks([drumTrack], ppq);
    expect(classified.settings.detectedChordAnalysisRole).toBe('exclude');
    expect(getEffectiveChordRole(classified)).toBe('exclude');
  });

  // =========================================================================
  // PHASE M: Chord Exclude vs Track Ignore Separation (Tests 9 ~ 12)
  // =========================================================================
  it('Test 9: Setting ChordAnalysisRole to exclude does not change track ignore to true', () => {
    const violinTrack = createDummyTrack(0, 'Solo Violin', 'melody', 'auto');
    violinTrack.settings.ignore = false;

    // Simulate updateTrackChordRole
    const updatedSettings = {
      ...violinTrack.settings,
      chordAnalysisRole: 'exclude' as const,
      chordAnalysisRoleSource: 'manual' as const,
    };
    violinTrack.settings = updatedSettings;

    expect(violinTrack.settings.ignore).toBe(false);
    expect(getEffectiveChordRole(violinTrack)).toBe('exclude');
  });

  it('Test 10: Excluded track notes are not used in chord detection', () => {
    const pianoTrack = createDummyTrack(0, 'Piano', 'harmony', 'primary_harmony');
    const pianoNotes = [
      createDummyNote('p1', 0, 60, 0, ppq * 2), // C4
      createDummyNote('p2', 0, 64, 0, ppq * 2), // E4
      createDummyNote('p3', 0, 67, 0, ppq * 2), // G4
    ];
    pianoTrack.notes = pianoNotes;

    // Violin plays sharp dissonant tones (e.g. F#4=66, C#5=73) but is chord-excluded
    const violinTrack = createDummyTrack(1, 'Violin Excluded', 'melody', 'exclude');
    const violinNotes = [
      createDummyNote('v1', 1, 66, 0, ppq * 2),
      createDummyNote('v2', 1, 73, 0, ppq * 2),
    ];
    violinTrack.notes = violinNotes;

    const allNotes = [...pianoNotes, ...violinNotes];
    const segments = detectChords(allNotes, [pianoTrack, violinTrack], ppq, ppq * 2, defaultTimeSigs, DEFAULT_ANALYSIS_SETTINGS);

    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
  });

  it('Test 11: Excluded track notes are still analyzed in Note Risk Analysis', () => {
    const pianoTrack = createDummyTrack(0, 'Piano', 'harmony', 'primary_harmony');
    pianoTrack.notes = [
      createDummyNote('p1', 0, 60, 0, ppq * 2),
      createDummyNote('p2', 0, 64, 0, ppq * 2),
      createDummyNote('p3', 0, 67, 0, ppq * 2),
    ];

    const violinTrack = createDummyTrack(1, 'Violin Excluded', 'melody', 'exclude');
    violinTrack.settings.ignore = false;
    violinTrack.notes = [
      createDummyNote('v1', 1, 66, 0, ppq * 2), // F# against C Major = avoid/tritone check
    ];

    const midi: MidiData = {
      name: 'ExcludeAnalysisTest',
      ppq,
      durationTicks: ppq * 2,
      durationSeconds: 1.0,
      totalBars: 1,
      tracks: [pianoTrack, violinTrack],
      notes: [...pianoTrack.notes, ...violinTrack.notes],
      tempos: defaultTempos,
      timeSignatures: defaultTimeSigs,
    };

    const analysis = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);
    // Violin note MUST be analyzed and present in results (not ignored)
    expect(analysis.analyses.has('v1')).toBe(true);
    const v1Analysis = analysis.analyses.get('v1');
    expect(v1Analysis).toBeDefined();
  });

  it('Test 12: Restoring Chord Role from exclude to primary_harmony rejoins chord detection immediately', () => {
    const track = createDummyTrack(0, 'Synth Pad', 'harmony', 'exclude');
    expect(getEffectiveChordRole(track)).toBe('exclude');

    track.settings.chordAnalysisRole = 'primary_harmony';
    track.settings.chordAnalysisRoleSource = 'manual';
    expect(getEffectiveChordRole(track)).toBe('primary_harmony');
  });

  // =========================================================================
  // PHASE N: Compound Meter & Span Windows Tests (Tests 13 ~ 19)
  // =========================================================================
  it('Test 13: 4/4 two_beats generates exactly 2 windows per bar (Beat 1-2 and Beat 3-4)', () => {
    const meterMap = buildMeterMap(defaultTimeSigs, ppq, ppq * 4);
    const windows = generateSpanWindows(meterMap, ppq * 4, 'two_beats', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 2, barIndex: 1, beatIndex: 1 });
    expect(windows[1]).toEqual({ startTicks: ppq * 2, endTicks: ppq * 4, barIndex: 1, beatIndex: 3 });
  });

  it('Test 14: 3/4 two_beats generates 2 windows ([0, 2 beats] and [2 beats, 3 beats])', () => {
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 3, denominator: 4 }], ppq, ppq * 3);
    const windows = generateSpanWindows(meterMap, ppq * 3, 'two_beats', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 2, barIndex: 1, beatIndex: 1 });
    expect(windows[1]).toEqual({ startTicks: ppq * 2, endTicks: ppq * 3, barIndex: 1, beatIndex: 3 });
  });

  it('Test 15: 3/4 half_bar generates 2 equal windows of 1.5 beats (720 ticks each)', () => {
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 3, denominator: 4 }], ppq, ppq * 3);
    const windows = generateSpanWindows(meterMap, ppq * 3, 'half_bar', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0].endTicks - windows[0].startTicks).toBe(720);
    expect(windows[1].endTicks - windows[1].startTicks).toBe(720);
  });

  it('Test 16: 6/8 two_beats generates 1 window for the entire bar (2 musical beats = 6 eighth notes)', () => {
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 6, denominator: 8 }], ppq, ppq * 3);
    const windows = generateSpanWindows(meterMap, ppq * 3, 'two_beats', ppq);
    expect(windows.length).toBe(1);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 3, barIndex: 1, beatIndex: 1 });
  });

  it('Test 17: 6/8 half_bar generates 2 windows of 1 dotted quarter each (1.5 ppq = 720 ticks)', () => {
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 6, denominator: 8 }], ppq, ppq * 3);
    const windows = generateSpanWindows(meterMap, ppq * 3, 'half_bar', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0].endTicks - windows[0].startTicks).toBe(720);
    expect(windows[1].endTicks - windows[1].startTicks).toBe(720);
  });

  it('Test 18: 9/8 two_beats generates 2 windows (Beat 1-2: 2 dotted quarters = 3 ppq, Beat 3: 1 dotted quarter = 1.5 ppq)', () => {
    // 9/8 bar = 9 * 240 = 2160 ticks = 4.5 ppq
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 9, denominator: 8 }], ppq, Math.round(ppq * 4.5));
    const windows = generateSpanWindows(meterMap, Math.round(ppq * 4.5), 'two_beats', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 3, barIndex: 1, beatIndex: 1 });
    expect(windows[1]).toEqual({ startTicks: ppq * 3, endTicks: Math.round(ppq * 4.5), barIndex: 1, beatIndex: 3 });
  });

  it('Test 19: 12/8 two_beats generates 2 windows (Beat 1-2: 3 ppq, Beat 3-4: 3 ppq)', () => {
    // 12/8 bar = 12 * 240 = 2880 ticks = 6 ppq
    const meterMap = buildMeterMap([{ ticks: 0, time: 0, numerator: 12, denominator: 8 }], ppq, ppq * 6);
    const windows = generateSpanWindows(meterMap, ppq * 6, 'two_beats', ppq);
    expect(windows.length).toBe(2);
    expect(windows[0]).toEqual({ startTicks: 0, endTicks: ppq * 3, barIndex: 1, beatIndex: 1 });
    expect(windows[1]).toEqual({ startTicks: ppq * 3, endTicks: ppq * 6, barIndex: 1, beatIndex: 3 });
  });

  // =========================================================================
  // PHASE O: Chord Detection Regression (Tests 20 ~ 24)
  // =========================================================================
  it('Test 20: 4/4 2-beat chord changes (Cmaj -> A7 in 1 bar) are detected and separated', () => {
    const pianoTrack = createDummyTrack(0, 'Piano', 'harmony', 'primary_harmony');
    const cMajor = [
      createDummyNote('c1', 0, 60, 0, ppq * 2),
      createDummyNote('c2', 0, 64, 0, ppq * 2),
      createDummyNote('c3', 0, 67, 0, ppq * 2),
    ];
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

  it('Test 21: Piano Primary + Vocal Melody (with D, F#, A) maintains core Root C', () => {
    const backingTrack = createDummyTrack(0, 'Guitar', 'harmony', 'primary_harmony');
    const backingNotes = [
      createDummyNote('b1', 0, 60, 0, ppq * 4),
      createDummyNote('b2', 0, 64, 0, ppq * 4),
      createDummyNote('b3', 0, 67, 0, ppq * 4),
    ];
    backingTrack.notes = backingNotes;

    const leadTrack = createDummyTrack(1, 'Lead Vocal', 'melody', 'melody');
    const leadNotes = [
      createDummyNote('m1', 1, 74, 0, ppq),
      createDummyNote('m2', 1, 78, ppq, ppq),
      createDummyNote('m3', 1, 81, ppq * 2, ppq),
    ];
    leadTrack.notes = leadNotes;

    const allNotes = [...backingNotes, ...leadNotes];
    const segments = detectChords(allNotes, [backingTrack, leadTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].rootName).toBe('C');
  });

  it('Test 22: Bass D + C major backing results in Bass D without overwriting chord harmony', () => {
    const pianoTrack = createDummyTrack(0, 'Keys', 'harmony', 'primary_harmony');
    const pianoNotes = [
      createDummyNote('p1', 0, 60, 0, ppq * 4),
      createDummyNote('p2', 0, 64, 0, ppq * 4),
      createDummyNote('p3', 0, 67, 0, ppq * 4),
    ];
    pianoTrack.notes = pianoNotes;

    const bassTrack = createDummyTrack(1, 'Bass', 'bass', 'bass_anchor');
    const bassNotes = [
      createDummyNote('b1', 1, 38, 0, ppq * 4), // D2
    ];
    bassTrack.notes = bassNotes;

    const segments = detectChords([...pianoNotes, ...bassNotes], [pianoTrack, bassTrack], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].bassName).toBe('D');
  });

  it('Test 23: String Quartet multiple primary harmony tracks combine cleanly', () => {
    const vln1 = createDummyTrack(0, 'Violin I', 'harmony', 'primary_harmony', [createDummyNote('v1', 0, 76, 0, ppq * 4)]);
    const vln2 = createDummyTrack(1, 'Violin II', 'harmony', 'primary_harmony', [createDummyNote('v2', 1, 72, 0, ppq * 4)]);
    const vla = createDummyTrack(2, 'Viola', 'harmony', 'primary_harmony', [createDummyNote('va', 2, 67, 0, ppq * 4)]);
    const vlc = createDummyTrack(3, 'Cello', 'bass', 'bass_anchor', [createDummyNote('vc', 3, 48, 0, ppq * 4)]);

    const allNotes = [...vln1.notes, ...vln2.notes, ...vla.notes, ...vlc.notes];
    const segments = detectChords(allNotes, [vln1, vln2, vla, vlc], ppq, ppq * 4, defaultTimeSigs, {
      ...DEFAULT_ANALYSIS_SETTINGS,
      chordAnalysisSpan: 'one_bar',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].rootName).toBe('C');
    expect(segments[0].type).toBe('maj');
    expect(segments[0].bassName).toBe('C');
  });

  it('Test 24: Manual Chord Role is strictly preserved across reclassification', () => {
    const track = createDummyTrack(0, 'Synth Pad', 'auto', 'auto');
    track.settings.chordAnalysisRole = 'primary_harmony';
    track.settings.chordAnalysisRoleSource = 'manual';

    const classified = classifyAllTracks([track], ppq);
    expect(classified[0].settings.chordAnalysisRole).toBe('primary_harmony');
    expect(classified[0].settings.chordAnalysisRoleSource).toBe('manual');
    expect(getEffectiveChordRole(classified[0])).toBe('primary_harmony');
  });
});
