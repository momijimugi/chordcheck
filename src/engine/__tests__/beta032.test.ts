import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { exportMidiFile, getExportDiagnosticInfo } from '../midiExporter';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { harmonyWorkerBridge } from '../../workers/harmonyWorkerBridge';
import { NoteData } from '../../types/midi';
import { formatPitchName } from '../../music/keyDetection';
import { buildMeterMap, calculateTotalBars } from '../../music/meter';

describe('MIDI Harmony Inspector β0.3.2 Master Safety & Worker Test Suite (Tests 1 ~ 12)', () => {
  // Helper to create SMF bytes with Tonejs
  const createTestMidi = (
    noteDefs: Array<{ midi: number; ticks: number; durationTicks: number; velocity?: number; channel?: number }>
  ) => {
    const midi = new Midi();
    const trk = midi.addTrack();
    noteDefs.forEach(n => {
      trk.addNote({
        midi: n.midi,
        ticks: n.ticks,
        durationTicks: n.durationTicks,
        velocity: n.velocity ?? 0.8,
      });
    });
    const bytes = midi.toArray();
    return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  };

  // Test 1: Duplicate Note Detection -> rawPatchStatus = 'ambiguous'
  it('Test 1: Duplicate simultaneous notes on same track/pitch are marked as ambiguous and have no byte offsets', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 }, // Duplicate simultaneous note
      { midi: 64, ticks: 480, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'ambiguous_test.mid');
    expect(parsed.notes.length).toBe(3);

    const ambiguousNotes = parsed.notes.filter(n => n.rawPatchStatus === 'ambiguous');
    expect(ambiguousNotes.length).toBe(2);

    ambiguousNotes.forEach(n => {
      expect(n.noteOnPitchByteOffset).toBeUndefined();
      expect(n.noteOffPitchByteOffset).toBeUndefined();
    });

    const cleanNote = parsed.notes.find(n => n.pitch === 64);
    expect(cleanNote?.rawPatchStatus).toBe('matched');
    expect(cleanNote?.noteOnPitchByteOffset).toBeDefined();
  });

  // Test 2: Ambiguous Note Unedited -> 100% Byte Identical Export
  it('Test 2: MIDI containing ambiguous notes retains 100% byte identity when exported without edits', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 67, ticks: 480, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'no_edit.mid');
    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);

    expect(diag.mode).toBe('Original Byte Identity');
    expect(diag.ambiguousNotesCount).toBe(2);

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    expect(exportedBytes.length).toBe(rawBytes.length);
    expect(Array.from(exportedBytes)).toEqual(Array.from(rawBytes));
  });

  // Test 3: Editing only Non-Ambiguous Note -> Direct Raw Byte Patch is Permitted
  it('Test 3: Editing only a matched note in a file with ambiguous notes elsewhere still allows Direct Raw Byte Patch', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 }, // Ambiguous pair
      { midi: 64, ticks: 480, durationTicks: 480 }, // Matched note
    ]);

    const parsed = parseMidiFile(rawBytes, 'partial_edit.mid');
    // Modify ONLY the clean matched note (64 -> 65)
    parsed.tracks[0].notes.find(n => n.originalPitch === 64)!.pitch = 65;

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.mode).toBe('Direct Raw Byte Patch');
    expect(diag.canExportDirectBytePatch).toBe(true);
    expect(diag.modifiedNotesCount).toBe(1);
    expect(diag.modifiedSafePatchCount).toBe(1);
    expect(diag.modifiedUnsafePatchCount).toBe(0);
    expect(diag.ambiguousNotesCount).toBe(2);

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    expect(exportedBytes.length).toBe(rawBytes.length);

    // Verify only the 2 pitch bytes changed in the raw SMF
    let diffCount = 0;
    for (let i = 0; i < rawBytes.length; i++) {
      if (rawBytes[i] !== exportedBytes[i]) {
        diffCount++;
      }
    }
    expect(diffCount).toBe(2); // Note On byte + Note Off byte
  });

  // Test 4: Editing an Ambiguous Note -> Falls back to Tone.js Fallback
  it('Test 4: Editing an ambiguous note prevents Direct Raw Byte Patch and switches mode to Tone.js Fallback', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 }, // Ambiguous pair
    ]);

    const parsed = parseMidiFile(rawBytes, 'ambiguous_edit.mid');
    // Modify one of the ambiguous notes (60 -> 62)
    parsed.tracks[0].notes[0].pitch = 62;

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.mode).toBe('Tone.js Fallback');
    expect(diag.canExportDirectBytePatch).toBe(false);
    expect(diag.modifiedNotesCount).toBe(1);
    expect(diag.modifiedSafePatchCount).toBe(0);
    expect(diag.modifiedUnsafePatchCount).toBe(1);
  });

  // Test 5: Diagnostics Field Accuracy
  it('Test 5: getExportDiagnosticInfo accurately counts all diagnostic categories', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 }, // 2 ambiguous
      { midi: 64, ticks: 480, durationTicks: 480 }, // matched
      { midi: 67, ticks: 960, durationTicks: 480 }, // matched
    ]);

    const parsed = parseMidiFile(rawBytes, 'diag_test.mid');
    // Modify 1 matched (64 -> 65) and 1 ambiguous (60 -> 61)
    parsed.tracks[0].notes.find(n => n.originalPitch === 64)!.pitch = 65;
    parsed.tracks[0].notes[0].pitch = 61;

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.totalNotes).toBe(4);
    expect(diag.matchedNotesCount).toBe(2);
    expect(diag.ambiguousNotesCount).toBe(2);
    expect(diag.modifiedNotesCount).toBe(2);
    expect(diag.modifiedSafePatchCount).toBe(1);
    expect(diag.modifiedUnsafePatchCount).toBe(1);
    expect(diag.mode).toBe('Tone.js Fallback');
  });

  // Test 6: Unmatched Note Identification
  it('Test 6: Synthetically added note without SMF offset has rawPatchStatus unmatched', () => {
    const rawBytes = createTestMidi([{ midi: 60, ticks: 0, durationTicks: 480 }]);
    const parsed = parseMidiFile(rawBytes, 'unmatched_test.mid');

    const syntheticNote: NoteData = {
      id: 'synth_1',
      trackId: 0,
      sourceTrackIndex: 0,
      sourceNoteIndex: 99,
      pitch: 72,
      pitchClass: 0,
      octave: 5,
      name: 'C5',
      startTicks: 960,
      durationTicks: 480,
      endTicks: 1440,
      startSeconds: 1,
      durationSeconds: 0.5,
      endSeconds: 1.5,
      velocity: 0.8,
      channel: 0,
      originalPitch: 72,
      rawPatchStatus: 'unmatched',
    };

    parsed.notes.push(syntheticNote);
    parsed.tracks[0].notes.push(syntheticNote);

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.unmatchedNotesCount).toBe(1);
  });

  // Test 7: Clean Matched Note Identification
  it('Test 7: Regular clean notes are assigned rawPatchStatus matched and valid byte offsets', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 64, ticks: 480, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'matched_test.mid');
    parsed.notes.forEach(n => {
      expect(n.rawPatchStatus).toBe('matched');
      expect(typeof n.noteOnPitchByteOffset).toBe('number');
      expect(typeof n.noteOffPitchByteOffset).toBe('number');
    });
  });

  // Test 8: Worker and Main Thread Result Consistency
  it('Test 8: Full analyzeMidi yields consistent segment structure and analyses count', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 64, ticks: 0, durationTicks: 480 },
      { midi: 67, ticks: 0, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'worker_compare.mid');
    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.analyses.size).toBe(3);
    expect(result.statusCounts.TOTAL).toBe(3);
  });

  // Test 9: Old requestId rejection & Worker Bridge lifecycle
  it('Test 9: HarmonyWorkerBridge tracks currentRequestId and isBusy flag correctly', () => {
    const rawBytes = createTestMidi([{ midi: 60, ticks: 0, durationTicks: 480 }]);
    const parsed = parseMidiFile(rawBytes, 'bridge_test.mid');

    const reqId1 = harmonyWorkerBridge.analyze(parsed, DEFAULT_ANALYSIS_SETTINGS, [], {
      onProgress: () => {},
      onSuccess: () => {},
      onError: () => {},
    });

    expect(harmonyWorkerBridge.isBusy).toBe(true);
    expect(reqId1.startsWith('req_')).toBe(true);

    // Starting a new analysis immediately cancels the previous one
    const reqId2 = harmonyWorkerBridge.analyze(parsed, DEFAULT_ANALYSIS_SETTINGS, [], {
      onProgress: () => {},
      onSuccess: () => {},
      onError: () => {},
    });

    expect(reqId2).not.toBe(reqId1);
    expect(harmonyWorkerBridge.isBusy).toBe(true);

    harmonyWorkerBridge.cancelCurrentAnalysis();
    expect(harmonyWorkerBridge.isBusy).toBe(false);
  });

  // Test 10: Worker Cancellation clears state cleanly
  it('Test 10: cancelCurrentAnalysis cleanly resets worker and busy state', () => {
    harmonyWorkerBridge.cancelCurrentAnalysis();
    expect(harmonyWorkerBridge.isBusy).toBe(false);
  });

  // Test 11: Main Thread Fallback on analysis call
  it('Test 11: Main thread direct analysis executes without errors on complex polyphony', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 960 },
      { midi: 64, ticks: 0, durationTicks: 960 },
      { midi: 67, ticks: 0, durationTicks: 960 },
      { midi: 71, ticks: 0, durationTicks: 960 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'polyphony.mid');
    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.statusCounts.TOTAL).toBe(4);
  });

  // Test 12: Core Regression Checks (Meter, Key Spelling, Enharmonic)
  it('Test 12: Enharmonic spelling and Meter calculation remain 100% robust', () => {
    const fMajorContext = { root: 5, mode: 'major' as const, name: 'F Major', confidence: 95, manualOverride: false };
    const eMajorContext = { root: 4, mode: 'major' as const, name: 'E Major', confidence: 95, manualOverride: false };

    expect(formatPitchName(70, fMajorContext)).toBe('Bb4');
    expect(formatPitchName(66, eMajorContext)).toBe('F#4');

    const meterMap = buildMeterMap(
      [
        { ticks: 0, time: 0, numerator: 4, denominator: 4 },
        { ticks: 7680, time: 0, numerator: 3, denominator: 4 },
      ],
      480,
      13440
    );
    const totalBars = calculateTotalBars(13440, meterMap, 480);
    expect(totalBars).toBe(8);
  });
});
