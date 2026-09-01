import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { exportMidiFile } from '../midiExporter';

function createSampleSMF(ppq: number = 480): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);

  const trk = midi.addTrack();
  trk.name = 'Violin Section';
  trk.channel = 0;
  trk.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 2, velocity: 0.8 }); // C4
  trk.addNote({ midi: 64, ticks: ppq * 2, durationTicks: ppq * 2, velocity: 0.85 }); // E4
  trk.addCC({ number: 1, value: 0.9, ticks: 100 });
  trk.addPitchBend({ value: 0.2, ticks: 200 });

  const bytes = midi.toArray();
  // Set exact PPQ in header division bytes (bytes 12 & 13)
  bytes[12] = (ppq >> 8) & 0xff;
  bytes[13] = ppq & 0xff;
  return bytes;
}

describe('Raw MIDI Pitch Patcher & Byte Identity (β0.3 Step 1)', () => {
  it('No-edit export produces exact byte-for-byte identity with original SMF bytes', () => {
    const rawBytes = createSampleSMF(480);
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'test.mid');

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);

    // Byte length must match exactly
    expect(exportedBytes.length).toBe(rawBytes.length);

    // Every single byte must be 100% identical
    for (let i = 0; i < rawBytes.length; i++) {
      expect(exportedBytes[i]).toBe(rawBytes[i]);
    }
  });

  it('Single pitch edit changes only Note On and Note Off pitch bytes in raw SMF', () => {
    const rawBytes = createSampleSMF(480);
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'test.mid');

    const noteToEdit = parsed.tracks[0].notes[0]; // C4 (60)
    expect(noteToEdit.pitch).toBe(60);
    expect(noteToEdit.noteOnPitchByteOffset).toBeDefined();
    expect(noteToEdit.noteOffPitchByteOffset).toBeDefined();

    // Modify pitch to G4 (67)
    noteToEdit.pitch = 67;

    const exportedBytes = exportMidiFile(parsed, parsed.tracks);
    expect(exportedBytes.length).toBe(rawBytes.length);

    // Find all differing byte indices
    const diffIndices: number[] = [];
    for (let i = 0; i < rawBytes.length; i++) {
      if (exportedBytes[i] !== rawBytes[i]) {
        diffIndices.push(i);
      }
    }

    // Only exactly 2 bytes (Note On pitch & Note Off pitch) must change
    expect(diffIndices.length).toBe(2);
    expect(diffIndices).toContain(noteToEdit.noteOnPitchByteOffset);
    expect(diffIndices).toContain(noteToEdit.noteOffPitchByteOffset);

    expect(exportedBytes[noteToEdit.noteOnPitchByteOffset!]).toBe(67);
    expect(exportedBytes[noteToEdit.noteOffPitchByteOffset!]).toBe(67);
  });

  it('Reset All restores clean original state and allows byte-identical export', () => {
    const rawBytes = createSampleSMF(480);
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'test.mid');

    // Modify pitch
    parsed.tracks[0].notes[0].pitch = 65;

    // Simulate resetAll from originalBytes
    const freshParsed = parseMidiFile(parsed.originalBytes!.buffer, `${parsed.name}.mid`);
    expect(freshParsed.tracks[0].notes[0].pitch).toBe(60);

    const freshExportedBytes = exportMidiFile(freshParsed, freshParsed.tracks);
    expect(freshExportedBytes.length).toBe(rawBytes.length);

    for (let i = 0; i < rawBytes.length; i++) {
      expect(freshExportedBytes[i]).toBe(rawBytes[i]);
    }
  });

  it('Preserves true SMF PPQ header divisions across 480, 960, and 1920', () => {
    [480, 960, 1920].forEach(ppq => {
      const rawBytes = createSampleSMF(ppq);
      const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, `ppq_${ppq}.mid`);

      expect(parsed.ppq).toBe(ppq);

      const exportedBytes = exportMidiFile(parsed, parsed.tracks);
      const reimported = new Midi(exportedBytes);
      expect(reimported.header.ppq).toBe(ppq);
    });
  });
});
