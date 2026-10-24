import { BALANCE } from '../data/balance';
import type { GameRenderer } from '../render/renderer';
import { distToCastle, type Sim } from '../sim/sim';
import type { Vec } from '../sim/types';
import type { GameCtl, Hud } from '../ui/hud';

const DRAG_PX = 8;

/** Mouse, keyboard and touch → camera moves and sim Commands. */
export class Input {
  hover: Vec | null = null;
  touchGhost: Vec | null = null;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number; type: string }>();
  private dragging = false;
  private pinchDist = 0;
  private lastTouchMid: { x: number; y: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: GameRenderer,
    private ctl: GameCtl,
    private hud: Hud,
    private getSim: () => Sim,
  ) {
    const on = <K extends keyof WindowEventMap>(target: EventTarget, ev: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(ev, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(ev, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(window, 'pointermove', (e: PointerEvent) => this.move(e));
    on(window, 'pointerup', (e: PointerEvent) => this.up(e));
    on(window, 'pointercancel', (e: PointerEvent) => this.pointers.delete(e.pointerId));
    on(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.renderer.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.key(e));
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
  }

  destroy(): void {
    for (const f of this.cleanup) f();
  }

  /** Per-frame camera panning from held keys. */
  update(dt: number): void {
    const speed = this.renderer.camDist * 1.1 * dt;
    let dx = 0;
    let dz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (dx || dz) this.renderer.pan(dx * speed, dz * speed);
  }

  private ndc(x: number, y: number): Vec | null {
    const r = this.canvas.getBoundingClientRect();
    return this.renderer.pick(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.lastTouchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.dragging = true;
    } else this.dragging = false;
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse') this.hover = this.ndc(e.clientX, e.clientY);
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const wpp = this.renderer.worldPerPixel(this.canvas.clientHeight);
    if (this.pointers.size === 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0 && d > 0) this.renderer.zoom(this.pinchDist / d);
      this.pinchDist = d;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.lastTouchMid) this.renderer.pan(-(mid.x - this.lastTouchMid.x) * wpp, -(mid.y - this.lastTouchMid.y) * wpp * 1.25);
      this.lastTouchMid = mid;
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > DRAG_PX) this.dragging = true;
    // Left/one-finger or middle drag pans. Right drag does nothing (right click orders).
    if (this.dragging && p.button !== 2) this.renderer.pan(-dx * wpp, -dy * wpp * 1.25);
  }

  private up(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastTouchMid = null;
    if (!p || this.dragging) {
      if (this.pointers.size === 0) this.dragging = false;
      return;
    }
    const pos = this.ndc(e.clientX, e.clientY);
    if (!pos) return;
    if (p.button === 2) this.orderAt(pos);
    else if (p.button === 0) this.tap(pos, p.type !== 'mouse');
  }

  private tap(pos: Vec, touch: boolean): void {
    const sim = this.getSim();
    const s = sim.state;
    const mode = this.ctl.mode;
    if (s.phase === 'gameover' || this.hud.modalOpen) return;
    if (mode.kind === 'build') {
      // On touch the first tap previews, a second tap on the same cell places.
      if (touch && (!this.touchGhost || Math.floor(this.touchGhost.x) !== Math.floor(pos.x) || Math.floor(this.touchGhost.z) !== Math.floor(pos.z))) {
        this.touchGhost = pos;
        return;
      }
      this.ctl.send({ t: 'build', type: mode.type, pos });
      this.touchGhost = null;
      return;
    }
    if (mode.kind === 'dismantle') {
      this.ctl.send({ t: 'dismantle', pos });
      return;
    }
    if (mode.kind === 'skill') {
      this.ctl.send({ t: 'ability', id: mode.id, pos });
      this.ctl.setMode({ kind: 'none' });
      return;
    }
    const onCastle = distToCastle(s, pos.x, pos.z) < 0.5;
    if (s.selected >= 0) {
      this.orderAt(pos);
      return;
    }
    if (onCastle) this.hud.toggleRooms(true);
  }

  private orderAt(pos: Vec): void {
    const s = this.getSim().state;
    if (this.ctl.mode.kind !== 'none') {
      this.ctl.setMode({ kind: 'none' });
      return;
    }
    if (s.selected < 0) {
      if (distToCastle(s, pos.x, pos.z) < 0.5) this.hud.toggleRooms(true);
      return;
    }
    this.ctl.send({ t: 'order', pos });
  }

  private key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    this.keys.add(e.code);
    const s = this.getSim().state;
    switch (e.code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4': {
        const g = Number(e.code.slice(-1)) - 1;
        this.ctl.send({ t: 'selectGroup', group: s.selected === g ? -1 : g });
        break;
      }
      case 'Tab':
        e.preventDefault();
        this.hud.toggleRooms();
        break;
      case 'KeyB':
        this.hud.toggleBuild();
        break;
      case 'Space':
        e.preventDefault();
        this.ctl.send({ t: 'toggleMove' });
        break;
      case 'KeyH':
        this.ctl.send({ t: 'orderAll', kind: 'home' });
        break;
      case 'KeyQ':
        this.hud.useSkill('arrowRain');
        break;
      case 'KeyE':
        this.hud.useSkill('bell');
        break;
      case 'KeyP':
        this.ctl.togglePause();
        break;
      case 'KeyO':
        this.ctl.toggleAuto();
        break;
      case 'KeyC':
        this.renderer.centerOn(s.castle.x, s.castle.z);
        break;
      case 'Escape':
        if (this.ctl.mode.kind !== 'none') this.ctl.setMode({ kind: 'none' });
        else if (this.hud.panelOpen) this.hud.closePanels();
        else if (s.selected >= 0) this.ctl.send({ t: 'selectGroup', group: -1 });
        else this.ctl.togglePause();
        break;
    }
  }

  /** Current ghost/target overlay for the renderer. */
  overlay(): { ghostPos: Vec | null; radius: number } {
    const m = this.ctl.mode;
    const p = m.kind === 'build' && this.touchGhost ? this.touchGhost : this.hover;
    return { ghostPos: p, radius: m.kind === 'skill' ? BALANCE.abilities[m.id].radius ?? 0 : 0 };
  }
}
