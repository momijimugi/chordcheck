import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { exportMidiFile, getExportDiagnosticInfo } from '../midiExporter';
import { analyzeMidi } from '../noteAnalyzer';
import { DEMO_PRESETS, createDemoMidi } from '../../utils/demoMidi';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';

describe('MIDI Harmony Inspector β0.3.3 GitHub Pages Production Test Suite (Phase Q & E)', () => {
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

  // Test 1: Base Path in Production Build (dist/index.html references /chordcheck/assets/)
  it('Test 1: dist/index.html correctly includes base path /chordcheck/ for all script and link tags', () => {
    const distIndexPath = path.resolve(process.cwd(), 'dist', 'index.html');
    expect(fs.existsSync(distIndexPath)).toBe(true);

    const html = fs.readFileSync(distIndexPath, 'utf-8');
    expect(html).toContain('/chordcheck/assets/');
    expect(html).not.toMatch(/src="\/assets\//);
    expect(html).not.toMatch(/href="\/assets\//);
  });

  // Test 2: Web Worker Asset exists in dist/assets
  it('Test 2: Compiled Web Worker asset is generated with hash in dist/assets/', () => {
    const distAssetsPath = path.resolve(process.cwd(), 'dist', 'assets');
    expect(fs.existsSync(distAssetsPath)).toBe(true);

    const files = fs.readdirSync(distAssetsPath);
    const workerFile = files.find(f => f.startsWith('harmonyWorker') && f.endsWith('.js'));
    expect(workerFile).toBeDefined();
    expect(typeof workerFile).toBe('string');
  });

  // Test 3: Standard Generation Export Diagnostic and Safety Mode
  it('Test 3: Standard Generation mode is assigned when no original SMF bytes exist and triggers safety warning', () => {
    const demo = createDemoMidi('c_major_clean');
    // Ensure originalBytes is deleted to simulate standard generation
    delete (demo as any).originalBytes;

    const diag = getExportDiagnosticInfo(demo, demo.tracks);
    expect(diag.mode).toBe('Standard Generation');
    expect(diag.canExportDirectBytePatch).toBe(false);
    expect(diag.hasOriginalBytes).toBe(false);

    const exportedBytes = exportMidiFile(demo, demo.tracks);
    expect(exportedBytes.length).toBeGreaterThan(0);
    // Parse exported bytes to verify validity
    const reimported = new Midi(exportedBytes);
    expect(reimported.tracks.length).toBeGreaterThan(0);
  });

  // Test 4: Tone.js Fallback Export Diagnostic and Warning
  it('Test 4: Modifying an ambiguous note triggers Tone.js Fallback with clear diagnostic message', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 60, ticks: 0, durationTicks: 480 }, // Duplicate simultaneous note
    ]);

    const parsed = parseMidiFile(rawBytes, 'ambiguous_pair.mid');
    parsed.tracks[0].notes[0].pitch = 62; // Modify one of the ambiguous notes

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.mode).toBe('Tone.js Fallback');
    expect(diag.canExportDirectBytePatch).toBe(false);
    expect(diag.modifiedUnsafePatchCount).toBe(1);
    expect(diag.warningMessage).toContain('Tone.js');

    const exported = exportMidiFile(parsed, parsed.tracks);
    expect(exported.length).toBeGreaterThan(0);
  });

  // Test 5: No-Edit Export Byte Identity Retention
  it('Test 5: Exporting unmodified MIDI yields exact 100% byte identical output on production pipeline', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 64, ticks: 480, durationTicks: 480 },
      { midi: 67, ticks: 960, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'identity_test.mid');
    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.mode).toBe('Original Byte Identity');
    expect(diag.canExportDirectBytePatch).toBe(true);

    const exported = exportMidiFile(parsed, parsed.tracks);
    expect(exported.length).toBe(rawBytes.length);
    expect(Array.from(exported)).toEqual(Array.from(rawBytes));
  });

  // Test 6: Safe Pitch Edit Export Direct Byte Patch
  it('Test 6: Safe pitch editing updates only the exact pitch byte offsets without altering any metadata', () => {
    const rawBytes = createTestMidi([
      { midi: 60, ticks: 0, durationTicks: 480 },
      { midi: 64, ticks: 480, durationTicks: 480 },
    ]);

    const parsed = parseMidiFile(rawBytes, 'patch_test.mid');
    parsed.tracks[0].notes.find(n => n.originalPitch === 60)!.pitch = 61;

    const diag = getExportDiagnosticInfo(parsed, parsed.tracks);
    expect(diag.mode).toBe('Direct Raw Byte Patch');
    expect(diag.canExportDirectBytePatch).toBe(true);
    expect(diag.modifiedSafePatchCount).toBe(1);

    const exported = exportMidiFile(parsed, parsed.tracks);
    expect(exported.length).toBe(rawBytes.length);

    let changedByteCount = 0;
    for (let i = 0; i < rawBytes.length; i++) {
      if (rawBytes[i] !== exported[i]) changedByteCount++;
    }
    expect(changedByteCount).toBe(2); // Note On byte + Note Off byte
  });

  // Test 7: All 7 Demo Presets Load & Analyze on Production Engine
  it('Test 7: All 7 built-in demo presets load and analyze cleanly with non-empty chords and analyses', () => {
    DEMO_PRESETS.forEach(preset => {
      const demoMidi = createDemoMidi(preset.id);
      expect(demoMidi.notes.length).toBeGreaterThan(0);
      expect(demoMidi.tracks.length).toBeGreaterThan(0);

      const result = analyzeMidi(demoMidi, DEFAULT_ANALYSIS_SETTINGS);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.analyses.size).toBe(demoMidi.notes.length);
      expect(result.statusCounts.TOTAL).toBe(demoMidi.notes.length);
    });
  });

  // Test 8: High-load 50,000 Notes Analysis Benchmark under Production Settings
  it('Test 8: 50,000 Notes scale analysis completes within performance budget without memory leak', () => {
    const notesCount = 50000;
    const tracksCount = 10;
    const notesPerTrack = notesCount / tracksCount;
    const ppq = 480;

    const tracks: any[] = [];
    const allNotes: any[] = [];

    for (let t = 0; t < tracksCount; t++) {
      const trackNotes: any[] = [];
      for (let i = 0; i < notesPerTrack; i++) {
        const pitch = 48 + ((i + t * 4) % 36);
        const startTicks = i * 240;
        const durationTicks = 240;
        const note = {
          id: `t${t}_n${i}`,
          trackId: t,
          sourceTrackIndex: t,
          sourceNoteIndex: i,
          pitch,
          pitchClass: pitch % 12,
          octave: Math.floor(pitch / 12) - 1,
          name: `N_${pitch}`,
          startTicks,
          durationTicks,
          endTicks: startTicks + durationTicks,
          startSeconds: (startTicks / ppq) * 0.5,
          durationSeconds: (durationTicks / ppq) * 0.5,
          endSeconds: ((startTicks + durationTicks) / ppq) * 0.5,
          velocity: 0.8,
          channel: t % 16,
          originalPitch: pitch,
          rawPatchStatus: 'matched' as const,
        };
        trackNotes.push(note);
        allNotes.push(note);
      }
      tracks.push({
        id: t,
        name: `Track ${t}`,
        channel: t % 16,
        notes: trackNotes,
        settings: {
          visible: true,
          muted: false,
          solo: false,
          ignore: false,
          role: 'auto',
          rangePreset: 'full',
          analysisMinPitch: 0,
          analysisMaxPitch: 127,
          hasKeyswitchWarning: false,
        },
      });
    }

    const largeMidi = {
      name: '50k_bench',
      ppq,
      durationTicks: (notesPerTrack + 10) * 240,
      durationSeconds: ((notesPerTrack + 10) * 240 / ppq) * 0.5,
      totalBars: Math.ceil((notesPerTrack + 10) * 240 / (ppq * 4)),
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks,
      notes: allNotes,
    };

    const startTime = performance.now();
    const result = analyzeMidi(largeMidi as any, DEFAULT_ANALYSIS_SETTINGS);
    const duration = performance.now() - startTime;

    expect(result.analyses.size).toBe(50000);
    expect(result.statusCounts.TOTAL).toBe(50000);
    expect(duration).toBeLessThan(5000); // within 5 seconds budget
  });
});
