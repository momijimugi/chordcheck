import { Midi } from '@tonejs/midi';
import { MidiData, TrackData } from '../types/midi';

export function exportMidiFile(
  midiData: MidiData,
  workingTracks: TrackData[]
): Uint8Array {
  // 1. Nondestructive Patch Export
  // If we have the original rawMidi instance, mutate only the pitches of notes and export directly.
  if (midiData.rawMidi) {
    try {
      // Re-parse a fresh copy from rawMidi's current array to avoid side effects
      const rawBytes = midiData.rawMidi.toArray();
      const patchedMidi = new Midi(rawBytes);

      workingTracks.forEach(trackData => {
        const rawTrack = patchedMidi.tracks[trackData.sourceTrackIndex];
        if (!rawTrack) return;

        trackData.notes.forEach(note => {
          const rawNote = rawTrack.notes[note.sourceNoteIndex];
          if (rawNote) {
            // Apply modified pitch only; velocity, durationTicks, ticks remain untouched
            rawNote.midi = note.pitch;
          }
        });
      });

      return patchedMidi.toArray();
    } catch (err) {
      console.warn('Nondestructive export fallback to standard generation:', err);
    }
  }

  // 2. Standard Generation Fallback (if rawMidi is unavailable)
  const midi = new Midi();

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

  workingTracks.forEach((trackData) => {
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
