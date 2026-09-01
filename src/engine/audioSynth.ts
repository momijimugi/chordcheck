import { pitchToFrequency } from '../music/pitch';
import { InstrumentFamily } from '../types/midi';

class SimpleAudioSynth {
  private ctx: AudioContext | null = null;
  private activeNodes: { osc?: OscillatorNode; gain: GainNode; filter?: BiquadFilterNode; noise?: AudioBufferSourceNode }[] = [];

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number = 0.5): AudioBuffer {
    const bufferSize = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playNote(
    pitch: number,
    duration: number = 0.5,
    velocity: number = 0.8,
    family: InstrumentFamily = 'piano'
  ) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const vol = Math.max(0.01, Math.min(1.0, velocity)) * 0.25;

      // Special Percussion / Drum Synthesizer (Phase P / Section 63)
      if (family === 'drums' || family === 'percussion') {
        if (pitch <= 36) {
          // Kick: Pitch drop sine wave
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

          gain.gain.setValueAtTime(vol * 1.5, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, 0.25));

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.3);

          const entry = { osc, gain };
          this.activeNodes.push(entry);
          return;
        } else if (pitch >= 37 && pitch <= 41) {
          // Snare / Clap: Noise + Tonal body
          const noiseBuffer = this.createNoiseBuffer(ctx, 0.2);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1200, now);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(vol * 1.2, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, 0.2));

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          noise.start(now);
          noise.stop(now + 0.25);

          const entry = { gain, filter, noise };
          this.activeNodes.push(entry);
          return;
        } else {
          // Hi-hat / Cymbal / Shaker: Highpass Noise
          const noiseBuffer = this.createNoiseBuffer(ctx, 0.15);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const filter = ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(6000, now);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(vol * 0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, 0.1));

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          noise.start(now);
          noise.stop(now + 0.15);

          const entry = { gain, filter, noise };
          this.activeNodes.push(entry);
          return;
        }
      }

      // Tonal Instruments Family Synthesizer
      const freq = pitchToFrequency(pitch);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = 'lowpass';

      switch (family) {
        case 'bass':
          osc.type = 'triangle';
          filter.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 1.3, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(vol * 0.8, now + 0.08);
          gain.gain.setValueAtTime(vol * 0.8, now + duration - 0.04);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;

        case 'strings':
        case 'orchestra':
          osc.type = 'sawtooth';
          filter.frequency.setValueAtTime(2200, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 0.9, now + 0.08); // Slow soft attack
          gain.gain.setValueAtTime(vol * 0.9, now + duration - 0.08);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration + 0.1);
          break;

        case 'brass':
          osc.type = 'sawtooth';
          filter.frequency.setValueAtTime(1500, now);
          filter.frequency.exponentialRampToValueAtTime(3200, now + 0.05);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 1.1, now + 0.03);
          gain.gain.setValueAtTime(vol * 0.85, now + duration - 0.03);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;

        case 'woodwind':
          osc.type = 'sine';
          filter.frequency.setValueAtTime(3000, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 0.9, now + 0.04);
          gain.gain.setValueAtTime(vol * 0.75, now + duration - 0.04);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;

        case 'guitar':
          osc.type = 'triangle';
          filter.frequency.setValueAtTime(2800, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 1.2, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(vol * 0.4, now + 0.25);
          gain.gain.setValueAtTime(vol * 0.4, now + duration - 0.02);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;

        case 'synth':
          osc.type = 'sawtooth';
          filter.frequency.setValueAtTime(4000, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol * 1.0, now + 0.01);
          gain.gain.setValueAtTime(vol * 0.8, now + duration - 0.03);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;

        case 'piano':
        case 'keyboard':
        default:
          osc.type = 'triangle';
          filter.frequency.setValueAtTime(3500, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(vol, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(vol * 0.7, now + 0.1);
          gain.gain.setValueAtTime(vol * 0.7, now + duration - 0.05);
          gain.gain.linearRampToValueAtTime(0.0001, now + duration);
          break;
      }

      osc.frequency.setValueAtTime(freq, now);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.15);

      const entry = { osc, gain, filter };
      this.activeNodes.push(entry);
      setTimeout(() => {
        const idx = this.activeNodes.indexOf(entry);
        if (idx >= 0) this.activeNodes.splice(idx, 1);
      }, (duration + 0.2) * 1000);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  public playChord(pitches: number[], duration: number = 1.0, family: InstrumentFamily = 'piano') {
    pitches.forEach(p => this.playNote(p, duration, 0.6, family));
  }

  public stopAll() {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeNodes.forEach(node => {
        try {
          node.gain.gain.setValueAtTime(0.0001, now);
          if (node.osc) node.osc.stop(now);
          if (node.noise) node.noise.stop(now);
        } catch {
          // Ignore node already stopped error
        }
      });
      this.activeNodes = [];
    }
  }
}

export const audioSynth = new SimpleAudioSynth();
