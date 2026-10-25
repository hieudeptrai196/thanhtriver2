import './style.css';
import { Audio } from './audio/audio';
import { getLang, initLang, setLang, t, type MessageKey } from './i18n';
import { Input } from './input/input';
import { GameRenderer } from './render/renderer';
import { botCommands } from './sim/bot';
import { DT, score, Sim } from './sim/sim';
import type { Command } from './sim/types';
import { el, Hud, type GameCtl, type Mode } from './ui/hud';
import { addScore, clearSave, loadSave, loadScores, writeSave } from './ui/storage';

initLang();
const params = new URLSearchParams(location.search);
const showFps = params.get('fps') === '1';
// ?shadows=0 turns sun shadows off from the start.
const noShadows = params.get('shadows') === '0';
// Debug: ?speed=4 runs the simulation faster (the in-game button switches x1/x2 on top of it).
const debugSpeed = Math.max(1, Math.min(16, Number(params.get('speed') ?? 1) || 1));
const app = document.getElementById('app')!;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new GameRenderer(canvas);
renderer.loadModels();
if (noShadows) renderer.setShadows(false);
if (import.meta.env.DEV) (window as unknown as { renderer: GameRenderer }).renderer = renderer;
const audio = new Audio();

document.title = t('app.title');
const rotate = el('div', 'rotate', `⟳ ${t('menu.rotate')}`);
document.body.append(rotate);

class Game implements GameCtl {
  sim: Sim;
  hud: Hud;
  input: Input;
  mode: Mode = { kind: 'none' };
  paused = false;
  auto = false;
  speed = 1;
  selectMode = false;
  private autoDawn = 0;
  gameOverInfo: { best: boolean } | null = null;
  private queue: Command[] = [];
  private acc = 0;
  private alive = true;

  constructor(sim: Sim) {
    this.sim = sim;
    this.hud = new Hud(app, this);
    this.hud.showFps = showFps;
    this.input = new Input(canvas, renderer, this, this.hud, () => this.sim);
    renderer.centerOn(sim.state.castle.x, sim.state.castle.z + 4);
  }

  send(cmd: Command): void {
    this.queue.push(cmd);
  }

  setMode(m: Mode, keepSelection = false): void {
    this.mode = m;
    this.input.touchGhost = null;
    if (m.kind !== 'none' && !keepSelection && this.sim.state.selected >= 0) this.send({ t: 'selectGroup', group: -1 });
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
  }

  toggleSelectMode(): void {
    this.selectMode = !this.selectMode;
    if (this.selectMode) this.setMode({ kind: 'none' });
  }

  toggleAuto(): void {
    this.auto = !this.auto;
    this.autoDawn = 0;
    if (this.auto) this.setMode({ kind: 'none' });
  }

  toMenu(): void {
    this.destroy();
    showMenu();
  }

  restart(): void {
    this.destroy();
    startGame(Sim.create(newSeed(), this.sim.state.mode));
  }

  destroy(): void {
    this.alive = false;
    this.input.destroy();
    this.hud.destroy();
    if (current === this) current = null;
  }

  frame(dt: number, fps: number): void {
    if (!this.alive) return;
    const sim = this.sim;
    // Commands apply even while paused, so you can give orders and then resume.
    if (this.queue.length) {
      sim.apply(this.queue);
      this.queue = [];
    }
    // Auto: the built-in commander plays. Dawn choices wait a moment so the screen can be read.
    if (this.auto && !this.paused && sim.state.phase === 'dawn') {
      this.autoDawn += dt * debugSpeed * this.speed;
      if (this.autoDawn > 2.5) {
        sim.apply(botCommands(sim));
        this.autoDawn = 0;
      }
    }
    if (!this.paused && !this.hud.modalOpen) {
      const speed = debugSpeed * this.speed;
      this.acc += dt * speed;
      const maxSteps = 8 * speed;
      let steps = 0;
      while (this.acc >= DT && steps < maxSteps) {
        if (this.auto) sim.apply(botCommands(sim));
        sim.step();
        this.acc -= DT;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
    }
    const events = sim.drainEvents();
    if (events.length) {
      this.hud.onEvents(events);
      renderer.onEvents(events);
      audio.play(events);
      for (const e of events) {
        if (e.key === 'msg.dawn') writeSave(sim.save());
        if (e.key === 'msg.gameOver' || e.key === 'msg.victory') {
          clearSave();
          const s = sim.state;
          const best = addScore({ nights: s.stats.nightsSurvived, kills: s.stats.kills, bosses: s.stats.bosses, score: score(s), date: Date.now(), mode: s.mode, won: s.phase === 'victory' });
          this.gameOverInfo = { best };
        }
      }
    }
    // Follow the castle while it rolls.
    if (sim.state.castle.moving) renderer.pan((sim.state.castle.x - renderer.camTarget.x) * Math.min(1, dt * 2), 0);
    this.input.update(dt);
    const ov = this.input.overlay();
    const m = this.mode;
    renderer.render(sim, dt, {
      ghost: m.kind === 'build' && ov.ghostPos ? { type: m.type, pos: ov.ghostPos, valid: sim.canBuildAt(m.type, ov.ghostPos) } : null,
      skillTarget: m.kind === 'skill' && ov.ghostPos ? { pos: ov.ghostPos, radius: ov.radius } : null,
    });
    this.hud.update(sim, renderer, canvas.clientWidth, canvas.clientHeight, fps);
  }
}

let current: Game | null = null;
let menuEl: HTMLElement | null = null;

function newSeed(): number {
  const q = params.get('seed');
  return q ? Number(q) >>> 0 : (Math.random() * 2 ** 31) >>> 0;
}

function startGame(sim: Sim): void {
  menuEl?.remove();
  menuEl = null;
  current = new Game(sim);
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = current;
}

// Buttons must not keep focus, or Space would also "click" the last pressed button.
document.addEventListener('click', (e) => (e.target as HTMLElement | null)?.closest('button')?.blur(), true);

function showMenu(view: 'main' | 'scores' | 'help' | 'credits' | 'mode' = 'main'): void {
  menuEl?.remove();
  menuEl = el('div', 'menu');
  const box = el('div', 'menu-box');
  box.append(el('h1', '', t('app.title')), el('div', 'subtitle', t('app.subtitle')));
  const save = loadSave();
  if (view === 'main') {
    const list = el('div', 'menu-list');
    const btn = (label: string, fn: () => void, cls = 'btn big') => {
      const b = el('button', cls, label);
      b.onclick = () => {
        audio.unlock();
        fn();
      };
      list.append(b);
      return b;
    };
    if (save) {
      btn(t('menu.continue'), () => {
        try {
          startGame(Sim.load(save));
        } catch {
          clearSave();
          showMenu();
        }
      });
    }
    btn(t('menu.new'), () => showMenu('mode'), save ? 'btn' : 'btn big');
    btn(t('menu.scores'), () => showMenu('scores'), 'btn');
    btn(t('menu.help'), () => showMenu('help'), 'btn');
    btn(t('menu.credits'), () => showMenu('credits'), 'btn');
    const lang = el('div', 'lang');
    lang.append(el('span', '', t('menu.language')));
    for (const l of ['vi', 'en'] as const) {
      const b = el('button', `btn small ${getLang() === l ? 'on' : ''}`, l === 'vi' ? 'Tiếng Việt' : 'English');
      b.onclick = () => {
        setLang(l);
        document.title = t('app.title');
        rotate.textContent = `⟳ ${t('menu.rotate')}`;
        showMenu();
      };
      lang.append(b);
    }
    box.append(list, lang);
  } else if (view === 'scores') {
    const rows = loadScores();
    const list = el('ol', 'scores');
    if (rows.length === 0) box.append(el('p', '', t('menu.noScores')));
    for (const r of rows) {
      const mode = r.mode ? ` · ${t(`mode.${r.mode}` as MessageKey)}` : '';
      list.append(el('li', '', `${t('menu.scoreRow', { nights: r.nights, kills: r.kills, score: r.score })}${mode}${r.won ? ' 🏆' : ''}`));
    }
    box.append(list);
  } else if (view === 'mode') {
    // Game modes (GDD v1.2 §14).
    const list = el('div', 'menu-list');
    for (const mode of ['journey', 'short', 'endless'] as const) {
      const b = el('button', mode === 'journey' ? 'btn big pick' : 'btn pick');
      b.append(el('b', '', t(`mode.${mode}` as MessageKey)), el('small', '', t(`mode.desc.${mode}` as MessageKey)));
      b.onclick = () => {
        audio.unlock();
        startGame(Sim.create(newSeed(), mode));
      };
      list.append(b);
    }
    box.append(list);
  } else if (view === 'help') {
    const list = el('div', 'help');
    for (let i = 1; i <= 8; i++) list.append(el('p', '', t(`help.${i}`)));
    box.append(list);
  } else {
    const list = el('div', 'help');
    list.append(el('p', '', t('credits.models')), el('p', '', t('credits.code')), el('p', '', t('credits.thanks')));
    box.append(list);
  }
  if (view !== 'main') {
    const back = el('button', 'btn', t('menu.back'));
    back.onclick = () => showMenu();
    box.append(back);
  }
  menuEl.append(box);
  app.append(menuEl);
}

// ---------------------------------------------------------------- loop

function resize(): void {
  renderer.resize(canvas.clientWidth, canvas.clientHeight);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fpsAvg = 60;
let slowTime = 0;
const menuSpin = { a: 0 };
const idleSim = Sim.create(7);

function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  // Adaptive resolution: drop pixel ratio when frames are slow.
  if (fpsAvg < 40) slowTime += dt;
  else slowTime = Math.max(0, slowTime - dt * 0.5);
  if (slowTime > 2 && renderer.shadows) {
    // Shadows go first, then resolution.
    renderer.setShadows(false);
    slowTime = 0;
  } else if (slowTime > 2 && renderer.pixelRatio > 0.75) {
    renderer.pixelRatio = Math.max(0.75, renderer.pixelRatio - 0.25);
    slowTime = 0;
    resize();
  }
  if (current) current.frame(dt, fpsAvg);
  else {
    // Slow orbit over a quiet village behind the menu.
    menuSpin.a += dt * 0.15;
    renderer.camTarget.set(Math.sin(menuSpin.a) * 6, 0, Math.cos(menuSpin.a) * 3);
    renderer.render(idleSim, dt, { ghost: null, skillTarget: null });
  }
  requestAnimationFrame(loop);
}

showMenu();
requestAnimationFrame(loop);
