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

  // If notes exist, analyze average pitch & polyphony
  if (notes.length > 0) {
    const avgPitch = notes.reduce((sum, n) => sum + n.midi, 0) / notes.length;
    if (avgPitch < 46) { // Below Bb2
      return 'bass';
    }
  }

  return 'auto';
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

  midi.tracks.forEach((track, trackIndex) => {
    // Skip empty tracks
    if (track.notes.length === 0) return;

    const trackName = track.name || `Track ${trackIndex + 1}`;
    const detectedRole = detectTrackRoleFromNameAndNotes(trackName, track.channel, track.notes);
    const color = TRACK_COLORS[trackIndex % TRACK_COLORS.length];

    const trackSettings: TrackSettings = {
      trackId: trackIndex,
      name: trackName,
      channel: track.channel,
      role: 'auto',
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
    };

    const trackNotes: NoteData[] = [];

    track.notes.forEach((note, noteIndex) => {
      const pitch = note.midi;
      const startTicks = note.ticks;
      const durationTicks = note.durationTicks;
      const endTicks = startTicks + durationTicks;

      const noteData: NoteData = {
        id: `trk${trackIndex}_n${noteIndex}_t${startTicks}`,
        trackId: trackIndex,
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
      id: trackIndex,
      name: trackName,
      channel: track.channel,
      instrument: track.instrument?.name,
      notes: trackNotes,
      settings: trackSettings,
    };

    // Check for keyswitch notes
    const ksResult = detectTrackKeyswitches(trackData);
    if (ksResult.hasSuspiciousKeyswitches) {
      trackData.settings.hasKeyswitchWarning = true;
      trackData.settings.keyswitchPitchCount = ksResult.count;
    }

    tracks.push(trackData);
  });

  const durationTicks = allNotes.reduce((max, n) => Math.max(max, n.endTicks), 0);
  const durationSeconds = allNotes.reduce((max, n) => Math.max(max, n.endSeconds), 0);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    ppq,
    durationTicks,
    durationSeconds,
    tempos,
    timeSignatures,
    tracks,
    notes: allNotes.sort((a, b) => a.startTicks - b.startTicks),
  };
}
