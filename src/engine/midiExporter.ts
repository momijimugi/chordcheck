import { Midi } from '@tonejs/midi';
import { MidiData, NoteData, TrackData } from '../types/midi';

export interface ExportDiagnosticInfo {
  mode: 'Direct Raw Byte Patch' | 'Original Byte Identity' | 'Tone.js Fallback' | 'Standard Generation';
  totalNotes: number;
  matchedNotesCount: number;
  unmatchedNotesCount: number;
  ambiguousNotesCount: number;
  modifiedNotesCount: number;
  modifiedSafePatchCount: number;
  modifiedUnsafePatchCount: number;
  hasOriginalBytes: boolean;
  canExportDirectBytePatch: boolean;
  warningMessage?: string;
}

export function getExportDiagnosticInfo(
  midiData: MidiData,
  workingTracks?: TrackData[]
): ExportDiagnosticInfo {
  const totalNotes = midiData.notes.length;
  let matchedNotesCount = 0;
  let unmatchedNotesCount = 0;
  let ambiguousNotesCount = 0;

  midiData.notes.forEach(n => {
    if (n.rawPatchStatus === 'matched' || (n.noteOnPitchByteOffset !== undefined && n.noteOffPitchByteOffset !== undefined)) {
      matchedNotesCount++;
    } else if (n.rawPatchStatus === 'ambiguous') {
      ambiguousNotesCount++;
    } else {
      unmatchedNotesCount++;
    }
  });

  const tracksToCheck = workingTracks || midiData.tracks;
  const modifiedNotes: NoteData[] = [];
  tracksToCheck.forEach(t => {
    t.notes.forEach(n => {
      if (n.pitch !== n.originalPitch) {
        modifiedNotes.push(n);
      }
    });
  });

  const modifiedNotesCount = modifiedNotes.length;
  const hasOriginalBytes = !!(midiData.originalBytes && midiData.originalBytes.length > 0);

  // Check if each modified note is safely patchable (Phase B / β0.3.2)
  let modifiedSafePatchCount = 0;
  modifiedNotes.forEach(n => {
    if (
      n.rawPatchStatus === 'matched' &&
      n.noteOnPitchByteOffset !== undefined &&
      n.noteOffPitchByteOffset !== undefined &&
      hasOriginalBytes &&
      n.noteOnPitchByteOffset < midiData.originalBytes!.length &&
      n.noteOffPitchByteOffset < midiData.originalBytes!.length
    ) {
      modifiedSafePatchCount++;
    }
  });

  const modifiedUnsafePatchCount = modifiedNotesCount - modifiedSafePatchCount;
  const canExportDirectBytePatch = hasOriginalBytes && (modifiedUnsafePatchCount === 0);

  let mode: ExportDiagnosticInfo['mode'] = 'Standard Generation';
  let warningMessage: string | undefined;

  if (!hasOriginalBytes) {
    mode = 'Standard Generation';
    warningMessage = '元SMFバイトデータが存在しないため、標準生成Exportを使用します。';
  } else if (modifiedNotesCount === 0) {
    mode = 'Original Byte Identity';
    if (ambiguousNotesCount > 0) {
      warningMessage = '重複した同時同音ノートが検出されていますが、未変更のためRaw Byte Patchに影響しません。';
    }
  } else if (canExportDirectBytePatch) {
    mode = 'Direct Raw Byte Patch';
    if (ambiguousNotesCount > 0) {
      warningMessage = '重複した同時同音ノートが検出されていますが、未変更のためRaw Byte Patchに影響しません。';
    }
  } else if (midiData.rawMidi) {
    mode = 'Tone.js Fallback';
    warningMessage = `一部の変更ノート（${modifiedUnsafePatchCount}音）を元MIDIイベントへ一意に対応付けできないため、完全非破壊Exportを保証できずTone.js互換Exportを使用します。`;
  } else {
    mode = 'Standard Generation';
    warningMessage = '元MIDIの完全非破壊Exportを保証できないため、標準生成Exportを使用します。';
  }

  return {
    mode,
    totalNotes,
    matchedNotesCount,
    unmatchedNotesCount,
    ambiguousNotesCount,
    modifiedNotesCount,
    modifiedSafePatchCount,
    modifiedUnsafePatchCount,
    hasOriginalBytes,
    canExportDirectBytePatch,
    warningMessage,
  };
}

export function exportMidiFile(
  midiData: MidiData,
  workingTracks: TrackData[]
): Uint8Array {
  // 1. Zero-reconstruction Direct SMF Byte Patcher (Phase B / β0.3.2)
  if (midiData.originalBytes && midiData.originalBytes.length > 0) {
    const diag = getExportDiagnosticInfo(midiData, workingTracks);

    // Case A: No Edit -> Return 100% byte-identical original copy
    if (diag.mode === 'Original Byte Identity') {
      return new Uint8Array(midiData.originalBytes.slice(0));
    }

    // Case B: Direct Raw Byte Patch for all safely matched modified notes
    if (diag.canExportDirectBytePatch && diag.mode === 'Direct Raw Byte Patch') {
      try {
        const patchedBytes = new Uint8Array(midiData.originalBytes.slice(0));
        let hasPatchFailure = false;

        for (const track of workingTracks) {
          for (const note of track.notes) {
            if (note.pitch !== note.originalPitch) {
              if (
                note.noteOnPitchByteOffset !== undefined &&
                note.noteOffPitchByteOffset !== undefined &&
                note.noteOnPitchByteOffset < patchedBytes.length &&
                note.noteOffPitchByteOffset < patchedBytes.length
              ) {
                patchedBytes[note.noteOnPitchByteOffset] = note.pitch;
                patchedBytes[note.noteOffPitchByteOffset] = note.pitch;
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
  }

  // 2. High-level Nondestructive Patch Export (Tone.js Fallback)
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
