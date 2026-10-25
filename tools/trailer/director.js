// Trailer director, loaded into the running game page (dev server) with import().
// Drives the simulation itself, flies a free cinematic camera, composes captions and letterbox
// on a 2D canvas, and posts every frame as a JPEG to the local frame server.
const W = 1920;
const H = 1080;
const BAR = 100; // letterbox bars, top and bottom
const FPS = 30;
const SERVER = 'http://127.0.0.1:5199';

let D = null;

export async function init() {
  const R = window.renderer;
  const g = window.game;
  window.requestAnimationFrame = () => 0; // stop the game's own loop: we own time now
  R.renderer.setPixelRatio(1);
  R.renderer.setSize(W, H, false);
  R.camera.aspect = W / H;
  R.camera.near = 0.3;
  R.camera.far = 600;
  R.camera.updateProjectionMatrix();
  R.scene.fog.near = 70;
  R.scene.fog.far = 190;
  R.ghost.visible = false;
  const comp = document.createElement('canvas');
  comp.width = W;
  comp.height = H;
  D = { R, g, sim: g.sim, comp, ctx: comp.getContext('2d'), realRender: R.renderer.render.bind(R.renderer) };
  D.bot = await import(location.origin + '/src/sim/bot.ts');
  D.world = await import(location.origin + '/src/sim/world.ts');
  D.terrain = await import(location.origin + '/src/render/terrain.ts');
  await document.fonts.load('700 60px "Alegreya SC"');
  window.D = D;
  return 'ready';
}

export const state = () => D.sim.state;

/** Step the simulation (60 Hz ticks); the bot plays when `auto`. Events go to the renderer for arrows, corpses, fx. */
export function advance(steps, auto = true) {
  // No selection rings in the trailer.
  D.sim.state.selected = -1;
  D.sim.state.selectedIds = [];
  for (let i = 0; i < steps; i++) {
    if (auto) D.sim.apply(D.bot.botCommands(D.sim));
    D.sim.step();
  }
  const ev = D.sim.drainEvents();
  if (ev.length) D.R.onEvents(ev);
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
export const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const v3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const ground = (x, z) => D.terrain.terrainHeight(state().seed, x, z);

/** Render one frame with a free camera {pos, look, fov} and overlays, and send it. */
export async function frame(shot, i, cam, over = {}) {
  const { R } = D;
  R.camTarget.set(cam.look[0], 0, cam.look[2]);
  R.camSmooth.copy(R.camTarget);
  R.renderer.render = () => {};
  R.render(D.sim, cam.dt ?? 1 / FPS, { ghost: null, skillTarget: null });
  R.renderer.render = D.realRender;
  R.ghost.visible = false;
  const c = R.camera;
  c.fov = cam.fov ?? 38;
  c.updateProjectionMatrix();
  c.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
  c.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  if (cam.roll) c.rotateZ(cam.roll);
  D.realRender(R.scene, c);
  compose(over);
  const url = D.comp.toDataURL('image/jpeg', 0.92);
  await fetch(`${SERVER}/frame?shot=${shot}&i=${i}`, { method: 'POST', body: url });
}

function compose(o) {
  const { ctx } = D;
  ctx.globalAlpha = 1;
  ctx.drawImage(D.R.renderer.domElement, 0, 0, W, H);
  // Warm grade and vignette.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,6,2,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (o.tint) {
    ctx.fillStyle = o.tint;
    ctx.fillRect(0, 0, W, H);
  }
  if (o.fade) {
    ctx.fillStyle = `rgba(0,0,0,${o.fade})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (o.flash) {
    ctx.fillStyle = `rgba(255,236,200,${o.flash})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, BAR);
  ctx.fillRect(0, H - BAR, W, BAR);
  if (o.text && o.textAlpha > 0) caption(o.text, o.textAlpha, o.sub);
  if (o.title) titleCard(o.title);
}

function spaced(text, x, y, spacing) {
  const { ctx } = D;
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((ch, k) => {
    ctx.fillText(ch, cx, y);
    cx += widths[k] + spacing;
  });
}

function caption(text, alpha, sub) {
  const { ctx } = D;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 18;
  ctx.font = '700 58px "Alegreya SC", Georgia, serif';
  ctx.fillStyle = '#efd590';
  const y = sub ? H - BAR - 92 : H - BAR - 58;
  spaced(text, W / 2, y, 2);
  if (sub) {
    ctx.font = '700 34px "Alegreya SC", Georgia, serif';
    ctx.fillStyle = '#e9dcc0';
    spaced(sub, W / 2, y + 52, 1.5);
  }
  ctx.restore();
}

function titleCard(t) {
  const { ctx } = D;
  ctx.save();
  ctx.fillStyle = `rgba(8,5,2,${t.dim ?? 0.55})`;
  ctx.fillRect(0, BAR, W, H - 2 * BAR);
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 30;
  ctx.globalAlpha = t.a;
  const grad = ctx.createLinearGradient(0, H / 2 - 140, 0, H / 2 + 20);
  grad.addColorStop(0, '#fff0b8');
  grad.addColorStop(0.55, '#e2b24c');
  grad.addColorStop(1, '#9a6a22');
  ctx.fillStyle = grad;
  ctx.font = '700 176px "Alegreya SC", Georgia, serif';
  spaced(t.main, W / 2, H / 2 + 10, 14 * (t.spread ?? 1));
  // Rule with a diamond.
  ctx.globalAlpha = t.a * (t.subA ?? 1);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#c99a44';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 330, H / 2 + 52);
  ctx.lineTo(W / 2 - 18, H / 2 + 52);
  ctx.moveTo(W / 2 + 18, H / 2 + 52);
  ctx.lineTo(W / 2 + 330, H / 2 + 52);
  ctx.stroke();
  ctx.fillStyle = '#e2b24c';
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2 + 42);
  ctx.lineTo(W / 2 + 10, H / 2 + 52);
  ctx.lineTo(W / 2, H / 2 + 62);
  ctx.lineTo(W / 2 - 10, H / 2 + 52);
  ctx.fill();
  ctx.shadowBlur = 16;
  ctx.font = '700 46px "Alegreya SC", Georgia, serif';
  ctx.fillStyle = '#efe2c4';
  spaced(t.tag, W / 2, H / 2 + 128, 3);
  if (t.foot) {
    ctx.globalAlpha = t.a * (t.footA ?? 1);
    ctx.font = '700 30px "Alegreya SC", Georgia, serif';
    ctx.fillStyle = '#c9b48a';
    spaced(t.foot, W / 2, H - BAR - 40, 2);
  }
  ctx.restore();
}

/** Caption alpha: fades in at a, holds, fades out at b (shot-relative 0..1). */
export function cap(t, a, b, f = 0.08) {
  return Math.max(0, Math.min(1, (t - a) / f, (b - t) / f));
}

/**
 * Record a shot of `n` frames in the background: per frame `steps` sim ticks, then camFn(t, i) and over(t, i).
 * Progress is in window.prog[name]; `before(i)` may issue commands.
 */
export function shoot(name, n, camFn, opts = {}) {
  window.prog = window.prog ?? {};
  window.prog[name] = 0;
  const run = async () => {
    // Warm-up: let the sky blend, effects and smoke settle after a fast-forward, without moving the game on.
    const R = D.R;
    for (let k = 0; k < (opts.warm ?? 45); k++) {
      R.renderer.render = () => {};
      R.render(D.sim, 1 / FPS, { ghost: null, skillTarget: null });
      R.renderer.render = D.realRender;
    }
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      if (opts.before) opts.before(t, i);
      advance(typeof opts.steps === 'function' ? opts.steps(t, i) : opts.steps ?? 2, opts.auto ?? true);
      await frame(name, i, camFn(t, i), opts.over ? opts.over(t, i) : {});
      window.prog[name] = i + 1;
    }
    window.prog[name] = 'done';
  };
  run().catch((e) => (window.prog[name] = 'error ' + e.message));
  return `recording ${name} (${n} frames)`;
}

/** Fast-forward until pred(state) holds (bot playing), at most maxSteps ticks. */
export function until(pred, maxSteps = 60 * 60 * 30) {
  let k = 0;
  while (!pred(state()) && k < maxSteps) {
    advance(30);
    k += 30;
  }
  return { ok: pred(state()), seconds: Math.round(k / 60), phase: state().phase, night: state().stats.nightsSurvived };
}


/**
 * A camera spot at distance r from target with a clear line to it: no castle, tower or wall in between,
 * and no other bodies right in front of the lens. Tries angles (radians, relative to "away from the castle")
 * in the given order of preference.
 */
export function clearSpot(target, r, prefs, bodies = []) {
  const s = state();
  const c = s.castle;
  const out = Math.atan2(target.x - c.x, target.z - c.z);
  const solid = s.structs.filter((x) => x.built > 0.3).map((x) => ({ x: x.cx + 0.5, z: x.cz + 0.5 }));
  for (const rel of prefs) {
    const a = out + rel;
    const P = { x: target.x + Math.sin(a) * r, z: target.z + Math.cos(a) * r };
    let ok = true;
    for (let k = 0; k <= 12 && ok; k++) {
      const f = k / 12;
      if (f * r > r - 1.4) break; // the last stretch is the subject itself
      const q = { x: P.x + (target.x - P.x) * f, z: P.z + (target.z - P.z) * f };
      if (Math.abs(q.x - c.x) < 3.8 && Math.abs(q.z - c.z) < 3.0) ok = false;
      if (solid.some((o) => near(o, q) < 1.3)) ok = false;
      if (f < 0.45 && bodies.some((o) => near(o, q) < 1.1)) ok = false;
    }
    if (ok) return { P, a };
  }
  return { P: { x: target.x + Math.sin(out) * r, z: target.z + Math.cos(out) * r }, a: out };
}

// ------------------------------------------------------------------ the shot list

/** Record and wait until done. */
export function rec(name, n, camFn, opts) {
  shoot(name, n, camFn, opts);
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      const p = window.prog[name];
      if (p === 'done') {
        clearInterval(iv);
        resolve(name);
      } else if (String(p).startsWith('error')) {
        clearInterval(iv);
        reject(new Error(p));
      }
    }, 200);
  });
}

const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centroid = (list) => ({ x: list.reduce((s, m) => s + m.x, 0) / list.length, z: list.reduce((s, m) => s + m.z, 0) / list.length });
const castle = () => state().castle;

export const shots = {
  async prep() {
    Object.assign(state().res, { wood: 900, stone: 600, food: 400, gold: 300 });
    advance(60 * 40);
    return 'prepped';
  },

  // 1. Over the meadow towards the village.
  s01: () =>
    rec('s01', 210, (t) => {
      const e = ease(t);
      return { pos: v3([-26, 4.2, -13], [-8, 6.8, -19], e), look: v3([-4, 2.2, -36], [8, 2.6, -37], e), fov: 40 };
    }, { over: (t) => ({ fade: Math.max(0, 1 - t / 0.17), text: 'Ở vùng đất bóng tối nuốt dần...', textAlpha: cap(t, 0.2, 0.9) }) }),

  // 3a. Camp life around the castle.
  s03a: () => {
    const c = castle();
    return rec('s03a', 100, (t) => {
      const e = ease(t);
      return { pos: v3([c.x - 15, 5.2, c.z + 13], [c.x - 5, 6, c.z + 15.5], e), look: v3([c.x - 5, 1.2, c.z - 2], [c.x + 4, 1.6, c.z - 3], e), fov: 42 };
    }, { over: (t) => ({ text: 'Ban ngày: đốn gỗ, đẽo đá, gặt lúa', textAlpha: cap(t, 0.08, 0.97, 0.1) }) });
  },

  // 3b. Builders raise a watchtower.
  async s03b() {
    const s = state();
    s.res.wood += 200;
    s.res.stone += 100;
    const c = s.castle;
    const S = [c.x - 11.5, 9.5];
    D.sim.apply([{ t: 'build', type: 'tower', pos: { x: S[0], z: S[1] } }]);
    const working = () => state().units.some((u) => u.type === 'builder' && u.job === 'build' && Math.hypot(u.x - S[0], u.z - S[1]) < 1.6);
    for (let k = 0; k < 400 && !working(); k++) advance(15);
    const gy = ground(S[0], S[1]);
    return rec('s03b', 96, (t) => {
      const a = lerp(0.55, 0.95, ease(t));
      const r = lerp(7.2, 6.2, ease(t));
      return { pos: [S[0] + Math.sin(a) * r, gy + lerp(2.4, 3.2, t), S[1] + Math.cos(a) * r], look: [S[0] + 0.5, gy + lerp(0.9, 1.7, t), S[1] - 1.2], fov: 42 };
    }, { steps: 4, over: (t) => ({ text: 'Dựng tháp canh trước khi trời tối', textAlpha: cap(t, 0.06, 0.97, 0.1) }) });
  },

  // 3c. Orbit over the courtyard.
  s03c: () => {
    const c = castle();
    return rec('s03c', 100, (t) => {
      const e = ease(t);
      const a = lerp(1.0, 0.25, e);
      const r = lerp(15, 12, e);
      return { pos: [c.x + Math.sin(a) * r, lerp(10.5, 8.5, e), c.z + Math.cos(a) * r], look: [c.x, 2.2, c.z], fov: 40 };
    }, { over: (t) => ({ text: 'Cả một thị trấn trên lưng đoàn tàu', textAlpha: cap(t, 0.06, 0.97, 0.1) }) });
  },

  // 2. The castle rolls on (recorded after the day shots, edited in second).
  async s02() {
    const c = castle();
    c.destX = c.x + 48;
    D.sim.apply([{ t: 'toggleMove' }]);
    advance(60 * 2, false);
    const done = await rec('s02', 210, (t) => {
      const k = castle();
      const e = ease(t);
      return { pos: [k.x - lerp(11, 4, e), lerp(5.6, 4.6, e), k.z + lerp(14, 12, e)], look: [k.x + lerp(0.5, 2.5, e), 2.0, k.z], fov: 38 };
    }, { auto: false, over: (t) => ({ text: '...một tòa thành vẫn lăn bánh.', textAlpha: cap(t, 0.15, 0.9) }) });
    for (let k = 0; k < 600 && castle().moving; k++) advance(30, false);
    return done;
  },

  // 4. Dusk falls: crane up while the sky turns.
  async s04() {
    until((s) => s.stats.nightsSurvived >= 3 && s.phase === 'day' && s.phaseLength - s.phaseTime < 9);
    const c = castle();
    return rec('s04', 150, (t) => {
      const e = easeIO(t);
      return { pos: v3([c.x - 13, 2.2, c.z + 13], [c.x - 6, 13, c.z + 22], e), look: v3([c.x, 3, c.z], [c.x, 1.5, c.z], e), fov: 40 };
    }, { steps: 12, over: (t) => ({ text: 'Khi mặt trời tắt...', textAlpha: cap(t, 0.25, 0.92) }) });
  },

  // 5. They come out of the dark, seen from behind one pack of them.
  async s05() {
    const pack = (s) => {
      const far = s.monsters.filter((m) => { const d = near(m, s.castle); return d > 9 && d < 28; });
      const lead = far.slice().sort((a, b) => far.filter((o) => near(o, b) < 6).length - far.filter((o) => near(o, a) < 6).length)[0];
      return lead ? far.filter((o) => near(o, lead) < 7) : [];
    };
    until((s) => s.phase === 'night' && pack(s).length >= 5);
    const ids = pack(state()).map((m) => m.id);
    const c = castle();
    const g0 = centroid(pack(state()));
    const dl = Math.hypot(g0.x - c.x, g0.z - c.z);
    const d = [(g0.x - c.x) / dl, (g0.z - c.z) / dl];
    return rec('s05', 120, (t) => {
      const live = state().monsters.filter((m) => ids.includes(m.id));
      const g = live.length ? centroid(live) : g0;
      const P = [g.x + d[0] * 6.5 - d[1] * 1.8, g.z + d[1] * 6.5 + d[0] * 1.8];
      return { pos: [P[0], ground(P[0], P[1]) + lerp(1.5, 2.1, t), P[1]], look: [c.x, 2.4, c.z], fov: 44 };
    }, { over: (t) => ({ text: '...lũ xương khô kéo đến.', textAlpha: cap(t, 0.3, 0.95) }) });
  },

  // 6a. From the battlements, archers loosing into the dark.
  s06a() {
    const s = state();
    const c = s.castle;
    const close = s.monsters.filter((m) => near(m, c) < 18);
    const lead = close.slice().sort((a, b) => close.filter((o) => near(o, b) < 6).length - close.filter((o) => near(o, a) < 6).length)[0];
    const g = lead ?? { x: c.x + 10, z: c.z };
    const dl = Math.hypot(g.x - c.x, g.z - c.z) || 1;
    const d = [(g.x - c.x) / dl, (g.z - c.z) / dl];
    // Just inside the wall on the monsters' side, off to one side of the keep.
    return rec('s06a', 84, (t) => ({
      pos: [c.x + d[0] * 1.2 + d[1] * 2.2, lerp(4.4, 4.0, t), c.z + d[1] * 1.2 - d[0] * 2.2],
      look: [c.x + d[0] * 13, 0.4, c.z + d[1] * 13],
      fov: 48,
    }), { over: (t) => ({ text: 'Giữ vững tường thành', textAlpha: cap(t, 0.1, 0.95) }) });
  },

  // 6b. The whole fight around the castle, orbiting from above (how the game is played).
  s06b() {
    const c = castle();
    const ms = state().monsters;
    const g = ms.length ? centroid(ms) : c;
    const L = { x: lerp(c.x, g.x, 0.35), z: lerp(c.z, g.z, 0.35) };
    return rec('s06b', 96, (t) => {
      const e = ease(t);
      const a = lerp(-0.55, 0.35, e);
      const r = lerp(19, 16, e);
      return { pos: [L.x + Math.sin(a) * r, lerp(15, 13, e), L.z + Math.cos(a) * r], look: [L.x, 0.5, L.z], fov: 42 };
    }, { over: (t) => ({ text: 'Mỗi đêm một trận chiến', textAlpha: cap(t, 0.1, 0.95) }) });
  },

  // 6c. A rain of arrows on the thickest knot of monsters, seen from outside the ring.
  s06c() {
    const s = state();
    const c = s.castle;
    const ms = s.monsters.filter((m) => m.type !== 'boss');
    const best = ms.slice().sort((a, b) => ms.filter((o) => near(o, b) < 4).length - ms.filter((o) => near(o, a) < 4).length)[0] ?? { x: c.x + 8, z: c.z };
    const P = { x: best.x, z: best.z };
    const dl = Math.hypot(P.x - c.x, P.z - c.z) || 1;
    const d = [(P.x - c.x) / dl, (P.z - c.z) / dl];
    return rec('s06c', 90, (t) => {
      const e = ease(t);
      const back = lerp(10, 8.5, e);
      return { pos: [P.x + d[0] * back + d[1] * 3, lerp(8, 9.5, e), P.z + d[1] * back - d[0] * 3], look: [P.x - d[0] * 1.5, 0.4, P.z - d[1] * 1.5], fov: 44 };
    }, { before: (t, i) => { if (i === 10) D.sim.apply([{ t: 'ability', id: 'arrowRain', pos: P }]); }, over: (t) => ({ text: 'Mưa tên!', textAlpha: cap(t, 0.25, 0.92) }) });
  },

  // 6d. The boss, from below, with a clear line of sight.
  async s06d() {
    until((s) => s.monsters.some((m) => m.type === 'boss' && near(m, s.castle) < 16));
    const s = state();
    const boss = s.monsters.find((m) => m.type === 'boss');
    if (!boss) return 'no boss';
    const id = boss.id;
    const deg = Math.PI / 180;
    // Prefer three-quarter views from the castle side, so we see its face and the walls behind us do not block.
    const { a } = clearSpot(boss, 8, [150 * deg, -150 * deg, 120 * deg, -120 * deg, 90 * deg, -90 * deg, 60 * deg, -60 * deg], s.units);
    return rec('s06d', 96, (t) => {
      const b = state().monsters.find((m) => m.id === id) ?? boss;
      const r = lerp(8.5, 6.8, ease(t));
      const P = { x: b.x + Math.sin(a) * r, z: b.z + Math.cos(a) * r };
      return { pos: [P.x, ground(P.x, P.z) + 1.0, P.z], look: [b.x, lerp(3.0, 3.6, t), b.z], fov: 48 };
    }, { over: (t) => ({ text: 'Và những thứ tệ hơn thế', textAlpha: cap(t, 0.25, 0.95) }) });
  },

  // 9. Title background: slow push-in on the castle at night.
  s09() {
    const c = castle();
    return rec('s09', 240, (t) => {
      const e = ease(t);
      return { pos: v3([c.x + 17, 7, c.z + 19], [c.x + 10, 5, c.z + 12], e), look: [c.x, 2.4, c.z], fov: 40 };
    }, {
      over: (t) => {
        const a = Math.min(1, Math.max(0, (t - 0.12) / 0.2));
        const out = Math.max(0, (t - 0.88) / 0.12);
        return { fade: out, title: { main: 'THÀNH TRÌ', tag: 'Sống qua đêm. Lên đường lúc ngày.', foot: 'Game chiến thuật sinh tồn · Chơi ngay trên trình duyệt', a, subA: Math.min(1, Math.max(0, (t - 0.3) / 0.15)), footA: Math.min(1, Math.max(0, (t - 0.45) / 0.15)), spread: lerp(1.6, 1, Math.min(1, t * 2)), dim: 0.25 + 0.35 * a } };
      },
    });
  },

  // 7. Dawn over the battlefield.
  async s07() {
    until((s) => s.phase === 'night' && s.phaseLength - s.phaseTime < 3);
    const c = castle();
    return rec('s07', 180, (t) => {
      const e = easeIO(t);
      return { pos: v3([c.x + 4, 1.8, c.z + 9], [c.x - 8, 15, c.z + 24], e), look: v3([c.x, 2.8, c.z], [c.x + 2, 1, c.z - 4], e), fov: 40 };
    }, { steps: 3, over: (t) => ({ text: 'Mỗi bình minh, một lựa chọn', sub: 'Ở lại giữ thành — hay lên đường?', textAlpha: cap(t, 0.3, 0.95) }) });
  },

  // 8. The castle leaves for the forest.
  async s08() {
    for (let k = 0; k < 200 && state().phase !== 'day'; k++) advance(30);
    const c = castle();
    if (!c.moving) {
      c.destX = c.x + 48;
      D.sim.apply([{ t: 'toggleMove' }]);
    }
    advance(60, false);
    const P = [c.x + 26, 0, c.z + 9];
    return rec('s08', 180, () => {
      const k = castle();
      return { pos: [P[0], ground(P[0], P[2]) + 2.0, P[2]], look: [k.x + 2, 2.4, k.z], fov: 38 };
    }, { steps: 4, auto: false, over: (t) => ({ fade: Math.max(0, (t - 0.85) / 0.15) }) });
  },
};
