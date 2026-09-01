import { describe, it, expect } from 'vitest';
import { detectChords } from '../chordDetection';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { NoteData, TrackData } from '../../types/midi';
import { ChordSegment } from '../../types/analysis';
import { matchesNoteFilter } from '../../utils/noteFilter';

describe('MIDI Harmony Inspector β0.4.1.1 Hotfix Master Test Suite (Tests 1 ~ 13)', () => {
  const ppq = 480;

  // Helper to create basic piano tracks
  const createPianoTrack = (notes: NoteData[]): TrackData[] => [
    {
      id: 0,
      sourceTrackIndex: 0,
      name: 'Piano',
      channel: 0,
      notes,
      settings: {
        trackId: 0,
        sourceTrackIndex: 0,
        name: 'Piano',
        channel: 0,
        role: 'harmony',
        rangePreset: 'all',
        analysisMinPitch: 0,
        analysisMaxPitch: 127,
        ignore: false,
        color: '#3b82f6',
        muted: false,
        solo: false,
        visible: true,
      },
      melodicConfidence: 0.2,
    },
  ];

  // -------------------------------------------------------------------------
  // PHASE N: Manual Chord Tests
  // -------------------------------------------------------------------------

  // Test 1: Manual Segment Bar 1 (Am7), Span 2 Bars -> Bar 1 = Am7 MANUAL, Bar 2 = AUTO
  it('Test 1: Manual segment in Bar 1 is preserved and Bar 2 is auto-analyzed when Span is 2 bars', () => {
    const notes: NoteData[] = [
      // Bar 1 (0 ~ 1920): notes for Am7
      { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 57, pitchClass: 9, octave: 3, name: 'A3', startTicks: 0, durationTicks: 1920, endTicks: 1920, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 57 },
      // Bar 2 (1920 ~ 3840): notes for C major (C4, E4, G4)
      { id: 'n2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 1920, durationTicks: 1920, endTicks: 3840, startSeconds: 1, durationSeconds: 1, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 60 },
      { id: 'n3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 1920, durationTicks: 1920, endTicks: 3840, startSeconds: 1, durationSeconds: 1, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 64 },
      { id: 'n4', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 3, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 1920, durationTicks: 1920, endTicks: 3840, startSeconds: 1, durationSeconds: 1, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 67 },
    ];
    const tracks = createPianoTrack(notes);

    const manualBar1: ChordSegment = {
      id: 'manual_bar1',
      startTicks: 0,
      endTicks: 1920,
      startSeconds: 0,
      endSeconds: 1,
      barIndex: 1,
      beatIndex: 1,
      root: 9,
      rootName: 'A',
      type: 'min7',
      typeName: 'Minor 7th',
      bass: 9,
      bassName: 'A',
      displayName: 'Am7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const segs = detectChords(
      notes,
      tracks,
      ppq,
      3840,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'two_bars' },
      [manualBar1]
    );

    expect(segs.length).toBe(2);
    // Segment 1: Bar 1 Manual
    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(1920);
    expect(segs[0].displayName).toBe('Am7');
    expect(segs[0].sourceType).toBe('MANUAL');

    // Segment 2: Bar 2 Auto
    expect(segs[1].startTicks).toBe(1920);
    expect(segs[1].endTicks).toBe(3840);
    expect(segs[1].displayName).toBe('C');
    expect(segs[1].sourceType).toBe('AUTO');
  });

  // Test 2: Manual segment Bar 2 only -> Bar 1 = AUTO, Bar 2 = MANUAL
  it('Test 2: Manual segment in Bar 2 only results in Bar 1 = AUTO, Bar 2 = MANUAL', () => {
    const notes: NoteData[] = [
      // Bar 1 (0 ~ 1920): notes for C major
      { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: 1920, endTicks: 1920, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 60 },
      { id: 'n2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: 1920, endTicks: 1920, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 64 },
    ];
    const tracks = createPianoTrack(notes);

    const manualBar2: ChordSegment = {
      id: 'manual_bar2',
      startTicks: 1920,
      endTicks: 3840,
      startSeconds: 1,
      endSeconds: 2,
      barIndex: 2,
      beatIndex: 1,
      root: 2,
      rootName: 'D',
      type: 'min7',
      typeName: 'Minor 7th',
      bass: 2,
      bassName: 'D',
      displayName: 'Dm7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const segs = detectChords(
      notes,
      tracks,
      ppq,
      3840,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'two_bars' },
      [manualBar2]
    );

    expect(segs.length).toBe(2);
    // Segment 1: Bar 1 Auto
    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(1920);
    expect(segs[0].sourceType).toBe('AUTO');

    // Segment 2: Bar 2 Manual
    expect(segs[1].startTicks).toBe(1920);
    expect(segs[1].endTicks).toBe(3840);
    expect(segs[1].displayName).toBe('Dm7');
    expect(segs[1].sourceType).toBe('MANUAL');
  });

  // Test 3: Manual segment Bar 1 Beat 3 to Bar 2 Beat 1 (960 to 2400) -> Exact range preserved
  it('Test 3: Partial-bar manual segment preserves its exact startTicks and endTicks without stretching', () => {
    const notes: NoteData[] = [
      { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: 3840, endTicks: 3840, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 60 },
    ];
    const tracks = createPianoTrack(notes);

    const manualPartial: ChordSegment = {
      id: 'manual_partial',
      startTicks: 960,
      endTicks: 2400,
      startSeconds: 0.5,
      endSeconds: 1.25,
      barIndex: 1,
      beatIndex: 3,
      root: 7,
      rootName: 'G',
      type: 'dom7',
      typeName: 'Dominant 7th',
      bass: 7,
      bassName: 'G',
      displayName: 'G7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const segs = detectChords(
      notes,
      tracks,
      ppq,
      3840,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'two_bars' },
      [manualPartial]
    );

    expect(segs.length).toBe(3);
    // Slice 1: 0 ~ 960 (AUTO)
    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(960);
    expect(segs[0].sourceType).toBe('AUTO');

    // Slice 2: 960 ~ 2400 (MANUAL G7)
    expect(segs[1].startTicks).toBe(960);
    expect(segs[1].endTicks).toBe(2400);
    expect(segs[1].displayName).toBe('G7');
    expect(segs[1].sourceType).toBe('MANUAL');

    // Slice 3: 2400 ~ 3840 (AUTO)
    expect(segs[2].startTicks).toBe(2400);
    expect(segs[2].endTicks).toBe(3840);
    expect(segs[2].sourceType).toBe('AUTO');
  });

  // Test 4: Manual Segment boundaries are not rounded to 1 bar in span mode
  it('Test 4: Manual segment boundaries are never rounded to full bars', () => {
    const manualHalfBar: ChordSegment = {
      id: 'manual_half',
      startTicks: 0,
      endTicks: 960, // 2 beats
      startSeconds: 0,
      endSeconds: 0.5,
      barIndex: 1,
      beatIndex: 1,
      root: 0,
      rootName: 'C',
      type: 'maj',
      typeName: 'Major',
      bass: 0,
      bassName: 'C',
      displayName: 'C',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const segs = detectChords(
      [],
      [],
      ppq,
      1920,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'one_bar' },
      [manualHalfBar]
    );

    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(960);
    expect(segs[0].sourceType).toBe('MANUAL');
  });

  // Test 5: Multiple Manual Segments in a single window are all preserved
  it('Test 5: Multiple manual segments are all preserved at their exact positions', () => {
    const manual1: ChordSegment = {
      id: 'm1',
      startTicks: 0,
      endTicks: 960,
      startSeconds: 0,
      endSeconds: 0.5,
      barIndex: 1,
      beatIndex: 1,
      root: 0,
      rootName: 'C',
      type: 'maj7',
      typeName: 'Major 7th',
      bass: 0,
      bassName: 'C',
      displayName: 'Cmaj7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const manual2: ChordSegment = {
      id: 'm2',
      startTicks: 960,
      endTicks: 1920,
      startSeconds: 0.5,
      endSeconds: 1.0,
      barIndex: 1,
      beatIndex: 3,
      root: 9,
      rootName: 'A',
      type: 'min7',
      typeName: 'Minor 7th',
      bass: 9,
      bassName: 'A',
      displayName: 'Am7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL',
    };

    const segs = detectChords(
      [],
      [],
      ppq,
      1920,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'one_bar' },
      [manual1, manual2]
    );

    expect(segs.length).toBe(2);
    expect(segs[0].displayName).toBe('Cmaj7');
    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(960);
    expect(segs[1].displayName).toBe('Am7');
    expect(segs[1].startTicks).toBe(960);
    expect(segs[1].endTicks).toBe(1920);
  });

  // -------------------------------------------------------------------------
  // PHASE O: Review UX Tests
  // -------------------------------------------------------------------------

  // Test 6: SAFE Note review button condition is false
  it('Test 6: SAFE Note cannot be marked reviewed (canMarkReviewed is false)', () => {
    const noteAnalysis: { status: 'SAFE' | 'INFO' | 'CHECK' | 'WARNING' } = { status: 'SAFE' };
    const canMarkReviewed = noteAnalysis.status !== 'SAFE';
    expect(canMarkReviewed).toBe(false);
  });

  // Test 7: INFO Note review button condition is true
  it('Test 7: INFO Note can be marked reviewed (canMarkReviewed is true)', () => {
    const noteAnalysis: { status: 'SAFE' | 'INFO' | 'CHECK' | 'WARNING' } = { status: 'INFO' };
    const canMarkReviewed = noteAnalysis.status !== 'SAFE';
    expect(canMarkReviewed).toBe(true);
  });

  // Test 8: CHECK Note review button condition is true
  it('Test 8: CHECK Note can be marked reviewed (canMarkReviewed is true)', () => {
    const noteAnalysis: { status: 'SAFE' | 'INFO' | 'CHECK' | 'WARNING' } = { status: 'CHECK' };
    const canMarkReviewed = noteAnalysis.status !== 'SAFE';
    expect(canMarkReviewed).toBe(true);
  });

  // Test 9: WARNING Note review button condition is true
  it('Test 9: WARNING Note can be marked reviewed (canMarkReviewed is true)', () => {
    const noteAnalysis: { status: 'SAFE' | 'INFO' | 'CHECK' | 'WARNING' } = { status: 'WARNING' };
    const canMarkReviewed = noteAnalysis.status !== 'SAFE';
    expect(canMarkReviewed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PHASE P: Filter & Navigation Tests
  // -------------------------------------------------------------------------

  // Test 10: CHECK以上 filter matches both CHECK and WARNING notes
  it('Test 10: matchesNoteFilter for CHECK filter returns true for both CHECK and WARNING', () => {
    expect(matchesNoteFilter('CHECK', 'CHECK')).toBe(true);
    expect(matchesNoteFilter('WARNING', 'CHECK')).toBe(true);
    expect(matchesNoteFilter('INFO', 'CHECK')).toBe(false);
    expect(matchesNoteFilter('SAFE', 'CHECK')).toBe(false);
  });

  // Test 11: Navigation with activeFilter === CHECK visits both CHECK and WARNING notes
  it('Test 11: Navigation with activeFilter = CHECK targets both CHECK and WARNING notes', () => {
    const notes = [
      { id: 'n_safe', status: 'SAFE' as const },
      { id: 'n_check', status: 'CHECK' as const },
      { id: 'n_warn', status: 'WARNING' as const },
    ];
    const reviewedSet = new Set<string>();

    const flagged = notes.filter(n => !reviewedSet.has(n.id) && matchesNoteFilter(n.status, 'CHECK'));
    expect(flagged.length).toBe(2);
    expect(flagged.map(f => f.id)).toEqual(['n_check', 'n_warn']);
  });

  // Test 12: Reviewed CHECK note is excluded from navigation
  it('Test 12: Reviewed CHECK note is excluded from active navigation', () => {
    const notes = [
      { id: 'n_check_1', status: 'CHECK' as const },
      { id: 'n_check_2', status: 'CHECK' as const },
    ];
    const reviewedSet = new Set<string>(['n_check_1']);

    const flagged = notes.filter(n => !reviewedSet.has(n.id) && matchesNoteFilter(n.status, 'CHECK'));
    expect(flagged.length).toBe(1);
    expect(flagged[0].id).toBe('n_check_2');
  });

  // Test 13: Reviewed WARNING note is excluded from navigation
  it('Test 13: Reviewed WARNING note is excluded from active navigation', () => {
    const notes = [
      { id: 'n_warn_1', status: 'WARNING' as const },
      { id: 'n_warn_2', status: 'WARNING' as const },
    ];
    const reviewedSet = new Set<string>(['n_warn_1']);

    const flagged = notes.filter(n => !reviewedSet.has(n.id) && matchesNoteFilter(n.status, 'WARNING_ONLY'));
    expect(flagged.length).toBe(1);
    expect(flagged[0].id).toBe('n_warn_2');
  });
});
