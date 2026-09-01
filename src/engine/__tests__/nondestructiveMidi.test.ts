import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { exportMidiFile } from '../midiExporter';

describe('Nondestructive MIDI Export & Event Preservation (β0.2)', () => {
  it('preserves CC1, CC11, CC64, and Pitch Bend events when editing note pitch', () => {
    const rawMidi = new Midi();
    rawMidi.header.setTempo(128);
    rawMidi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);

    const violin = rawMidi.addTrack();
    violin.name = 'Violin Solo';
    violin.channel = 0;
    violin.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 }); // C4
    violin.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.8 }); // E4

    // Add CC and Pitch Bend events
    violin.addCC({ number: 1, value: 0.85, ticks: 120 }); // CC1 Modulation
    violin.addCC({ number: 11, value: 0.75, ticks: 240 }); // CC11 Expression
    violin.addCC({ number: 64, value: 1.0, ticks: 0 }); // CC64 Sustain
    violin.addPitchBend({ value: 0.4, ticks: 360 });

    const rawBytes = rawMidi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'violin_test.mid');

    expect(parsed.notes.length).toBe(2);
    expect(parsed.notes[0].pitch).toBe(60);

    // Modify pitch of first note from C4 (60) to G4 (67)
    parsed.tracks[0].notes[0].pitch = 67;

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    const reimported = new Midi(exportedBytes);

    // Verify note pitch is updated to G4
    expect(reimported.tracks[0].notes[0].midi).toBe(67);
    expect(reimported.tracks[0].notes[1].midi).toBe(64);

    // Verify CCs are preserved exactly
    expect(reimported.tracks[0].controlChanges[1]).toBeDefined();
    expect(reimported.tracks[0].controlChanges[1].length).toBe(1);
    expect(reimported.tracks[0].controlChanges[11]).toBeDefined();
    expect(reimported.tracks[0].controlChanges[64]).toBeDefined();

    // Verify Pitch Bend is preserved
    expect(reimported.tracks[0].pitchBends.length).toBe(1);
  });

  it('preserves multi-tempo changes (120 -> 80 -> 140 BPM)', () => {
    const rawMidi = new Midi();
    rawMidi.header.setTempo(120);
    rawMidi.header.tempos.push({ ticks: 480 * 4 * 2, bpm: 80 } as any); // Bar 3
    rawMidi.header.tempos.push({ ticks: 480 * 4 * 4, bpm: 140 } as any); // Bar 5

    const trk = rawMidi.addTrack();
    trk.name = 'Piano';
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480 * 4 * 6, velocity: 0.7 });

    const rawBytes = rawMidi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'tempo_test.mid');

    expect(parsed.tempos.length).toBe(3);

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    const reimported = new Midi(exportedBytes);

    expect(reimported.header.tempos.length).toBe(3);
    expect(Math.round(reimported.header.tempos[0].bpm)).toBe(120);
    expect(Math.round(reimported.header.tempos[1].bpm)).toBe(80);
    expect(Math.round(reimported.header.tempos[2].bpm)).toBe(140);
  });

  it('preserves multi-time signature changes (4/4 -> 3/4 -> 6/8)', () => {
    const rawMidi = new Midi();
    rawMidi.header.setTempo(120);
    rawMidi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);
    rawMidi.header.timeSignatures.push({ ticks: 480 * 4 * 4, timeSignature: [3, 4] } as any); // Bar 5
    rawMidi.header.timeSignatures.push({ ticks: 480 * 4 * 4 + 480 * 3 * 4, timeSignature: [6, 8] } as any); // Bar 9

    const trk = rawMidi.addTrack();
    trk.name = 'Flute';
    trk.addNote({ midi: 72, ticks: 0, durationTicks: 480, velocity: 0.8 });

    const rawBytes = rawMidi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'timesig_test.mid');

    expect(parsed.timeSignatures.length).toBe(3);

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    const reimported = new Midi(exportedBytes);

    expect(reimported.header.timeSignatures.length).toBe(3);
    expect(reimported.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
    expect(reimported.header.timeSignatures[1].timeSignature).toEqual([3, 4]);
    expect(reimported.header.timeSignatures[2].timeSignature).toEqual([6, 8]);
  });

  it('preserves PPQ across roundtrips (480, 960, 1920)', () => {
    [480, 960, 1920].forEach(testPpq => {
      const rawMidi = new Midi();
      rawMidi.header.setTempo(120);
      const trk = rawMidi.addTrack();
      trk.name = 'Bass';
      trk.addNote({ midi: 36, ticks: testPpq * 2, durationTicks: testPpq, velocity: 0.9 });

      const rawBytes = rawMidi.toArray();
      const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, `ppq_${testPpq}.mid`);

      const exportedBytes = exportMidiFile(parsed, parsed.tracks);
      const reimported = new Midi(exportedBytes);

      expect(reimported.header.ppq).toBe(parsed.ppq);
      expect(reimported.tracks[0].notes[0].ticks).toBe(parsed.notes[0].startTicks);
      expect(reimported.tracks[0].notes[0].durationTicks).toBe(parsed.notes[0].durationTicks);
    });
  });
});
