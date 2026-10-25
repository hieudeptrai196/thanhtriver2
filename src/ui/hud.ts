import {
  BALANCE,
  ROOM_TYPES,
  SOLDIER_TYPES,
  STRUCT_TYPES,
  UNIT_TYPES,
  type AbilityId,
  type Cost,
  type Dir,
  type Res,
  type RoomType,
  type StructType,
} from '../data/balance';
import { t, type MessageKey } from '../i18n';
import type { GameRenderer } from '../render/renderer';
import { canAfford, castleLoad, foodDawns, foodNeed, refundShare, travelSpeed, loadCapacity, loadLevel, storageCap, structCost, unitCost, groupCounts, incomePerMin, popCap, popUsed, resourcePctOf, score, slotCount, synergySlots, SLOT_POS, type Sim } from '../sim/sim';
import type { Command, GameEvent, LaborRes } from '../sim/types';

export type Mode =
  | { kind: 'none' }
  | { kind: 'build'; type: StructType }
  | { kind: 'dismantle' }
  | { kind: 'skill'; id: AbilityId }
  | { kind: 'order'; mode: 'hold' | 'guard' | 'focus' };

export interface GameCtl {
  send(cmd: Command): void;
  mode: Mode;
  setMode(m: Mode, keepSelection?: boolean): void;
  paused: boolean;
  togglePause(): void;
  auto: boolean;
  toggleAuto(): void;
  selectMode: boolean;
  toggleSelectMode(): void;
  toMenu(): void;
  restart(): void;
  gameOverInfo: { best: boolean } | null;
  speed: number;
  toggleSpeed(): void;
}

const RES_ICON: Record<Res, string> = { wood: '🪵', stone: '🪨', food: '🍖', gold: '🪙' };
// Frequent events the HUD or the dawn recap already show.
const TOAST_SKIP = new Set(['msg.wave', 'msg.unitLost', 'msg.nightPlan', 'msg.cargoDropped', 'msg.dusk']);
const TOAST_INFO = new Set(['msg.tierUp', 'msg.bossDown', 'msg.victory', 'msg.strangers', 'msg.arrived', 'msg.fireOut']);
const SKILLS: AbilityId[] = ['arrowRain', 'bell', 'seal', 'reserve', 'patch'];
const SKILL_KEY: Record<AbilityId, string> = { arrowRain: 'Q', bell: 'E', seal: 'Z', reserve: 'X', patch: 'V' };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function costText(cost: Cost): string {
  return (Object.keys(cost) as Res[]).map((r) => `${RES_ICON[r]}${cost[r]}`).join(' ');
}

const TERRAIN_ICON: Record<string, string> = { plains: '🌾', forest: '🌲', canyon: '⛰' };
const UNIT_ICON: Record<string, string> = { peasant: '🌾', builder: '🔨', spear: '🗡', shield: '🛡', archer: '🏹' };
const PATTERN_ICON: Record<string, string> = { breach: '🔨', harass: '🐺', split: '⇄', ranged: '🏹', siege: '⏳', boss: '💀' };
const SKILL_ICON: Record<AbilityId, string> = { arrowRain: '🎯', bell: '🔔', seal: '🚪', reserve: '🪖', patch: '🔧' };

/** Button label as icon + name + extra; the name hides on small screens. Only touches the DOM when it changes. */
function setLabel(b: HTMLElement, icon: string, name: string, extra = ''): void {
  const key = icon + '|' + name + '|' + extra;
  if (b.dataset.label === key) return;
  b.dataset.label = key;
  b.replaceChildren(el('span', 'ic', icon), el('span', 'nm', name), ...(extra ? [el('span', 'ex', extra)] : []));
  if (!b.dataset.tip) b.title = name;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  readonly root: HTMLElement;
  private ctl: GameCtl;
  private topNight = el('div', 'tb-night');
  private topPhase = el('div', 'tb-phase');
  private resEls = {} as Record<Res, HTMLElement>;
  private popEl = el('div', 'tb-res');
  private coreBar = el('div', 'bar-fill');
  private wallBar = el('div', 'bar-fill wall');
  private coreTxt = el('span');
  private wallTxt = el('span');
  private wheelEl = el('div', 'tb-wheel');
  private groupBtns: HTMLButtonElement[] = [];
  private skillBtns = {} as Record<AbilityId, HTMLButtonElement>;
  private runBtn = el('button', 'btn run big');
  private pauseBtn = el('button', 'btn small');
  private autoBtn = el('button', 'btn small auto');
  private speedBtn = el('button', 'btn small');
  private loadEl = el('div', 'tb-load');
  private dumpBtn = el('button', 'btn small dump');
  private selectBtn = el('button', 'btn');
  private pickBar = el('div', 'pick-bar');
  private squadBar = el('div', 'squad-bar');
  private squadBtns: HTMLButtonElement[] = [];
  private orderBar = el('div', 'order-bar');
  private orderBtns = {} as Record<'hold' | 'guard' | 'focus' | 'retreat' | 'formation', HTMLButtonElement>;
  private pickText = el('span', 'pick-text');
  private box = el('div', 'select-box');
  private hint = el('div', 'hint');
  private toasts = el('div', 'toasts');
  private arrows = el('div', 'arrows');
  private pauseBanner = el('div', 'pause-banner');
  private fps = el('div', 'fps');
  private planEl = el('div', 'plan-banner');
  private planSig = '';
  private rooms: HTMLElement;
  private build: HTMLElement;
  private eco: HTMLElement;
  private ecoSig = '';
  private foodEl = el('div', 'tb-food');
  private dawn: HTMLElement;
  private over: HTMLElement;
  private roomSig = '';
  private dawnSig = '';
  private buildSig = '';
  private roomProgress: HTMLElement[] = [];
  private selectedSlot = -1;
  private overShown = false;
  private dawnShownAt = 0;
  showFps = false;

  constructor(parent: HTMLElement, ctl: GameCtl) {
    this.ctl = ctl;
    this.root = el('div', 'hud');
    parent.appendChild(this.root);

    // Top bar.
    const top = el('div', 'topbar');
    const left = el('div', 'tb-left');
    left.append(this.topNight, this.topPhase);
    const res = el('div', 'tb-resources');
    for (const r of ['wood', 'stone', 'food', 'gold'] as Res[]) {
      const e = el('div', 'tb-res');
      e.title = t(`res.${r}`);
      this.resEls[r] = e;
      res.appendChild(e);
    }
    this.popEl.title = t('hud.pop');
    res.appendChild(this.popEl);
    res.appendChild(this.foodEl);
    const bars = el('div', 'tb-bars');
    const coreWrap = el('div', 'bar');
    coreWrap.append(this.coreBar, this.coreTxt);
    const wallWrap = el('div', 'bar');
    wallWrap.append(this.wallBar, this.wallTxt);
    bars.append(coreWrap, wallWrap, this.wheelEl, this.loadEl);
    const menuBtn = el('button', 'btn small', '☰');
    menuBtn.title = t('hud.menu');
    menuBtn.onclick = () => ctl.toMenu();
    this.pauseBtn.onclick = () => ctl.togglePause();
    this.autoBtn.onclick = () => ctl.toggleAuto();
    this.speedBtn.onclick = () => ctl.toggleSpeed();
    this.speedBtn.title = t('hud.speedHelp');
    top.append(left, res, bars, this.speedBtn, this.autoBtn, this.pauseBtn, menuBtn);

    // Bottom bar.
    const bottom = el('div', 'bottombar');
    const groups = el('div', 'groups');
    UNIT_TYPES.forEach((type, i) => {
      const b = el('button', 'btn group');
      b.dataset.type = type;
      b.onclick = () => {
        const sel = this.selected === i ? -1 : i;
        ctl.send({ t: 'selectGroup', group: sel });
        if (ctl.mode.kind !== 'none') ctl.setMode({ kind: 'none' });
      };
      this.groupBtns.push(b);
      groups.appendChild(b);
    });
    const actions = el('div', 'actions');
    for (const id of SKILLS) {
      const b = el('button', 'btn skill');
      b.onclick = () => this.useSkill(id);
      this.skillBtns[id] = b;
      actions.appendChild(b);
    }
    const buildBtn = el('button', 'btn');
    setLabel(buildBtn, '⚒', t('hud.build'));
    buildBtn.onclick = () => this.toggleBuild();
    const roomsBtn = el('button', 'btn');
    setLabel(roomsBtn, '🏰', t('hud.rooms'));
    roomsBtn.onclick = () => this.toggleRooms();
    const recallBtn = el('button', 'btn');
    setLabel(recallBtn, '📯', t('hud.recall'));
    recallBtn.onclick = () => ctl.send({ t: 'orderAll', kind: 'home' });
    this.runBtn.onclick = () => ctl.send({ t: 'toggleMove' });
    setLabel(this.dumpBtn, '📤', t('hud.dump'));
    this.dumpBtn.title = t('hud.dumpHelp');
    this.dumpBtn.onclick = () => ctl.send({ t: 'dumpCargo' });
    setLabel(this.selectBtn, '⬚', t('hud.selectMode'));
    this.selectBtn.title = t('hud.selectModeHelp');
    this.selectBtn.onclick = () => ctl.toggleSelectMode();
    const ecoBtn = el('button', 'btn');
    setLabel(ecoBtn, '📦', t('hud.economy'));
    ecoBtn.title = t('eco.help');
    ecoBtn.onclick = () => this.toggleEco();
    actions.append(this.selectBtn, ecoBtn, buildBtn, roomsBtn, recallBtn, this.dumpBtn, this.runBtn);
    const release = el('button', 'btn small', '↺');
    release.title = t('hud.release');
    release.onclick = () => ctl.send({ t: 'releaseUnits' });
    const deselect = el('button', 'btn small', '✕');
    deselect.title = t('hud.deselect');
    deselect.onclick = () => ctl.send({ t: 'selectUnits', ids: [] });
    // One row: who is picked, tactical orders, back to auto / deselect, squad assignment.
    this.pickBar.append(this.pickText, this.orderBar, release, deselect);
    // Squads 1–5 (GDD v1.2 §8.1): tap to select; with units picked, "assign" puts them in a squad.
    const assign = el('span', 'assign', '⚑');
    assign.title = t('hud.assign');
    this.pickBar.append(assign);
    for (let n = 1; n <= BALANCE.squads.count; n++) {
      const a = el('button', 'btn tiny', String(n));
      a.title = t('hud.assignHelp', { n });
      a.onclick = () => ctl.send({ t: 'assignSquad', ids: this.sim.state.selectedIds, squad: n });
      this.pickBar.append(a);
      const b = el('button', 'btn squad');
      b.onclick = () => ctl.send({ t: 'selectSquad', squad: n });
      this.squadBtns.push(b);
      this.squadBar.append(b);
    }
    // Tactical orders for soldiers.
    const ob = (key: keyof typeof this.orderBtns, icon: string, label: string, help: string, fn: () => void) => {
      const b = el('button', 'btn small');
      setLabel(b, icon, label);
      b.title = help;
      b.onclick = fn;
      this.orderBtns[key] = b;
      this.orderBar.append(b);
    };
    const pick = (mode: 'hold' | 'guard' | 'focus') => () =>
      ctl.setMode(ctl.mode.kind === 'order' && ctl.mode.mode === mode ? { kind: 'none' } : { kind: 'order', mode }, true);
    ob('hold', '✋', t('order.hold'), t('order.help.hold'), pick('hold'));
    ob('guard', '🛡', t('order.guard'), t('order.help.guard'), pick('guard'));
    ob('focus', '🎯', t('order.focus'), t('order.help.focus'), pick('focus'));
    ob('retreat', '↩', t('order.retreat'), t('order.help.retreat'), () => ctl.send({ t: 'order', pos: { x: this.sim.state.castle.x, z: this.sim.state.castle.z }, mode: 'retreat' }));
    ob('formation', '▤', t('order.line'), t('order.help.formation'), () => ctl.send({ t: 'setFormation', formation: this.sim.state.formation === 'line' ? 'ring' : 'line' }));
    bottom.append(groups, actions);
    // Bars that float above the bottom bar follow its real height (it wraps on narrow screens).
    const fit = () => this.root.style.setProperty('--bb', `${bottom.offsetHeight + 12}px`);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(bottom);
    requestAnimationFrame(fit);

    this.rooms = el('div', 'panel rooms hidden');
    this.build = el('div', 'panel build hidden');
    this.eco = el('div', 'panel eco hidden');
    this.dawn = el('div', 'modal dawn hidden');
    this.over = el('div', 'modal over hidden');
    this.pauseBanner.textContent = t('hud.paused');
    this.root.append(top, this.planEl, this.box, this.pickBar, this.squadBar, this.arrows, this.hint, this.toasts, this.pauseBanner, bottom, this.rooms, this.build, this.eco, this.dawn, this.over, this.fps);
  }

  private sim!: Sim;
  private get selected(): number {
    return this.sim ? this.sim.state.selected : -1;
  }

  useSkill(id: AbilityId): void {
    const s = this.sim.state;
    if (s.cooldowns[id] > 0 || s.phase === 'dawn') return;
    if (!s.unlocked.includes(id)) return;
    if (id === 'arrowRain') this.ctl.setMode(this.ctl.mode.kind === 'skill' ? { kind: 'none' } : { kind: 'skill', id });
    else this.ctl.send({ t: 'ability', id });
  }

  /** Rubber-band rectangle in CSS pixels, or null to hide it. */
  setBox(r: { x0: number; y0: number; x1: number; y1: number } | null): void {
    if (!r) {
      this.box.style.display = 'none';
      return;
    }
    this.box.style.display = 'block';
    this.box.style.left = `${Math.min(r.x0, r.x1)}px`;
    this.box.style.top = `${Math.min(r.y0, r.y1)}px`;
    this.box.style.width = `${Math.abs(r.x1 - r.x0)}px`;
    this.box.style.height = `${Math.abs(r.y1 - r.y0)}px`;
  }

  get panelOpen(): boolean {
    return [this.rooms, this.build, this.eco].some((p) => !p.classList.contains('hidden'));
  }

  toggleEco(force?: boolean): void {
    const open = force ?? this.eco.classList.contains('hidden');
    this.closePanels();
    this.eco.classList.toggle('hidden', !open);
    this.ecoSig = '';
  }

  get modalOpen(): boolean {
    return !this.dawn.classList.contains('hidden') || !this.over.classList.contains('hidden');
  }

  toggleRooms(force?: boolean): void {
    const open = force ?? this.rooms.classList.contains('hidden');
    this.closePanels();
    this.rooms.classList.toggle('hidden', !open);
    this.roomSig = '';
    this.selectedSlot = -1;
  }

  toggleBuild(force?: boolean): void {
    const open = force ?? this.build.classList.contains('hidden');
    this.closePanels();
    this.build.classList.toggle('hidden', !open);
    this.buildSig = '';
  }

  closePanels(): void {
    this.rooms.classList.add('hidden');
    this.build.classList.add('hidden');
    this.eco.classList.add('hidden');
  }

  toast(text: string, level: GameEvent['level'] = 'info'): void {
    // The same message twice in a row is not repeated.
    if (this.toasts.firstElementChild?.textContent === text) return;
    const e = el('div', `toast ${level}`, text);
    this.toasts.prepend(e);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild!.remove();
    setTimeout(() => e.classList.add('fade'), 1800);
    setTimeout(() => e.remove(), 2400);
  }

  onEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (!e.key.startsWith('msg.')) continue;
      // Only warnings and a few milestones get a toast; the HUD already shows the rest.
      if (e.level !== 'warn' && e.level !== 'danger' && !TOAST_INFO.has(e.key)) continue;
      if (TOAST_SKIP.has(e.key)) continue;
      this.toast(t(e.key as MessageKey, e.params), e.level);
    }
  }

  update(sim: Sim, renderer: GameRenderer, w: number, h: number, fps: number): void {
    this.sim = sim;
    const s = sim.state;
    const c = s.castle;
    this.topNight.textContent = t('hud.night', { n: s.night });
    const remain = s.phaseLength - s.phaseTime;
    this.topPhase.textContent = `${t(`phase.${s.phase}` as MessageKey)}${s.phase === 'day' || s.phase === 'dusk' || s.phase === 'night' ? ' · ' + fmtTime(remain) : ''}`;
    this.topPhase.className = `tb-phase ${s.phase}`;
    for (const r of ['wood', 'stone', 'food', 'gold'] as Res[]) this.resEls[r].textContent = `${RES_ICON[r]} ${Math.floor(s.res[r])}`;
    this.popEl.textContent = `👥 ${s.units.length}/${popCap(s)}`;
    // Food forecast: how many dawns the stock still covers (GDD v1.2 §6.5).
    const dawns = foodDawns(s);
    const foodTxt = dawns >= 9 ? '☀✓' : `☀${dawns}`;
    if (this.foodEl.textContent !== foodTxt) this.foodEl.textContent = foodTxt;
    this.foodEl.classList.toggle('bad', dawns < 2);
    this.foodEl.title = t('eco.foodNeed', { need: s.units.length * BALANCE.foodPerUnit });
    const core = c.coreHp / c.coreMax;
    this.coreBar.style.width = `${core * 100}%`;
    this.coreBar.classList.toggle('low', core < BALANCE.warnings.coreLow);
    this.coreTxt.textContent = `❤ ${Math.ceil(c.coreHp)}`;
    this.coreTxt.parentElement!.title = t('hud.core');
    this.wallBar.style.width = `${(c.wallHp / c.wallMax) * 100}%`;
    this.wallBar.classList.toggle('low', c.wallHp / c.wallMax < BALANCE.warnings.wallLow);
    this.wallTxt.textContent = `🧱 ${Math.ceil(c.wallHp)}`;
    this.wallTxt.parentElement!.title = t('hud.wall');
    const wheelBroken = c.wheelHp <= 0;
    this.wheelEl.textContent = wheelBroken ? '⚙✕' : `⚙ ${Math.round((c.wheelHp / c.wheelMax) * 100)}%`;
    this.wheelEl.title = wheelBroken ? t('hud.wheelBroken') : t('hud.wheel');
    this.wheelEl.classList.toggle('bad', wheelBroken);
    // Castle load (GDD v1.2 §5.2): light / heavy / very heavy / overloaded.
    const lv = loadLevel(s);
    const loadTxt = lv === 'light' ? '⚖' : `⚖ ${t(`load.${lv}` as MessageKey)}`;
    if (this.loadEl.textContent !== loadTxt) this.loadEl.textContent = loadTxt;
    this.loadEl.className = `tb-load ${lv}`;
    this.loadEl.title = `${t(`load.${lv}` as MessageKey)} · ${t('load.help', { load: Math.round(castleLoad(s)), cap: Math.round(loadCapacity(s)), store: storageCap(s) })}`;
    this.dumpBtn.style.display = lv === 'overloaded' && s.phase === 'day' ? '' : 'none';
    const spd = `x${this.ctl.speed}`;
    if (this.speedBtn.textContent !== spd) this.speedBtn.textContent = spd;
    this.speedBtn.classList.toggle('on', this.ctl.speed > 1);
    this.pauseBtn.textContent = this.ctl.paused ? '▶' : '⏸';
    this.pauseBtn.title = this.ctl.paused ? t('hud.resume') : t('hud.pause');
    this.pauseBanner.classList.toggle('show', this.ctl.paused);
    setLabel(this.autoBtn, '🤖', t('hud.auto'), this.ctl.auto ? '✓' : '');
    this.autoBtn.title = t('hud.autoHelp');
    this.autoBtn.classList.toggle('on', this.ctl.auto);

    // Hand-picked units.
    this.selectBtn.classList.toggle('on', this.ctl.selectMode);
    const picked = s.units.filter((u) => s.selectedIds.includes(u.id));
    const groupSoldier = s.selected >= 0 && SOLDIER_TYPES.includes(UNIT_TYPES[s.selected]);
    this.pickBar.classList.toggle('show', picked.length > 0 || groupSoldier);
    this.root.classList.toggle('picking', picked.length > 0 || groupSoldier);
    if (!picked.length && groupSoldier) {
      const type = UNIT_TYPES[s.selected];
      const txt = `${UNIT_ICON[type]}${groupCounts(s)[type]}`;
      if (this.pickText.textContent !== txt) this.pickText.textContent = txt;
    }
    if (picked.length) {
      const by = UNIT_TYPES.map((type) => [type, picked.filter((u) => u.type === type).length] as const).filter(([, n]) => n > 0);
      const txt = by.map(([type, n]) => `${UNIT_ICON[type]}${n}`).join(' ');
      if (this.pickText.textContent !== txt) this.pickText.textContent = txt;
    }

    // Squad strip and the tactical order bar.
    for (let n = 1; n <= this.squadBtns.length; n++) {
      const members = s.units.filter((u) => u.squad === n);
      const b = this.squadBtns[n - 1];
      setLabel(b, `⚑${n}`, t('hud.squad', { n }), String(members.length));
      b.disabled = members.length === 0;
      b.classList.toggle('on', members.length > 0 && members.every((u) => s.selectedIds.includes(u.id)));
    }
    const soldiersPicked = picked.some((u) => SOLDIER_TYPES.includes(u.type)) || (s.selected >= 0 && SOLDIER_TYPES.includes(UNIT_TYPES[s.selected]));
    this.orderBar.classList.toggle('show', soldiersPicked);
    if (soldiersPicked) {
      const m = this.ctl.mode;
      for (const k of ['hold', 'guard', 'focus'] as const) this.orderBtns[k].classList.toggle('on', m.kind === 'order' && m.mode === k);
      setLabel(this.orderBtns.formation, s.formation === 'line' ? '▤' : '◎', t(s.formation === 'line' ? 'order.line' : 'order.ring'));
    }

    const counts = groupCounts(s);
    UNIT_TYPES.forEach((type, i) => {
      const b = this.groupBtns[i];
      setLabel(b, UNIT_ICON[type], t(`unit.${type}` as MessageKey), String(counts[type]));
      b.classList.toggle('on', s.selected === i);
    });
    for (const id of SKILLS) {
      const b = this.skillBtns[id];
      b.style.display = s.unlocked.includes(id) ? '' : 'none';
      const cd = s.cooldowns[id] > 1e5 ? 0 : s.cooldowns[id];
      const usedTonight = s.cooldowns[id] > 1e5;
      const locked = BALANCE.abilities[id].tier > c.tier;
      setLabel(b, SKILL_ICON[id], `${SKILL_KEY[id]} · ${t(`skill.${id}` as MessageKey)}`, usedTonight ? '✓' : cd > 0 ? `${Math.ceil(cd)}s` : '');
      b.title = t(`skill.desc.${id}` as MessageKey);
      const nightOnly = id === 'seal' || id === 'reserve';
      b.disabled = cd > 0 || usedTonight || locked || s.phase === 'dawn' || (nightOnly && s.phase !== 'dusk' && s.phase !== 'night');
      b.classList.toggle('on', this.ctl.mode.kind === 'skill' && this.ctl.mode.id === id);
      b.style.setProperty('--cd', `${cd > 0 ? (cd / Math.max(1, BALANCE.abilities[id].cooldown)) * 100 : 0}%`);
    }
    const canRun = s.phase === 'day' && Math.abs(c.destX - c.x) > 0.5 && !wheelBroken;
    const runTxt = c.moving ? `■ ${t('hud.stop')}` : `▶ ${t('hud.run')}`;
    if (this.runBtn.textContent !== runTxt) this.runBtn.textContent = runTxt;
    this.runBtn.disabled = !c.moving && !canRun;
    this.runBtn.classList.toggle('pulse', canRun && !c.moving);

    // Hint line.
    const m = this.ctl.mode;
    let hint = '';
    if (m.kind === 'build') hint = t('hud.buildMode', { struct: m.type });
    else if (m.kind === 'dismantle') hint = t('hud.dismantleMode');
    else if (m.kind === 'skill') hint = t('hud.targetSkill', { skill: m.id });
    else if (m.kind === 'order') hint = t(`order.pick.${m.mode}` as MessageKey);
    else if (c.moving) hint = `⏱ ${Math.ceil(Math.abs(c.destX - c.x) / Math.max(0.01, travelSpeed(s)))}s`;
    else if (c.fire > 0) hint = `🔥 ${t('hud.fire')}`;
    else if (s.phase === 'night' && s.plan && s.monsters.length === 0 && s.plan.waves.some((w) => w.spawned < w.count)) hint = t('hud.rest');
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.hint.classList.toggle('show', hint !== '');

    this.updateArrows(sim, renderer, w, h);
    this.updatePlan(sim);
    if (!this.rooms.classList.contains('hidden')) this.renderRooms(sim);
    if (!this.build.classList.contains('hidden')) this.renderBuild(sim);
    if (!this.eco.classList.contains('hidden')) this.renderEco(sim);
    this.renderDawn(sim);
    this.renderOver(sim);

    this.fps.classList.toggle('show', this.showFps);
    if (this.showFps) this.fps.textContent = t('hud.fps', { fps: Math.round(fps) });
  }

  /** Dusk/night banner: tonight's problems and how sure the forecast is (GDD v1.2 §10.2). */
  private updatePlan(sim: Sim): void {
    const s = sim.state;
    const plan = s.plan;
    const show = !!plan && (s.phase === 'dusk' || s.phase === 'night') && !!plan.patterns;
    const sig = show ? `${s.night}:${plan!.patterns.join()}:${plan!.confirmed}:${plan!.harassDir}` : '';
    this.planEl.classList.toggle('show', show);
    if (sig === this.planSig) return;
    this.planSig = sig;
    this.planEl.replaceChildren();
    if (!show) return;
    // One chip per problem; the explanation is in the tooltip so the screen stays clear.
    for (const p of plan!.patterns) {
      const chip = el('span', 'plan-chip', `${PATTERN_ICON[p]} ${t(`pattern.${p}` as MessageKey)}`);
      chip.title = t(`pattern.hint.${p}` as MessageKey, { dir: plan!.harassDir ?? plan!.dirs[0] });
      this.planEl.append(chip);
    }
    const est = plan!.confirmed ? `👁 ${plan!.total}` : `≈ ${Math.round(plan!.total * 0.8)}–${Math.round(plan!.total * 1.2)}`;
    const count = el('span', 'plan-count', est);
    count.title = plan!.confirmed ? t('plan.confirmed') : t('plan.estimated', { lo: Math.round(plan!.total * 0.8), hi: Math.round(plan!.total * 1.2) });
    this.planEl.append(count);
  }

  private updateArrows(sim: Sim, renderer: GameRenderer, w: number, h: number): void {
    const s = sim.state;
    const show = (s.phase === 'dusk' || s.phase === 'night') && s.plan;
    if (!show) {
      if (this.arrows.childElementCount) this.arrows.replaceChildren();
      return;
    }
    const plan = s.plan!;
    while (this.arrows.childElementCount < plan.dirs.length) this.arrows.appendChild(el('div', 'arrow'));
    while (this.arrows.childElementCount > plan.dirs.length) this.arrows.lastElementChild!.remove();
    const vec: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const angle: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };
    plan.dirs.forEach((d, i) => {
      const a = this.arrows.children[i] as HTMLElement;
      const [dx, dz] = vec[d];
      const p = renderer.project(s.castle.x + dx * 30, s.castle.z + dz * 30, w, h);
      const margin = 56;
      const x = Math.max(margin, Math.min(w - margin, p.x));
      // Keep clear of the bars at the bottom (their height is in --bb) and the floating bars above them.
      const bb = parseFloat(this.root.style.getPropertyValue('--bb')) || 110;
      const y = Math.max(margin + 40, Math.min(h - bb - 150, p.y));
      const threat = plan.threat?.[i] ?? 'mid';
      const many = threat === 'high';
      const label = `${t(`dir.${d}` as MessageKey)} · ${t(`threat.${threat}` as MessageKey)}`;
      a.style.transform = `translate(${x}px, ${y}px)`;
      a.innerHTML = '';
      const ic = el('div', 'arrow-icon', '➤');
      ic.style.transform = `rotate(${angle[d] - 90}deg)`;
      a.append(ic, el('div', 'arrow-label', label));
      a.classList.toggle('many', many);
    });
  }

  private renderRooms(sim: Sim): void {
    const s = sim.state;
    const n = slotCount(s);
    const syn = synergySlots(s);
    const sig = JSON.stringify([s.rooms.map((r) => (r ? r.type + r.queue.length : '')), n, s.castle.tier, Math.floor(s.res.wood), Math.floor(s.res.stone), Math.floor(s.res.food), Math.floor(s.res.gold), this.selectedSlot, popUsed(s), popCap(s), syn]);
    if (sig !== this.roomSig) {
      this.roomSig = sig;
      this.rooms.replaceChildren();
      this.roomProgress = [];
      const head = el('div', 'panel-head');
      head.append(el('div', 'panel-title', t('room.title', { tier: s.castle.tier })));
      const close = el('button', 'btn small', '✕');
      close.title = t('room.close');
      close.onclick = () => this.toggleRooms(false);
      head.append(close);
      this.rooms.append(head);
      const grid = el('div', 'room-grid');
      for (let i = 0; i < BALANCE.castle.maxSlots; i++) {
        const [col, row] = SLOT_POS[i];
        const cell = el('div', 'room-cell');
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = String(row + 1);
        const room = s.rooms[i];
        if (i >= n) {
          cell.classList.add('locked');
          cell.textContent = i < BALANCE.castle.slotsByTier[1] ? '🔒²' : '🔒';
          cell.title = i < BALANCE.castle.slotsByTier[1] ? t('room.locked') : t('card.extraSlot');
        } else if (!room) {
          cell.classList.add('empty');
          cell.textContent = '＋';
          cell.title = t('room.pick');
          if (this.selectedSlot === i) cell.classList.add('sel');
          cell.onclick = () => {
            this.selectedSlot = this.selectedSlot === i ? -1 : i;
          };
        } else {
          if (syn[i]) cell.classList.add('syn');
          cell.append(el('div', 'room-name', t(`room.${room.type}` as MessageKey)));
          const trains = BALANCE.rooms[room.type].trains;
          if (trains.length) {
            for (const type of trains) {
              const cost = unitCost(s, type);
              const b = el('button', 'btn tiny', `${UNIT_ICON[type]} ${costText(cost)}`);
              b.title = t('room.train', { unit: type });
              b.disabled = !canAfford(s, cost) || popUsed(s) >= popCap(s) || room.queue.length >= BALANCE.roomQueueMax;
              b.onclick = (ev) => {
                ev.stopPropagation();
                this.ctl.send({ t: 'queueUnit', slot: i, type });
              };
              cell.append(b);
            }
            const q = el('div', 'room-queue', room.queue.length ? t('room.queue', { n: room.queue.length }) : '');
            const prog = el('div', 'room-prog');
            const fill = el('div', 'room-prog-fill');
            prog.append(fill);
            this.roomProgress[i] = fill;
            cell.append(q, prog);
          }
          cell.title = t(`room.desc.${room.type}` as MessageKey);
          if (syn[i]) cell.append(el('div', 'syn-tag', `✦ ${t('room.synergy')}`));
        }
        grid.append(cell);
      }
      this.rooms.append(grid);
      if (this.selectedSlot >= 0) {
        const pick = el('div', 'room-pick');
        pick.append(el('div', 'panel-sub', t('room.pick')));
        for (const type of ROOM_TYPES) {
          const def = BALANCE.rooms[type];
          const b = el('button', 'btn pick');
          b.append(el('b', '', t(`room.${type}` as MessageKey)), el('span', 'cost', costText(def.cost)));
          b.title = t(`room.desc.${type}` as MessageKey);
          b.disabled = def.tier > s.castle.tier || !canAfford(s, def.cost);
          const slot = this.selectedSlot;
          b.onclick = () => {
            this.ctl.send({ t: 'placeRoom', slot, type: type as RoomType });
            this.selectedSlot = -1;
          };
          pick.append(b);
        }
        this.rooms.append(pick);
      }
      const foot = el('div', 'panel-foot');
      const synHelp = el('small', 'syn-help', `✦ ${t('room.synergy')}`);
      synHelp.title = t('room.synergy.help');
      foot.append(synHelp);
      if (s.castle.tier < 2) {
        const up = el('button', 'btn', `⬆ ${t('room.tier2')} ${costText(BALANCE.castle.tier2Cost)}`);
        up.disabled = !canAfford(s, BALANCE.castle.tier2Cost);
        up.onclick = () => this.ctl.send({ t: 'upgradeTier' });
        foot.append(up);
      } else foot.append(el('span', 'tag', t('room.tierMax')));
      this.rooms.append(foot);
    }
    for (let i = 0; i < n; i++) {
      const r = s.rooms[i];
      const fill = this.roomProgress[i];
      if (!r || !fill) continue;
      const type = r.queue[0];
      fill.style.width = type ? `${(r.progress / BALANCE.units[type].train) * 100}%` : '0%';
    }
  }

  private renderEco(sim: Sim): void {
    const s = sim.state;
    const resList: LaborRes[] = ['food', 'wood', 'stone'];
    const rows = resList.map((r) => {
      const crew = s.units.filter((u) => u.type === 'peasant' && !u.inside && (u.workRes === r || (u.order && u.carryRes === r)));
      // Congestion (GDD v1.2 §6.4): expected delivery from trip length vs what actually arrived.
      const trip = crew.map((u) => {
        const node = s.nodes.find((n) => n.id === u.targetId);
        return node ? Math.hypot(node.x - s.castle.x, node.z - s.castle.z) : 12;
      });
      const avg = trip.length ? trip.reduce((a, b) => a + b, 0) / trip.length : 12;
      const P = BALANCE.units.peasant;
      const expected = (crew.length * P.carry * 60) / (P.gatherTime + (2 * avg) / P.speed);
      const inc = incomePerMin(s, r);
      const jam = s.phase === 'day' && s.phaseTime > BALANCE.economy.incomeWindow && crew.length >= 2 && inc < expected * 0.4;
      return { r, p: s.labor[r], inc, workers: crew.length, left: Math.round(resourcePctOf(s, s.castle.x, r) * 100), jam };
    });
    const sig = JSON.stringify([rows, foodDawns(s), s.units.length]);
    if (sig === this.ecoSig) return;
    this.ecoSig = sig;
    this.eco.replaceChildren();
    const head = el('div', 'panel-head');
    head.append(el('div', 'panel-title', t('eco.title')));
    const close = el('button', 'btn small', '✕');
    close.onclick = () => this.toggleEco(false);
    head.append(close);
    this.eco.append(head);
    head.title = t('eco.help');
    for (const row of rows) {
      const line = el('div', 'eco-row');
      const name = el('div', 'eco-name');
      const sub = el('small', '', `📈${row.inc} · 👷${row.workers} · ⛏${row.left}%`);
      sub.title = `${t('eco.perMin', { n: row.inc })} · ${t('eco.workers', { n: row.workers })} · ${t('eco.left', { pct: row.left })}`;
      name.append(el('b', '', `${RES_ICON[row.r]} ${t(`res.${row.r}` as MessageKey)}`), sub);
      const prio = el('div', 'eco-prio');
      for (let p = 0; p <= 3; p++) {
        const b = el('button', 'btn tiny', t(`eco.p${p}` as MessageKey));
        b.classList.toggle('on', row.p === p);
        b.onclick = () => this.ctl.send({ t: 'setLabor', res: row.r, priority: p });
        prio.append(b);
      }
      line.append(name, prio);
      if (row.p > 0 && row.left === 0) line.append(el('div', 'warn small-warn', t('eco.none', { res: row.r })));
      else if (row.jam) line.append(el('div', 'warn small-warn', `⚠ ${t('eco.jam')}`));
      this.eco.append(line);
    }
    const need = s.units.length * BALANCE.foodPerUnit;
    const dawns = foodDawns(s);
    const foot = el('div', dawns < 2 ? 'warn' : 'panel-sub', `☀${dawns} · 🍖${need}/☀`);
    foot.title = t('eco.food', { n: dawns, need });
    this.eco.append(foot);
  }

  private renderBuild(sim: Sim): void {
    const s = sim.state;
    const hasWorkshop = s.rooms.slice(0, slotCount(s)).some((r) => r?.type === 'workshop');
    const sig = JSON.stringify([hasWorkshop, s.castle.moving, Math.floor(s.res.wood), Math.floor(s.res.stone), this.ctl.mode]);
    if (sig === this.buildSig) return;
    this.buildSig = sig;
    this.build.replaceChildren();
    const head = el('div', 'panel-head');
    head.append(el('div', 'panel-title', t('build.title')));
    const close = el('button', 'btn small', '✕');
    close.onclick = () => {
      this.toggleBuild(false);
      this.ctl.setMode({ kind: 'none' });
    };
    head.append(close);
    this.build.append(head);
    if (!hasWorkshop || s.castle.moving) {
      this.build.append(el('div', 'panel-sub', t(s.castle.moving ? 'build.moving' : 'build.needWorkshop')));
      return;
    }
    const list = el('div', 'build-list');
    for (const type of STRUCT_TYPES) {
      const cost = structCost(s, type);
      const b = el('button', 'btn pick');
      b.append(el('b', '', t(`struct.${type}` as MessageKey)), el('span', 'cost', costText(cost)));
      b.title = t(`struct.desc.${type}` as MessageKey);
      b.disabled = !canAfford(s, cost);
      b.classList.toggle('on', this.ctl.mode.kind === 'build' && this.ctl.mode.type === type);
      b.onclick = () => this.ctl.setMode(this.ctl.mode.kind === 'build' && this.ctl.mode.type === type ? { kind: 'none' } : { kind: 'build', type });
      list.append(b);
    }
    const dis = el('button', 'btn pick');
    dis.append(el('b', '', `⛏ ${t('struct.dismantle')}`));
    dis.title = t('hud.dismantleMode');
    dis.classList.toggle('on', this.ctl.mode.kind === 'dismantle');
    dis.onclick = () => this.ctl.setMode(this.ctl.mode.kind === 'dismantle' ? { kind: 'none' } : { kind: 'dismantle' });
    list.append(dis);
    this.build.append(list);
  }

  private renderDawn(sim: Sim): void {
    const s = sim.state;
    if (s.phase !== 'dawn') {
      if (!this.dawn.classList.contains('hidden')) this.dawn.classList.add('hidden');
      this.dawnSig = '';
      return;
    }
    const sig = `${s.night}:${s.cardPicked}:${s.routePicked}:${s.doctrineOffer}`;
    if (sig === this.dawnSig) return;
    this.dawnSig = sig;
    this.closePanels();
    this.dawn.classList.remove('hidden');
    this.dawn.replaceChildren();
    this.dawnShownAt = performance.now();
    // Ignore a tap that lands right after the screen changed (it was meant for the previous step).
    const fresh = () => performance.now() - this.dawnShownAt < 350;
    const box = el('div', 'modal-box');
    const st = s.nightStats;
    box.append(el('h2', '', t('dawn.title', { n: s.stats.nightsSurvived })));
    const sum = el('div', 'summary');
    const stat = (icon: string, n: number, tip: string) => {
      const e = el('span', '', `${icon} ${n}`);
      e.title = tip;
      return e;
    };
    sum.append(
      stat('⚔', st.kills, t('dawn.kills', { n: st.kills })),
      stat('✝', st.lost, t('dawn.lost', { n: st.lost })),
      stat('🪙', st.gold, t('dawn.gold', { n: st.gold })),
      stat('🍖', st.food, t('dawn.food', { n: st.food })),
    );
    box.append(sum);
    if (st.hungry) box.append(el('div', 'warn', t('dawn.hungry')));
    box.append(this.recap(s));
    if (s.doctrineOffer) {
      box.append(el('h3', '', t('dawn.pickDoctrine')));
      const row = el('div', 'cards');
      for (const d of ['fortress', 'caravan'] as const) {
        const b = el('button', 'card');
        b.append(el('b', '', t(`doctrine.${d}` as MessageKey)), el('div', 'good', t(`doctrine.gain.${d}` as MessageKey)), el('small', 'bad', t(`doctrine.cost.${d}` as MessageKey)));
        b.onclick = () => !fresh() && this.ctl.send({ t: 'pickDoctrine', doctrine: d });
        row.append(b);
      }
      box.append(row);
    } else if (!s.cardPicked) {
      box.append(el('h3', '', t('dawn.pickCard')));
      const row = el('div', 'cards');
      for (const id of s.cards) {
        const b = el('button', 'card');
        b.append(el('b', '', t(`card.${id}` as MessageKey)), el('small', '', t(`card.desc.${id}` as MessageKey)));
        b.onclick = () => !fresh() && this.ctl.send({ t: 'pickCard', id });
        row.append(b);
      }
      box.append(row);
    } else {
      box.append(el('h3', '', t('dawn.pickRoute')));
      const row = el('div', 'cards routes');
      for (const r of s.routes) {
        const b = el('button', `card route ${r.id === 0 ? 'stay' : 'go'}`);
        b.title = t(`terrain.desc.${r.terrain}` as MessageKey);
        b.append(el('b', '', r.id === 0 ? `🏰 ${t('dawn.stay')}` : `➡ ${t(r.id === 1 ? 'dawn.ahead' : 'dawn.aheadMany', { n: r.id })}`));
        b.append(el('div', 'terrain', `${TERRAIN_ICON[r.terrain]} ${t(`terrain.${r.terrain}` as MessageKey)} · ${RES_ICON[r.mainRes]}`));
        const chips = el('div', 'route-chips');
        const chip = (txt: string, tip: string, cls = '') => {
          const c = el('span', `chip ${cls}`, txt);
          c.title = tip;
          chips.append(c);
        };
        chip(`⛏ ${r.id === 0 ? Math.round(r.resourcePct * 100) + '%' : '100%'}`, r.id === 0 ? t('dawn.resLeft', { pct: Math.round(r.resourcePct * 100) }) : t('dawn.resFull'), r.exhausted ? 'bad' : '');
        chip(`⚔ ${r.dirs}`, t('dawn.dirs', { n: r.dirs }), r.id === 0 ? 'bad' : '');
        chip('●'.repeat(r.danger) + '○'.repeat(5 - r.danger), t('dawn.danger'), 'danger');
        const built = s.structs.length;
        if (r.id === 0) chip(`🏗 ${built}`, t('dawn.keep'), 'good');
        else {
          const over = loadLevel(s) === 'overloaded';
          chip(over ? '⚖ ✕' : `⏱ ${r.travel}s`, over ? t('dawn.overloaded') : t('dawn.travel', { s: r.travel }), over ? 'bad' : '');
          if (built) chip(`🏗 −${built} ↩${Math.round(refundShare(s) * 100)}%`, t('dawn.leave'), 'bad');
        }
        chip(`☀${Math.min(9, foodDawns(s))}`, t('eco.food', { n: foodDawns(s), need: foodNeed(s) }), foodDawns(s) < 2 ? 'bad' : '');
        b.append(chips);
        if (r.exhausted) b.append(el('div', 'bad small', `⚠ ${t('dawn.exhausted')}`));
        b.onclick = () => !fresh() && this.ctl.send({ t: 'pickRoute', id: r.id });
        row.append(b);
      }
      box.append(row);
    }
    box.append(el('div', 'saved', '💾'));
    this.dawn.append(box);
  }

  /** Three-line recap built from what really happened (GDD v1.2 §17.5). */
  private recap(s: Sim['state']): HTMLElement {
    const st = s.nightStats;
    const c = s.castle;
    const box = el('div', 'recap');
    const lostList = Object.entries(st.lostByType)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => `${n} ${t(`unit.one.${type}` as MessageKey)}`)
      .join(', ');
    box.append(el('div', '', `${t('recap.losses')}: ${t('recap.lossLine', { units: lostList || t('recap.noneLost'), structs: st.structLost, wall: Math.round(st.wallDamage), core: Math.round(st.coreDamage) })}`));
    let cause = t('recap.noBreak');
    if (st.cause.startsWith('breach:')) cause = t('recap.breach', { dir: t(`dir.${st.cause.slice(7)}` as MessageKey) });
    else if (st.cause === 'fire') cause = t('recap.fire');
    else if (st.cause === 'workersCaught') cause = t('recap.workers');
    else if (st.coreDamage > 0) cause = t('recap.core');
    box.append(el('div', '', `${t('recap.break')}: ${cause}`));
    const todo: string[] = [];
    const need = s.units.length * BALANCE.foodPerUnit;
    if (s.res.food < need) todo.push(t('recap.food', { n: need - Math.floor(s.res.food) }));
    const woodForWall = Math.ceil((c.wallMax - c.wallHp) * BALANCE.repairWoodPerHp);
    if (woodForWall > s.res.wood) todo.push(t('recap.wood', { n: woodForWall - Math.floor(s.res.wood) }));
    if (c.wheelHp <= 0) todo.push(t('recap.wheel'));
    if (s.routes[0]?.exhausted) todo.push(t('recap.dry'));
    box.append(el('div', todo.length ? 'bad' : 'good', `${t('recap.next')}: ${todo.length ? todo.join(' · ') : t('recap.ok')}`));
    return box;
  }

  private renderOver(sim: Sim): void {
    const s = sim.state;
    if (s.phase !== 'gameover' && s.phase !== 'victory') {
      this.overShown = false;
      this.over.classList.add('hidden');
      return;
    }
    if (this.overShown) return;
    this.overShown = true;
    this.closePanels();
    this.over.classList.remove('hidden');
    this.over.replaceChildren();
    const box = el('div', 'modal-box');
    const won = s.phase === 'victory';
    box.append(el('h2', won ? 'good' : '', t(won ? 'over.victory' : 'over.title')));
    if (won) box.append(el('div', '', t('over.victoryText', { n: s.stats.nightsSurvived })));
    const row = el('div', 'summary');
    const stat = (icon: string, n: number, tip: string) => {
      const e = el('span', '', `${icon} ${n}`);
      e.title = tip;
      return e;
    };
    row.append(
      stat('🌙', s.stats.nightsSurvived, t('over.nights', { n: s.stats.nightsSurvived })),
      stat('⚔', s.stats.kills, t('over.kills', { n: s.stats.kills })),
      stat('💀', s.stats.bosses, t('over.bosses', { n: s.stats.bosses })),
    );
    box.append(row, el('div', 'big-stat', t('over.score', { n: score(s) })));
    if (this.ctl.gameOverInfo?.best) box.append(el('div', 'good', `🏆 ${t('over.best')}`));
    const btns = el('div', 'btn-row');
    const again = el('button', 'btn big', t('over.again'));
    again.onclick = () => this.ctl.restart();
    const menu = el('button', 'btn', t('over.menu'));
    menu.onclick = () => this.ctl.toMenu();
    // Local run log (GDD v1.2 §16.1): nothing is uploaded; the player saves the file if they want to share it.
    const log = el('button', 'btn', '📥');
    log.title = t('over.log');
    log.onclick = () => {
      const data = { seed: s.seed, mode: s.mode, doctrine: s.doctrine, stats: s.stats, score: score(s), hash: sim.hash(), history: s.history, saveVersion: s.version };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `thanhtri-${s.seed}-n${s.stats.nightsSurvived}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    btns.append(again, menu, log);
    box.append(btns);
    this.over.append(box);
  }

  destroy(): void {
    this.root.remove();
  }
}
