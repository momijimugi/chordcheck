import { Midi } from '@tonejs/midi';
import { MidiData, NoteData, TrackData, TrackRole, TrackSettings } from '../types/midi';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { buildMeterMap, calculateTotalBars } from '../music/meter';
import { TRACK_COLORS } from '../utils/constants';
import { detectTrackKeyswitches } from './keyswitchDetection';
import { parseSMFNoteOffsets, SMFNoteOffset } from './smfPatcher';
import { classifyTrack } from './trackClassifier';

export function detectTrackRoleFromNameAndNotes(
  name: string,
  channel: number,
  notes: { midi: number; durationTicks: number }[]
): TrackRole {
  const lowerName = name.toLowerCase();

  // Chord Guide track name check (Section 22, 27)
  if (lowerName.includes('chord track') || lowerName.includes('chord guide') || lowerName.includes('chords') || lowerName === 'chord' || lowerName.includes('harmony guide')) {
    return 'chord_guide';
  }

  // Percussion check
  if (channel === 9 || lowerName.includes('drum') || lowerName.includes('perc') || lowerName.includes('cymb') || lowerName.includes('snare')) {
    return 'percussion';
  }

  // Keyswitch track name check
  if (lowerName.includes('keyswitch') || lowerName.includes('ks_') || lowerName.includes('articulation')) {
    return 'keyswitch';
  }

  // Bass check by name
  if (lowerName.includes('bass') || lowerName.includes('cello') || lowerName.includes('contrabass') || lowerName.includes('tuba')) {
    return 'bass';
  }

  // Melody check by name
  if (lowerName.includes('lead') || lowerName.includes('solo') || lowerName.includes('vocal') || lowerName.includes('flute') || lowerName.includes('violin 1') || lowerName.includes('vln 1')) {
    return 'melody';
  }

  // Harmony check by name
  if (lowerName.includes('pad') || lowerName.includes('chord') || lowerName.includes('strings') || lowerName.includes('piano') || lowerName.includes('organ') || lowerName.includes('brass') || lowerName.includes('choir')) {
    return 'harmony';
  }

  // If notes exist, analyze average pitch
  if (notes.length > 0) {
    const avgPitch = notes.reduce((sum, n) => sum + n.midi, 0) / notes.length;
    if (avgPitch < 46) { // Below Bb2
      return 'bass';
    }
  }

  return 'auto';
}

/**
 * Calculates melodic confidence (0.0 to 1.0)
 * 1.0 = strictly monophonic line (melody)
 * 0.0 = dense polyphonic chords (piano, strings pad)
 */
export function calculateMelodicConfidence(notes: { ticks: number; durationTicks: number }[]): number {
  if (notes.length <= 1) return 1.0;

  let overlapCount = 0;
  const sorted = [...notes].sort((a, b) => a.ticks - b.ticks);

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = sorted[i].ticks + sorted[i].durationTicks;
    const nextStart = sorted[i + 1].ticks;
    // If overlap is more than 30 ticks (slight legato is allowed)
    if (currentEnd - nextStart > 30) {
      overlapCount++;
    }
  }

  const overlapRatio = overlapCount / sorted.length;
  // If no overlaps -> 1.0; if 50%+ notes overlap -> drops toward 0.1
  return Math.max(0.05, Math.min(1.0, 1.0 - (overlapRatio * 1.5)));
}

export function parseMidiFile(input: ArrayBuffer | ArrayBufferLike | Uint8Array, fileName: string): MidiData {
  const originalBytes = input instanceof Uint8Array 
    ? new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
    : new Uint8Array(input.slice(0));
  const midi = new Midi(originalBytes);

  // Extract low-level SMF byte offsets for byte-identical patching
  let smfOffsets: SMFNoteOffset[] = [];
  try {
    smfOffsets = parseSMFNoteOffsets(originalBytes);
  } catch (err) {
    console.warn('Failed to parse SMF byte offsets, will fall back to tonejs export:', err);
  }

  const ppq = midi.header.ppq || 480;
  const timeSignatures = midi.header.timeSignatures.map(ts => ({
    ticks: ts.ticks,
    time: (ts as any).time ?? 0,
    numerator: ts.timeSignature[0],
    denominator: ts.timeSignature[1],
  }));

  const tempos = midi.header.tempos.map(t => ({
    ticks: t.ticks,
    time: (t as any).time ?? 0,
    bpm: t.bpm,
  }));

  const tracks: TrackData[] = [];
  const allNotes: NoteData[] = [];

  let appTrackId = 0;

  midi.tracks.forEach((track, sourceTrackIndex) => {
    // Keep empty tracks in rawMidi, but only add active tracks to UI track list
    if (track.notes.length === 0) return;

    const trackName = track.name || `Track ${sourceTrackIndex + 1}`;
    const rawTrackNotes = track.notes.map((n, idx) => ({
      id: `raw_${sourceTrackIndex}_${idx}`,
      trackId: appTrackId,
      sourceTrackIndex,
      sourceNoteIndex: idx,
      pitch: n.midi,
      pitchClass: n.midi % 12,
      octave: Math.floor(n.midi / 12) - 1,
      name: n.name || '',
      startTicks: n.ticks,
      durationTicks: n.durationTicks,
      endTicks: n.ticks + n.durationTicks,
      startSeconds: n.time,
      durationSeconds: n.duration,
      endSeconds: n.time + n.duration,
      velocity: n.velocity,
      channel: track.channel,
      originalPitch: n.midi,
    }));

    const classification = classifyTrack({
      id: appTrackId,
      name: trackName,
      channel: track.channel,
      notes: rawTrackNotes,
    }, ppq);

    const detectedRole = classification.suggestedRole;
    const color = TRACK_COLORS[appTrackId % TRACK_COLORS.length];
    const melodicConfidence = calculateMelodicConfidence(track.notes);

    const trackSettings: TrackSettings = {
      trackId: appTrackId,
      sourceTrackIndex,
      name: trackName,
      channel: track.channel,
      role: detectedRole === 'chord_guide' ? 'chord_guide' : 'auto',
      detectedRole,
      roleSource: 'automatic',
      instrumentFamily: classification.instrumentFamily,
      classification,
      rangePreset: 'all',
      analysisMinPitch: 0,
      analysisMaxPitch: 127,
      ignore: detectedRole === 'percussion' || detectedRole === 'keyswitch',
      color,
      muted: false,
      solo: false,
      visible: true,
      hasKeyswitchWarning: false,
      melodicConfidence,
    };

    const trackNotes: NoteData[] = [];

    // Match offsets against remaining SMF offsets for this track (Phase A / β0.3.2)
    track.notes.forEach((note, sourceNoteIndex) => {
      const pitch = note.midi;
      const startTicks = note.ticks;
      const durationTicks = note.durationTicks;
      const endTicks = startTicks + durationTicks;
      const velocityMidi = Math.round((note.velocity ?? 0.8) * 127);

      // 1. Gather all candidates within tolerance (track/channel, pitch, startTicks +- 2)
      let candidates = smfOffsets.filter(
        o => (o.trackIndex === sourceTrackIndex || o.channel === track.channel) &&
             o.pitch === pitch &&
             Math.abs(o.startTicks - startTicks) <= 2
      );

      // Prefer exact track match if multiple
      const exactTrackCandidates = candidates.filter(o => o.trackIndex === sourceTrackIndex);
      if (exactTrackCandidates.length > 0) {
        candidates = exactTrackCandidates;
      }

      let rawPatchStatus: 'matched' | 'ambiguous' | 'unmatched' = 'unmatched';
      let matchedOffset: SMFNoteOffset | undefined;

      if (candidates.length === 0) {
        rawPatchStatus = 'unmatched';
      } else if (candidates.length === 1) {
        if (candidates[0].isAmbiguous) {
          rawPatchStatus = 'ambiguous';
        } else {
          matchedOffset = candidates[0];
          rawPatchStatus = 'matched';
          const idx = smfOffsets.indexOf(matchedOffset);
          if (idx >= 0) smfOffsets.splice(idx, 1);
        }
      } else {
        // 2 or more candidates: narrow by durationTicks (+-2) and velocity (+-2)
        const narrowed = candidates.filter(
          c => Math.abs(c.durationTicks - durationTicks) <= 2 &&
               Math.abs(c.velocity - velocityMidi) <= 2 &&
               !c.isAmbiguous
        );

        if (narrowed.length === 1) {
          matchedOffset = narrowed[0];
          rawPatchStatus = 'matched';
          const idx = smfOffsets.indexOf(matchedOffset);
          if (idx >= 0) smfOffsets.splice(idx, 1);
        } else {
          rawPatchStatus = 'ambiguous';
        }
      }

      const noteData: NoteData = {
        id: `trk${sourceTrackIndex}_n${sourceNoteIndex}_t${startTicks}`,
        trackId: appTrackId,
        sourceTrackIndex,
        sourceNoteIndex,
        pitch,
        pitchClass: getPitchClass(pitch),
        octave: getOctave(pitch),
        name: note.name || pitchToName(pitch),
        startTicks,
        durationTicks,
        endTicks,
        startSeconds: note.time,
        durationSeconds: note.duration,
        endSeconds: note.time + note.duration,
        velocity: note.velocity,
        channel: track.channel,
        originalPitch: pitch,
        noteOnPitchByteOffset: rawPatchStatus === 'matched' ? matchedOffset?.noteOnPitchByteOffset : undefined,
        noteOffPitchByteOffset: rawPatchStatus === 'matched' ? matchedOffset?.noteOffPitchByteOffset : undefined,
        rawPatchStatus,
      };

      trackNotes.push(noteData);
      allNotes.push(noteData);
    });

    const trackData: TrackData = {
      id: appTrackId,
      sourceTrackIndex,
      name: trackName,
      channel: track.channel,
      instrument: track.instrument?.name,
      notes: trackNotes,
      settings: trackSettings,
      melodicConfidence,
    };

    const ksResult = detectTrackKeyswitches(trackData);
    if (ksResult.hasSuspiciousKeyswitches) {
      trackData.settings.hasKeyswitchWarning = true;
      trackData.settings.keyswitchPitchCount = ksResult.count;
    }

    tracks.push(trackData);
    appTrackId++;
  });

  const durationTicks = allNotes.reduce((max, n) => Math.max(max, n.endTicks), 0);
  const durationSeconds = allNotes.reduce((max, n) => Math.max(max, n.endSeconds), 0);
  const meterMap = buildMeterMap(timeSignatures, ppq, durationTicks);
  const totalBars = calculateTotalBars(durationTicks, meterMap, ppq);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    ppq,
    durationTicks,
    durationSeconds,
    totalBars,
    tempos,
    timeSignatures,
    tracks,
    notes: allNotes.sort((a, b) => a.startTicks - b.startTicks),
    rawMidi: midi,
    originalBytes,
  };
}
