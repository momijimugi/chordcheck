import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';

describe('Chord Guide Track & Benchmark (β0.2)', () => {
  it('derives chord progression directly from Chord Guide track with high confidence', () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const ppq = 480;

    // 1. Chord Guide Track (Cubase Chord Track MIDI export)
    const chordGuide = midi.addTrack();
    chordGuide.name = 'Chord Track Guide';
    chordGuide.channel = 0;
    // Bar 1: C Major (C4, E4, G4)
    chordGuide.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 });
    chordGuide.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 });
    chordGuide.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 });
    // Bar 2: F Major (F4, A4, C5)
    chordGuide.addNote({ midi: 65, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.8 });
    chordGuide.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.8 });
    chordGuide.addNote({ midi: 72, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.8 });

    // 2. Melody Track (Violin)
    const melody = midi.addTrack();
    melody.name = 'Violin Lead';
    melody.channel = 1;
    melody.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 2, velocity: 0.8 });
    melody.addNote({ midi: 65, ticks: ppq * 4, durationTicks: ppq * 2, velocity: 0.8 });

    const rawBytes = midi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'chord_guide_test.mid');

    expect(parsed.tracks[0].settings.role).toBe('chord_guide');

    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.segments.length).toBeGreaterThanOrEqual(2);
    expect(result.segments[0].sourceType).toBe('GUIDE');
    expect(result.segments[0].displayName).toBe('C');
    expect(result.segments[0].confidence).toBe(98);

    // Bar 2 should be F Major
    const bar2Seg = result.segments.find(s => s.startTicks >= ppq * 4);
    expect(bar2Seg).toBeDefined();
    expect(bar2Seg?.displayName).toBe('F');
    expect(bar2Seg?.sourceType).toBe('GUIDE');
  });

  it('handles 5,000+ notes benchmark efficiently without performance lag', () => {
    const midi = new Midi();
    midi.header.setTempo(140);
    const ppq = 480;

    // Create 10 tracks x 500 notes = 5,000 notes
    for (let t = 0; t < 10; t++) {
      const trk = midi.addTrack();
      trk.name = `Orchestral Section ${t + 1}`;
      trk.channel = t % 8;

      for (let n = 0; n < 500; n++) {
        const start = n * (ppq / 2);
        trk.addNote({
          midi: 48 + ((n * 3 + t) % 36),
          ticks: start,
          durationTicks: ppq / 2,
          velocity: 0.7,
        });
      }
    }

    const rawBytes = midi.toArray();
    const startTime = performance.now();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'large_score.mid');
    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);
    const endTime = performance.now();

    expect(parsed.notes.length).toBe(5000);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.analyses.size).toBe(5000);
    
    // Performance assertion: 5,000 notes parsed and analyzed in under 1500ms
    const elapsed = endTime - startTime;
    expect(elapsed).toBeLessThan(2500);
  });
});
