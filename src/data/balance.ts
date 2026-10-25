// Every tunable number in the game lives here.

export type Res = 'wood' | 'stone' | 'food' | 'gold';
export type Cost = Partial<Record<Res, number>>;

export type UnitType = 'peasant' | 'builder' | 'spear' | 'shield' | 'archer';
export type DamageType = 'physical' | 'piercing' | 'siege';
export type Formation = 'line' | 'ring';
export type MonsterType = 'fast' | 'brute' | 'ranged' | 'boss';
export type RoomType = 'house' | 'barracks' | 'range' | 'workshop' | 'watchtower';
export type StructType = 'wall' | 'tower' | 'torch';
export type NodeType = 'tree' | 'rock' | 'bush';
export type TerrainType = 'plains' | 'forest' | 'canyon';
export type Dir = 'N' | 'E' | 'S' | 'W';
export type AbilityId = 'arrowRain' | 'bell';
export type CardId =
  | 'soldierHp'
  | 'towerRate'
  | 'moveSpeed'
  | 'carry'
  | 'torchRadius'
  | 'wallHp'
  | 'repairSpeed'
  | 'extraSlot'
  | 'archerDmg'
  | 'coreHeal';

export const UNIT_TYPES: UnitType[] = ['peasant', 'builder', 'spear', 'shield', 'archer'];
export const SOLDIER_TYPES: UnitType[] = ['spear', 'shield', 'archer'];

export const BALANCE = {
  tickRate: 60,

  phases: {
    // GDD v1.2 pacing in three stages: nights 1–2, 3–6, 7+.
    stageFrom: [1, 3, 7],
    day: [150, 165, 180],
    dusk: [20, 25, 30],
    night: [100, 130, 150],
    rampNights: 10,
    waveRest: 12,
    wavesEarly: 2, // nights < wavesThreeFrom
    wavesLate: 3,
    wavesThreeFrom: 3,
    waveSpawnSpread: 14, // seconds to trickle in one wave
  },

  difficulty: {
    baseCount: 20,
    growth: 1.25,
    maxAlive: 80,
    overflowHpPerSkipped: 0.5, // skipped spawn adds this × its hp to the next spawn
    overflowHpCap: 4,
    dangerPerChunk: 0.06, // monster hp/damage multiplier per chunk travelled
    dirsByNight: [
      { from: 1, dirs: 2 },
      { from: 3, dirs: 3 },
      { from: 7, dirs: 4 },
    ],
    stayExtraDirs: 1,
    awarenessPerNight: 0.12, // extra monsters per night camped beyond the second at the same spot
    campRadius: 8, // stopping within this distance of last night's spot counts as the same camp
    newRegionMaxDirs: 2,
    rangedFrom: 3,
    bossEvery: 5,
    // Night pressure patterns (GDD v1.2 §2.2): first night from which each can be drawn.
    patternFrom: { breach: 1, harass: 1, split: 2, ranged: 3, siege: 4 } as Record<'breach' | 'harass' | 'split' | 'ranged' | 'siege', number>,
    twoPatternsFrom: 3,
    breachMainShare: 0.6,
    breachBrute: 0.1, // added to the brute share
    harassShare: 0.25, // of the night's monsters come as fast raiders on a flank
    rangedMix: 0.4,
    siegeWaves: 4,
    siegeBrute: 0.15,
    mix: { fast: 0.45, brute: 0.4, ranged: 0.15 },
    dayWanderEvery: 35,
    dayWanderMax: 2,
    dayWanderFrom: 2, // first night whose day has stragglers
    dayDefendRadius: 18, // idle spearmen chase monsters this close to the castle by day
  },

  world: {
    chunkLength: 48,
    gridSize: 80, // nav grid cells per side, centered on the castle
    roadHalfWidth: 2.5,
    canyonCliffZ: 11,
    keepChunksBehind: 1,
    genChunksAhead: 3,
    richnessPerChunk: 0.06,
    // Reserves are finite and never regrow: a camp runs dry by how much is taken, not by a clock.
    exhaustedPct: 0.25, // below this share left, dawn warns that the area is running dry
    // Resource nodes per chunk by terrain.
    nodes: {
      plains: { tree: 14, rock: 5, bush: 16 },
      forest: { tree: 46, rock: 4, bush: 6 },
      canyon: { tree: 5, rock: 8, bush: 4 },
    } as Record<TerrainType, Record<NodeType, number>>,
    nodeAmount: { tree: 60, rock: 80, bush: 40 } as Record<NodeType, number>,
    nodeRes: { tree: 'wood', rock: 'stone', bush: 'food' } as Record<NodeType, Res>,
    terrainDirs: {
      plains: ['N', 'E', 'S', 'W'],
      forest: ['N', 'E', 'S', 'W'],
      canyon: ['E', 'W'],
    } as Record<TerrainType, Dir[]>,
    // Terrain weights for chunks after the first one.
    terrainWeights: { plains: 4, forest: 3, canyon: 2 } as Record<TerrainType, number>,
    spawnDistance: 37,

  },

  castle: {
    halfSize: 3, // castle footprint is (2*halfSize)^2 cells
    coreHp: 800,
    wallHp: 700,
    wheelHp: 150,
    wheelDamageShare: 0.06, // fraction of melee damage on the castle that also hits the wheel
    moveSpeed: 1.6,
    lightRadius: 11,
    watchtowerLight: 5,
    basePop: 10,
    startRes: { wood: 150, stone: 40, food: 50, gold: 0 } as Record<Res, number>,
    tier2Cost: { wood: 200, stone: 100, gold: 50 } as Cost,
    slotsByTier: [4, 8],
    maxSlots: 12,
    stationRadius: 4.2, // archers stand on the castle wall here
    stationRangeBonus: 2,
    fireChancePerNight: 0.45,
    fireDps: 4,
    fireWork: 6, // builder-seconds to put out
    strangerChancePerDay: 0.5,
    strangerCount: 2,
  },

  units: {
    peasant: { hp: 40, speed: 3.4, dmg: 2, range: 1.2, cooldown: 1.2, cost: { food: 15 } as Cost, train: 6, carry: 10, gatherTime: 3 },
    builder: { hp: 50, speed: 3.2, dmg: 3, range: 1.2, cooldown: 1.2, cost: { food: 15, wood: 10 } as Cost, train: 7, buildRate: 10, repairRate: 12 },
    spear: { hp: 110, speed: 3.6, dmg: 14, range: 1.6, cooldown: 1.0, cost: { food: 20, wood: 15 } as Cost, train: 8, aggro: 7 },
    // Shieldbearer (GDD v1.2 §9.1): soaks pressure in front of the archers, shrugs off arrows, hard to push.
    shield: { hp: 190, speed: 3.0, dmg: 6, range: 1.5, cooldown: 1.2, cost: { food: 20, wood: 10, stone: 10 } as Cost, train: 9, aggro: 5 },
    archer: { hp: 60, speed: 3.4, dmg: 8, range: 9, cooldown: 1.3, cost: { food: 20, wood: 25 } as Cost, train: 8, aggro: 10 },
  },
  // Damage taken multipliers by damage type; 1 when not listed.
  resist: {
    shield: { piercing: 0.5 },
  } as Partial<Record<UnitType, Partial<Record<DamageType, number>>>>,
  // How hard a unit is to shove when monsters press into it (0 = immovable).
  shove: { peasant: 0.6, builder: 0.6, spear: 0.25, shield: 0, archer: 0.5 } as Record<UnitType, number>,
  frontage: 3, // most melee monsters that can hit one unit at once
  squads: { count: 5, defaultOf: { spear: 1, shield: 2, archer: 3 } as Partial<Record<UnitType, number>> },
  formation: { spacing: 1.1, rowGap: 1.8 },
  startUnits: { peasant: 4, builder: 1, spear: 3, shield: 0, archer: 0 } as Record<UnitType, number>,
  foodPerUnit: 1,
  // Hunger (GDD v1.2): no sudden HP loss. A short dawn weakens everyone; a second one in a row also
  // makes one villager leave. Eating fully at dawn clears it.
  hunger: { weak: 0.8, starving: 0.6, desertFrom: 2 },
  unitRadius: 0.4,

  monsters: {
    fast: { hp: 28, speed: 4.6, dmg: 6, range: 1.2, cooldown: 0.9, gold: 1, radius: 0.4 },
    brute: { hp: 90, speed: 2.1, dmg: 16, range: 1.4, cooldown: 1.5, gold: 2, radius: 0.6 },
    ranged: { hp: 40, speed: 2.8, dmg: 7, range: 7, cooldown: 1.8, gold: 2, radius: 0.45 },
    boss: { hp: 1000, speed: 1.6, dmg: 28, range: 2, cooldown: 2.2, gold: 50, radius: 1.2 },
  } as Record<MonsterType, { hp: number; speed: number; dmg: number; range: number; cooldown: number; gold: number; radius: number }>,
  monsterDamage: { fast: 'physical', brute: 'siege', ranged: 'piercing', boss: 'siege' } as Record<MonsterType, DamageType>,
  monsterGrowthPerNight: 0.06, // hp multiplier per night
  boss: { slamEvery: 7, slamWarn: 1.6, slamRadius: 4.5, slamDmg: 80 },
  fastTargetRange: 14,

  rooms: {
    house: { cost: { wood: 40 } as Cost, pop: 3, trains: ['peasant'] as UnitType[], tier: 1 },
    barracks: { cost: { wood: 60, stone: 20 } as Cost, pop: 0, trains: ['spear', 'shield'] as UnitType[], tier: 1 },
    range: { cost: { wood: 60 } as Cost, pop: 0, trains: ['archer'] as UnitType[], tier: 2 },
    workshop: { cost: { wood: 50 } as Cost, pop: 0, trains: ['builder'] as UnitType[], tier: 1 },
    watchtower: { cost: { wood: 40, stone: 30 } as Cost, pop: 0, trains: [] as UnitType[], tier: 1 },
  } as Record<RoomType, { cost: Cost; pop: number; trains: UnitType[]; tier: number }>,
  roomQueueMax: 5,
  watchtowerShot: { dmg: 12, range: 13, cooldown: 1.4 },
  synergy: {
    barracksWorkshopSpearHp: 0.15,
    watchtowerRangeArcherRange: 0.2,
  },
  startRooms: ['house', 'workshop'] as RoomType[],

  structs: {
    wall: { cost: { wood: 10 } as Cost, hp: 160, work: 3, blocks: true, light: 0 },
    tower: { cost: { wood: 40, stone: 15 } as Cost, hp: 140, work: 8, blocks: true, light: 3.5, dmg: 8, range: 10, cooldown: 1.2 },
    torch: { cost: { wood: 8 } as Cost, hp: 40, work: 2, blocks: false, light: 7 },
  } as Record<StructType, { cost: Cost; hp: number; work: number; blocks: boolean; light: number; dmg?: number; range?: number; cooldown?: number }>,
  refundShare: 0.3,
  repairWoodPerHp: 0.08, // repairs cost wood; no wood, no repairs
  emergencyWall: 0.35, // builders drop everything to patch the castle wall below this share
  economy: {
    laborDefault: { food: 2, wood: 2, stone: 1 } as Record<'food' | 'wood' | 'stone', number>,
    dropTtl: 120, // seconds a dropped load stays on the ground
    incomeWindow: 60, // seconds averaged for the income readout
    hungryFoodWeight: 2, // food priority doubles when fewer than two dawns are covered
  },
  dismantleWork: 2,
  wallPathCost: 9, // flow-field cost for walking through a wall (monsters smash it)

  abilities: {
    arrowRain: { cooldown: 60, radius: 6, dmg: 70, tier: 1 },
    bell: { cooldown: 90, heal: 0.2, tier: 1 },
  } as Record<AbilityId, { cooldown: number; radius?: number; dmg?: number; heal?: number; tier: number }>,

  cards: {
    soldierHp: 0.2,
    towerRate: 0.25,
    moveSpeed: 2,
    carry: 0.5,
    torchRadius: 0.3,
    wallHp: 0.3,
    repairSpeed: 2,
    extraSlot: 1,
    archerDmg: 0.25,
    coreHeal: 0.4,
  } as Record<CardId, number>,

  warnings: { coreLow: 0.3, wallLow: 0.25 },

  score: { perNight: 100, perKill: 1, perBoss: 500 },

  route: { stayCards: 1, aheadChoices: 2 },
};

export const CARD_IDS = Object.keys(BALANCE.cards) as CardId[];
export const ROOM_TYPES = Object.keys(BALANCE.rooms) as RoomType[];
export const STRUCT_TYPES = Object.keys(BALANCE.structs) as StructType[];

export function lerpByNight(night: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (night - 1) / (BALANCE.phases.rampNights - 1)));
  return a + (b - a) * t;
}
