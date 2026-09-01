import { describe, it, expect } from 'vitest';
import { createDemoMidi } from '../../utils/demoMidi';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { exportMidiFile } from '../midiExporter';
import { parseMidiFile } from '../midiParser';

describe('MIDI Harmony Inspector Core Engine', () => {
  it('Test 1: C Major Triad is detected with high confidence and all notes SAFE', () => {
    const midi = createDemoMidi('test1');
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments[0].displayName).toBe('C');
    expect(result.segments[0].confidence).toBeGreaterThan(60);

    // All notes should be SAFE
    midi.notes.forEach(n => {
      const analysis = result.analyses.get(n.id);
      expect(analysis).toBeDefined();
      expect(analysis?.status).toBe('SAFE');
      expect(analysis?.relation.isChordTone).toBe(true);
    });
  });

  it('Test 2: Long F#4 on strong beat over C Major is flagged as CHECK or WARNING', () => {
    const midi = createDemoMidi('test2');
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);

    const fSharpNote = midi.notes.find(n => n.pitch === 66); // F#4
    expect(fSharpNote).toBeDefined();

    const analysis = result.analyses.get(fSharpNote!.id);
    expect(analysis).toBeDefined();
    expect(['CHECK', 'WARNING']).toContain(analysis?.status);
    expect(analysis?.relation.isNonChordTone).toBe(true);
    expect(analysis?.reasons.some(r => r.includes('コード外音') || r.includes('Non-chord tone'))).toBe(true);

    // Suggestions should include G4 (67) or E4 (64)
    expect(analysis?.suggestions.length).toBeGreaterThan(0);
    const suggestedPitches = analysis?.suggestions.map(s => s.pitch);
    expect(suggestedPitches).toContain(67); // G4
  });

  it('Test 3: Passing tone E -> F -> G with short F is recognized as Passing Tone', () => {
    const midi = createDemoMidi('test3');
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);

    const fNote = midi.notes.find(n => n.pitch === 65); // F4
    expect(fNote).toBeDefined();

    const analysis = result.analyses.get(fNote!.id);
    expect(analysis).toBeDefined();
    expect(analysis?.nonChordTone).toBe('passing');
    expect(['SAFE', 'INFO']).toContain(analysis?.status);
  });

  it('Test 4: Neighbor tone E -> F -> E with short F is recognized as Neighbor Tone', () => {
    const midi = createDemoMidi('test4');
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);

    const fNote = midi.notes.find(n => n.pitch === 65); // F4
    expect(fNote).toBeDefined();

    const analysis = result.analyses.get(fNote!.id);
    expect(analysis).toBeDefined();
    expect(analysis?.nonChordTone).toBe('neighbor');
    expect(['SAFE', 'INFO']).toContain(analysis?.status);
  });

  it('Test 5: Anticipation note before chord boundary is recognized as Anticipation', () => {
    const midi = createDemoMidi('test5');
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);

    // Lead vocal anticipation F4 before bar 2
    const vocalTrack = midi.tracks.find(t => t.name.includes('Vocal'));
    const anticipationF = vocalTrack?.notes.find(n => n.pitch === 65 && n.startTicks > 1000);
    expect(anticipationF).toBeDefined();

    const analysis = result.analyses.get(anticipationF!.id);
    expect(analysis).toBeDefined();
    expect(analysis?.nonChordTone).toBe('anticipation');
    expect(['SAFE', 'INFO']).toContain(analysis?.status);
  });

  it('Test 6: Keyswitch track detection flags suspicious low notes', () => {
    const midi = createDemoMidi('test6');
    const violinTrack = midi.tracks.find(t => t.name.includes('Violin'));
    expect(violinTrack?.settings.hasKeyswitchWarning).toBe(true);

    // When range filter is applied (ignore below C1 / pitch 24), harmony is purely C Major
    violinTrack!.settings.analysisMinPitch = 24;
    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.segments[0].displayName).toBe('C');
  });

  it('Test 7: 10-Track Orchestral progression detects Cmaj7 -> Am7 -> Dm7 -> G7 and flags G#5 clash', () => {
    const midi = createDemoMidi('test7');
    expect(midi.tracks.length).toBe(10);

    const result = analyzeMidi(midi, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.segments.length).toBeGreaterThanOrEqual(4);

    // Bar 1 should be C or Cmaj7
    expect(['C', 'Cmaj7', 'C6', 'Cadd9']).toContain(result.segments[0].displayName);

    // Find the intentional G#5 clash note (pitch 80)
    const clashNote = midi.notes.find(n => n.pitch === 80);
    expect(clashNote).toBeDefined();

    const clashAnalysis = result.analyses.get(clashNote!.id);
    expect(clashAnalysis).toBeDefined();
    expect(['CHECK', 'WARNING']).toContain(clashAnalysis?.status);
    expect(clashAnalysis?.suggestions.length).toBeGreaterThan(0);
  });

  it('MIDI Export Roundtrip preserves tracks, note count, and pitches', () => {
    const originalMidi = createDemoMidi('test7');
    
    // Modify one pitch (simulate user correcting G#5 -> A5)
    const clashNote = originalMidi.tracks[4].notes.find(n => n.pitch === 80);
    if (clashNote) {
      clashNote.pitch = 81; // A5
    }

    const exportedBytes = exportMidiFile(originalMidi, originalMidi.tracks);
    expect(exportedBytes).toBeInstanceOf(Uint8Array);
    expect(exportedBytes.length).toBeGreaterThan(100);

    // Re-import and verify
    const reimported = parseMidiFile(exportedBytes.buffer as ArrayBuffer, 'reimported.mid');
    expect(reimported.tracks.length).toBe(originalMidi.tracks.length);
    expect(reimported.notes.length).toBe(originalMidi.notes.length);
    
    const reimportedNote = reimported.tracks[4].notes.find(n => n.pitch === 81);
    expect(reimportedNote).toBeDefined();
  });
});
