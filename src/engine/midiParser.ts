import { Midi } from '@tonejs/midi';
import { MidiData, NoteData, TrackData, TrackRole, TrackSettings } from '../types/midi';
import { pitchToName, getPitchClass, getOctave } from '../music/pitch';
import { TRACK_COLORS } from '../utils/constants';
import { detectTrackKeyswitches, getPitchRangeForPreset } from './keyswitchDetection';

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

export function parseMidiFile(arrayBuffer: ArrayBuffer, fileName: string): MidiData {
  const midi = new Midi(arrayBuffer);

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
    const detectedRole = detectTrackRoleFromNameAndNotes(trackName, track.channel, track.notes);
    const color = TRACK_COLORS[appTrackId % TRACK_COLORS.length];
    const melodicConfidence = calculateMelodicConfidence(track.notes);

    const trackSettings: TrackSettings = {
      trackId: appTrackId,
      sourceTrackIndex,
      name: trackName,
      channel: track.channel,
      role: detectedRole === 'chord_guide' ? 'chord_guide' : 'auto',
      detectedRole,
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

    track.notes.forEach((note, sourceNoteIndex) => {
      const pitch = note.midi;
      const startTicks = note.ticks;
      const durationTicks = note.durationTicks;
      const endTicks = startTicks + durationTicks;

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
  const initialTimeSig = timeSignatures.length > 0 ? timeSignatures[0] : { numerator: 4, denominator: 4 };
  const ticksPerBar = ppq * (4 / initialTimeSig.denominator) * initialTimeSig.numerator;
  const totalBars = Math.max(1, Math.ceil(durationTicks / Math.max(1, ticksPerBar)));

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
    rawMidi: midi, // Stored for nondestructive patch export
  };
}
