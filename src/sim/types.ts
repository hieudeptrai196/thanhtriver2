import type {
  AbilityId,
  CardId,
  Dir,
  MonsterType,
  NodeType,
  Res,
  RoomType,
  StructType,
  TerrainType,
  UnitType,
} from '../data/balance';

export interface Vec {
  x: number;
  z: number;
}

export type Phase = 'day' | 'dusk' | 'night' | 'dawn' | 'gameover';

export type Job = 'gather' | 'deliver' | 'build' | 'repair' | 'guard' | 'shelter' | 'attack' | 'idle';

export interface Order {
  kind: 'move' | 'gather' | 'home' | 'repair' | 'dismantle';
  pos: Vec;
  targetId?: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  job: Job;
  order: Order | null;
  targetId: number; // resource/struct/monster id, -1 when none
  carry: number;
  carryRes: Res | null;
  work: number; // seconds of progress on the current action
  cooldown: number;
  inside: boolean; // sheltered inside the castle
  slot: number; // follow slot around the castle while moving
}

export interface Monster {
  id: number;
  type: MonsterType;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  dmgMult: number;
  cooldown: number;
  targetId: number; // unit id it is chasing, -1 when none
  slamTimer: number; // boss only
  slamAt: Vec | null; // boss telegraph target
  wander: boolean; // daytime straggler
}

export interface ResourceNode {
  id: number;
  type: NodeType;
  x: number;
  z: number;
  amount: number;
  max: number;
  chunk: number;
}

export interface Structure {
  id: number;
  type: StructType;
  cx: number; // grid-independent integer world cell
  cz: number;
  hp: number;
  maxHp: number;
  built: number; // 0..1 construction progress
  dismantle: boolean; // marked for dismantling
  cooldown: number;
}

export interface Room {
  type: RoomType;
  queue: UnitType[];
  progress: number;
}

export interface WavePlan {
  dirs: Dir[];
  weights: number[]; // share of monsters per direction
  total: number;
  waves: { start: number; count: number; spawned: number; boss: boolean }[];
}

export interface RouteOption {
  id: number; // 0 = stay, 1.. = chunks ahead
  chunk: number;
  terrain: TerrainType;
  mainRes: Res;
  dirs: number;
  danger: number; // 1..5
  resourcePct: number; // only for stay
  travel: number; // seconds of daylight needed
  exhausted: boolean; // only for stay: the land no longer regrows or is nearly empty
}

export interface Mods {
  soldierHp: number;
  towerRate: number;
  moveSpeed: number;
  carry: number;
  torchRadius: number;
  wallHp: number;
  repairSpeed: number;
  extraSlots: number;
  archerDmg: number;
}

export interface NightStats {
  kills: number;
  lost: number;
  gold: number;
  food: number;
  hungry: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  tick: number;
  nextId: number;
  phase: Phase;
  phaseTime: number; // seconds elapsed in phase
  phaseLength: number;
  night: number; // the night that is coming (or running)
  res: Record<Res, number>;
  castle: {
    x: number;
    z: number;
    chunk: number;
    anchorX: number; // x where the nav grid is centered
    coreHp: number;
    coreMax: number;
    wallHp: number;
    wallMax: number;
    wheelHp: number;
    wheelMax: number;
    tier: number;
    moving: boolean;
    destX: number;
    destChunk: number;
    fire: number; // remaining fire work, 0 = no fire
    lastNightX: number;
    nightsHere: number; // consecutive nights at the same spot
  };
  rooms: (Room | null)[];
  units: Unit[];
  monsters: Monster[];
  nodes: ResourceNode[];
  structs: Structure[];
  genChunk: number; // highest chunk generated
  selected: number; // selected group index into UNIT_TYPES, -1 none
  selectedIds: number[]; // hand-picked units (box or click); takes priority over the group
  groupOrders: Record<UnitType, Order | null>;
  cooldowns: Record<AbilityId, number>;
  mods: Mods;
  cards: CardId[]; // card offer at dawn
  cardPicked: boolean;
  routes: RouteOption[];
  routePicked: boolean;
  plan: WavePlan | null;
  overflowHp: number;
  wanderTimer: number;
  stats: { kills: number; bosses: number; nightsSurvived: number };
  nightStats: NightStats;
  strangerDone: boolean;
  fireDone: boolean;
  newRegion: boolean;
}

export type Command =
  | { t: 'selectGroup'; group: number }
  | { t: 'selectUnits'; ids: number[] }
  | { t: 'releaseUnits' }
  | { t: 'order'; pos: Vec; targetId?: number }
  | { t: 'orderAll'; kind: 'home' }
  | { t: 'build'; type: StructType; pos: Vec }
  | { t: 'dismantle'; pos: Vec }
  | { t: 'placeRoom'; slot: number; type: RoomType }
  | { t: 'queueUnit'; slot: number }
  | { t: 'upgradeTier' }
  | { t: 'toggleMove' }
  | { t: 'ability'; id: AbilityId; pos?: Vec }
  | { t: 'pickCard'; id: CardId }
  | { t: 'pickRoute'; id: number };

export interface GameEvent {
  key: string; // i18n message key, or fx:* for render/audio only
  params?: Record<string, string | number>;
  pos?: Vec;
  to?: Vec;
  level?: 'info' | 'warn' | 'danger';
}
