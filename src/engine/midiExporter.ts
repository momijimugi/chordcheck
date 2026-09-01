import { Midi } from '@tonejs/midi';
import { MidiData, TrackData } from '../types/midi';

export function exportMidiFile(
  midiData: MidiData,
  workingTracks: TrackData[]
): Uint8Array {
  // 1. Zero-reconstruction Direct SMF Byte Patcher (β0.3)
  // If original immutable bytes exist, patch only the Note On/Off pitch data bytes directly.
  if (midiData.originalBytes && midiData.originalBytes.length > 0) {
    try {
      const patchedBytes = new Uint8Array(midiData.originalBytes.slice(0));
      let hasPatchFailure = false;
      let patchCount = 0;

      for (const track of workingTracks) {
        for (const note of track.notes) {
          // If note pitch was modified
          if (note.pitch !== note.originalPitch) {
            if (
              note.noteOnPitchByteOffset !== undefined &&
              note.noteOffPitchByteOffset !== undefined &&
              note.noteOnPitchByteOffset < patchedBytes.length &&
              note.noteOffPitchByteOffset < patchedBytes.length
            ) {
              patchedBytes[note.noteOnPitchByteOffset] = note.pitch;
              patchedBytes[note.noteOffPitchByteOffset] = note.pitch;
              patchCount++;
            } else {
              hasPatchFailure = true;
              break;
            }
          }
        }
        if (hasPatchFailure) break;
      }

      if (!hasPatchFailure) {
        return patchedBytes;
      }
    } catch (err) {
      console.warn('Direct SMF byte patch fallback to Tonejs Midi patch:', err);
    }
  }

  // 2. High-level Nondestructive Patch Export
  if (midiData.rawMidi) {
    try {
      const rawBytes = midiData.rawMidi.toArray();
      const patchedMidi = new Midi(rawBytes);

      workingTracks.forEach(trackData => {
        const rawTrack = patchedMidi.tracks[trackData.sourceTrackIndex];
        if (!rawTrack) return;

        trackData.notes.forEach(note => {
          const rawNote = rawTrack.notes[note.sourceNoteIndex];
          if (rawNote) {
            rawNote.midi = note.pitch;
          }
        });
      });

      return patchedMidi.toArray();
    } catch (err) {
      console.warn('Tone.js patch export fallback to standard generation:', err);
    }
  }

  // 3. Standard Generation Fallback
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
