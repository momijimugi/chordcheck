import { Midi } from '@tonejs/midi';
import { MidiData, TrackData } from '../types/midi';

export function exportMidiFile(
  midiData: MidiData,
  tracks: TrackData[]
): Uint8Array {
  const midi = new Midi();

  // Add Tempos
  if (midiData.tempos && midiData.tempos.length > 0) {
    midi.header.setTempo(midiData.tempos[0].bpm);
    for (let i = 1; i < midiData.tempos.length; i++) {
      midi.header.tempos.push({
        ticks: midiData.tempos[i].ticks,
        bpm: midiData.tempos[i].bpm,
      } as any);
    }
  } else {
    midi.header.setTempo(120);
  }

  // Add Time Signatures
  if (midiData.timeSignatures && midiData.timeSignatures.length > 0) {
    midiData.timeSignatures.forEach(ts => {
      midi.header.timeSignatures.push({
        ticks: ts.ticks,
        timeSignature: [ts.numerator, ts.denominator],
      } as any);
    });
  } else {
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);
  }

  // Build tracks
  tracks.forEach((trackData) => {
    const track = midi.addTrack();
    track.name = trackData.name;
    track.channel = trackData.channel;

    trackData.notes.forEach(note => {
      track.addNote({
        midi: note.pitch,
        ticks: note.startTicks,
        durationTicks: note.durationTicks,
        velocity: note.velocity,
      });
    });
  });

  return midi.toArray();
}
