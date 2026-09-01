import { pitchToFrequency } from '../music/pitch';

class SimpleAudioSynth {
  private ctx: AudioContext | null = null;
  private activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

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

  public playNote(pitch: number, duration: number = 0.5, velocity: number = 0.8) {
    try {
      const ctx = this.getContext();
      const freq = pitchToFrequency(pitch);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Warm blended waveform
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const now = ctx.currentTime;
      const vol = Math.max(0.01, Math.min(1.0, velocity)) * 0.25;

      // Envelope
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(vol * 0.7, now + 0.1);
      gain.gain.setValueAtTime(vol * 0.7, now + duration - 0.05);
      gain.gain.linearRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      const entry = { osc, gain };
      this.activeNodes.push(entry);
      setTimeout(() => {
        const idx = this.activeNodes.indexOf(entry);
        if (idx >= 0) this.activeNodes.splice(idx, 1);
      }, duration * 1000 + 100);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  public playChord(pitches: number[], duration: number = 1.0) {
    pitches.forEach(p => this.playNote(p, duration, 0.6));
  }

  public stopAll() {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeNodes.forEach(node => {
        try {
          node.gain.gain.setValueAtTime(0.0001, now);
          node.osc.stop(now);
        } catch (e) {}
      });
      this.activeNodes = [];
    }
  }
}

export const audioSynth = new SimpleAudioSynth();
