import { Midi } from '@tonejs/midi';
import { parseMidiFile } from '../engine/midiParser';
import { MidiData } from '../types/midi';

export type DemoCaseId = 'test1' | 'test2' | 'test3' | 'test4' | 'test5' | 'test6' | 'test7';

export interface DemoPreset {
  id: DemoCaseId;
  name: string;
  description: string;
  expectedOutcome: string;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'test1',
    name: 'Test 1: C Major Triad (C E G)',
    description: 'Clean C Major chord (C4, E4, G4) played in harmony.',
    expectedOutcome: 'C Major detected with high confidence; all notes SAFE.',
  },
  {
    id: 'test2',
    name: 'Test 2: C Major with F#4 (Long Strong-beat Non-Chord Tone)',
    description: 'C Major harmony with a long F#4 on strong beat.',
    expectedOutcome: 'F#4 flagged as WARNING / CHECK with clear reasons.',
  },
  {
    id: 'test3',
    name: 'Test 3: Stepwise Passing Tone (E -> F -> G)',
    description: 'Melody E4 -> F4 -> G4 over C Major chord with short F4.',
    expectedOutcome: 'F4 recognized as Passing Tone and marked SAFE / INFO.',
  },
  {
    id: 'test4',
    name: 'Test 4: Neighbor Tone (E -> F -> E)',
    description: 'Melody E4 -> F4 -> E4 over C Major chord with short F4.',
    expectedOutcome: 'F4 recognized as Neighbor Tone and marked SAFE / INFO.',
  },
  {
    id: 'test5',
    name: 'Test 5: Anticipation (C Maj -> F Maj)',
    description: 'F4 note appears shortly before chord transition to F Major.',
    expectedOutcome: 'F4 recognized as Anticipation (INFO).',
  },
  {
    id: 'test6',
    name: 'Test 6: Keyswitch Notes (Violin with C-1 / D-1 KS)',
    description: 'Violin track containing ultra-low keyswitches (C-1, D-1) and normal melody.',
    expectedOutcome: 'Keyswitch detection alert triggered; range exclusion prevents false chords.',
  },
  {
    id: 'test7',
    name: 'Test 7: 10-Track Orchestral Harmony (Cmaj7-Am7-Dm7-G7)',
    description: '10 tracks (Violins, Viola, Cello, Bass, Flute, Brass, Piano, Timpani) across 4 bars with passing tones & deliberate clash.',
    expectedOutcome: 'Smooth performance across 10 tracks, chord progression detected, warnings pinpointed.',
  },
];

export function createDemoMidi(id: DemoCaseId): MidiData {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] } as any);

  const ppq = 480;

  switch (id) {
    case 'test1': {
      // C Major (C4, E4, G4, C3 Bass)
      midi.name = 'Test1_CMajor';
      const piano = midi.addTrack();
      piano.name = 'Piano';
      piano.channel = 0;
      piano.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 }); // C4
      piano.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // E4
      piano.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // G4

      const bass = midi.addTrack();
      bass.name = 'Bass';
      bass.channel = 1;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.9 }); // C2
      break;
    }

    case 'test2': {
      // C Major with F#4 (Long Strong Beat)
      midi.name = 'Test2_CMajor_FSharp_Clash';
      const piano = midi.addTrack();
      piano.name = 'Piano';
      piano.channel = 0;
      piano.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 }); // C4
      piano.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // E4
      piano.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // G4

      const lead = midi.addTrack();
      lead.name = 'Lead Synth';
      lead.channel = 1;
      // F#4 on strong beat 1, full 2 beats long
      lead.addNote({ midi: 66, ticks: 0, durationTicks: ppq * 2, velocity: 0.85 }); // F#4
      lead.addNote({ midi: 67, ticks: ppq * 2, durationTicks: ppq * 2, velocity: 0.8 }); // G4

      const bass = midi.addTrack();
      bass.name = 'Bass';
      bass.channel = 2;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.9 }); // C2
      break;
    }

    case 'test3': {
      // Stepwise Passing Tone: E -> F -> G (F is short 1/8 note)
      midi.name = 'Test3_Passing_Tone';
      const piano = midi.addTrack();
      piano.name = 'Piano Pad';
      piano.channel = 0;
      piano.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // C4
      piano.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // E4
      piano.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // G4

      const melody = midi.addTrack();
      melody.name = 'Flute Melody';
      melody.channel = 1;
      // E4 (quarter) -> F4 (8th passing) -> G4 (dotted quarter)
      melody.addNote({ midi: 64, ticks: 0, durationTicks: ppq, velocity: 0.8 }); // E4
      melody.addNote({ midi: 65, ticks: ppq, durationTicks: ppq / 2, velocity: 0.7 }); // F4 (Passing)
      melody.addNote({ midi: 67, ticks: Math.round(ppq * 1.5), durationTicks: Math.round(ppq * 2.5), velocity: 0.85 }); // G4

      const bass = midi.addTrack();
      bass.name = 'Acoustic Bass';
      bass.channel = 2;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.85 }); // C2
      break;
    }

    case 'test4': {
      // Neighbor Tone: E -> F -> E (F is short 1/8 note)
      midi.name = 'Test4_Neighbor_Tone';
      const piano = midi.addTrack();
      piano.name = 'Piano Accompaniment';
      piano.channel = 0;
      piano.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // C4
      piano.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // E4
      piano.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // G4

      const melody = midi.addTrack();
      melody.name = 'Oboe Melody';
      melody.channel = 1;
      // E4 (quarter) -> F4 (8th neighbor) -> E4 (dotted quarter)
      melody.addNote({ midi: 64, ticks: 0, durationTicks: ppq, velocity: 0.8 }); // E4
      melody.addNote({ midi: 65, ticks: ppq, durationTicks: ppq / 2, velocity: 0.7 }); // F4 (Neighbor)
      melody.addNote({ midi: 64, ticks: Math.round(ppq * 1.5), durationTicks: Math.round(ppq * 2.5), velocity: 0.85 }); // E4

      const bass = midi.addTrack();
      bass.name = 'Bass';
      bass.channel = 2;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.85 }); // C2
      break;
    }

    case 'test5': {
      // Anticipation: Bar 1 C Maj, Bar 2 F Maj. F4 played at end of Bar 1.
      midi.name = 'Test5_Anticipation';
      const piano = midi.addTrack();
      piano.name = 'Piano';
      piano.channel = 0;
      // Bar 1: C Major (C4, E4, G4)
      piano.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 });
      piano.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 });
      piano.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 });
      // Bar 2: F Major (C4, F4, A4)
      piano.addNote({ midi: 60, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.75 });
      piano.addNote({ midi: 65, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.7 });
      piano.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.7 });

      const melody = midi.addTrack();
      melody.name = 'Lead Vocal';
      melody.channel = 1;
      // Bar 1: G4 (3 beats) -> F4 (Anticipation 8th note at tick 3.5 beats)
      melody.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 3, velocity: 0.8 }); // G4
      melody.addNote({ midi: 65, ticks: Math.round(ppq * 3.5), durationTicks: ppq / 2, velocity: 0.85 }); // F4 (Anticipates F Maj)
      // Bar 2: A4 (4 beats)
      melody.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.9 }); // A4

      const bass = midi.addTrack();
      bass.name = 'Bass';
      bass.channel = 2;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.85 }); // C2
      bass.addNote({ midi: 41, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.85 }); // F2
      break;
    }

    case 'test6': {
      // Keyswitch in Violin: C-1 (0), D-1 (2) keyswitch triggers alongside normal C4-G4 melody
      midi.name = 'Test6_Violin_Keyswitches';
      const violin = midi.addTrack();
      violin.name = 'Violin 1 (Keyswitched)';
      violin.channel = 0;
      // Low keyswitches
      violin.addNote({ midi: 0, ticks: 0, durationTicks: ppq / 4, velocity: 0.5 }); // C-1 KS (staccato)
      violin.addNote({ midi: 2, ticks: ppq * 2, durationTicks: ppq / 4, velocity: 0.5 }); // D-1 KS (legato)
      violin.addNote({ midi: 0, ticks: ppq * 3, durationTicks: ppq / 4, velocity: 0.5 }); // C-1 KS
      // Normal playing notes
      violin.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 2, velocity: 0.85 }); // C4
      violin.addNote({ midi: 64, ticks: ppq * 2, durationTicks: ppq, velocity: 0.85 }); // E4
      violin.addNote({ midi: 67, ticks: ppq * 3, durationTicks: ppq, velocity: 0.85 }); // G4

      const cello = midi.addTrack();
      cello.name = 'Cello';
      cello.channel = 1;
      cello.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 }); // C2
      break;
    }

    case 'test7':
    default: {
      // 10-Track Orchestral Progression: Bar 1: Cmaj7, Bar 2: Am7, Bar 3: Dm7, Bar 4: G7
      midi.name = 'Test7_Orchestra_4Bars';

      // 1. Contrabass (Bass)
      const bass = midi.addTrack();
      bass.name = 'Contrabass';
      bass.channel = 0;
      bass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4, velocity: 0.9 }); // C2
      bass.addNote({ midi: 33, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.9 }); // A1
      bass.addNote({ midi: 38, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.9 }); // D2
      bass.addNote({ midi: 43, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.9 }); // G2

      // 2. Cello
      const cello = midi.addTrack();
      cello.name = 'Cello Section';
      cello.channel = 1;
      cello.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4, velocity: 0.8 }); // C3
      cello.addNote({ midi: 45, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.8 }); // A2
      cello.addNote({ midi: 50, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.8 }); // D3
      cello.addNote({ midi: 47, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.8 }); // B2

      // 3. Viola
      const viola = midi.addTrack();
      viola.name = 'Viola Section';
      viola.channel = 2;
      viola.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // G3
      viola.addNote({ midi: 57, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.75 }); // A3
      viola.addNote({ midi: 57, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.75 }); // A3
      viola.addNote({ midi: 53, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.75 }); // F3

      // 4. Violin 2
      const violin2 = midi.addTrack();
      violin2.name = 'Violin 2';
      violin2.channel = 3;
      violin2.addNote({ midi: 59, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // B3 (maj7)
      violin2.addNote({ midi: 60, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.75 }); // C4 (min7)
      violin2.addNote({ midi: 62, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.75 }); // D4 (root)
      violin2.addNote({ midi: 62, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.75 }); // D4 (5th)

      // 5. Violin 1 (Melody + Passing tone + 1 intentional clash note in Bar 3)
      const violin1 = midi.addTrack();
      violin1.name = 'Violin 1 Lead';
      violin1.channel = 4;
      // Bar 1: E5 (2 beats) -> F5 (passing 8th) -> G5
      violin1.addNote({ midi: 76, ticks: 0, durationTicks: ppq * 2, velocity: 0.85 }); // E5
      violin1.addNote({ midi: 77, ticks: ppq * 2, durationTicks: ppq / 2, velocity: 0.75 }); // F5 (passing)
      violin1.addNote({ midi: 79, ticks: Math.round(ppq * 2.5), durationTicks: Math.round(ppq * 1.5), velocity: 0.85 }); // G5
      // Bar 2: E5 (2 beats) -> D5 (1 beat) -> C5 (1 beat)
      violin1.addNote({ midi: 76, ticks: ppq * 4, durationTicks: ppq * 2, velocity: 0.85 });
      violin1.addNote({ midi: 74, ticks: ppq * 6, durationTicks: ppq, velocity: 0.8 });
      violin1.addNote({ midi: 72, ticks: ppq * 7, durationTicks: ppq, velocity: 0.8 });
      // Bar 3: Intentional Clash! G#5 on strong beat over Dm7 (instead of A5)
      violin1.addNote({ midi: 80, ticks: ppq * 8, durationTicks: ppq * 2, velocity: 0.9 }); // G#5 (Intentionally suspicious note!)
      violin1.addNote({ midi: 81, ticks: ppq * 10, durationTicks: ppq * 2, velocity: 0.85 }); // A5
      // Bar 4: B5 (2 beats) -> G5 (2 beats)
      violin1.addNote({ midi: 83, ticks: ppq * 12, durationTicks: ppq * 2, velocity: 0.85 });
      violin1.addNote({ midi: 79, ticks: ppq * 14, durationTicks: ppq * 2, velocity: 0.85 });

      // 6. Flute
      const flute = midi.addTrack();
      flute.name = 'Flute';
      flute.channel = 5;
      flute.addNote({ midi: 72, ticks: 0, durationTicks: ppq * 4, velocity: 0.7 }); // C5
      flute.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.7 }); // A4
      flute.addNote({ midi: 65, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.7 }); // F4
      flute.addNote({ midi: 67, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.7 }); // G4

      // 7. French Horn
      const horn = midi.addTrack();
      horn.name = 'French Horn';
      horn.channel = 6;
      horn.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4, velocity: 0.75 }); // E4
      horn.addNote({ midi: 64, ticks: ppq * 4, durationTicks: ppq * 4, velocity: 0.75 }); // E4
      horn.addNote({ midi: 62, ticks: ppq * 8, durationTicks: ppq * 4, velocity: 0.75 }); // D4
      horn.addNote({ midi: 59, ticks: ppq * 12, durationTicks: ppq * 4, velocity: 0.75 }); // B3

      // 8. Piano
      const piano = midi.addTrack();
      piano.name = 'Grand Piano';
      piano.channel = 7;
      // Arpeggios / chords across 4 bars
      for (let b = 0; b < 4; b++) {
        const start = b * ppq * 4;
        if (b === 0) { // Cmaj7: C4, E4, G4, B4
          piano.addNote({ midi: 60, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 64, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 67, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 71, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
        } else if (b === 1) { // Am7: A3, C4, E4, G4
          piano.addNote({ midi: 57, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 60, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 64, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 67, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
        } else if (b === 2) { // Dm7: D4, F4, A4, C5
          piano.addNote({ midi: 62, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 65, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 69, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 72, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
        } else { // G7: G3, B3, D4, F4
          piano.addNote({ midi: 55, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 59, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 62, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
          piano.addNote({ midi: 65, ticks: start, durationTicks: ppq * 4, velocity: 0.7 });
        }
      }

      // 9. Harp
      const harp = midi.addTrack();
      harp.name = 'Orchestral Harp';
      harp.channel = 8;
      harp.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 71, ticks: ppq * 2, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 57, ticks: ppq * 4, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 69, ticks: ppq * 6, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 62, ticks: ppq * 8, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 72, ticks: ppq * 10, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 55, ticks: ppq * 12, durationTicks: ppq * 2, velocity: 0.65 });
      harp.addNote({ midi: 67, ticks: ppq * 14, durationTicks: ppq * 2, velocity: 0.65 });

      // 10. Timpani & Percussion
      const perc = midi.addTrack();
      perc.name = 'Timpani / Percussion';
      perc.channel = 9; // channel 10 (drums)
      perc.addNote({ midi: 36, ticks: 0, durationTicks: ppq, velocity: 0.9 });
      perc.addNote({ midi: 36, ticks: ppq * 4, durationTicks: ppq, velocity: 0.9 });
      perc.addNote({ midi: 38, ticks: ppq * 8, durationTicks: ppq, velocity: 0.9 });
      perc.addNote({ midi: 43, ticks: ppq * 12, durationTicks: ppq, velocity: 0.9 });
      break;
    }
  }

  const uint8 = midi.toArray();
  const buffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
  return parseMidiFile(buffer as ArrayBuffer, `${midi.name}.mid`);
}
