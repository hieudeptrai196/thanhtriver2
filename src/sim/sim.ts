import {
  BALANCE,
  CARD_IDS,
  SOLDIER_TYPES,
  UNIT_TYPES,
  type AbilityId,
  type CardId,
  type Cost,
  type DamageType,
  type Dir,
  type MonsterType,
  type Res,
  type RoomType,
  type StructType,
  type UnitType,
} from '../data/balance';
import {
  allowedDirs,
  awarenessMult,
  dayLength,
  duskLength,
  dirCount,
  isBossNight,
  monsterCount,
  monsterHpMult,
  nightLength,
  waveCount,
} from './difficulty';
import { CASTLE, CLIFF, NavGrid, STRUCT } from './grid';
import { nextRandom, pickIndex, range, shuffle } from './rng';
import type {
  Command,
  Drop,
  LaborRes,
  GameEvent,
  GameState,
  Monster,
  Order,
  ResourceNode,
  RouteOption,
  Structure,
  Unit,
  Vec,
} from './types';
import { chunkCenter, chunkOf, chunkTerrain, danger, ensureChunks, mainResource } from './world';

export const DT = 1 / BALANCE.tickRate;
export const SAVE_VERSION = 1;

const C = BALANCE.castle;
const U = BALANCE.units;

// Slot positions of the room grid (4 columns). The first N are open.
export const SLOT_POS: [number, number][] = [
  [0, 0], [1, 0], [0, 1], [1, 1],
  [2, 0], [3, 0], [2, 1], [3, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
];

// Builder targets that are not structures.
const T_WALL = -2;
const T_WHEEL = -3;
const T_FIRE = -4;

interface Light {
  x: number;
  z: number;
  r: number;
}

export function createState(seed: number): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rng: seed >>> 0,
    tick: 0,
    nextId: 1,
    phase: 'day',
    phaseTime: 0,
    phaseLength: dayLength(1),
    night: 1,
    res: { ...C.startRes },
    castle: {
      x: 0,
      z: 0,
      chunk: 0,
      anchorX: 0,
      coreHp: C.coreHp,
      coreMax: C.coreHp,
      wallHp: C.wallHp,
      wallMax: C.wallHp,
      wheelHp: C.wheelHp,
      wheelMax: C.wheelHp,
      tier: 1,
      moving: false,
      destX: 0,
      destChunk: 0,
      fire: 0,
      lastNightX: 0,
      nightsHere: 0,
    },
    rooms: Array.from({ length: C.maxSlots }, () => null),
    units: [],
    monsters: [],
    nodes: [],
    structs: [],
    genChunk: -2,
    selected: -1,
    selectedIds: [],
    groupOrders: { peasant: null, builder: null, spear: null, shield: null, archer: null },
    cooldowns: { arrowRain: 0, bell: 0 },
    mods: {
      soldierHp: 0,
      towerRate: 0,
      moveSpeed: 1,
      carry: 0,
      torchRadius: 0,
      wallHp: 0,
      repairSpeed: 1,
      extraSlots: 0,
      archerDmg: 0,
    },
    cards: [],
    cardPicked: false,
    routes: [],
    routePicked: false,
    plan: null,
    overflowHp: 0,
    wanderTimer: 0,
    stats: { kills: 0, bosses: 0, nightsSurvived: 0 },
    nightStats: emptyNightStats(),
    strangerDone: true,
    hunger: 0,
    history: [],
    labor: { ...BALANCE.economy.laborDefault },
    drops: [],
    deliveries: [],
    repairDebt: 0,
    formation: 'line',
    fireDone: false,
    newRegion: false,
  };
  ensureChunks(s);
  BALANCE.startRooms.forEach((type, i) => (s.rooms[i] = { type, queue: [], progress: 0 }));
  for (const type of UNIT_TYPES) {
    for (let i = 0; i < BALANCE.startUnits[type]; i++) addUnit(s, type, { x: range(s, -5, 5), z: i % 2 ? 4.5 : -4.5 });
  }
  return s;
}

function addUnit(s: GameState, type: UnitType, pos: Vec): Unit {
  const maxHp = unitMaxHp(s, type);
  const u: Unit = {
    id: s.nextId++,
    type,
    x: pos.x,
    z: pos.z,
    hp: maxHp,
    maxHp,
    job: 'idle',
    order: null,
    targetId: -1,
    carry: 0,
    carryRes: null,
    work: 0,
    cooldown: 0,
    inside: false,
    slot: s.units.length,
    workRes: null,
    squad: BALANCE.squads.defaultOf[type] ?? 0,
  };
  s.units.push(u);
  return u;
}

// ---------------------------------------------------------------- derived values

export function slotCount(s: GameState): number {
  return Math.min(C.maxSlots, C.slotsByTier[s.castle.tier - 1] + s.mods.extraSlots);
}

export function popCap(s: GameState): number {
  let cap = C.basePop;
  for (const r of s.rooms) if (r) cap += BALANCE.rooms[r.type].pop;
  return cap;
}

export function popUsed(s: GameState): number {
  let n = s.units.length;
  for (const r of s.rooms) if (r) n += r.queue.length;
  return n;
}

function adjacent(a: number, b: number): boolean {
  const [ax, az] = SLOT_POS[a];
  const [bx, bz] = SLOT_POS[b];
  return Math.abs(ax - bx) + Math.abs(az - bz) === 1;
}

export function hasSynergy(s: GameState, a: RoomType, b: RoomType): boolean {
  const n = slotCount(s);
  for (let i = 0; i < n; i++) {
    if (s.rooms[i]?.type !== a) continue;
    for (let j = 0; j < n; j++) if (s.rooms[j]?.type === b && adjacent(i, j)) return true;
  }
  return false;
}

export function synergySlots(s: GameState): boolean[] {
  const n = slotCount(s);
  const out = new Array<boolean>(C.maxSlots).fill(false);
  const pairs: [RoomType, RoomType][] = [
    ['barracks', 'workshop'],
    ['watchtower', 'range'],
  ];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = s.rooms[i]?.type;
      const b = s.rooms[j]?.type;
      if (!a || !b || !adjacent(i, j)) continue;
      if (pairs.some(([p, q]) => (a === p && b === q) || (a === q && b === p))) out[i] = out[j] = true;
    }
  }
  return out;
}

export function unitMaxHp(s: GameState, type: UnitType): number {
  let mult = 1;
  if (SOLDIER_TYPES.includes(type)) mult += s.mods.soldierHp;
  if (type === 'spear' && hasSynergy(s, 'barracks', 'workshop')) mult += BALANCE.synergy.barracksWorkshopSpearHp;
  return Math.round(U[type].hp * mult);
}

export function archerRange(s: GameState, u: Unit): number {
  let r = U.archer.range;
  if (hasSynergy(s, 'watchtower', 'range')) r *= 1 + BALANCE.synergy.watchtowerRangeArcherRange;
  if (Math.hypot(u.x - s.castle.x, u.z - s.castle.z) < C.stationRadius + 0.8) r += C.stationRangeBonus;
  return r;
}

function countRooms(s: GameState, type: RoomType): number {
  let n = 0;
  for (let i = 0; i < slotCount(s); i++) if (s.rooms[i]?.type === type) n++;
  return n;
}

export function castleLightRadius(s: GameState): number {
  return C.lightRadius + countRooms(s, 'watchtower') * C.watchtowerLight;
}

export function structLight(s: GameState, st: Structure): number {
  const base = BALANCE.structs[st.type].light;
  return st.type === 'torch' ? base * (1 + s.mods.torchRadius) : base;
}

export function lights(s: GameState): Light[] {
  const out: Light[] = [{ x: s.castle.x, z: s.castle.z, r: castleLightRadius(s) }];
  for (const st of s.structs) {
    const r = structLight(s, st);
    if (r > 0 && st.built >= 1) out.push({ x: st.cx + 0.5, z: st.cz + 0.5, r });
  }
  return out;
}

export function isDark(s: GameState): boolean {
  return s.phase === 'night';
}

export function isLit(s: GameState, ls: Light[], x: number, z: number): boolean {
  if (!isDark(s)) return true;
  for (const l of ls) if ((x - l.x) ** 2 + (z - l.z) ** 2 <= l.r * l.r) return true;
  return false;
}

export function canAfford(s: GameState, cost: Cost): boolean {
  return (Object.keys(cost) as Res[]).every((k) => s.res[k] >= (cost[k] ?? 0));
}

function pay(s: GameState, cost: Cost): void {
  for (const k of Object.keys(cost) as Res[]) s.res[k] -= cost[k] ?? 0;
}

function refund(s: GameState, cost: Cost, share: number): void {
  for (const k of Object.keys(cost) as Res[]) s.res[k] += Math.floor((cost[k] ?? 0) * share);
}

export function score(s: GameState): number {
  const sc = BALANCE.score;
  return s.stats.nightsSurvived * sc.perNight + s.stats.kills * sc.perKill + s.stats.bosses * sc.perBoss;
}

/** Distance from a point to the castle's square footprint. */
export function distToCastle(s: GameState, x: number, z: number): number {
  const h = C.halfSize;
  const dx = Math.max(0, Math.abs(x - s.castle.x) - h);
  const dz = Math.max(0, Math.abs(z - s.castle.z) - h);
  return Math.hypot(dx, dz);
}

/** Share of one resource left around x. */
export function resourcePctOf(s: GameState, x: number, res: Res, radius = 30): number {
  let amount = 0;
  let max = 0;
  for (const n of s.nodes) {
    if (Math.abs(n.x - x) > radius || BALANCE.world.nodeRes[n.type] !== res) continue;
    amount += n.amount;
    max += n.max;
  }
  return max > 0 ? amount / max : 0;
}

export function resourcePct(s: GameState, x: number, radius = 30): number {
  let amount = 0;
  let max = 0;
  for (const n of s.nodes) {
    if (Math.abs(n.x - x) > radius) continue;
    amount += n.amount;
    max += n.max;
  }
  return max > 0 ? amount / max : 0;
}

export function stayedHere(s: GameState): boolean {
  return s.night > 1 && Math.abs(s.castle.x - s.castle.lastNightX) < BALANCE.difficulty.campRadius;
}

export function emptyNightStats(): GameState['nightStats'] {
  return { kills: 0, lost: 0, gold: 0, food: 0, hungry: false, structLost: 0, wallDamage: 0, coreDamage: 0, cause: '', lostByType: {} };
}

/** Speed and damage multiplier from hunger. */
export function hungerMult(s: GameState): number {
  return s.hunger <= 0 ? 1 : s.hunger === 1 ? BALANCE.hunger.weak : BALANCE.hunger.starving;
}

/** How many more dawns the current food feeds everyone. */
export function foodDawns(s: GameState): number {
  const need = s.units.length * BALANCE.foodPerUnit;
  return need > 0 ? Math.floor(s.res.food / need) : 99;
}

/** FNV-1a hash of the whole state, for replay and save checks. */
export function stateHash(s: GameState): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------- simulation

export class Sim {
  state: GameState;
  grid = new NavGrid();
  private events: GameEvent[] = [];
  private lightCache: Light[] = [];
  private engaged = new Map<number, number>(); // melee monsters on each unit this tick
  private warned = { wall: false, core: false, wallBroken: false };

  constructor(state: GameState) {
    // Fields added after the first release.
    state.selectedIds ??= [];
    state.hunger ??= 0;
    state.history ??= [];
    state.labor ??= { ...BALANCE.economy.laborDefault };
    state.drops ??= [];
    state.deliveries ??= [];
    state.repairDebt ??= 0;
    state.formation ??= 'line';
    state.groupOrders.shield ??= null;
    for (const u of state.units) u.squad ??= BALANCE.squads.defaultOf[u.type] ?? 0;
    state.nightStats = { ...emptyNightStats(), ...state.nightStats };
    this.state = state;
    this.grid.rebuild(state);
  }

  static create(seed: number): Sim {
    return new Sim(createState(seed));
  }

  static load(json: string): Sim {
    return new Sim(JSON.parse(json) as GameState);
  }

  save(): string {
    return JSON.stringify(this.state);
  }

  hash(): string {
    return stateHash(this.state);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(key: string, extra: Omit<GameEvent, 'key'> = {}): void {
    this.events.push({ key, ...extra });
  }

  // ------------------------------------------------------------ commands

  apply(cmds: Command[]): void {
    for (const c of cmds) this.applyOne(c);
  }

  private applyOne(c: Command): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    switch (c.t) {
      case 'selectGroup':
        s.selected = c.group >= 0 && c.group < UNIT_TYPES.length ? c.group : -1;
        s.selectedIds = [];
        break;
      case 'selectUnits': {
        const alive = new Set(s.units.filter((u) => !u.inside).map((u) => u.id));
        s.selectedIds = c.ids.filter((id) => alive.has(id));
        if (s.selectedIds.length) s.selected = -1;
        break;
      }
      case 'releaseUnits':
        this.releaseUnits();
        break;
      case 'setLabor':
        s.labor[c.res] = Math.max(0, Math.min(3, Math.round(c.priority)));
        for (const u of s.units) if (u.type === 'peasant' && !u.order) u.workRes = null;
        break;
      case 'order':
        this.order(c.pos, c.targetId, c.mode);
        break;
      case 'orderAll':
        for (const type of UNIT_TYPES) this.setGroupOrder(type, type === 'peasant' ? { kind: 'home', pos: { x: s.castle.x, z: s.castle.z } } : null);
        this.emit('msg.allHome');
        break;
      case 'build':
        this.build(c.type, c.pos);
        break;
      case 'dismantle':
        this.markDismantle(c.pos);
        break;
      case 'placeRoom':
        this.placeRoom(c.slot, c.type);
        break;
      case 'queueUnit':
        this.queueUnit(c.slot, c.type);
        break;
      case 'assignSquad':
        for (const u of s.units) if (c.ids.includes(u.id)) u.squad = Math.max(0, Math.min(BALANCE.squads.count, c.squad));
        this.emit('msg.squadAssigned', { params: { n: c.squad } });
        break;
      case 'selectSquad': {
        const ids = s.units.filter((u) => u.squad === c.squad && !u.inside).map((u) => u.id);
        s.selectedIds = ids;
        if (ids.length) s.selected = -1;
        break;
      }
      case 'setFormation':
        s.formation = c.formation;
        break;
      case 'upgradeTier':
        this.upgradeTier();
        break;
      case 'toggleMove':
        this.toggleMove();
        break;
      case 'ability':
        this.ability(c.id, c.pos);
        break;
      case 'pickCard':
        this.pickCard(c.id);
        break;
      case 'pickRoute':
        this.pickRoute(c.id);
        break;
    }
  }

  private setGroupOrder(type: UnitType, order: Order | null): void {
    const s = this.state;
    s.groupOrders[type] = order;
    for (const u of s.units) {
      if (u.type !== type) continue;
      u.order = order ? { ...order, pos: { ...order.pos } } : null;
      u.targetId = -1;
      u.work = 0;
      if (type === 'peasant' && order?.kind !== 'home' && u.inside && s.phase === 'day') this.exitCastle(u);
    }
  }

  /** What an order at `pos` means for one unit type (shared by group and hand-picked orders). */
  private orderFor(type: UnitType, pos: Vec, targetId?: number): Order | null {
    const s = this.state;
    const onCastle = distToCastle(s, pos.x, pos.z) < 0.5;
    const p = { x: pos.x, z: pos.z };
    if (type === 'peasant') return onCastle ? { kind: 'home', pos: p } : { kind: 'gather', pos: p };
    if (type === 'builder') {
      const st = targetId !== undefined ? s.structs.find((x) => x.id === targetId) : this.structAt(pos);
      return onCastle ? { kind: 'repair', pos: p, targetId: T_WALL } : st ? { kind: 'repair', pos: p, targetId: st.id } : { kind: 'move', pos: p };
    }
    return onCastle ? null : { kind: 'move', pos: p };
  }

  private order(pos: Vec, targetId?: number, mode?: 'move' | 'hold' | 'guard' | 'focus' | 'retreat'): void {
    const s = this.state;
    const p = { x: pos.x, z: pos.z };
    const picked = s.selectedIds.length
      ? s.units.filter((u) => s.selectedIds.includes(u.id))
      : s.selected >= 0
        ? null
        : [];
    if (picked === null) {
      // Whole group by type (the default orders new units of that type inherit too).
      const type = UNIT_TYPES[s.selected];
      this.setGroupOrder(type, mode && mode !== 'move' ? this.tacticalOrder(type, mode, p, targetId) : this.orderFor(type, pos, targetId));
      this.emit('fx.order', { pos: p });
      return;
    }
    if (picked.length === 0) return;
    const onCastle = distToCastle(s, pos.x, pos.z) < 0.5;
    const spots = this.formationSpots(picked, p, onCastle || mode === 'guard' || mode === 'focus' || mode === 'retreat');
    picked.forEach((u, i) => {
      const spot = spots[i];
      u.order = mode && mode !== 'move' ? this.tacticalOrder(u.type, mode, spot, targetId) : this.orderFor(u.type, onCastle ? p : spot, targetId);
      u.targetId = -1;
      u.work = 0;
      if (u.type === 'peasant' && u.order?.kind !== 'home' && u.inside && s.phase === 'day') this.exitCastle(u);
    });
    this.emit('fx.order', { pos: p });
  }

  /** Hold / guard / focus / retreat for soldiers; workers read retreat as "go inside" and ignore the rest. */
  private tacticalOrder(type: UnitType, mode: 'hold' | 'guard' | 'focus' | 'retreat', pos: Vec, targetId?: number): Order | null {
    const s = this.state;
    const soldier = SOLDIER_TYPES.includes(type);
    if (mode === 'retreat') return type === 'peasant' ? { kind: 'home', pos: { x: s.castle.x, z: s.castle.z } } : { kind: 'retreat', pos: { x: s.castle.x, z: s.castle.z } };
    if (!soldier) return this.orderFor(type, pos, targetId);
    if (mode === 'hold') return { kind: 'hold', pos };
    if (mode === 'focus') return targetId !== undefined ? { kind: 'focus', pos, targetId } : { kind: 'move', pos };
    return { kind: 'guard', pos, targetId: targetId ?? T_WALL };
  }

  /**
   * Where each picked unit should stand (GDD v1.2 §8.3). Line: shields and spears in a front row facing away
   * from the castle, archers in a row behind. Ring: melee on a circle, archers inside. Workers spiral.
   */
  private formationSpots(units: Unit[], at: Vec, cluster: boolean): Vec[] {
    const s = this.state;
    const out: Vec[] = new Array(units.length);
    if (cluster) {
      units.forEach((_, i) => (out[i] = { x: at.x, z: at.z }));
      return out;
    }
    const F = BALANCE.formation;
    const melee = units.map((u, i) => [u, i] as const).filter(([u]) => u.type === 'shield' || u.type === 'spear');
    melee.sort(([a], [b]) => (a.type === b.type ? 0 : a.type === 'shield' ? -1 : 1));
    const ranged = units.map((u, i) => [u, i] as const).filter(([u]) => u.type === 'archer');
    const others = units.map((u, i) => [u, i] as const).filter(([u]) => !SOLDIER_TYPES.includes(u.type));
    let fx = at.x - s.castle.x;
    let fz = at.z - s.castle.z;
    const len = Math.hypot(fx, fz);
    if (len < 0.5) {
      fx = 1;
      fz = 0;
    } else {
      fx /= len;
      fz /= len;
    }
    const px = -fz;
    const pz = fx;
    const row = (list: (readonly [Unit, number])[], back: number) =>
      list.forEach(([, i], k) => {
        const off = (k - (list.length - 1) / 2) * F.spacing;
        out[i] = { x: at.x + px * off - fx * back, z: at.z + pz * off - fz * back };
      });
    const ring = (list: (readonly [Unit, number])[], r: number) =>
      list.forEach(([, i], k) => {
        const a = (k / Math.max(1, list.length)) * Math.PI * 2;
        out[i] = { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r };
      });
    if (s.formation === 'ring') {
      const r = Math.max(1.8, (melee.length * F.spacing) / (Math.PI * 2));
      ring(melee, r);
      ring(ranged, melee.length ? r * 0.45 : Math.max(1.4, (ranged.length * F.spacing) / (Math.PI * 2)));
    } else {
      row(melee, 0);
      row(ranged, melee.length ? F.rowGap : 0);
    }
    others.forEach(([, i], k) => {
      const r = k === 0 ? 0 : 0.95 * Math.sqrt(k);
      const a = k * 2.39996;
      out[i] = { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r + (melee.length + ranged.length ? 2 : 0) };
    });
    return out;
  }

  /** Hand-picked units drop their own orders and go back to their group's default work. */
  private releaseUnits(): void {
    const s = this.state;
    for (const u of s.units) {
      if (!s.selectedIds.includes(u.id)) continue;
      const g = s.groupOrders[u.type];
      u.order = g ? { ...g, pos: { ...g.pos } } : null;
      u.targetId = -1;
      u.work = 0;
    }
    s.selectedIds = [];
    this.emit('msg.released');
  }

  private structAt(pos: Vec): Structure | undefined {
    const cx = Math.floor(pos.x);
    const cz = Math.floor(pos.z);
    return this.state.structs.find((st) => st.cx === cx && st.cz === cz);
  }

  canBuildAt(type: StructType, pos: Vec): boolean {
    const s = this.state;
    if (s.castle.moving || countRooms(s, 'workshop') === 0) return false;
    const cx = Math.floor(pos.x);
    const cz = Math.floor(pos.z);
    const k = this.grid.index(cx, cz);
    if (k < 0 || this.grid.cells[k] !== 0) return false;
    if (distToCastle(s, cx + 0.5, cz + 0.5) < 1) return false;
    if (s.structs.some((st) => st.cx === cx && st.cz === cz)) return false;
    if (BALANCE.structs[type].blocks && s.units.some((u) => !u.inside && Math.floor(u.x) === cx && Math.floor(u.z) === cz)) return false;
    return true;
  }

  private build(type: StructType, pos: Vec): void {
    const s = this.state;
    const def = BALANCE.structs[type];
    if (s.castle.moving) return this.emit('msg.cantBuildMoving', { level: 'warn' });
    if (countRooms(s, 'workshop') === 0) return this.emit('msg.needWorkshop', { level: 'warn' });
    if (!this.canBuildAt(type, pos)) return this.emit('msg.cantBuildHere', { level: 'warn' });
    if (!canAfford(s, def.cost)) return this.emit('msg.notEnough', { level: 'warn' });
    pay(s, def.cost);
    const maxHp = Math.round(def.hp * (1 + s.mods.wallHp));
    const st: Structure = {
      id: s.nextId++,
      type,
      cx: Math.floor(pos.x),
      cz: Math.floor(pos.z),
      hp: maxHp * 0.1,
      maxHp,
      built: 0,
      dismantle: false,
      cooldown: 0,
    };
    s.structs.push(st);
    if (def.blocks) this.grid.setStruct(st.cx, st.cz, st.id);
    this.emit('fx.place', { pos: { x: st.cx + 0.5, z: st.cz + 0.5 } });
  }

  private markDismantle(pos: Vec): void {
    const st = this.structAt(pos);
    if (!st) return;
    st.dismantle = !st.dismantle;
    this.emit(st.dismantle ? 'msg.dismantleMarked' : 'msg.dismantleCancelled');
  }

  private placeRoom(slot: number, type: RoomType): void {
    const s = this.state;
    const def = BALANCE.rooms[type];
    if (slot < 0 || slot >= slotCount(s) || s.rooms[slot]) return;
    if (def.tier > s.castle.tier) return this.emit('msg.needTier2', { level: 'warn' });
    if (!canAfford(s, def.cost)) return this.emit('msg.notEnough', { level: 'warn' });
    pay(s, def.cost);
    s.rooms[slot] = { type, queue: [], progress: 0 };
    this.refreshUnitStats();
    this.emit('msg.roomBuilt', { params: { room: type } });
  }

  private queueUnit(slot: number, wanted?: UnitType): void {
    const s = this.state;
    const room = s.rooms[slot];
    if (!room || slot >= slotCount(s)) return;
    const trains = BALANCE.rooms[room.type].trains;
    const type = wanted && trains.includes(wanted) ? wanted : trains[0];
    if (!type) return;
    if (room.queue.length >= BALANCE.roomQueueMax) return this.emit('msg.queueFull', { level: 'warn' });
    if (popUsed(s) >= popCap(s)) return this.emit('msg.popFull', { level: 'warn' });
    if (!canAfford(s, U[type].cost)) return this.emit('msg.notEnough', { level: 'warn' });
    pay(s, U[type].cost);
    room.queue.push(type);
  }

  private upgradeTier(): void {
    const s = this.state;
    if (s.castle.tier >= 2) return;
    if (!canAfford(s, C.tier2Cost)) return this.emit('msg.notEnough', { level: 'warn' });
    pay(s, C.tier2Cost);
    s.castle.tier = 2;
    this.emit('msg.tierUp', { level: 'info' });
  }

  private toggleMove(): void {
    const s = this.state;
    const c = s.castle;
    if (c.moving) {
      this.stopCastle();
      return;
    }
    if (s.phase !== 'day') return this.emit('msg.cantMoveNight', { level: 'warn' });
    if (c.wheelHp <= 0) return this.emit('msg.wheelBroken', { level: 'warn' });
    if (Math.abs(c.destX - c.x) < 0.5) return this.emit('msg.noDestination', { level: 'warn' });
    const left = s.structs.length;
    s.structs = [];
    c.moving = true;
    this.grid.rebuild(s);
    for (const u of s.units) {
      u.targetId = -1;
      u.work = 0;
    }
    this.emit('msg.castleMoving');
    if (left > 0) this.emit('msg.abandoned', { params: { n: left }, level: 'warn' });
  }

  private stopCastle(): void {
    const s = this.state;
    const c = s.castle;
    c.moving = false;
    c.anchorX = c.x;
    c.chunk = chunkOf(c.x);
    // Units standing in the new footprint step out.
    for (const u of s.units) {
      if (u.inside || distToCastle(s, u.x, u.z) > 0) continue;
      const a = (u.slot * 2.39996) % (Math.PI * 2);
      u.x = c.x + Math.cos(a) * (C.halfSize + 1);
      u.z = c.z + Math.sin(a) * (C.halfSize + 1);
    }
    ensureChunks(s);
    this.grid.rebuild(s);
    this.emit('msg.castleStopped');
  }

  private ability(id: AbilityId, pos?: Vec): void {
    const s = this.state;
    const def = BALANCE.abilities[id];
    if (s.cooldowns[id] > 0) return this.emit('msg.abilityCooldown', { level: 'warn' });
    if (s.phase === 'dawn') return;
    if (id === 'arrowRain') {
      if (!pos) return;
      const r = def.radius!;
      for (const m of s.monsters) {
        if ((m.x - pos.x) ** 2 + (m.z - pos.z) ** 2 <= r * r) this.hurtMonster(m, def.dmg!);
      }
      this.emit('fx.arrowRain', { pos: { ...pos } });
    } else {
      for (const u of s.units) {
        const a = (u.slot * 2.39996) % (Math.PI * 2);
        u.x = s.castle.x + Math.cos(a) * (C.halfSize + 1);
        u.z = s.castle.z + Math.sin(a) * (C.halfSize + 1);
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * def.heal!);
        u.targetId = -1;
        u.work = 0;
      }
      for (const type of UNIT_TYPES) this.setGroupOrder(type, null);
      this.emit('fx.bell', { pos: { x: s.castle.x, z: s.castle.z } });
    }
    s.cooldowns[id] = def.cooldown;
  }

  private pickCard(id: CardId): void {
    const s = this.state;
    if (s.phase !== 'dawn' || s.cardPicked || !s.cards.includes(id)) return;
    const v = BALANCE.cards[id];
    const m = s.mods;
    switch (id) {
      case 'soldierHp': m.soldierHp += v; break;
      case 'towerRate': m.towerRate += v; break;
      case 'moveSpeed': m.moveSpeed *= v; break;
      case 'carry': m.carry += v; break;
      case 'torchRadius': m.torchRadius += v; break;
      case 'wallHp': {
        m.wallHp += v;
        const c = s.castle;
        const max = Math.round(C.wallHp * (1 + m.wallHp));
        c.wallHp += max - c.wallMax;
        c.wallMax = max;
        for (const st of s.structs) {
          const smax = Math.round(BALANCE.structs[st.type].hp * (1 + m.wallHp));
          st.hp += smax - st.maxHp;
          st.maxHp = smax;
        }
        break;
      }
      case 'repairSpeed': m.repairSpeed *= v; break;
      case 'extraSlot': m.extraSlots += v; break;
      case 'archerDmg': m.archerDmg += v; break;
      case 'coreHeal': s.castle.coreHp = Math.min(s.castle.coreMax, s.castle.coreHp + s.castle.coreMax * v); break;
    }
    s.cardPicked = true;
    this.refreshUnitStats();
    this.maybeStartDay();
  }

  private pickRoute(id: number): void {
    const s = this.state;
    if (s.phase !== 'dawn' || s.routePicked) return;
    const route = s.routes.find((r) => r.id === id);
    if (!route) return;
    s.castle.destChunk = route.chunk;
    s.castle.destX = id === 0 ? s.castle.x : chunkCenter(route.chunk);
    s.routePicked = true;
    this.maybeStartDay();
  }

  private refreshUnitStats(): void {
    for (const u of this.state.units) {
      const max = unitMaxHp(this.state, u.type);
      if (max !== u.maxHp) {
        u.hp = (u.hp / u.maxHp) * max;
        u.maxHp = max;
      }
    }
  }

  // ------------------------------------------------------------ tick

  step(): void {
    const s = this.state;
    if (s.phase === 'gameover' || s.phase === 'dawn') return;
    s.tick++;
    s.phaseTime += DT;
    this.lightCache = lights(s);
    this.engaged.clear();

    for (const k of Object.keys(s.cooldowns) as AbilityId[]) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - DT);
    if (s.drops.length) {
      for (const d of s.drops) d.ttl -= DT;
      s.drops = s.drops.filter((d) => d.ttl > 0 && d.amount > 0);
    }

    this.updateCastle();
    this.updateRooms();
    this.updateSpawns();
    for (const u of s.units) this.updateUnit(u);
    for (const m of s.monsters) this.updateMonster(m);
    this.updateStructs();
    this.separate();
    this.cleanup();
    this.warnings();

    if (s.castle.coreHp <= 0) {
      s.castle.coreHp = 0;
      s.phase = 'gameover';
      this.emit('msg.gameOver', { level: 'danger' });
      return;
    }
    if (s.phaseTime >= s.phaseLength) this.nextPhase();
  }

  private nextPhase(): void {
    const s = this.state;
    s.phaseTime = 0;
    if (s.phase === 'day') {
      if (s.castle.moving) this.stopCastle();
      s.phase = 'dusk';
      s.phaseLength = duskLength(s.night);
      this.planNight();
      this.emit('msg.dusk', { level: 'warn' });
    } else if (s.phase === 'dusk') {
      s.phase = 'night';
      s.phaseLength = nightLength(s.night);
      s.fireDone = false;
      this.warned = { wall: false, core: false, wallBroken: false };
      this.emit('msg.nightFalls', { params: { n: s.night }, level: 'danger' });
    } else if (s.phase === 'night') {
      this.dawn();
    }
  }

  private planNight(): void {
    const s = this.state;
    const terrain = chunkTerrain(s.seed, chunkOf(s.castle.x));
    const stayed = stayedHere(s);
    s.newRegion = s.night > 1 && !stayed;
    const n = dirCount(s.night, stayed, s.newRegion, terrain);
    const dirs = shuffle(s, [...allowedDirs(terrain)]).slice(0, n);
    const raw = dirs.map(() => range(s, 0.6, 1.4));
    const sum = raw.reduce((a, b) => a + b, 0);
    const weights = raw.map((w) => w / sum);
    const total = Math.round(monsterCount(s.night) * awarenessMult(stayed ? s.castle.nightsHere + 1 : 1));
    const wc = waveCount(s.night);
    const length = nightLength(s.night);
    const seg = (length - 4) / wc;
    const shares = Array.from({ length: wc }, (_, i) => 1 + i * 0.3);
    const shareSum = shares.reduce((a, b) => a + b, 0);
    const waves = shares.map((sh, i) => ({
      start: 2 + i * seg,
      count: Math.max(1, Math.round((total * sh) / shareSum)),
      spawned: 0,
      boss: isBossNight(s.night) && i === wc - 1,
    }));
    s.plan = { dirs, weights, total, waves };
    s.overflowHp = 0;
    // Peasants head home at dusk.
    for (const u of s.units) if (u.type === 'peasant') u.targetId = -1;
  }

  private dawn(): void {
    const s = this.state;
    const st = s.nightStats;
    // Survivors of the night flee at sunrise.
    s.monsters = [];
    s.castle.fire = 0;
    s.stats.nightsSurvived = s.night;
    const stayed = stayedHere(s);
    const route: 'stay' | 'move' | 'start' = s.night === 1 ? 'start' : stayed ? 'stay' : 'move';
    s.castle.nightsHere = stayed ? s.castle.nightsHere + 1 : 1;
    s.castle.lastNightX = s.castle.x;
    // Food: a short dawn weakens everyone; two in a row also make a villager leave.
    const need = s.units.length * BALANCE.foodPerUnit;
    st.food = Math.min(need, s.res.food);
    st.hungry = s.res.food < need;
    s.res.food = Math.max(0, s.res.food - need);
    if (st.hungry) {
      s.hunger++;
      this.emit(s.hunger === 1 ? 'msg.hungry' : 'msg.starving', { level: 'danger' });
      if (s.hunger >= BALANCE.hunger.desertFrom && s.units.length > 0) {
        const order: UnitType[] = ['peasant', 'builder', 'spear', 'archer'];
        const leaver = order.map((t) => s.units.filter((u) => u.type === t).pop()).find(Boolean)!;
        s.units = s.units.filter((u) => u !== leaver);
        st.lost++;
        this.emit('msg.deserted', { params: { unit: leaver.type }, level: 'danger' });
      }
    } else s.hunger = 0;
    s.history.push({
      night: s.night,
      route,
      terrain: chunkTerrain(s.seed, chunkOf(s.castle.x)),
      dirs: s.plan?.dirs.length ?? 0,
      monsters: s.plan?.total ?? 0,
      kills: st.kills,
      lost: st.lost,
      structLost: st.structLost,
      wallDamage: Math.round(st.wallDamage),
      coreDamage: Math.round(st.coreDamage),
      food: st.food,
      hungry: st.hungry,
      cause: st.cause,
    });
    // Card offer.
    const pool = CARD_IDS.filter((c) => c !== 'extraSlot' || slotCount(s) < C.maxSlots);
    s.cards = shuffle(s, [...pool]).slice(0, 3);
    s.cardPicked = false;
    s.plan = null;
    s.night++;
    s.routes = this.routeOptions();
    s.routePicked = false;
    s.phase = 'dawn';
    s.phaseTime = 0;
    s.phaseLength = 0;
    this.emit('msg.dawn', { params: { n: s.stats.nightsSurvived }, level: 'info' });
  }

  routeOptions(): RouteOption[] {
    const s = this.state;
    const here = chunkOf(s.castle.x);
    const speed = C.moveSpeed * s.mods.moveSpeed;
    const opts: RouteOption[] = [];
    const tHere = chunkTerrain(s.seed, here);
    const stayDirs = dirCount(s.night, true, false, tHere);
    opts.push({
      id: 0,
      chunk: here,
      terrain: tHere,
      mainRes: mainResource(tHere),
      dirs: stayDirs,
      danger: this.dangerLevel(here, stayDirs),
      resourcePct: resourcePct(s, s.castle.x),
      travel: 0,
      exhausted: resourcePct(s, s.castle.x) < BALANCE.world.exhaustedPct,
    });
    for (let i = 1; i <= BALANCE.route.aheadChoices; i++) {
      const chunk = here + i;
      const terrain = chunkTerrain(s.seed, chunk);
      const dirs = dirCount(s.night, false, true, terrain);
      opts.push({
        id: i,
        chunk,
        terrain,
        mainRes: mainResource(terrain),
        dirs,
        danger: this.dangerLevel(chunk, dirs),
        resourcePct: 1,
        exhausted: false,
        travel: Math.round(Math.abs(chunkCenter(chunk) - s.castle.x) / speed),
      });
    }
    return opts;
  }

  private dangerLevel(chunk: number, dirs: number): number {
    return Math.max(1, Math.min(5, Math.round((danger(chunk) - 1) / 0.12) + dirs - 1));
  }

  private maybeStartDay(): void {
    const s = this.state;
    if (!s.cardPicked || !s.routePicked) return;
    s.phase = 'day';
    s.phaseTime = 0;
    s.phaseLength = dayLength(s.night);
    s.nightStats = emptyNightStats();
    s.strangerDone = false;
    s.wanderTimer = 0;
    for (const u of s.units) {
      if (u.inside && u.order?.kind !== 'home') this.exitCastle(u);
    }
    this.emit('msg.dayStarts', { params: { n: s.night } });
  }

  private exitCastle(u: Unit): void {
    const s = this.state;
    u.inside = false;
    const a = (u.slot * 2.39996) % (Math.PI * 2);
    u.x = s.castle.x + Math.cos(a) * (C.halfSize + 0.8);
    u.z = s.castle.z + Math.sin(a) * (C.halfSize + 0.8);
  }

  // ------------------------------------------------------------ castle & rooms

  private updateCastle(): void {
    const s = this.state;
    const c = s.castle;
    if (c.moving) {
      const speed = C.moveSpeed * s.mods.moveSpeed;
      const d = c.destX - c.x;
      const step = Math.sign(d) * Math.min(Math.abs(d), speed * DT);
      c.x += step;
      if (Math.floor((c.x - step) / 8) !== Math.floor(c.x / 8)) ensureChunks(s);
      if (Math.abs(c.destX - c.x) < 1e-6) {
        c.x = c.destX;
        this.stopCastle();
        this.emit('msg.arrived', { level: 'info' });
      }
    }
    if (c.fire > 0) {
      c.coreHp -= C.fireDps * DT;
    } else if (s.phase === 'night' && !s.fireDone && s.night >= 2 && s.phaseTime > 20) {
      s.fireDone = true;
      if (nextRandom(s) < C.fireChancePerNight) {
        c.fire = C.fireWork;
        if (!s.nightStats.cause) s.nightStats.cause = 'fire';
        this.emit('msg.fire', { level: 'danger' });
      }
    }
    if (s.phase === 'day' && !s.strangerDone && s.phaseTime > 30) {
      s.strangerDone = true;
      if (nextRandom(s) < C.strangerChancePerDay && popUsed(s) + C.strangerCount <= popCap(s) + 2) {
        for (let i = 0; i < C.strangerCount; i++) {
          const type: UnitType = i === 0 ? 'peasant' : 'spear';
          addUnit(s, type, { x: c.x + range(s, -2, 2), z: c.z + C.halfSize + 1.5 });
        }
        this.emit('msg.strangers', { params: { n: C.strangerCount }, level: 'info' });
      }
    }
  }

  private updateRooms(): void {
    const s = this.state;
    for (let i = 0; i < slotCount(s); i++) {
      const r = s.rooms[i];
      if (!r || r.queue.length === 0) continue;
      r.progress += DT;
      const type = r.queue[0];
      if (r.progress >= U[type].train) {
        r.progress = 0;
        r.queue.shift();
        const u = addUnit(s, type, { x: s.castle.x, z: s.castle.z + C.halfSize + 0.8 });
        u.order = s.groupOrders[type] ? { ...s.groupOrders[type]!, pos: { ...s.groupOrders[type]!.pos } } : null;
        if (type === 'peasant' && s.phase !== 'day') u.inside = true;
        this.emit('msg.unitReady', { params: { unit: type } });
      }
    }
  }

  // ------------------------------------------------------------ spawning

  private updateSpawns(): void {
    const s = this.state;
    if (s.phase === 'night' && s.plan) {
      const spread = BALANCE.phases.waveSpawnSpread;
      s.plan.waves.forEach((w, wi) => {
        if (s.phaseTime < w.start) return;
        if (w.spawned === 0 && w.count > 0) this.emit('msg.wave', { params: { n: wi + 1, of: s.plan!.waves.length }, level: 'danger' });
        if (w.boss && w.spawned === 0) this.spawnMonster('boss', this.pickDir());
        const target = Math.min(w.count, Math.floor((w.count * (s.phaseTime - w.start)) / spread) + 1);
        while (w.spawned < target) {
          w.spawned++;
          this.spawnMonster(this.pickType(), this.pickDir());
        }
      });
    } else if (s.phase === 'day' && !s.castle.moving && s.night >= BALANCE.difficulty.dayWanderFrom) {
      s.wanderTimer += DT;
      if (s.wanderTimer >= BALANCE.difficulty.dayWanderEvery) {
        s.wanderTimer = 0;
        const wanderers = s.monsters.filter((m) => m.wander).length;
        if (wanderers < BALANCE.difficulty.dayWanderMax) {
          const dirs = allowedDirs(chunkTerrain(s.seed, chunkOf(s.castle.x)));
          const m = this.spawnMonster('fast', dirs[pickIndex(s, dirs.length)]);
          if (m) m.wander = true;
        }
      }
    }
  }

  private pickDir(): Dir {
    const s = this.state;
    const plan = s.plan!;
    let r = nextRandom(s);
    for (let i = 0; i < plan.dirs.length; i++) {
      r -= plan.weights[i];
      if (r < 0) return plan.dirs[i];
    }
    return plan.dirs[plan.dirs.length - 1];
  }

  private pickType(): MonsterType {
    const s = this.state;
    const mix = BALANCE.difficulty.mix;
    const ranged = s.night >= BALANCE.difficulty.rangedFrom ? mix.ranged : 0;
    const r = nextRandom(s) * (mix.fast + mix.brute + ranged);
    if (r < mix.fast) return 'fast';
    if (r < mix.fast + mix.brute) return 'brute';
    return 'ranged';
  }

  private spawnMonster(type: MonsterType, dir: Dir): Monster | null {
    const s = this.state;
    const def = BALANCE.monsters[type];
    const hpMult = monsterHpMult(s.night, danger(chunkOf(s.castle.x)));
    let hp = def.hp * hpMult;
    if (type !== 'boss' && s.monsters.length >= BALANCE.difficulty.maxAlive) {
      // Over the cap: the next monster that does spawn gets stronger instead.
      s.overflowHp += hp * BALANCE.difficulty.overflowHpPerSkipped;
      return null;
    }
    if (s.overflowHp > 0 && type !== 'boss') {
      const bonus = Math.min(s.overflowHp, hp * BALANCE.difficulty.overflowHpCap);
      s.overflowHp -= bonus;
      hp += bonus;
    }
    const d = BALANCE.world.spawnDistance;
    const cx = s.castle.x;
    const canyon = chunkTerrain(s.seed, chunkOf(cx)) === 'canyon';
    const lateral = range(s, canyon ? -6 : -14, canyon ? 6 : 14);
    const pos: Vec =
      dir === 'N' ? { x: cx + lateral, z: -d } :
      dir === 'S' ? { x: cx + lateral, z: d } :
      dir === 'E' ? { x: cx + d, z: lateral } :
      { x: cx - d, z: lateral };
    const m: Monster = {
      id: s.nextId++,
      type,
      x: pos.x,
      z: pos.z,
      hp,
      maxHp: hp,
      dmgMult: Math.sqrt(hpMult),
      cooldown: 0,
      targetId: -1,
      slamTimer: 0,
      slamAt: null,
      wander: false,
    };
    s.monsters.push(m);
    if (type === 'boss') this.emit('msg.boss', { level: 'danger' });
    return m;
  }

  // ------------------------------------------------------------ units

  private updateUnit(u: Unit): void {
    const s = this.state;
    if (u.hp <= 0) return;
    u.cooldown = Math.max(0, u.cooldown - DT);
    if (u.inside) {
      u.job = 'shelter';
      return;
    }
    if (s.castle.moving) {
      u.job = 'idle';
      const a = (u.slot * 2.39996) % (Math.PI * 2);
      const r = C.halfSize + 1.5 + (u.slot % 3) * 0.9;
      this.moveDirect(u, s.castle.x + Math.cos(a) * r, s.castle.z + Math.sin(a) * r, U[u.type].speed * 1.3);
      return;
    }
    switch (u.type) {
      case 'peasant':
        return this.peasant(u);
      case 'builder':
        return this.builder(u);
      case 'spear':
      case 'shield':
        return this.soldier(u, false);
      case 'archer':
        return this.soldier(u, true);
    }
  }

  private peasant(u: Unit): void {
    const s = this.state;
    const sheltering = s.phase === 'dusk' || s.phase === 'night' || u.order?.kind === 'home';
    const cap = Math.round(U.peasant.carry * (1 + s.mods.carry));
    if (sheltering || u.carry >= cap) {
      u.job = sheltering ? 'shelter' : 'deliver';
      if (this.walkTo(u, s.castle.x, s.castle.z, 0.6, true)) {
        this.deliver(u);
        if (sheltering) u.inside = true;
        else u.targetId = -1;
      }
      return;
    }
    // A load dropped on the ground is picked up first.
    let drop = u.targetId >= 0 ? s.drops.find((d) => d.id === u.targetId) : undefined;
    if (!drop && !u.order) drop = this.nearestDrop(u);
    if (drop) {
      u.targetId = drop.id;
      u.job = 'gather';
      if (u.carry > 0 && u.carryRes !== drop.res) {
        u.job = 'deliver';
        if (this.walkTo(u, s.castle.x, s.castle.z, 0.6, true)) this.deliver(u);
        return;
      }
      if (!this.walkTo(u, drop.x, drop.z, 0.8)) return;
      const take = Math.min(cap - u.carry, drop.amount);
      drop.amount -= take;
      u.carry += take;
      u.carryRes = drop.res;
      if (drop.amount <= 0) s.drops = s.drops.filter((d) => d !== drop);
      u.targetId = -1;
      return;
    }
    let node = u.targetId >= 0 ? s.nodes.find((n) => n.id === u.targetId) : undefined;
    if (!node || node.amount <= 0) {
      const from = u.order?.kind === 'gather' ? u.order.pos : { x: s.castle.x, z: s.castle.z };
      node = this.nearestNode(from, u);
      u.targetId = node ? node.id : -1;
      u.work = 0;
    }
    if (!node) {
      if (u.carry > 0) {
        u.job = 'deliver';
        if (this.walkTo(u, s.castle.x, s.castle.z, 0.6, true)) this.deliver(u);
      } else u.job = 'idle';
      return;
    }
    u.job = 'gather';
    if (!this.walkTo(u, node.x, node.z, 1.0)) return;
    const res = BALANCE.world.nodeRes[node.type];
    if (u.carryRes !== res && u.carry > 0) {
      u.job = 'deliver';
      u.targetId = -1;
      return;
    }
    u.work += DT;
    if (u.work >= U.peasant.gatherTime) {
      u.work = 0;
      const take = Math.min(cap - u.carry, node.amount);
      node.amount -= take;
      u.carry += take;
      u.carryRes = res;
      this.emit('fx.gather', { pos: { x: node.x, z: node.z } });
      if (node.amount <= 0) this.emit('fx.depleted', { pos: { x: node.x, z: node.z } });
    }
  }

  private nearestDrop(u: Unit): Drop | undefined {
    let best: Drop | undefined;
    let bestD = 25;
    for (const d of this.state.drops) {
      if (this.state.units.some((o) => o !== u && o.targetId === d.id)) continue;
      const dist = Math.hypot(d.x - u.x, d.z - u.z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /**
   * Labour policy (GDD v1.2 §6.3): each free peasant takes the resource with the best
   * priority-per-worker, food counting double when fewer than two dawns are covered.
   */
  private assignWork(u: Unit): LaborRes[] {
    const s = this.state;
    const order: LaborRes[] = ['food', 'wood', 'stone'];
    const score = (r: LaborRes) => {
      const p = s.labor[r];
      if (p <= 0) return -1;
      const need = r === 'food' && foodDawns(s) < 2 ? BALANCE.economy.hungryFoodWeight : 1;
      let workers = 0;
      for (const o of s.units) if (o !== u && o.type === 'peasant' && !o.order && o.workRes === r) workers++;
      return (p * need) / (1 + workers);
    };
    return order.filter((r) => score(r) >= 0).sort((a, b) => score(b) - score(a) || order.indexOf(a) - order.indexOf(b));
  }

  private nearestNode(from: Vec, u: Unit): ResourceNode | undefined {
    const s = this.state;
    const limit = this.grid.size / 2 - 2;
    // Hand-ordered peasants take whatever is nearest their flag; the rest follow the labour policy.
    const wanted: (LaborRes | null)[] = u.order ? [null] : this.assignWork(u);
    for (const res of wanted) {
      let best: ResourceNode | undefined;
      let bestD = Infinity;
      for (const n of s.nodes) {
        if (n.amount <= 0) continue;
        if (res && BALANCE.world.nodeRes[n.type] !== res) continue;
        if (Math.abs(n.x - s.castle.x) > limit) continue;
        if (isDark(s) && !isLit(s, this.lightCache, n.x, n.z)) continue;
        // Spread peasants a bit: crowded nodes look further away.
        let crowd = 0;
        for (const o of s.units) if (o !== u && o.targetId === n.id) crowd++;
        const d = Math.hypot(n.x - from.x, n.z - from.z) + crowd * 3;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) {
        u.workRes = res ?? (BALANCE.world.nodeRes[best.type] as LaborRes);
        return best;
      }
      if (res && s.tick % (BALANCE.tickRate * 30) === 0) this.emit('msg.noNodes', { params: { res }, level: 'warn' });
    }
    u.workRes = null;
    return undefined;
  }

  private deliver(u: Unit): void {
    if (u.carry > 0 && u.carryRes) {
      const s = this.state;
      s.res[u.carryRes] += u.carry;
      s.deliveries.push({ tick: s.tick, res: u.carryRes, n: u.carry });
      const since = s.tick - BALANCE.economy.incomeWindow * BALANCE.tickRate;
      if (s.deliveries[0].tick < since) s.deliveries = s.deliveries.filter((d) => d.tick >= since);
      this.emit('fx.deliver', { pos: { x: u.x, z: u.z }, params: { res: u.carryRes, n: u.carry } });
    }
    u.carry = 0;
    u.carryRes = null;
  }

  private builder(u: Unit): void {
    const s = this.state;
    const c = s.castle;
    // Pick a task: explicit order, fire, blueprints, dismantling, worst damage.
    if (u.targetId === -1 || !this.builderTargetValid(u.targetId)) {
      u.targetId = -1;
      u.work = 0;
      // GDD v1.2 §6.3: emergency castle repair > fire > construction > outer repairs.
      if (u.order?.kind === 'repair' && u.order.targetId !== undefined && this.builderTargetValid(u.order.targetId)) u.targetId = u.order.targetId;
      else if (c.wallHp / c.wallMax < BALANCE.emergencyWall && s.res.wood > 0) u.targetId = T_WALL;
      else if (c.fire > 0) u.targetId = T_FIRE;
      else {
        const blueprint = this.nearestStruct(u, (st) => st.built < 1 && !st.dismantle);
        const dis = this.nearestStruct(u, (st) => st.dismantle);
        if (blueprint) u.targetId = blueprint.id;
        else if (dis) u.targetId = dis.id;
        else u.targetId = this.worstDamage();
      }
    }
    const t = u.targetId;
    if (t === -1) {
      u.job = 'idle';
      if (u.order?.kind === 'move') this.walkTo(u, u.order.pos.x, u.order.pos.z, 0.4);
      else this.idleNearCastle(u);
      return;
    }
    const rate = U.builder.repairRate * s.mods.repairSpeed;
    if (t === T_FIRE || t === T_WALL || t === T_WHEEL) {
      u.job = 'repair';
      if (!this.walkTo(u, c.x, c.z, 0.6, true)) return;
      if (t === T_FIRE) {
        c.fire = Math.max(0, c.fire - DT * s.mods.repairSpeed);
        if (c.fire === 0) {
          u.targetId = -1;
          this.emit('msg.fireOut', { level: 'info' });
        }
      } else if (t === T_WALL) c.wallHp = Math.min(c.wallMax, c.wallHp + this.payRepair(rate * DT));
      else c.wheelHp = Math.min(c.wheelMax, c.wheelHp + this.payRepair(rate * DT));
      return;
    }
    const st = s.structs.find((x) => x.id === t)!;
    if (!this.walkTo(u, st.cx + 0.5, st.cz + 0.5, 1.1, BALANCE.structs[st.type].blocks)) {
      u.job = st.built < 1 ? 'build' : 'repair';
      return;
    }
    const def = BALANCE.structs[st.type];
    if (st.dismantle) {
      u.job = 'build';
      u.work += DT;
      if (u.work >= BALANCE.dismantleWork) {
        refund(s, def.cost, BALANCE.refundShare);
        this.removeStruct(st);
        this.emit('msg.dismantled', { params: { struct: st.type } });
        u.targetId = -1;
      }
    } else if (st.built < 1) {
      u.job = 'build';
      st.built = Math.min(1, st.built + (DT * s.mods.repairSpeed) / def.work);
      st.hp = Math.max(st.hp, st.maxHp * Math.max(0.1, st.built));
      if (st.built >= 1) {
        st.hp = st.maxHp;
        this.emit('fx.built', { pos: { x: st.cx + 0.5, z: st.cz + 0.5 } });
        u.targetId = -1;
      }
    } else {
      u.job = 'repair';
      st.hp = Math.min(st.maxHp, st.hp + this.payRepair(rate * DT));
      if (st.hp >= st.maxHp) u.targetId = -1;
    }
  }

  /** Repairs cost wood (GDD v1.2 §5.1). Returns how much of `hp` could be paid for. */
  private payRepair(hp: number): number {
    const s = this.state;
    if (s.res.wood <= 0 && s.repairDebt >= 1) {
      if (s.tick % (BALANCE.tickRate * 20) === 0) this.emit('msg.noWoodRepair', { level: 'warn' });
      return 0;
    }
    s.repairDebt += hp * BALANCE.repairWoodPerHp;
    while (s.repairDebt >= 1 && s.res.wood > 0) {
      s.res.wood--;
      s.repairDebt--;
    }
    return hp;
  }

  private builderTargetValid(t: number): boolean {
    const s = this.state;
    const c = s.castle;
    if (t === T_FIRE) return c.fire > 0;
    if (t === T_WALL) return c.wallHp < c.wallMax;
    if (t === T_WHEEL) return c.wheelHp < c.wheelMax;
    const st = s.structs.find((x) => x.id === t);
    return !!st && (st.built < 1 || st.dismantle || st.hp < st.maxHp);
  }

  private nearestStruct(u: Unit, pred: (st: Structure) => boolean): Structure | undefined {
    let best: Structure | undefined;
    let bestD = Infinity;
    for (const st of this.state.structs) {
      if (!pred(st)) continue;
      const d = Math.hypot(st.cx - u.x, st.cz - u.z);
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    return best;
  }

  /** Most damaged thing (relative), or -1. Castle wall and wheel count. */
  private worstDamage(): number {
    const s = this.state;
    const c = s.castle;
    let best = -1;
    let worst = 0.98;
    if (c.wheelHp / c.wheelMax < worst) {
      worst = c.wheelHp / c.wheelMax;
      best = T_WHEEL;
    }
    if (c.wallHp / c.wallMax < worst) {
      worst = c.wallHp / c.wallMax;
      best = T_WALL;
    }
    for (const st of s.structs) {
      if (st.built < 1) continue;
      const r = st.hp / st.maxHp;
      if (r < worst) {
        worst = r;
        best = st.id;
      }
    }
    return best;
  }

  private idleNearCastle(u: Unit): void {
    const s = this.state;
    const a = (u.slot * 2.39996) % (Math.PI * 2);
    const r = C.halfSize + 2 + (u.slot % 3);
    this.walkTo(u, s.castle.x + Math.cos(a) * r, s.castle.z + Math.sin(a) * r, 0.5);
  }

  private soldier(u: Unit, archer: boolean): void {
    const s = this.state;
    const c = s.castle;
    const def = U[u.type as 'spear' | 'shield' | 'archer'];
    const o = u.order;
    // Retreat: run home and do not stop to fight.
    if (o?.kind === 'retreat') {
      u.job = 'shelter';
      u.targetId = -1;
      if (this.walkTo(u, c.x, c.z, 0.8, true)) u.order = null;
      return;
    }
    const reach = archer ? archerRange(s, u) : def.range;
    let anchor: Vec;
    let aggro = archer ? reach : def.aggro;
    let holdGround = false;
    let focus: Monster | undefined;
    if (o?.kind === 'focus') {
      focus = s.monsters.find((m) => m.id === o.targetId && m.hp > 0);
      if (!focus) u.order = null;
    }
    if (u.order?.kind === 'guard') {
      const g = this.guardPos(u.order.targetId ?? -1);
      if (!g) u.order = null;
      anchor = g ?? { x: c.x, z: c.z };
      aggro = Math.max(aggro, 6);
    } else if (u.order?.kind === 'hold') {
      anchor = u.order.pos;
      holdGround = true;
      aggro = reach + 0.5;
    } else if (u.order?.kind === 'move' || u.order?.kind === 'focus') {
      anchor = u.order.pos;
    } else if (archer) {
      const archers = s.units.filter((x) => x.type === 'archer' && !x.order);
      const i = archers.indexOf(u);
      const a = (i / Math.max(1, archers.length)) * Math.PI * 2 + 0.4;
      anchor = { x: c.x + Math.cos(a) * C.stationRadius, z: c.z + Math.sin(a) * C.stationRadius };
    } else {
      // Melee stands guard on the side where monsters come from.
      const a = this.guardAngle(u);
      anchor = { x: c.x + Math.cos(a) * (C.halfSize + 2.5), z: c.z + Math.sin(a) * (C.halfSize + 2.5) };
      if (s.phase === 'day') {
        // By day idle melee protects the whole camp from stragglers.
        anchor = { x: c.x, z: c.z };
        aggro = BALANCE.difficulty.dayDefendRadius;
      }
    }
    // Pick a target: the focus target, else the nearest visible monster near the anchor.
    let target = focus ?? (u.targetId >= 0 ? s.monsters.find((m) => m.id === u.targetId && m.hp > 0) : undefined);
    if (!focus && target && (Math.hypot(target.x - anchor.x, target.z - anchor.z) > aggro + (holdGround ? 0 : 4) || !this.canSee(target, u, archer))) target = undefined;
    if (!target) {
      let bestD = Infinity;
      for (const m of s.monsters) {
        if (!this.canSee(m, u, archer)) continue;
        const da = Math.hypot(m.x - anchor.x, m.z - anchor.z);
        const du = Math.hypot(m.x - u.x, m.z - u.z);
        if (archer || holdGround ? du > reach + 0.5 : da > aggro) continue;
        if (du < bestD) {
          bestD = du;
          target = m;
        }
      }
    }
    u.targetId = target ? target.id : -1;
    if (target) {
      u.job = 'attack';
      const d = Math.hypot(target.x - u.x, target.z - u.z);
      if (d <= reach + BALANCE.monsters[target.type].radius) {
        if (u.cooldown <= 0) {
          u.cooldown = def.cooldown;
          const dmg = (archer ? def.dmg * (1 + s.mods.archerDmg) : def.dmg) * hungerMult(s);
          this.hurtMonster(target, dmg);
          this.emit(archer ? 'fx.arrow' : 'fx.hit', { pos: { x: u.x, z: u.z }, to: { x: target.x, z: target.z } });
        }
        return;
      }
      // Hold never chases; archers close in only on a focus target.
      if (!holdGround && (!archer || focus)) {
        this.walkTo(u, target.x, target.z, archer ? reach * 0.9 : reach * 0.8);
        return;
      }
    }
    u.job = 'guard';
    if (archer && !u.order) this.walkTo(u, anchor.x, anchor.z, 0.3, true);
    else this.walkTo(u, anchor.x, anchor.z, holdGround ? 0.3 : 0.6);
  }

  /** Where a guard order stands: a unit, a building, or the castle (-2). Null when the charge is gone. */
  private guardPos(id: number): Vec | null {
    const s = this.state;
    if (id === T_WALL) return { x: s.castle.x, z: s.castle.z };
    const unit = s.units.find((u) => u.id === id && !u.inside);
    if (unit) return { x: unit.x, z: unit.z };
    const st = s.structs.find((x) => x.id === id);
    return st ? { x: st.cx + 0.5, z: st.cz + 0.5 } : null;
  }

  private guardAngle(u: Unit): number {
    const s = this.state;
    const spears = s.units.filter((x) => (x.type === 'spear' || x.type === 'shield') && !x.order);
    const i = Math.max(0, spears.indexOf(u));
    const dirs = s.plan?.dirs ?? [];
    if (dirs.length === 0) return (i / Math.max(1, spears.length)) * Math.PI * 2;
    const dir = dirs[i % dirs.length];
    const base = dir === 'E' ? 0 : dir === 'S' ? Math.PI / 2 : dir === 'W' ? Math.PI : -Math.PI / 2;
    const k = Math.floor(i / dirs.length);
    return base + ((k % 3) - 1) * 0.35;
  }

  private canSee(m: Monster, u: Unit, ranged: boolean): boolean {
    if (m.hp <= 0) return false;
    if (isLit(this.state, this.lightCache, m.x, m.z)) return true;
    // Melee can still fight what is right next to it in the dark.
    return !ranged && Math.hypot(m.x - u.x, m.z - u.z) < 2;
  }

  // ------------------------------------------------------------ monsters

  private updateMonster(m: Monster): void {
    const s = this.state;
    if (m.hp <= 0) return;
    const def = BALANCE.monsters[m.type];
    m.cooldown = Math.max(0, m.cooldown - DT);
    if (m.type === 'boss') this.bossSlam(m);
    if (m.slamAt) return; // winding up

    // Ranged: shoot the nearest unit in range.
    if (m.type === 'ranged') {
      const u = this.nearestUnit(m, def.range, () => true);
      if (u) {
        if (m.cooldown <= 0) {
          m.cooldown = def.cooldown;
          this.hurtUnit(u, def.dmg * m.dmgMult, BALANCE.monsterDamage[m.type]);
          this.emit('fx.spit', { pos: { x: m.x, z: m.z }, to: { x: u.x, z: u.z } });
        }
        return;
      }
    }
    // Melee contact with units (brutes prefer buildings).
    // Frontage (GDD v1.2 §8.4): only a few monsters can get at one unit; the rest have to find a gap.
    const contact = this.nearestUnit(m, def.range + 0.4, (u) => (this.engaged.get(u.id) ?? 0) < BALANCE.frontage);
    if (contact) this.engaged.set(contact.id, (this.engaged.get(contact.id) ?? 0) + 1);
    if (contact && m.type !== 'brute' && m.type !== 'boss') {
      if (m.cooldown <= 0) {
        m.cooldown = def.cooldown;
        this.hurtUnit(contact, def.dmg * m.dmgMult, BALANCE.monsterDamage[m.type]);
        this.emit('fx.bite', { pos: { x: contact.x, z: contact.z } });
      }
      return;
    }
    // Castle in reach.
    if (distToCastle(s, m.x, m.z) <= def.range + 0.2) {
      if (m.cooldown <= 0) {
        m.cooldown = def.cooldown;
        this.hurtCastle(def.dmg * m.dmgMult, m);
      }
      return;
    }
    // Fast monsters chase peasants and stragglers.
    let goal: Vec | null = null;
    if (m.type === 'fast') {
      const prey = this.nearestUnit(m, BALANCE.fastTargetRange, (u) => u.type === 'peasant' || u.type === 'builder');
      if (prey) goal = { x: prey.x, z: prey.z };
    }
    if (!goal && contact && m.cooldown <= 0) {
      // Brutes still swat units that block them.
      m.cooldown = def.cooldown;
      this.hurtUnit(contact, def.dmg * m.dmgMult, BALANCE.monsterDamage[m.type]);
      return;
    }
    let next: Vec | null;
    if (goal) {
      const d = Math.hypot(goal.x - m.x, goal.z - m.z);
      const nx = m.x + ((goal.x - m.x) / d) * 0.8;
      const nz = m.z + ((goal.z - m.z) / d) * 0.8;
      const cell = this.grid.cellAt(nx, nz);
      next = cell === 0 ? goal : this.grid.flowStep(m.x, m.z);
    } else {
      next = this.grid.flowStep(m.x, m.z) ?? { x: s.castle.x, z: s.castle.z };
    }
    if (!next) next = { x: s.castle.x, z: s.castle.z };
    // Smash structures in the way.
    const dx = next.x - m.x;
    const dz = next.z - m.z;
    const len = Math.hypot(dx, dz) || 1;
    const ahead = { x: m.x + (dx / len) * (def.radius + 0.5), z: m.z + (dz / len) * (def.radius + 0.5) };
    const k = this.grid.index(ahead.x, ahead.z);
    if (k >= 0 && this.grid.cells[k] === STRUCT) {
      const st = s.structs.find((x) => x.id === this.grid.structAt[k]);
      if (st) {
        if (m.cooldown <= 0) {
          m.cooldown = def.cooldown;
          this.hurtStruct(st, def.dmg * m.dmgMult * (m.type === 'brute' ? 1.5 : 1));
        }
        return;
      }
    }
    // Brutes also go for torches and towers close by.
    if (m.type === 'brute' && m.cooldown <= 0) {
      const st = s.structs.find((x) => Math.hypot(x.cx + 0.5 - m.x, x.cz + 0.5 - m.z) < def.range + 0.9);
      if (st) {
        m.cooldown = def.cooldown;
        this.hurtStruct(st, def.dmg * m.dmgMult * 1.5);
        return;
      }
    }
    this.moveMonster(m, next, def.speed);
  }

  private bossSlam(m: Monster): void {
    const s = this.state;
    const b = BALANCE.boss;
    m.slamTimer += DT;
    if (!m.slamAt && m.slamTimer >= b.slamEvery) {
      // Aim at the nearest building, or the castle edge.
      const st = this.nearestStructTo(m.x, m.z, 7);
      if (st) m.slamAt = { x: st.cx + 0.5, z: st.cz + 0.5 };
      else if (distToCastle(s, m.x, m.z) < 6) m.slamAt = { x: m.x + (s.castle.x - m.x) * 0.5, z: m.z + (s.castle.z - m.z) * 0.5 };
      else {
        m.slamTimer = b.slamEvery - 1;
        return;
      }
      m.slamTimer = 0;
      this.emit('fx.telegraph', { pos: { ...m.slamAt }, params: { r: b.slamRadius, t: b.slamWarn } });
    } else if (m.slamAt && m.slamTimer >= b.slamWarn) {
      const at = m.slamAt;
      const r2 = b.slamRadius * b.slamRadius;
      for (const st of [...s.structs]) if ((st.cx + 0.5 - at.x) ** 2 + (st.cz + 0.5 - at.z) ** 2 <= r2) this.hurtStruct(st, b.slamDmg * 2);
      for (const u of s.units) if (!u.inside && (u.x - at.x) ** 2 + (u.z - at.z) ** 2 <= r2) this.hurtUnit(u, b.slamDmg * 0.5, 'siege');
      if (distToCastle(s, at.x, at.z) < b.slamRadius) this.hurtCastle(b.slamDmg, m);
      this.emit('fx.slam', { pos: { ...at }, params: { r: b.slamRadius } });
      m.slamAt = null;
      m.slamTimer = 0;
    }
  }

  private nearestStructTo(x: number, z: number, within: number): Structure | undefined {
    let best: Structure | undefined;
    let bestD = within;
    for (const st of this.state.structs) {
      const d = Math.hypot(st.cx + 0.5 - x, st.cz + 0.5 - z);
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    return best;
  }

  private nearestUnit(m: Monster, within: number, pred: (u: Unit) => boolean): Unit | undefined {
    let best: Unit | undefined;
    let bestD = within;
    for (const u of this.state.units) {
      if (u.inside || u.hp <= 0 || !pred(u)) continue;
      const d = Math.hypot(u.x - m.x, u.z - m.z);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private moveMonster(m: Monster, to: Vec, speed: number): void {
    const dx = to.x - m.x;
    const dz = to.z - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const step = Math.min(d, speed * DT);
    const nx = m.x + (dx / d) * step;
    const nz = m.z + (dz / d) * step;
    const cell = this.grid.cellAt(nx, nz);
    if (cell === CLIFF || cell === CASTLE || cell === STRUCT) {
      // Slide along the blocking axis.
      if (this.grid.cellAt(nx, m.z) === 0) m.x = nx;
      else if (this.grid.cellAt(m.x, nz) === 0) m.z = nz;
      return;
    }
    m.x = nx;
    m.z = nz;
  }

  // ------------------------------------------------------------ structures

  private updateStructs(): void {
    const s = this.state;
    for (const st of s.structs) {
      const def = BALANCE.structs[st.type];
      if (st.built < 1 || !def.dmg) continue;
      st.cooldown = Math.max(0, st.cooldown - DT);
      if (st.cooldown > 0) continue;
      const m = this.nearestVisibleMonster(st.cx + 0.5, st.cz + 0.5, def.range!);
      if (m) {
        st.cooldown = def.cooldown! / (1 + s.mods.towerRate);
        this.hurtMonster(m, def.dmg);
        this.emit('fx.arrow', { pos: { x: st.cx + 0.5, z: st.cz + 0.5 }, to: { x: m.x, z: m.z } });
      }
    }
    // Watchtower rooms shoot from the castle.
    const towers = countRooms(s, 'watchtower');
    if (towers > 0) {
      const w = BALANCE.watchtowerShot;
      const period = w.cooldown / (towers * (1 + s.mods.towerRate));
      if (s.tick % Math.max(1, Math.round(period * BALANCE.tickRate)) === 0) {
        const m = this.nearestVisibleMonster(s.castle.x, s.castle.z, w.range);
        if (m) {
          this.hurtMonster(m, w.dmg);
          this.emit('fx.arrow', { pos: { x: s.castle.x, z: s.castle.z }, to: { x: m.x, z: m.z } });
        }
      }
    }
  }

  private nearestVisibleMonster(x: number, z: number, within: number): Monster | undefined {
    let best: Monster | undefined;
    let bestD = within;
    for (const m of this.state.monsters) {
      if (m.hp <= 0 || !isLit(this.state, this.lightCache, m.x, m.z)) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ damage

  private hurtMonster(m: Monster, dmg: number): void {
    if (m.hp <= 0) return;
    m.hp -= dmg;
    if (m.hp > 0) return;
    const s = this.state;
    const gold = BALANCE.monsters[m.type].gold;
    s.res.gold += gold;
    s.stats.kills++;
    s.nightStats.kills++;
    s.nightStats.gold += gold;
    if (m.type === 'boss') {
      s.stats.bosses++;
      this.emit('msg.bossDown', { level: 'info' });
    }
    this.emit('fx.monsterDie', { pos: { x: m.x, z: m.z }, params: { type: m.type } });
  }

  private hurtUnit(u: Unit, dmg: number, type: DamageType = 'physical'): void {
    if (u.hp <= 0) return;
    u.hp -= dmg * (BALANCE.resist[u.type]?.[type] ?? 1);
    if (u.hp > 0) return;
    const st = this.state.nightStats;
    if (u.carry > 0 && u.carryRes) {
      // The load falls where they fell; it can be picked up for a while.
      this.state.drops.push({ id: this.state.nextId++, x: u.x, z: u.z, res: u.carryRes, amount: u.carry, ttl: BALANCE.economy.dropTtl });
      u.carry = 0;
      this.emit('msg.cargoDropped', { params: { res: u.carryRes }, pos: { x: u.x, z: u.z }, level: 'warn' });
    }
    st.lost++;
    st.lostByType[u.type] = (st.lostByType[u.type] ?? 0) + 1;
    if (!st.cause && (u.type === 'peasant' || u.type === 'builder') && this.state.phase === 'night') st.cause = 'workersCaught';
    this.emit('msg.unitLost', { params: { unit: u.type }, pos: { x: u.x, z: u.z }, level: 'warn' });
  }

  private hurtStruct(st: Structure, dmg: number): void {
    st.hp -= dmg;
    this.emit('fx.structHit', { pos: { x: st.cx + 0.5, z: st.cz + 0.5 } });
    if (st.hp <= 0) {
      this.removeStruct(st);
      this.state.nightStats.structLost++;
      this.emit('fx.structDie', { pos: { x: st.cx + 0.5, z: st.cz + 0.5 } });
    }
  }

  private hurtCastle(dmg: number, m: Monster): void {
    const s = this.state;
    const c = s.castle;
    const st = s.nightStats;
    if (m.type !== 'ranged') c.wheelHp = Math.max(0, c.wheelHp - dmg * C.wheelDamageShare);
    if (c.wallHp > 0) {
      const absorbed = Math.min(c.wallHp, dmg);
      c.wallHp -= absorbed;
      st.wallDamage += absorbed;
      dmg -= absorbed;
      if (c.wallHp <= 0 && !st.cause.startsWith('breach')) st.cause = `breach:${dirOf(m.x - c.x, m.z - c.z)}`;
    }
    c.coreHp -= dmg;
    st.coreDamage += dmg;
    this.emit('fx.castleHit', { pos: { x: m.x, z: m.z } });
  }

  private removeStruct(st: Structure): void {
    const s = this.state;
    s.structs = s.structs.filter((x) => x !== st);
    if (BALANCE.structs[st.type].blocks) this.grid.setStruct(st.cx, st.cz, -1);
  }

  private cleanup(): void {
    const s = this.state;
    if (s.monsters.some((m) => m.hp <= 0)) s.monsters = s.monsters.filter((m) => m.hp > 0);
    if (s.units.some((u) => u.hp <= 0)) {
      s.units = s.units.filter((u) => u.hp > 0);
      if (s.selectedIds.length) s.selectedIds = s.selectedIds.filter((id) => s.units.some((u) => u.id === id));
    }
  }

  private warnings(): void {
    const s = this.state;
    const c = s.castle;
    if (s.phase !== 'night') return;
    if (!this.warned.wall && c.wallHp / c.wallMax < BALANCE.warnings.wallLow && c.wallHp > 0) {
      this.warned.wall = true;
      this.emit('msg.wallLow', { level: 'warn' });
    }
    if (!this.warned.wallBroken && c.wallHp <= 0) {
      this.warned.wallBroken = true;
      this.emit('msg.wallBroken', { level: 'danger' });
    }
    if (!this.warned.core && c.coreHp / c.coreMax < BALANCE.warnings.coreLow) {
      this.warned.core = true;
      this.emit('msg.coreLow', { level: 'danger' });
    }
  }

  // ------------------------------------------------------------ movement

  /** Walk along the nav grid. Returns true once within `near` of the goal (or the castle edge when `toCastle`). */
  private walkTo(u: Unit, x: number, z: number, near: number, toCastle = false): boolean {
    const s = this.state;
    const d = toCastle ? distToCastle(s, u.x, u.z) : Math.hypot(x - u.x, z - u.z);
    if (d <= near) return true;
    const speed = U[u.type].speed * hungerMult(s);
    const direct = Math.hypot(x - u.x, z - u.z);
    if (direct < 2.5 || toCastle && d < 1.5) {
      this.moveDirect(u, x, z, speed, true);
      return false;
    }
    const path = this.grid.findPath({ x: u.x, z: u.z }, { x, z });
    if (!path || path.length === 0) {
      this.moveDirect(u, x, z, speed, true);
      return false;
    }
    const wp = path[0];
    this.moveDirect(u, wp.x, wp.z, speed, true);
    return false;
  }

  private moveDirect(u: Unit, x: number, z: number, speed: number, collide = false): void {
    const dx = x - u.x;
    const dz = z - u.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const step = Math.min(d, speed * DT);
    const nx = u.x + (dx / d) * step;
    const nz = u.z + (dz / d) * step;
    if (collide) {
      const cell = this.grid.cellAt(nx, nz);
      if (cell === STRUCT || cell === CLIFF) {
        if (this.grid.cellAt(nx, u.z) !== STRUCT && this.grid.cellAt(nx, u.z) !== CLIFF) u.x = nx;
        else if (this.grid.cellAt(u.x, nz) !== STRUCT && this.grid.cellAt(u.x, nz) !== CLIFF) u.z = nz;
        return;
      }
    }
    u.x = nx;
    u.z = nz;
  }

  /** Soft separation so crowds do not stack into one point. */
  private separate(): void {
    const s = this.state;
    const push = (a: { x: number; z: number }, b: { x: number; z: number }, r: number, wa: number, wb: number) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-8) return;
      const d = Math.sqrt(d2);
      const o = (r - d) * 0.3;
      const ox = (dx / d) * o;
      const oz = (dz / d) * o;
      a.x -= ox * wa;
      a.z -= oz * wa;
      b.x += ox * wb;
      b.z += oz * wb;
    };
    const ms = s.monsters;
    for (let i = 0; i < ms.length; i++) {
      const ri = BALANCE.monsters[ms[i].type].radius;
      for (let j = i + 1; j < ms.length; j++) {
        push(ms[i], ms[j], ri + BALANCE.monsters[ms[j].type].radius, 1, 1);
      }
    }
    const us = s.units;
    const ur = BALANCE.unitRadius * 2;
    for (let i = 0; i < us.length; i++) {
      if (us[i].inside) continue;
      for (let j = i + 1; j < us.length; j++) if (!us[j].inside) push(us[i], us[j], ur, 1, 1);
    }
    // Units stand their ground against monsters: soldiers barely give way, shields not at all.
    for (const m of ms) {
      const rm = BALANCE.monsters[m.type].radius;
      for (const u of us) if (!u.inside) push(m, u, rm + BALANCE.unitRadius, 1, BALANCE.shove[u.type]);
    }
    // Keep monsters out of blocked cells after pushing.
    for (const m of ms) {
      const c = this.grid.cellAt(m.x, m.z);
      if (c === CLIFF || c === STRUCT) {
        const k = this.grid.index(m.x, m.z);
        const cx = this.grid.ox + (k % this.grid.size) + 0.5;
        const cz = this.grid.oz + Math.floor(k / this.grid.size) + 0.5;
        m.x += Math.sign(m.x - cx || 1) * 0.05;
        m.z += Math.sign(m.z - cz || 1) * 0.05;
      }
    }
  }
}

/** Compass side of an offset from the castle (north is -z). */
export function dirOf(dx: number, dz: number): Dir {
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
}

/** Delivered per minute over the last income window. */
export function incomePerMin(s: GameState, res: Res): number {
  const since = s.tick - BALANCE.economy.incomeWindow * BALANCE.tickRate;
  let n = 0;
  for (const d of s.deliveries) if (d.res === res && d.tick >= since) n += d.n;
  return Math.round((n * 60) / BALANCE.economy.incomeWindow);
}

export function groupCounts(s: GameState): Record<UnitType, number> {
  const out = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0])) as Record<UnitType, number>;
  for (const u of s.units) out[u.type]++;
  return out;
}
