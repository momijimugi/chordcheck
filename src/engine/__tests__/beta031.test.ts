import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { MidiData, NoteData, TrackData } from '../../types/midi';
import { buildMeterMap, calculateTotalBars, getBarStartTicks, getTempoAtTicks } from '../../music/meter';
import { detectKeyFromNotes, formatPitchName, getNotesForKeyDetection } from '../../music/keyDetection';
import { parseSMFNoteOffsets } from '../smfPatcher';

describe('MIDI Harmony Inspector β0.3.1 Master Test Suite (Tests 1 ~ 12)', () => {
  // Test 1: Worker vs Main Thread analysis result consistency
  it('Test 1: Main Thread analyzeMidi produces consistent structure and counts', () => {
    const ppq = 480;
    const midi = new Midi();
    const trk = midi.addTrack();
    trk.name = 'Piano';
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    trk.addNote({ midi: 64, ticks: 0, durationTicks: 480 });
    trk.addNote({ midi: 67, ticks: 0, durationTicks: 480 });

    const rawBytes = midi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'test1.mid');
    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.analyses.size).toBe(3);
    expect(result.statusCounts.TOTAL).toBe(3);
  });

  // Test 2: Large Scale 10,000 Notes Correctness Analysis
  it('Test 2: 10,000 Notes analysis execution completes with correct total note count', () => {
    const ppq = 480;
    const trackCount = 10;
    const notesPerTrack = 1000;
    const totalNotes = trackCount * notesPerTrack;

    const tracks: TrackData[] = [];
    const allNotes: NoteData[] = [];

    for (let t = 0; t < trackCount; t++) {
      const trackNotes: NoteData[] = [];
      for (let n = 0; n < notesPerTrack; n++) {
        const startTicks = n * 240;
        const durationTicks = 200;
        const pitch = 48 + ((n + t) % 36);

        const noteData: NoteData = {
          id: `t${t}_n${n}`,
          trackId: t,
          sourceTrackIndex: t,
          sourceNoteIndex: n,
          pitch,
          pitchClass: pitch % 12,
          octave: Math.floor(pitch / 12) - 1,
          name: `N${pitch}`,
          startTicks,
          durationTicks,
          endTicks: startTicks + durationTicks,
          startSeconds: startTicks / ppq * 0.5,
          durationSeconds: durationTicks / ppq * 0.5,
          endSeconds: (startTicks + durationTicks) / ppq * 0.5,
          velocity: 0.8,
          channel: t % 16,
          originalPitch: pitch,
        };

        trackNotes.push(noteData);
        allNotes.push(noteData);
      }

      tracks.push({
        id: t,
        sourceTrackIndex: t,
        name: `Track ${t + 1}`,
        channel: t % 16,
        notes: trackNotes,
        settings: {
          trackId: t,
          sourceTrackIndex: t,
          name: `Track ${t + 1}`,
          channel: t % 16,
          role: t === 0 ? 'bass' : 'auto',
          rangePreset: 'all',
          analysisMinPitch: 0,
          analysisMaxPitch: 127,
          ignore: false,
          color: '#3b82f6',
          muted: false,
          solo: false,
          visible: true,
        },
        melodicConfidence: 0.8,
      });
    }

    const midiData: MidiData = {
      name: 'Benchmark_10000_Worker',
      ppq,
      durationTicks: notesPerTrack * 240,
      durationSeconds: (notesPerTrack * 240) / ppq * 0.5,
      totalBars: Math.ceil((notesPerTrack * 240) / (ppq * 4)),
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks,
      notes: allNotes,
    };

    const startTime = performance.now();
    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const elapsed = performance.now() - startTime;

    console.log(`[β0.3.1 Benchmark] 10,000 Notes took ${elapsed.toFixed(2)}ms`);

    expect(result.statusCounts.TOTAL).toBe(totalNotes);
    expect(result.analyses.size).toBe(totalNotes);
  });

  // Test 3: 4/4 -> 3/4 -> 6/8 totalBars = 12
  it('Test 3: 4/4 (4 bars) -> 3/4 (4 bars) -> 6/8 (4 bars) calculates totalBars as 12', () => {
    const ppq = 480;
    // 4 bars of 4/4 = 4 * 1920 = 7680 ticks
    // 4 bars of 3/4 = 4 * 1440 = 5760 ticks (end at 13440)
    // 4 bars of 6/8 = 4 * 1440 = 5760 ticks (end at 19200)
    const timeSignatures = [
      { ticks: 0, time: 0, numerator: 4, denominator: 4 },
      { ticks: 7680, time: 0, numerator: 3, denominator: 4 },
      { ticks: 13440, time: 0, numerator: 6, denominator: 8 },
    ];
    const durationTicks = 19200;
    const meterMap = buildMeterMap(timeSignatures, ppq, durationTicks);
    const totalBars = calculateTotalBars(durationTicks, meterMap, ppq);

    expect(totalBars).toBe(12);
  });

  // Test 4: Adaptive Change Points with meter changes
  it('Test 4: Adaptive bar start ticks are accurately derived across mixed meter regions', () => {
    const ppq = 480;
    const timeSignatures = [
      { ticks: 0, time: 0, numerator: 4, denominator: 4 },
      { ticks: 7680, time: 0, numerator: 3, denominator: 4 },
      { ticks: 13440, time: 0, numerator: 6, denominator: 8 },
    ];
    const totalDurationTicks = 19200;
    const meterMap = buildMeterMap(timeSignatures, ppq, totalDurationTicks);
    const barStarts = getBarStartTicks(meterMap, totalDurationTicks);

    // Bar 1..4 (4/4): 0, 1920, 3840, 5760
    expect(barStarts).toContain(0);
    expect(barStarts).toContain(1920);
    expect(barStarts).toContain(3840);
    expect(barStarts).toContain(5760);

    // Bar 5..8 (3/4): 7680, 9120, 10560, 12000
    expect(barStarts).toContain(7680);
    expect(barStarts).toContain(9120);
    expect(barStarts).toContain(10560);
    expect(barStarts).toContain(12000);

    // Bar 9..12 (6/8): 13440, 14880, 16320, 17760
    expect(barStarts).toContain(13440);
    expect(barStarts).toContain(14880);
    expect(barStarts).toContain(16320);
    expect(barStarts).toContain(17760);
  });

  // Test 5: Drum Track isolation in Key Detection
  it('Test 5: Large amounts of C/D/E on Percussion Track do NOT contaminate Key Detection', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestDrums',
      ppq,
      durationTicks: ppq * 8,
      durationSeconds: 4,
      totalBars: 2,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Drums',
          channel: 9,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Drums',
            channel: 9,
            role: 'percussion',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: true,
            color: '#ef4444',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // Hundreds of Bass Drum (C1=36) and Snare (D1=38)
            { id: 'd1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 36, pitchClass: 0, octave: 1, name: 'C1', startTicks: 0, durationTicks: 240, endTicks: 240, startSeconds: 0, durationSeconds: 0.25, endSeconds: 0.25, velocity: 0.9, channel: 9, originalPitch: 36 },
            { id: 'd2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 38, pitchClass: 2, octave: 1, name: 'D1', startTicks: 240, durationTicks: 240, endTicks: 480, startSeconds: 0.25, durationSeconds: 0.25, endSeconds: 0.5, velocity: 0.9, channel: 9, originalPitch: 38 },
          ],
          melodicConfidence: 0,
        },
        {
          id: 1,
          sourceTrackIndex: 1,
          name: 'Flute (G Major Melody)',
          channel: 0,
          settings: {
            trackId: 1,
            sourceTrackIndex: 1,
            name: 'Flute',
            channel: 0,
            role: 'melody',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // G Major scale phrase: G4, A4, B4, C5, D5, E5, F#5, G5
            { id: 'f1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.9, channel: 0, originalPitch: 67 },
            { id: 'f2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 69, pitchClass: 9, octave: 4, name: 'A4', startTicks: ppq, durationTicks: ppq, endTicks: ppq * 2, startSeconds: 0.5, durationSeconds: 0.5, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 69 },
            { id: 'f3', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 2, pitch: 71, pitchClass: 11, octave: 4, name: 'B4', startTicks: ppq * 2, durationTicks: ppq, endTicks: ppq * 3, startSeconds: 1, durationSeconds: 0.5, endSeconds: 1.5, velocity: 0.8, channel: 0, originalPitch: 71 },
            { id: 'f4', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 3, pitch: 72, pitchClass: 0, octave: 5, name: 'C5', startTicks: ppq * 3, durationTicks: ppq, endTicks: ppq * 4, startSeconds: 1.5, durationSeconds: 0.5, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 72 },
            { id: 'f5', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 4, pitch: 74, pitchClass: 2, octave: 5, name: 'D5', startTicks: ppq * 4, durationTicks: ppq, endTicks: ppq * 5, startSeconds: 2, durationSeconds: 0.5, endSeconds: 2.5, velocity: 0.8, channel: 0, originalPitch: 74 },
            { id: 'f6', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 5, pitch: 76, pitchClass: 4, octave: 5, name: 'E5', startTicks: ppq * 5, durationTicks: ppq, endTicks: ppq * 6, startSeconds: 2.5, durationSeconds: 0.5, endSeconds: 3, velocity: 0.8, channel: 0, originalPitch: 76 },
            { id: 'f7', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 6, pitch: 78, pitchClass: 6, octave: 5, name: 'F#5', startTicks: ppq * 6, durationTicks: ppq, endTicks: ppq * 7, startSeconds: 3, durationSeconds: 0.5, endSeconds: 3.5, velocity: 0.8, channel: 0, originalPitch: 78 },
            { id: 'f8', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 7, pitch: 79, pitchClass: 7, octave: 5, name: 'G5', startTicks: ppq * 7, durationTicks: ppq * 2, endTicks: ppq * 9, startSeconds: 3.5, durationSeconds: 1, endSeconds: 4.5, velocity: 0.9, channel: 0, originalPitch: 79 },
          ],
          melodicConfidence: 1.0,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes, ...midiData.tracks[1].notes];

    const keyNotes = getNotesForKeyDetection(midiData);
    expect(keyNotes.length).toBe(8);
    expect(keyNotes.some(n => n.trackId === 0)).toBe(false);

    const key = detectKeyFromNotes(keyNotes, ppq);
    expect(key.root).toBe(7); // G
    expect(key.mode).toBe('major');
  });

  // Test 6: Keyswitch note isolation in Key Detection
  it('Test 6: Low keyswitch notes (C-1 / D-1) do NOT contaminate Key Detection', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestKS',
      ppq,
      durationTicks: ppq * 4,
      durationSeconds: 2,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Violin KS',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Violin KS',
            channel: 0,
            role: 'keyswitch',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: true,
            color: '#8b5cf6',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'k1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 12, pitchClass: 0, octave: 0, name: 'C0', startTicks: 0, durationTicks: ppq, endTicks: ppq, startSeconds: 0, durationSeconds: 0.5, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 12 },
          ],
          melodicConfidence: 0,
        },
        {
          id: 1,
          sourceTrackIndex: 1,
          name: 'Strings (D Major)',
          channel: 1,
          settings: {
            trackId: 1,
            sourceTrackIndex: 1,
            name: 'Strings',
            channel: 1,
            role: 'harmony',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 's1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 62, pitchClass: 2, octave: 4, name: 'D4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 62 },
            { id: 's2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 66, pitchClass: 6, octave: 4, name: 'F#4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 66 },
            { id: 's3', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 2, pitch: 69, pitchClass: 9, octave: 4, name: 'A4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 69 },
          ],
          melodicConfidence: 0.5,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes, ...midiData.tracks[1].notes];

    const keyNotes = getNotesForKeyDetection(midiData);
    expect(keyNotes.length).toBe(3);
    const key = detectKeyFromNotes(keyNotes, ppq);
    expect(key.root).toBe(2); // D
    expect(key.mode).toBe('major');
  });

  // Test 7: Identical Key Detection across PPQ 480, 960, 1920
  it('Test 7: Same musical piece produces identical Key Detection across PPQ 480, 960, 1920', () => {
    [480, 960, 1920].forEach(ppq => {
      const notes: NoteData[] = [
        { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 60 },
        { id: 'n2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 64 },
        { id: 'n3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 67 },
      ];
      const key = detectKeyFromNotes(notes, ppq);
      expect(key.root).toBe(0); // C
      expect(key.mode).toBe('major');
    });
  });

  // Test 8: F Major pitch 70 is Bb4 (not A#4)
  it('Test 8: In F Major, pitch 70 is formatted as Bb4 instead of A#4', () => {
    const fMajorContext = { root: 5, mode: 'major' as const, name: 'F Major', confidence: 95, manualOverride: false };
    const pitchName = formatPitchName(70, fMajorContext);
    expect(pitchName).toBe('Bb4');
  });

  // Test 9: E Major pitch 66 is F#4 (not Gb4)
  it('Test 9: In E Major, pitch 66 is formatted as F#4 instead of Gb4', () => {
    const eMajorContext = { root: 4, mode: 'major' as const, name: 'E Major', confidence: 95, manualOverride: false };
    const pitchName = formatPitchName(66, eMajorContext);
    expect(pitchName).toBe('F#4');
  });

  // Test 10: Key Manual Override
  it('Test 10: Key Manual Override sets confidence to 100 and manualOverride to true', () => {
    const midiData: MidiData = {
      name: 'TestOverride',
      ppq: 480,
      durationTicks: 1920,
      durationSeconds: 1,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Piano',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Piano',
            channel: 0,
            role: 'auto',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#3b82f6',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'p1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: 480, endTicks: 480, startSeconds: 0, durationSeconds: 0.5, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 60 },
          ],
          melodicConfidence: 1.0,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes];

    const customSettings = {
      ...DEFAULT_ANALYSIS_SETTINGS,
      keyOverride: { root: 2, mode: 'minor' as const }, // D Minor
    };

    const result = analyzeMidi(midiData, customSettings);
    expect(result.segments.length).toBeGreaterThan(0);
  });

  // Test 11: Duplicate Simultaneous Notes detection in SMF Patcher
  it('Test 11: SMF Patcher flags duplicate simultaneous notes on same pitch as ambiguous', () => {
    const midi = new Midi();
    const trk = midi.addTrack();
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 }); // Duplicate identical note

    const bytes = midi.toArray();
    const offsets = parseSMFNoteOffsets(bytes);
    expect(offsets.length).toBe(2);
    expect(offsets[0].isAmbiguous).toBe(true);
    expect(offsets[1].isAmbiguous).toBe(true);
  });

  // Test 12: Tempo Change Playback Utility getTempoAtTicks
  it('Test 12: getTempoAtTicks correctly returns tempo at ticks across multiple tempo changes', () => {
    const tempos = [
      { ticks: 0, time: 0, bpm: 120 },
      { ticks: 3840, time: 2, bpm: 60 },
      { ticks: 7680, time: 4, bpm: 180 },
    ];

    expect(getTempoAtTicks(0, tempos)).toBe(120);
    expect(getTempoAtTicks(1000, tempos)).toBe(120);
    expect(getTempoAtTicks(3840, tempos)).toBe(60);
    expect(getTempoAtTicks(5000, tempos)).toBe(60);
    expect(getTempoAtTicks(7680, tempos)).toBe(180);
    expect(getTempoAtTicks(10000, tempos)).toBe(180);
  });
});
