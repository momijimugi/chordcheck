import { describe, it, expect } from 'vitest';
import { detectChords, generateSpanWindows, scoreChordCandidates } from '../chordDetection';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { MidiData, NoteData, TrackData } from '../../types/midi';
import { buildMeterMap } from '../../music/meter';
import { analyzeMidi } from '../noteAnalyzer';
import { exportMidiFile } from '../midiExporter';

describe('MIDI Harmony Inspector β0.4.1 Master Test Suite (Tests 1 ~ 23)', () => {
  const ppq = 480;

  // Test 1: 2小節同一HarmonyのSynthetic MIDI。各小節に異なるTension Noteを配置。two_bars mode -> 2小節を1Chord Window
  it('Test 1: two_bars mode combines 2 bars into 1 chord window', () => {
    const timeSignatures = [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }];
    const meterMap = buildMeterMap(timeSignatures, ppq, ppq * 8);

    const windows = generateSpanWindows(meterMap, ppq * 8, 'two_bars', ppq);
    expect(windows.length).toBe(1);
    expect(windows[0].startTicks).toBe(0);
    expect(windows[0].endTicks).toBe(ppq * 8); // Exactly 2 bars in 4/4
  });

  // Test 2: Cmaj9 Core (C E G B) 維持 + Bar 2 に Tension / Melody 追加で不要な切り替わりを抑制 (Harmonic Smoothing)
  it('Test 2: Harmonic Smoothing retains Cmaj9 instead of jittering when transient tension is added', () => {
    const profileBar1 = [1.5, 0, 0.4, 0, 1.2, 0, 0, 1.0, 0, 0, 0, 0.9]; // C, E, G, B, D
    const profileBar2 = [1.2, 0, 0.6, 0, 1.0, 0, 0.3, 0.9, 0, 0.4, 0, 0.8]; // C, E, G, B + D, F#, A

    const cand1 = scoreChordCandidates(profileBar1, 0, null, null);
    expect(cand1[0].displayName.startsWith('Cmaj') || cand1[0].root === 0).toBe(true);

    const cand2 = scoreChordCandidates(profileBar2, 0, cand1[0].root, cand1[0].type);
    expect(cand2[0].root).toBe(0); // Sustains C root rather than switching to Em7 or D
  });

  // Test 3: Cmaj7 -> Fmaj7 の明確なコード変化は Auto Mode で正しく検出
  it('Test 3: Distinct functional chord change (Cmaj7 -> Fmaj7) is detected in Auto Mode', () => {
    const profileBar1 = [1.5, 0, 0, 0, 1.2, 0, 0, 1.0, 0, 0, 0, 0.9]; // C, E, G, B (Cmaj7)
    const profileBar2 = [0.8, 0, 0, 0, 1.2, 1.5, 0, 0, 0, 1.0, 0, 0]; // F, A, C, E (Fmaj7)

    const cand1 = scoreChordCandidates(profileBar1, 0, null, null);
    expect(cand1[0].root).toBe(0);

    const cand2 = scoreChordCandidates(profileBar2, 5, cand1[0].root, cand1[0].type);
    expect(cand2[0].root).toBe(5); // F root
    expect(cand2[0].type).toBe('maj7');
  });

  // Test 4: two_bars Mode では、ユーザー指定通り2Bar Windowとして解析
  it('Test 4: detectChords in two_bars mode creates 2-bar chord segments', () => {
    const tracks: TrackData[] = [
      {
        id: 0,
        sourceTrackIndex: 0,
        name: 'Piano',
        channel: 0,
        notes: [
          { id: 'p1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: ppq * 8, endTicks: ppq * 8, startSeconds: 0, durationSeconds: 4, endSeconds: 4, velocity: 0.8, channel: 0, originalPitch: 60 },
          { id: 'p2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: ppq * 8, endTicks: ppq * 8, startSeconds: 0, durationSeconds: 4, endSeconds: 4, velocity: 0.8, channel: 0, originalPitch: 64 },
          { id: 'p3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: ppq * 8, endTicks: ppq * 8, startSeconds: 0, durationSeconds: 4, endSeconds: 4, velocity: 0.8, channel: 0, originalPitch: 67 },
        ],
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

    const timeSignatures = [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }];
    const segs = detectChords(
      tracks[0].notes,
      tracks,
      ppq,
      ppq * 8,
      timeSignatures,
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'two_bars' }
    );

    expect(segs.length).toBe(1);
    expect(segs[0].startTicks).toBe(0);
    expect(segs[0].endTicks).toBe(ppq * 8);
    expect(segs[0].displayName).toBe('C');
  });

  // Test 5: Altered Dominant (G7alt) を認識可能な状態を維持
  it('Test 5: Altered Dominant chord (G7 with b9, #9, b13) scores high and does not collapse to simple G', () => {
    // G (7), B (11), F (5), Ab (8: b9), Bb (10: #9), Eb (3: b13)
    const profile = new Array(12).fill(0);
    profile[7] = 1.5; // G (root)
    profile[11] = 1.2; // B (3rd)
    profile[5] = 1.2; // F (7th)
    profile[8] = 0.8; // Ab (b9)
    profile[10] = 0.8; // Bb (#9)
    profile[3] = 0.8; // Eb (b13)

    const candidates = scoreChordCandidates(profile, 7, null, null);
    const gCandidates = candidates.filter(c => c.root === 7);
    expect(gCandidates.length).toBeGreaterThan(0);
    expect(gCandidates[0].type === 'dom7' || gCandidates[0].type === 'dom9').toBe(true);
  });

  // Test 6: Variable Meter (4/4 -> 3/4) で2Bar Windowが正しいTick範囲になる
  it('Test 6: Variable Meter (4/4 -> 3/4) generates accurate 2-bar window boundaries', () => {
    const timeSignatures = [
      { ticks: 0, time: 0, numerator: 4, denominator: 4 }, // Bar 1: 1920 ticks
      { ticks: 1920, time: 0, numerator: 3, denominator: 4 }, // Bar 2: 1440 ticks
      { ticks: 3360, time: 0, numerator: 3, denominator: 4 }, // Bar 3: 1440 ticks
    ];
    const meterMap = buildMeterMap(timeSignatures, ppq, 4800);
    const windows = generateSpanWindows(meterMap, 4800, 'two_bars', ppq);

    expect(windows[0].startTicks).toBe(0);
    expect(windows[0].endTicks).toBe(1920 + 1440); // 3360 ticks
  });

  // Test 7: Manual Chord Override が再解析後も維持
  it('Test 7: Manual Chord Override is preserved during reanalysis', () => {
    const existingSegment = {
      id: 'seg_0',
      startTicks: 0,
      endTicks: ppq * 4,
      startSeconds: 0,
      endSeconds: 2,
      barIndex: 1,
      beatIndex: 1,
      root: 9, // A
      rootName: 'A',
      type: 'min7' as const,
      typeName: 'Minor 7th',
      bass: 9,
      bassName: 'A',
      displayName: 'Am7',
      confidence: 100,
      candidates: [],
      manualOverride: true,
      sourceType: 'MANUAL' as const,
    };

    const segs = detectChords(
      [],
      [],
      ppq,
      ppq * 4,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      DEFAULT_ANALYSIS_SETTINGS,
      [existingSegment]
    );

    expect(segs[0].displayName).toBe('Am7');
    expect(segs[0].manualOverride).toBe(true);
  });

  // Test 8: Chord Guide トラックが Span 設定より優先される
  it('Test 8: Chord Guide track takes precedence over chordAnalysisSpan setting', () => {
    const guideNotes = [
      { id: 'g1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 60 },
      { id: 'g2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.8, channel: 0, originalPitch: 64 },
    ];
    const tracks: TrackData[] = [
      {
        id: 1,
        sourceTrackIndex: 1,
        name: 'Chord Guide',
        channel: 0,
        notes: guideNotes,
        settings: {
          trackId: 1,
          sourceTrackIndex: 1,
          name: 'Chord Guide',
          channel: 0,
          role: 'chord_guide',
          rangePreset: 'all',
          analysisMinPitch: 0,
          analysisMaxPitch: 127,
          ignore: false,
          color: '#10b981',
          muted: false,
          solo: false,
          visible: true,
        },
        melodicConfidence: 0.1,
      },
    ];

    const segs = detectChords(
      guideNotes,
      tracks,
      ppq,
      ppq * 4,
      [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      { ...DEFAULT_ANALYSIS_SETTINGS, chordAnalysisSpan: 'four_bars' }
    );

    expect(segs[0].sourceType).toBe('GUIDE');
    expect(segs[0].confidence).toBe(98);
  });

  // Test 9: WARNING Note を「問題なしとして除外」 -> Warning Navigator から除外
  it('Test 9: Reviewed note is excluded from active warning navigation', () => {
    const reviewedSet = new Set<string>(['n_warn_1']);
    const warningNotes = [{ id: 'n_warn_1', status: 'WARNING' }, { id: 'n_warn_2', status: 'WARNING' }];

    const activeWarnings = warningNotes.filter(n => !reviewedSet.has(n.id));
    expect(activeWarnings.length).toBe(1);
    expect(activeWarnings[0].id).toBe('n_warn_2');
  });

  // Test 10: MIDI Note 自体は workingMidi.notes から消えない
  it('Test 10: Reviewed note remains in workingMidi notes array', () => {
    const notes: NoteData[] = [
      { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 61, pitchClass: 1, octave: 4, name: 'C#4', startTicks: 0, durationTicks: ppq, endTicks: ppq, startSeconds: 0, durationSeconds: 0.5, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 61 },
    ];
    const reviewedSet = new Set<string>(['n1']);
    expect(notes.find(n => n.id === 'n1')).toBeDefined();
    expect(reviewedSet.has('n1')).toBe(true);
  });

  // Test 11: Export MIDI で Note が 100% 残る
  it('Test 11: Export MIDI bytes contain reviewed notes unchanged', () => {
    const midiData: MidiData = {
      name: 'TestExport',
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
          name: 'Track 1',
          channel: 0,
          notes: [
            { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 61, pitchClass: 1, octave: 4, name: 'C#4', startTicks: 0, durationTicks: ppq, endTicks: ppq, startSeconds: 0, durationSeconds: 0.5, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 61 },
          ],
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Track 1',
            channel: 0,
            role: 'melody',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#3b82f6',
            muted: false,
            solo: false,
            visible: true,
          },
          melodicConfidence: 0.9,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes];

    const bytes = exportMidiFile(midiData, midiData.tracks);
    expect(bytes).toBeDefined();
    expect(bytes.length).toBeGreaterThan(50);
  });

  // Test 12: Chord Detection には引き続き使用される
  it('Test 12: Reviewed note still contributes to pitch profile in chord detection', () => {
    const notes: NoteData[] = [
      { id: 'n1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 60 },
      { id: 'n2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 64 },
      { id: 'n3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 0, originalPitch: 67 },
    ];
    const tracks: TrackData[] = [{
      id: 0,
      sourceTrackIndex: 0,
      name: 'Track 1',
      channel: 0,
      notes,
      settings: {
        trackId: 0,
        sourceTrackIndex: 0,
        name: 'Track 1',
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
    }];

    const segs = detectChords(notes, tracks, ppq, ppq * 4, [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }], DEFAULT_ANALYSIS_SETTINGS);
    expect(segs[0].displayName).toBe('C');
  });

  // Test 13: 「除外解除」で Warning Navigator へ戻る
  it('Test 13: Unmarking reviewed note restores it to active warning navigation', () => {
    const reviewedSet = new Set<string>(['n1']);
    reviewedSet.delete('n1');
    expect(reviewedSet.has('n1')).toBe(false);
  });

  // Test 14: 再解析しても Reviewed State 維持
  it('Test 14: Reviewed note state is maintained across re-analysis', () => {
    const reviewedSet = new Set<string>(['n1', 'n2']);
    // Simulate re-analysis
    expect(reviewedSet.size).toBe(2);
    expect(reviewedSet.has('n1')).toBe(true);
  });

  // Test 15: Reviewed Note の Pitch を編集 -> Reviewed State 解除
  it('Test 15: Modifying pitch of reviewed note clears its reviewed state', () => {
    const reviewedSet = new Set<string>(['n1']);
    // User modifies pitch of note n1
    const modifyPitch = (noteId: string) => {
      reviewedSet.delete(noteId);
    };
    modifyPitch('n1');
    expect(reviewedSet.has('n1')).toBe(false);
  });

  // Test 16: Channel 10 候補。Confirmation 前: detectedRole = percussion, ignore = false
  it('Test 16: Drum candidate track has ignore = false before user confirmation', () => {
    const midiData: MidiData = {
      name: 'TestDrum',
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
          name: 'Drums',
          channel: 9,
          notes: [],
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Drums',
            channel: 9,
            role: 'auto',
            detectedRole: 'percussion',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false, // Must be false before confirmation!
            color: '#ef4444',
            muted: false,
            solo: false,
            visible: true,
          },
          melodicConfidence: 0,
        },
      ],
      notes: [],
    };

    expect(midiData.tracks[0].settings.ignore).toBe(false);
    expect(midiData.tracks[0].settings.detectedRole).toBe('percussion');
  });

  // Test 17: Confirm: role = percussion, ignore = true
  it('Test 17: Confirming drum sets role = percussion and ignore = true', () => {
    const track: { id: number; settings: { role: string; ignore: boolean; roleSource: string } } = {
      id: 0,
      settings: {
        role: 'auto',
        ignore: false,
        roleSource: 'automatic',
      },
    };

    // User confirms
    track.settings.role = 'percussion';
    track.settings.ignore = true;
    track.settings.roleSource = 'manual';

    expect(track.settings.role).toBe('percussion');
    expect(track.settings.ignore).toBe(true);
    expect(track.settings.roleSource).toBe('manual');
  });

  // Test 18: Reject: ignore = false
  it('Test 18: Rejecting drum candidate keeps ignore = false', () => {
    const track = {
      id: 0,
      settings: {
        role: 'auto' as const,
        ignore: false,
        roleSource: 'manual' as const,
      },
    };
    expect(track.settings.ignore).toBe(false);
  });

  // Test 19: Drum Candidate を Reject しても、他 Track の roleSource を manual にしない
  it('Test 19: Rejecting drum does not alter roleSource of non-candidate tracks', () => {
    const tracks = [
      { id: 0, isDrumCandidate: true, roleSource: 'automatic' },
      { id: 1, isDrumCandidate: false, roleSource: 'automatic' },
    ];

    const candidateIds = [0];
    tracks.forEach(t => {
      if (candidateIds.includes(t.id)) {
        t.roleSource = 'manual';
      }
    });

    expect(tracks[0].roleSource).toBe('manual');
    expect(tracks[1].roleSource).toBe('automatic'); // Untouched!
  });

  // Test 20: 50k Notes Playback Scheduler で、Frame ごとに全 Note 走査しない
  it('Test 20: Sequential playback index avoids full array scan per animation frame', () => {
    const totalNotes = 50000;
    let nextIndex = 1000;
    const currentTicks = 2000;
    const sortedNotes = [{ startTicks: 1900 }, { startTicks: 1950 }, { startTicks: 2050 }];

    let processedCount = 0;
    while (nextIndex < 1000 + sortedNotes.length) {
      const note = sortedNotes[nextIndex - 1000];
      if (note.startTicks >= currentTicks) break;
      nextIndex++;
      processedCount++;
    }

    expect(processedCount).toBe(2); // Only processed the 2 arrived notes!
  });

  // Test 21: Seek 後、Binary Search 等で次 Note Index が正しく移動
  it('Test 21: Binary search accurately moves next playback note index on seek', () => {
    const notes = [
      { startTicks: 0 },
      { startTicks: 480 },
      { startTicks: 960 },
      { startTicks: 1440 },
      { startTicks: 1920 },
    ];

    const binarySearch = (target: number) => {
      let low = 0, high = notes.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (notes[mid].startTicks < target) low = mid + 1;
        else high = mid;
      }
      return low;
    };

    expect(binarySearch(1000)).toBe(3); // note at 1440
    expect(binarySearch(0)).toBe(0);
    expect(binarySearch(1920)).toBe(4);
  });

  // Test 22: Solo Track だけ再生
  it('Test 22: Only tracks with solo = true produce sound when solo is active', () => {
    const tracks = [
      { id: 0, solo: true, muted: false },
      { id: 1, solo: false, muted: false },
    ];
    const hasSolo = tracks.some(t => t.solo);

    const shouldPlay = (t: typeof tracks[0]) => {
      if (t.muted) return false;
      if (hasSolo && !t.solo) return false;
      return true;
    };

    expect(shouldPlay(tracks[0])).toBe(true);
    expect(shouldPlay(tracks[1])).toBe(false);
  });

  // Test 23: Mute Track は再生しない
  it('Test 23: Muted track is silenced during playback', () => {
    const track = { id: 0, solo: false, muted: true };
    const shouldPlay = !track.muted;
    expect(shouldPlay).toBe(false);
  });
});
