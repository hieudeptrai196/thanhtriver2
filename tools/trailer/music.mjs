// Trailer score for "Thành Trì", synthesised from scratch (no samples): D minor, plucked lute,
// low strings, taiko, brass stabs, choir pad, Schroeder reverb. Cues follow the edit (seconds).
// Usage: node tools/trailer/music.mjs out.wav
import { writeFileSync } from 'node:fs';

const SR = 44100;
const LEN = 64.6;
const N = Math.ceil(LEN * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const SL = new Float32Array(N); // reverb send
const SRt = new Float32Array(N);

// Cut times of the edit.
const CUT = {
  s01: 0, s02: 6.4, s03a: 13.4, s03b: 16.733, s03c: 19.933, s04: 23.267, s05: 28.267,
  s06a: 32.267, s06c: 35.067, s06d: 38.067, s06b: 41.267, s07: 44.467, s08: 49.867, s09: 55.867, end: 63.867,
};

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI
const D2 = 38, A2 = 45, D3 = 50, F3 = 53, A3 = 57, Bb2 = 46, C3 = 48, G2 = 43, E3 = 52, Cs4 = 61, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, Bb3 = 58, G3 = 55, Bb4 = 70, C5 = 72, D5 = 74;

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function add(i, l, r, send = 0.25) {
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
  SL[i] += l * send;
  SRt[i] += r * send;
}
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

/** Karplus–Strong pluck: a lute-like note. */
function pluck(t, midi, amp = 0.25, p = 0, decay = 0.996) {
  const f = NOTE(midi);
  const period = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(period);
  for (let k = 0; k < period; k++) buf[k] = rnd() * 2 - 1;
  const [gl, gr] = pan(p);
  const start = Math.round(t * SR);
  const dur = Math.round(2.6 * SR);
  let prev = 0;
  for (let n = 0; n < dur; n++) {
    const k = n % period;
    const v = buf[k];
    const nv = (v + prev) * 0.5 * decay;
    prev = v;
    buf[k] = nv;
    const env = n < 40 ? n / 40 : 1;
    add(start + n, v * amp * gl * env, v * amp * gr * env, 0.35);
  }
}

/** Band-limited saw by additive synthesis; `bright` 0..1 sets how many harmonics. */
function saw(phase, f, bright) {
  const kmax = Math.max(1, Math.min(24, Math.floor((2000 + 6000 * bright) / f)));
  let v = 0;
  for (let k = 1; k <= kmax; k++) v += Math.sin(phase * k) / k;
  return v * 0.6;
}

/** Sustained string section note with attack/release and optional tremolo. */
function strings(t0, t1, midi, amp, { atk = 1.2, rel = 1.5, trem = 0, bright = 0.25, p = 0, detune = 0.004 } = {}) {
  const f = NOTE(midi);
  const [gl, gr] = pan(p);
  const a = Math.round(t0 * SR);
  const b = Math.round((t1 + rel) * SR);
  let ph1 = rnd() * 6, ph2 = rnd() * 6;
  for (let i = a; i < b; i++) {
    const t = i / SR;
    const env = Math.min(1, (t - t0) / atk) * (t > t1 ? Math.max(0, 1 - (t - t1) / rel) : 1);
    if (env <= 0) continue;
    const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t);
    ph1 += (2 * Math.PI * f * vib * (1 + detune)) / SR;
    ph2 += (2 * Math.PI * f * vib * (1 - detune)) / SR;
    const tr = trem ? 0.65 + 0.35 * Math.sin(2 * Math.PI * trem * t) : 1;
    const v = (saw(ph1, f, bright) + saw(ph2, f, bright)) * 0.5 * env * tr * amp;
    add(i, v * gl, v * gr, 0.45);
  }
}

/** Choir-like pad: sine stacks with slow vibrato and soft formant colour. */
function choir(t0, t1, notes, amp, { atk = 1.5, rel = 2.5 } = {}) {
  const a = Math.round(t0 * SR);
  const b = Math.round((t1 + rel) * SR);
  const voices = notes.flatMap((m, k) => [-1, 1].map((s) => ({ f: NOTE(m) * (1 + s * 0.003), ph: rnd() * 6, p: (k / Math.max(1, notes.length - 1)) * 1.2 - 0.6 + s * 0.15 })));
  for (let i = a; i < b; i++) {
    const t = i / SR;
    const env = Math.min(1, (t - t0) / atk) * (t > t1 ? Math.max(0, 1 - (t - t1) / rel) : 1);
    if (env <= 0) continue;
    let l = 0, r = 0;
    for (const v of voices) {
      v.ph += (2 * Math.PI * v.f * (1 + 0.004 * Math.sin(2 * Math.PI * 4.6 * t + v.p))) / SR;
      const s = Math.sin(v.ph) + 0.35 * Math.sin(2 * v.ph) + 0.18 * Math.sin(3 * v.ph);
      const [gl, gr] = pan(v.p);
      l += s * gl;
      r += s * gr;
    }
    const g = (env * amp) / voices.length;
    add(i, l * g, r * g, 0.6);
  }
}

/** Taiko / timpani hit: pitch-dropping sine plus a noise slap. */
function taiko(t, amp = 0.8, { f0 = 150, f1 = 48, dec = 0.55, p = 0 } = {}) {
  const a = Math.round(t * SR);
  const [gl, gr] = pan(p);
  let ph = 0;
  let lp = 0;
  for (let n = 0; n < SR * (dec * 3); n++) {
    const tt = n / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt * 18);
    ph += (2 * Math.PI * f) / SR;
    const body = Math.sin(ph) * Math.exp(-tt / dec);
    lp += ((rnd() * 2 - 1) - lp) * 0.2;
    const slap = lp * Math.exp(-tt * 40) * 0.6;
    const v = (body + slap) * amp;
    add(a + n, v * gl, v * gr, 0.3);
  }
}

/** Frame drum: small and quick. */
function frameDrum(t, amp = 0.25, p = 0) {
  taiko(t, amp, { f0: 260, f1: 140, dec: 0.12, p });
}

/** Brass stab: bright saw chord with a fast swell and filter-like brightness envelope. */
function brass(t, notes, dur, amp = 0.3) {
  const a = Math.round(t * SR);
  const n = Math.round((dur + 0.6) * SR);
  const vs = notes.map((m, k) => ({ f: NOTE(m), ph: rnd() * 6, p: (k / Math.max(1, notes.length - 1)) * 0.8 - 0.4 }));
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt / 0.04) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.6) : 1) * (0.75 + 0.25 * Math.exp(-tt * 3));
    const bright = 0.15 + 0.85 * Math.exp(-tt * 2.5);
    let l = 0, r = 0;
    for (const v of vs) {
      v.ph += (2 * Math.PI * v.f) / SR;
      const s = saw(v.ph, v.f, bright);
      const [gl, gr] = pan(v.p);
      l += s * gl;
      r += s * gr;
    }
    add(a + i, (l * env * amp) / vs.length, (r * env * amp) / vs.length, 0.4);
  }
}

/** Noise swell into a hit (reverse cymbal), highpassed. */
function swell(t0, t1, amp = 0.25) {
  const a = Math.round(t0 * SR);
  const b = Math.round(t1 * SR);
  let lp = 0;
  for (let i = a; i < b; i++) {
    const x = (i - a) / (b - a);
    const w = rnd() * 2 - 1;
    lp += (w - lp) * 0.08;
    const hp = w - lp;
    const v = hp * x * x * x * amp;
    add(i, v * (0.8 + 0.2 * rnd()), v * (0.8 + 0.2 * rnd()), 0.5);
  }
}

/** Low sub boom for big hits. */
function boom(t, amp = 0.6, dec = 1.6) {
  const a = Math.round(t * SR);
  let ph = 0;
  for (let n = 0; n < SR * dec * 2.5; n++) {
    const tt = n / SR;
    const f = 34 + 40 * Math.exp(-tt * 6);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-tt / dec) * amp;
    add(a + n, v, v, 0.1);
  }
}

/** Wind: slow filtered noise bed. */
function wind(t0, t1, amp = 0.05) {
  const a = Math.round(t0 * SR);
  const b = Math.round(t1 * SR);
  let lp1 = 0, lp2 = 0;
  for (let i = a; i < b; i++) {
    const t = i / SR;
    const env = Math.min(1, (t - t0) / 2) * Math.min(1, (t1 - t) / 2);
    const gust = 0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.31 + 1);
    lp1 += ((rnd() * 2 - 1) - lp1) * 0.02;
    lp2 += ((rnd() * 2 - 1) - lp2) * 0.02;
    add(i, lp1 * amp * env * gust * 3, lp2 * amp * env * gust * 3, 0.2);
  }
}

// ------------------------------------------------------------------ the cue sheet

const prog = [
  [D3, F3, A3],
  [Bb2, D3, F3],
  [C3, E3, G3],
  [A2, Cs4 - 12, E3],
];

// Intro (0–13.4): wind, low drone, lute arpeggios.
wind(0, 23.5, 0.05);
strings(0.2, 13, D2, 0.16, { atk: 4, rel: 3, bright: 0.12 });
strings(0.2, 13, A2, 0.1, { atk: 5, rel: 3, bright: 0.12, p: 0.3 });
{
  const beat = 0.6; // 100 bpm eighths
  let t = 1.4;
  let k = 0;
  while (t < 13.2) {
    const ch = prog[Math.floor(k / 8) % 4];
    const pat = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12];
    const vel = t < 6.4 ? 0.13 : 0.18;
    pluck(t, pat[k % 8], vel * (k % 2 ? 0.75 : 1), (k % 2 ? 0.35 : -0.35));
    t += beat / 2;
    k++;
  }
}
// Castle reveal (6.4): strings swell, a melody on top.
strings(6.4, 13.2, D3, 0.1, { atk: 2.5, rel: 1.5, bright: 0.3, p: -0.4 });
strings(6.4, 13.2, F3, 0.08, { atk: 3, rel: 1.5, bright: 0.3, p: 0.4 });
taiko(6.4, 0.45, { f0: 110, f1: 45, dec: 0.9 });
[[7.0, A4, 1.2], [8.2, G4, 0.6], [8.8, F4, 0.6], [9.4, E4, 1.2], [10.6, F4, 0.6], [11.2, G4, 0.6], [11.8, A4, 1.4]].forEach(([t, m, d]) =>
  strings(t, t + d, m, 0.07, { atk: 0.25, rel: 0.6, bright: 0.45, p: 0.1 }));

// Day montage (13.4–23.27): lively lute, frame drums, march feel at 100 bpm.
{
  const beat = 0.6;
  for (let t = CUT.s03a; t < CUT.s04 - 0.1; t += beat / 2) {
    const k = Math.round((t - CUT.s03a) / (beat / 2));
    const ch = prog[Math.floor(k / 8) % 4];
    const pat = [ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12];
    pluck(t, pat[k % 4], 0.17 * (k % 2 ? 0.7 : 1), k % 2 ? 0.4 : -0.4);
    if (k % 2 === 0) frameDrum(t, k % 4 === 0 ? 0.32 : 0.18, -0.2);
    if (k % 8 === 6) frameDrum(t + beat / 4, 0.14, 0.3);
  }
  for (let b = 0; b < 4; b++) {
    const t0 = CUT.s03a + b * 2.4;
    const ch = prog[b % 4];
    strings(t0, t0 + 2.3, ch[0] - 12, 0.11, { atk: 0.3, rel: 0.4, bright: 0.25 });
  }
  [[CUT.s03a + 0.0, D5, 0.6], [CUT.s03a + 0.6, C5, 0.3], [CUT.s03a + 0.9, A4, 0.9], [CUT.s03b, Bb4, 0.6], [CUT.s03b + 0.6, A4, 0.3], [CUT.s03b + 0.9, G4, 0.9], [CUT.s03c, A4, 0.9], [CUT.s03c + 1.2, E4, 0.6], [CUT.s03c + 1.8, A4, 1.2]].forEach(([t, m, d]) =>
    strings(t, t + d, m, 0.06, { atk: 0.05, rel: 0.4, bright: 0.6, p: -0.1 }));
}

// Dusk (23.27–28.27): everything drains away; low tremolo strings rise; swell into the hit.
strings(CUT.s04, CUT.s05 - 0.05, D2, 0.2, { atk: 1.5, rel: 0.2, trem: 11, bright: 0.2 });
strings(CUT.s04 + 1.2, CUT.s05 - 0.05, A2 + 1, 0.12, { atk: 2.5, rel: 0.2, trem: 11, bright: 0.25, p: 0.4 });
strings(CUT.s04 + 2.4, CUT.s05 - 0.05, D3 + 1, 0.1, { atk: 2, rel: 0.2, trem: 12, bright: 0.3, p: -0.4 });
pluck(CUT.s04 + 0.1, D4, 0.16);
pluck(CUT.s04 + 1.3, A3, 0.12);
pluck(CUT.s04 + 2.5, F3, 0.1);
swell(CUT.s05 - 2.6, CUT.s05, 0.35);
for (let k = 0; k < 6; k++) taiko(CUT.s05 - 1.5 + k * 0.25, 0.12 + k * 0.05, { f0: 120, f1: 60, dec: 0.2 });

// They come (28.27–32.27): the hit, then a heartbeat and low brass.
boom(CUT.s05, 0.7, 2.2);
taiko(CUT.s05, 0.9, { f0: 140, f1: 40, dec: 0.9 });
brass(CUT.s05, [D2 + 12, A2 + 12, D3 + 12], 1.6, 0.35);
choir(CUT.s05 + 0.2, CUT.s06a - 0.2, [D3, F3, A3, D4], 0.12, { atk: 1.2, rel: 0.6 });
for (let t = CUT.s05 + 1.0; t < CUT.s06a - 0.2; t += 0.8) {
  taiko(t, 0.35, { f0: 90, f1: 45, dec: 0.3 });
  taiko(t + 0.22, 0.22, { f0: 90, f1: 45, dec: 0.25 });
}
swell(CUT.s06a - 1.2, CUT.s06a, 0.3);

// Battle (32.27–44.47): 120 bpm war drums, ostinato strings, brass on each cut, choir for the boss.
{
  const b = 0.5;
  for (let t = CUT.s06a; t < CUT.s07 - 0.05; t += b / 2) {
    const k = Math.round((t - CUT.s06a) / (b / 2));
    if (k % 4 === 0) taiko(t, 0.75, { f0: 150, f1: 46, dec: 0.45, p: -0.15 });
    if (k % 4 === 2) taiko(t, 0.5, { f0: 170, f1: 55, dec: 0.35, p: 0.2 });
    if (k % 8 === 3 || k % 8 === 7) taiko(t, 0.35, { f0: 200, f1: 80, dec: 0.2, p: 0.4 });
    frameDrum(t, k % 2 ? 0.1 : 0.16, -0.5);
    // Ostinato: D–D–F–D–E–D–C–D pattern on low strings in sixteenth pairs.
    const ost = [D3, D3, F3, D3, E3, D3, C3, D3];
    strings(t, t + 0.2, ost[k % 8] - 12, 0.13, { atk: 0.01, rel: 0.08, bright: 0.5, p: 0 });
  }
  const chords = [[D3, F3, A3, D4], [Bb2, D3, F3, Bb3], [G2, Bb2, D3, G3], [A2, Cs4 - 12, E3, A3]];
  [CUT.s06a, CUT.s06c, CUT.s06d, CUT.s06b].forEach((t, k) => {
    brass(t, chords[k % 4].map((m) => m + 12), 1.1, 0.4);
    taiko(t, 0.9, { f0: 140, f1: 40, dec: 0.8 });
  });
  brass(CUT.s06a + 1.5, [A3, D4, F4], 0.35, 0.22);
  brass(CUT.s06c + 1.5, [Bb3, D4, F4], 0.35, 0.22);
  brass(CUT.s06b + 1.5, [A3, Cs4, E4], 0.35, 0.22);
  // The boss: low boom, dark choir.
  boom(CUT.s06d, 0.8, 2.5);
  choir(CUT.s06d, CUT.s06b + 0.5, [G2 + 12, Bb2 + 12, D3 + 12, G3 + 12], 0.16, { atk: 0.4, rel: 1.0 });
  // Rising line over the last cut into dawn.
  [[CUT.s06b, D4], [CUT.s06b + 0.8, E4], [CUT.s06b + 1.6, F4], [CUT.s06b + 2.4, G4]].forEach(([t, m]) =>
    strings(t, t + 0.75, m, 0.09, { atk: 0.05, rel: 0.2, bright: 0.55 }));
  swell(CUT.s07 - 1.0, CUT.s07, 0.3);
}

// Dawn (44.47–49.87): final battle hit, then light — D major choir, gentle lute.
taiko(CUT.s07, 0.85, { f0: 140, f1: 40, dec: 1.2 });
boom(CUT.s07, 0.5, 1.6);
choir(CUT.s07 + 0.1, CUT.s08 + 1.5, [D3, Fs(), A3, D4], 0.14, { atk: 2.0, rel: 2.0 });
function Fs() { return F3 + 1; }
strings(CUT.s07 + 0.1, CUT.s08 + 1.0, D2, 0.12, { atk: 2, rel: 2, bright: 0.15 });
[[CUT.s07 + 1.2, A4], [CUT.s07 + 2.0, D5], [CUT.s07 + 3.2, Cs4 + 12], [CUT.s07 + 4.0, A4]].forEach(([t, m]) => pluck(t, m, 0.15, 0.2));

// Departure (49.87–55.87): march builds: lute, frame drums, strings melody, crescendo.
{
  const beat = 0.6;
  for (let t = CUT.s08; t < CUT.s09 - 0.05; t += beat / 2) {
    const k = Math.round((t - CUT.s08) / (beat / 2));
    const ch = [[D3, F3 + 1, A3], [G2, B2(), D3], [D3, F3 + 1, A3], [A2, Cs4 - 12, E3]][Math.floor(k / 8) % 4];
    const pat = [ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12];
    pluck(t, pat[k % 4], 0.16, k % 2 ? 0.4 : -0.4);
    if (k % 2 === 0) frameDrum(t, 0.2 + 0.25 * (t - CUT.s08) / 6, -0.2);
  }
  strings(CUT.s08, CUT.s09 - 0.05, D3, 0.1, { atk: 3, rel: 0.2, bright: 0.35, p: -0.3 });
  strings(CUT.s08 + 1.5, CUT.s09 - 0.05, A3, 0.09, { atk: 3, rel: 0.2, bright: 0.4, p: 0.3 });
  swell(CUT.s09 - 2.0, CUT.s09, 0.38);
  for (let k = 0; k < 8; k++) taiko(CUT.s09 - 1.0 + k * 0.125, 0.15 + k * 0.06, { f0: 140, f1: 60, dec: 0.15 });
}
function B2() { return 47; }

// Title (55.87–63.87): the big chord, then it rings out.
boom(CUT.s09, 0.9, 3.0);
taiko(CUT.s09, 1.0, { f0: 140, f1: 38, dec: 1.4 });
brass(CUT.s09, [D3, A3, D4, F4 + 1, A4], 2.8, 0.42);
choir(CUT.s09, CUT.end - 2.5, [D3, A3, D4, F4 + 1, A4], 0.2, { atk: 0.3, rel: 3.0 });
strings(CUT.s09, CUT.end - 2.5, D2, 0.2, { atk: 0.2, rel: 3, bright: 0.25 });
pluck(CUT.s09 + 2.2, D5, 0.14, 0.3);
pluck(CUT.s09 + 2.5, A4, 0.12, -0.3);
pluck(CUT.s09 + 2.8, F4 + 1, 0.11, 0.2);
pluck(CUT.s09 + 3.1, D4, 0.12, -0.2);

// ------------------------------------------------------------------ reverb and master

function reverb(inp, out, delays, fb) {
  const combs = delays.map((d) => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
  const aps = [225, 556, 441].map((d) => ({ buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = inp[n] + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    s /= combs.length;
    for (const a of aps) {
      const y = a.buf[a.i];
      const o = -0.5 * s + y;
      a.buf[a.i] = s + 0.5 * o;
      a.i = (a.i + 1) % a.buf.length;
      s = o;
    }
    out[n] += s * 0.9;
  }
}
reverb(SL, L, [1557, 1617, 1491, 1422, 1277, 1356], 0.84);
reverb(SRt, R, [1580, 1640, 1514, 1445, 1300, 1379], 0.84);

// Fade the tail, normalise, soft-clip.
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const g = t > CUT.end - 1.5 ? Math.max(0, (LEN - t) / (LEN - CUT.end + 1.5)) : 1;
  L[n] *= g;
  R[n] *= g;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const norm = 0.92 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 4, 40);
const clip = (x) => Math.tanh(x * 1.2) / Math.tanh(1.2);
for (let n = 0; n < N; n++) {
  pcm.writeInt16LE(Math.round(clip(L[n] * norm) * 32000), 44 + n * 4);
  pcm.writeInt16LE(Math.round(clip(R[n] * norm) * 32000), 46 + n * 4);
}
writeFileSync(process.argv[2], pcm);
console.log('peak', peak.toFixed(2), 'seconds', LEN);
