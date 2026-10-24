import type { GameEvent } from '../sim/types';

// Tiny synthesized sound effects with WebAudio. No files, no music.

type Voice = { freq: number; to?: number; dur: number; type?: OscillatorType; vol?: number; noise?: boolean };

const SOUNDS: Record<string, Voice> = {
  'fx.arrow': { freq: 900, to: 500, dur: 0.06, type: 'triangle', vol: 0.04 },
  'fx.hit': { freq: 220, to: 120, dur: 0.07, type: 'square', vol: 0.04 },
  'fx.bite': { freq: 160, to: 90, dur: 0.08, type: 'sawtooth', vol: 0.05 },
  'fx.spit': { freq: 400, to: 200, dur: 0.1, type: 'sawtooth', vol: 0.03 },
  'fx.monsterDie': { freq: 300, to: 60, dur: 0.2, type: 'sawtooth', vol: 0.05 },
  'fx.castleHit': { freq: 90, to: 50, dur: 0.15, noise: true, vol: 0.06 },
  'fx.structHit': { freq: 140, to: 70, dur: 0.08, noise: true, vol: 0.04 },
  'fx.structDie': { freq: 120, to: 40, dur: 0.35, noise: true, vol: 0.08 },
  'fx.built': { freq: 520, to: 780, dur: 0.12, type: 'triangle', vol: 0.06 },
  'fx.place': { freq: 440, dur: 0.05, type: 'triangle', vol: 0.05 },
  'fx.order': { freq: 660, dur: 0.04, type: 'sine', vol: 0.05 },
  'fx.deliver': { freq: 880, to: 1100, dur: 0.05, type: 'sine', vol: 0.025 },
  'fx.arrowRain': { freq: 1200, to: 300, dur: 0.6, noise: true, vol: 0.1 },
  'fx.bell': { freq: 523, dur: 1.2, type: 'sine', vol: 0.12 },
  'fx.telegraph': { freq: 70, to: 140, dur: 1.2, type: 'sawtooth', vol: 0.06 },
  'fx.slam': { freq: 80, to: 30, dur: 0.5, noise: true, vol: 0.14 },
  'msg.dusk': { freq: 330, to: 220, dur: 0.8, type: 'triangle', vol: 0.1 },
  'msg.nightFalls': { freq: 196, to: 147, dur: 1.2, type: 'triangle', vol: 0.12 },
  'msg.dawn': { freq: 392, to: 587, dur: 0.9, type: 'triangle', vol: 0.1 },
  'msg.wave': { freq: 110, to: 165, dur: 0.6, type: 'square', vol: 0.06 },
  'msg.boss': { freq: 60, to: 45, dur: 1.5, type: 'sawtooth', vol: 0.12 },
  'msg.coreLow': { freq: 880, to: 440, dur: 0.5, type: 'square', vol: 0.08 },
  'msg.wallLow': { freq: 660, to: 330, dur: 0.4, type: 'square', vol: 0.06 },
  'msg.fire': { freq: 300, to: 900, dur: 0.6, noise: true, vol: 0.08 },
  'msg.gameOver': { freq: 220, to: 55, dur: 2, type: 'sawtooth', vol: 0.12 },
  'msg.unitLost': { freq: 250, to: 150, dur: 0.25, type: 'triangle', vol: 0.06 },
  'msg.tierUp': { freq: 523, to: 1046, dur: 0.6, type: 'triangle', vol: 0.1 },
};

export class Audio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private recent = new Map<string, number>();
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  play(events: GameEvent[]): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const e of events) {
      const v = SOUNDS[e.key];
      if (!v) continue;
      // Rate-limit busy sounds.
      const last = this.recent.get(e.key) ?? -1;
      if (now - last < 0.05) continue;
      this.recent.set(e.key, now);
      this.voice(v, now);
    }
  }

  private voice(v: Voice, now: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v.vol ?? 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
    gain.connect(ctx.destination);
    if (v.noise && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(v.freq * 4, now);
      if (v.to) filter.frequency.exponentialRampToValueAtTime(v.to * 4, now + v.dur);
      src.connect(filter).connect(gain);
      src.start(now);
      src.stop(now + v.dur);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = v.type ?? 'sine';
    osc.frequency.setValueAtTime(v.freq, now);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, now + v.dur);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + v.dur);
  }
}
