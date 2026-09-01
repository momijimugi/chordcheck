import { describe, it, expect } from 'vitest';
import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../midiParser';
import { exportMidiFile } from '../midiExporter';
import { analyzeMidi } from '../noteAnalyzer';
import { DEFAULT_ANALYSIS_SETTINGS } from '../../utils/constants';
import { MidiData, NoteData, TrackData } from '../../types/midi';
import { detectKeyFromNotes, getEnharmonicPitchName } from '../../music/keyDetection';

describe('MIDI Harmony Inspector β0.3 Master Test Suite (Tests A ~ J)', () => {
  // Test A: Reset All -> Export preserves CC / Pitch Bend
  it('Test A: Reset All restores clean state and maintains CC / Pitch Bend integrity', () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const trk = midi.addTrack();
    trk.name = 'Lead';
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    trk.addCC({ number: 1, value: 0.8, ticks: 50 });
    trk.addPitchBend({ value: 0.5, ticks: 100 });

    const rawBytes = midi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'testA.mid');

    // Modify note
    parsed.tracks[0].notes[0].pitch = 67;

    // Reset from originalBytes
    const fresh = parseMidiFile(parsed.originalBytes!.buffer, 'testA.mid');
    expect(fresh.tracks[0].notes[0].pitch).toBe(60);

    const exported = exportMidiFile(fresh, fresh.tracks);
    expect(exported.length).toBe(rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) {
      expect(exported[i]).toBe(rawBytes[i]);
    }
  });

  // Test B: True PPQ across 480, 960, 1920
  it('Test B: Preserves SMF division PPQ across 480, 960, 1920', () => {
    [480, 960, 1920].forEach(ppq => {
      const midi = new Midi();
      const trk = midi.addTrack();
      trk.addNote({ midi: 60, ticks: 0, durationTicks: ppq });
      const bytes = midi.toArray();
      bytes[12] = (ppq >> 8) & 0xff;
      bytes[13] = ppq & 0xff;

      const parsed = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, `ppq_${ppq}.mid`);
      expect(parsed.ppq).toBe(ppq);
      const exported = exportMidiFile(parsed, parsed.tracks);
      const reimported = new Midi(exported);
      expect(reimported.header.ppq).toBe(ppq);
    });
  });

  // Test C: 4/4 -> 3/4 -> 6/8 Meter transitions
  it('Test C: Variable meter transitions calculate correct bars and beat heads', () => {
    const midi = new Midi();
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);
    midi.header.timeSignatures.push({ ticks: 7680, timeSignature: [3, 4] } as any);
    midi.header.timeSignatures.push({ ticks: 13440, timeSignature: [6, 8] } as any);
    const trk = midi.addTrack();
    trk.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    trk.addNote({ midi: 62, ticks: 7680, durationTicks: 480 }); // Bar 5 in 3/4
    trk.addNote({ midi: 64, ticks: 13440, durationTicks: 480 }); // Bar 9 in 6/8

    const rawBytes = midi.toArray();
    const parsed = parseMidiFile(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength) as ArrayBuffer, 'testC.mid');
    const result = analyzeMidi(parsed, DEFAULT_ANALYSIS_SETTINGS);

    const noteBar5 = parsed.notes.find(n => n.startTicks === 7680);
    const analysisBar5 = result.analyses.get(noteBar5!.id);
    expect(analysisBar5?.positionDescription).toContain('第5小節');

    const noteBar9 = parsed.notes.find(n => n.startTicks === 13440);
    const analysisBar9 = result.analyses.get(noteBar9!.id);
    expect(analysisBar9?.positionDescription).toContain('第9小節');
  });

  // Test D: Chord Guide with different gate lengths does NOT micro-fragment chords
  it('Test D: Chord Guide notes with slightly differing gate lengths cluster into single stable chord segment', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestD',
      ppq,
      durationTicks: ppq * 8,
      durationSeconds: 4,
      totalBars: 2,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Chord Guide Track',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Chord Guide Track',
            channel: 0,
            role: 'chord_guide',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // C Major chord with slightly different note lengths (gate lengths)
            { id: 'g1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: 460, endTicks: 460, startSeconds: 0, durationSeconds: 0.48, endSeconds: 0.48, velocity: 0.8, channel: 0, originalPitch: 60 },
            { id: 'g2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 5, durationTicks: 480, endTicks: 485, startSeconds: 0.01, durationSeconds: 0.5, endSeconds: 0.51, velocity: 0.8, channel: 0, originalPitch: 64 },
            { id: 'g3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: 420, endTicks: 420, startSeconds: 0, durationSeconds: 0.44, endSeconds: 0.44, velocity: 0.8, channel: 0, originalPitch: 67 },
          ],
          melodicConfidence: 0.1,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes];

    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].displayName).toBe('C');
    expect(result.segments[0].sourceType).toBe('GUIDE');
  });

  // Test E: Chord Guide track itself is excluded from Warning count
  it('Test E: Chord Guide track itself does NOT contribute to note warning count', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestE',
      ppq,
      durationTicks: ppq * 4,
      durationSeconds: 2,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Chord Guide Track',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Chord Guide Track',
            channel: 0,
            role: 'chord_guide',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'g1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: 480, endTicks: 480, startSeconds: 0, durationSeconds: 0.5, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 60 },
          ],
          melodicConfidence: 0.1,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes];

    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.statusCounts.TOTAL).toBe(0);
    expect(result.analyses.size).toBe(0);
  });

  // Test F: 50,000 Notes High-Performance Benchmark
  it('Test F: 50,000 Notes benchmark completes without memory errors', () => {
    const ppq = 480;
    const trackCount = 50;
    const notesPerTrack = 1000;
    const totalNotes = trackCount * notesPerTrack;

    const tracks: TrackData[] = [];
    const allNotes: NoteData[] = [];

    for (let t = 0; t < trackCount; t++) {
      const trackNotes: NoteData[] = [];
      for (let n = 0; n < notesPerTrack; n++) {
        const startTicks = n * 240;
        const durationTicks = 200;
        const pitch = 48 + ((n + t) % 36);

        const noteData: NoteData = {
          id: `t${t}_n${n}`,
          trackId: t,
          sourceTrackIndex: t,
          sourceNoteIndex: n,
          pitch,
          pitchClass: pitch % 12,
          octave: Math.floor(pitch / 12) - 1,
          name: `N${pitch}`,
          startTicks,
          durationTicks,
          endTicks: startTicks + durationTicks,
          startSeconds: startTicks / ppq * 0.5,
          durationSeconds: durationTicks / ppq * 0.5,
          endSeconds: (startTicks + durationTicks) / ppq * 0.5,
          velocity: 0.8,
          channel: t % 16,
          originalPitch: pitch,
        };

        trackNotes.push(noteData);
        allNotes.push(noteData);
      }

      tracks.push({
        id: t,
        sourceTrackIndex: t,
        name: `Track ${t + 1}`,
        channel: t % 16,
        notes: trackNotes,
        settings: {
          trackId: t,
          sourceTrackIndex: t,
          name: `Track ${t + 1}`,
          channel: t % 16,
          role: t === 0 ? 'bass' : 'auto',
          rangePreset: 'all',
          analysisMinPitch: 0,
          analysisMaxPitch: 127,
          ignore: false,
          color: '#3b82f6',
          muted: false,
          solo: false,
          visible: true,
        },
        melodicConfidence: 0.8,
      });
    }

    const midiData: MidiData = {
      name: 'Benchmark_50000',
      ppq,
      durationTicks: notesPerTrack * 240,
      durationSeconds: (notesPerTrack * 240) / ppq * 0.5,
      totalBars: Math.ceil((notesPerTrack * 240) / (ppq * 4)),
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks,
      notes: allNotes,
    };

    const startTime = performance.now();
    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const elapsedMs = performance.now() - startTime;

    console.log(`[Benchmark] 50,000 Notes Analysis took ${elapsedMs.toFixed(2)}ms`);

    expect(result.statusCounts.TOTAL).toBe(totalNotes);
    expect(result.analyses.size).toBe(totalNotes);
  });

  // Test G: Passing tone E -> F -> G on C Major
  it('Test G: Passing tone E4 -> F4 -> G4 is classified as passing tone', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestG',
      ppq,
      durationTicks: ppq * 4,
      durationSeconds: 2,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Melody',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Melody',
            channel: 0,
            role: 'melody',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#3b82f6',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'm1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: 240, endTicks: 240, startSeconds: 0, durationSeconds: 0.25, endSeconds: 0.25, velocity: 0.8, channel: 0, originalPitch: 64 },
            { id: 'm2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 65, pitchClass: 5, octave: 4, name: 'F4', startTicks: 240, durationTicks: 240, endTicks: 480, startSeconds: 0.25, durationSeconds: 0.25, endSeconds: 0.5, velocity: 0.8, channel: 0, originalPitch: 65 },
            { id: 'm3', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 480, durationTicks: 480, endTicks: 960, startSeconds: 0.5, durationSeconds: 0.5, endSeconds: 1.0, velocity: 0.8, channel: 0, originalPitch: 67 },
          ],
          melodicConfidence: 1.0,
        },
        {
          id: 1,
          sourceTrackIndex: 1,
          name: 'Chords',
          channel: 1,
          settings: {
            trackId: 1,
            sourceTrackIndex: 1,
            name: 'Chords',
            channel: 1,
            role: 'harmony',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'c1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 48, pitchClass: 0, octave: 3, name: 'C3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 48 },
            { id: 'c2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 52, pitchClass: 4, octave: 3, name: 'E3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 52 },
            { id: 'c3', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 2, pitch: 55, pitchClass: 7, octave: 3, name: 'G3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 55 },
          ],
          melodicConfidence: 0.1,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes, ...midiData.tracks[1].notes];

    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const f4Analysis = result.analyses.get('m2');
    expect(f4Analysis?.nonChordTone).toBe('passing');
    expect(['SAFE', 'INFO']).toContain(f4Analysis?.status);
  });

  // Test H: Chromatic Approach D#4 -> E4 on C Major
  it('Test H: Chromatic approach D#4 -> E4 is recognized and allowed', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestH',
      ppq,
      durationTicks: ppq * 4,
      durationSeconds: 2,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Lead',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Lead',
            channel: 0,
            role: 'melody',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#3b82f6',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'l1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 63, pitchClass: 3, octave: 4, name: 'D#4', startTicks: 240, durationTicks: 120, endTicks: 360, startSeconds: 0.25, durationSeconds: 0.125, endSeconds: 0.375, velocity: 0.8, channel: 0, originalPitch: 63 },
            { id: 'l2', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 360, durationTicks: 480, endTicks: 840, startSeconds: 0.375, durationSeconds: 0.5, endSeconds: 0.875, velocity: 0.8, channel: 0, originalPitch: 64 },
          ],
          melodicConfidence: 1.0,
        },
        {
          id: 1,
          sourceTrackIndex: 1,
          name: 'Pad',
          channel: 1,
          settings: {
            trackId: 1,
            sourceTrackIndex: 1,
            name: 'Pad',
            channel: 1,
            role: 'harmony',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            { id: 'p1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 48, pitchClass: 0, octave: 3, name: 'C3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 48 },
            { id: 'p2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 52, pitchClass: 4, octave: 3, name: 'E3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 52 },
            { id: 'p3', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 2, pitch: 55, pitchClass: 7, octave: 3, name: 'G3', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 55 },
          ],
          melodicConfidence: 0.1,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes, ...midiData.tracks[1].notes];

    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const dSharpAnalysis = result.analyses.get('l1');
    expect(dSharpAnalysis?.nonChordTone).toBe('chromatic_approach');
    expect(['SAFE', 'INFO']).toContain(dSharpAnalysis?.status);
  });

  // Test I: Bass Pedal Point C across C -> F/C -> G/C -> C
  it('Test I: Bass Pedal Point C sustained across multiple changing chords is identified as Pedal Point', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestI',
      ppq,
      durationTicks: ppq * 16,
      durationSeconds: 8,
      totalBars: 4,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Bass',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Bass',
            channel: 0,
            role: 'bass',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#f59e0b',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // Long sustained Bass C2 across 4 measures
            { id: 'b1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 36, pitchClass: 0, octave: 2, name: 'C2', startTicks: 0, durationTicks: ppq * 16, endTicks: ppq * 16, startSeconds: 0, durationSeconds: 8, endSeconds: 8, velocity: 0.8, channel: 0, originalPitch: 36 },
          ],
          melodicConfidence: 1.0,
        },
        {
          id: 1,
          sourceTrackIndex: 1,
          name: 'Chords',
          channel: 1,
          settings: {
            trackId: 1,
            sourceTrackIndex: 1,
            name: 'Chords',
            channel: 1,
            role: 'harmony',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#10b981',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // Bar 1: C Major (C4, E4, G4)
            { id: 'ch1', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 0, pitch: 60, pitchClass: 0, octave: 4, name: 'C4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 60 },
            { id: 'ch2', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 1, pitch: 64, pitchClass: 4, octave: 4, name: 'E4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 64 },
            { id: 'ch3', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 2, pitch: 67, pitchClass: 7, octave: 4, name: 'G4', startTicks: 0, durationTicks: ppq * 4, endTicks: ppq * 4, startSeconds: 0, durationSeconds: 2, endSeconds: 2, velocity: 0.8, channel: 1, originalPitch: 67 },
            // Bar 2: F Major (F4, A4, C5)
            { id: 'ch4', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 3, pitch: 65, pitchClass: 5, octave: 4, name: 'F4', startTicks: ppq * 4, durationTicks: ppq * 4, endTicks: ppq * 8, startSeconds: 2, durationSeconds: 2, endSeconds: 4, velocity: 0.8, channel: 1, originalPitch: 65 },
            { id: 'ch5', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 4, pitch: 69, pitchClass: 9, octave: 4, name: 'A4', startTicks: ppq * 4, durationTicks: ppq * 4, endTicks: ppq * 8, startSeconds: 2, durationSeconds: 2, endSeconds: 4, velocity: 0.8, channel: 1, originalPitch: 69 },
            { id: 'ch6', trackId: 1, sourceTrackIndex: 1, sourceNoteIndex: 5, pitch: 72, pitchClass: 0, octave: 5, name: 'C5', startTicks: ppq * 4, durationTicks: ppq * 4, endTicks: ppq * 8, startSeconds: 2, durationSeconds: 2, endSeconds: 4, velocity: 0.8, channel: 1, originalPitch: 72 },
          ],
          melodicConfidence: 0.1,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes, ...midiData.tracks[1].notes];

    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const bassAnalysis = result.analyses.get('b1');
    expect(bassAnalysis?.nonChordTone).toBe('pedal_point');
    expect(['SAFE', 'INFO']).toContain(bassAnalysis?.status);
  });

  // Test J: Low-confidence chord segments cap non-chord tone warnings at CHECK
  it('Test J: Non-chord tone over low-confidence chord is capped at CHECK (never WARNING)', () => {
    const ppq = 480;
    const midiData: MidiData = {
      name: 'TestJ',
      ppq,
      durationTicks: ppq * 4,
      durationSeconds: 2,
      totalBars: 1,
      tempos: [{ ticks: 0, time: 0, bpm: 120 }],
      timeSignatures: [{ ticks: 0, time: 0, numerator: 4, denominator: 4 }],
      tracks: [
        {
          id: 0,
          sourceTrackIndex: 0,
          name: 'Lead',
          channel: 0,
          settings: {
            trackId: 0,
            sourceTrackIndex: 0,
            name: 'Lead',
            channel: 0,
            role: 'melody',
            rangePreset: 'all',
            analysisMinPitch: 0,
            analysisMaxPitch: 127,
            ignore: false,
            color: '#3b82f6',
            muted: false,
            solo: false,
            visible: true,
          },
          notes: [
            // Long F#4 on strong beat
            { id: 'j1', trackId: 0, sourceTrackIndex: 0, sourceNoteIndex: 0, pitch: 66, pitchClass: 6, octave: 4, name: 'F#4', startTicks: 0, durationTicks: ppq * 2, endTicks: ppq * 2, startSeconds: 0, durationSeconds: 1, endSeconds: 1, velocity: 0.9, channel: 0, originalPitch: 66 },
          ],
          melodicConfidence: 1.0,
        },
      ],
      notes: [],
    };
    midiData.notes = [...midiData.tracks[0].notes];

    // Single note -> chord detection confidence is low (< 50%) or UNKNOWN
    const result = analyzeMidi(midiData, DEFAULT_ANALYSIS_SETTINGS);
    const noteAnalysis = result.analyses.get('j1');
    expect(noteAnalysis?.status).not.toBe('WARNING');
    expect(['SAFE', 'INFO', 'CHECK']).toContain(noteAnalysis?.status);
  });
});
