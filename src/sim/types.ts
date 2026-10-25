import type {
  AbilityId,
  Doctrine,
  Formation,
  GameMode,
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

export type Phase = 'day' | 'dusk' | 'night' | 'dawn' | 'gameover' | 'victory';

export type Job = 'gather' | 'deliver' | 'build' | 'repair' | 'guard' | 'shelter' | 'attack' | 'idle';

export interface Order {
  // move = go there, fight what comes (flexible); hold = stand, hit only what reaches; guard = stay by a
  // unit/building/castle and intercept; focus = hunt one monster; retreat = run home without fighting.
  kind: 'move' | 'gather' | 'home' | 'repair' | 'dismantle' | 'hold' | 'guard' | 'focus' | 'retreat';
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
  workRes: Res | null; // resource the labour AI assigned this peasant to
  squad: number; // 0 = none, 1..5
}

export interface Drop {
  id: number;
  x: number;
  z: number;
  res: Res;
  amount: number;
  ttl: number;
}

export type LaborRes = 'food' | 'wood' | 'stone';

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
  harass: boolean; // goes for workers, torches and towers instead of the walls
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

export type Pattern = 'breach' | 'harass' | 'split' | 'ranged' | 'siege' | 'boss';
export type Threat = 'low' | 'mid' | 'high';

/** Committed at dusk, before the warning is shown (GDD v1.2 §10.2); nothing the player does after changes it. */
export interface WavePlan {
  dirs: Dir[];
  weights: number[]; // share of monsters per direction
  total: number;
  waves: { start: number; count: number; spawned: number; boss: boolean }[];
  patterns: Pattern[];
  threat: Threat[]; // per entry in dirs
  mix: { fast: number; brute: number; ranged: number };
  harassDir: Dir | null; // flank lane of the harassing stream
  harassShare: number;
  confirmed: boolean; // a watchtower confirms the forecast; otherwise it is an estimate
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
  // Drawbacks and new effects of the v1.2 cards.
  soldierFood: number; // extra food per soldier trained
  towerCost: number; // extra wood per tower
  wheelMax: number; // multiplier
  peasantSpeed: number; // multiplier
  torchCost: number; // extra wood per torch
  torchConfirm: number; // 1 = a torch confirms the night forecast
  castleLoad: number; // extra load
  dismantleSpeed: number; // multiplier
  refundBonus: number; // added to the dismantle refund share
  archerCost: number; // extra wood per archer
  holdArmor: number; // damage cut while on Hold
  retreatSpeed: number; // multiplier while retreating
  loadCap: number; // added to capacity, as a share
  storageCap: number; // added to storage, as a share
  repairCost: number; // multiplier on wood per hp
}

export interface NightStats {
  kills: number;
  lost: number;
  gold: number;
  food: number;
  hungry: boolean;
  structLost: number;
  wallDamage: number;
  coreDamage: number;
  cause: string; // first serious failure of the night (message key), '' if none
  lostByType: Record<string, number>;
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
  hunger: number; // dawns in a row without enough food
  labor: Record<LaborRes, number>; // 0 = none … 3 = high
  drops: Drop[];
  deliveries: { tick: number; res: Res; n: number }[];
  repairDebt: number; // wood owed for repairs, paid a whole unit at a time
  formation: Formation;
  mode: GameMode;
  goalNights: number; // 0 = endless
  doctrine: Doctrine | null;
  doctrineOffer: boolean; // the dawn screen asks for a doctrine first
  unlocked: AbilityId[];
  sealTimer: number; // seconds the emergency seal still cuts damage
  sealed: boolean; // workers stay inside until dawn after sealing
  reserveIds: number[]; // militia called by the Reserve card, gone at dawn
  history: NightRecord[];
  fireDone: boolean;
  newRegion: boolean;
}

export interface NightRecord {
  night: number;
  route: 'stay' | 'move' | 'start';
  terrain: string;
  dirs: number;
  monsters: number;
  kills: number;
  lost: number;
  structLost: number;
  wallDamage: number;
  coreDamage: number;
  food: number;
  hungry: boolean;
  cause: string; // what broke first: msg key of the first serious event, or ''
}

export type Command =
  | { t: 'selectGroup'; group: number }
  | { t: 'selectUnits'; ids: number[] }
  | { t: 'releaseUnits' }
  | { t: 'setLabor'; res: LaborRes; priority: number }
  | { t: 'order'; pos: Vec; targetId?: number; mode?: 'move' | 'hold' | 'guard' | 'focus' | 'retreat' }
  | { t: 'assignSquad'; ids: number[]; squad: number }
  | { t: 'selectSquad'; squad: number }
  | { t: 'setFormation'; formation: Formation }
  | { t: 'pickDoctrine'; doctrine: Doctrine }
  | { t: 'dumpCargo' }
  | { t: 'orderAll'; kind: 'home' }
  | { t: 'build'; type: StructType; pos: Vec }
  | { t: 'dismantle'; pos: Vec }
  | { t: 'placeRoom'; slot: number; type: RoomType }
  | { t: 'queueUnit'; slot: number; type?: UnitType }
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
