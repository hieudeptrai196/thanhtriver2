import { BALANCE, type CardId, type RoomType, type StructType } from '../data/balance';
import { canAfford, groupCounts, loadLevel, popCap, popUsed, slotCount, structCost, unitCost, Sim } from './sim';
import type { Command } from './types';

const CARD_PRIORITY: CardId[] = ['wallHp', 'soldierHp', 'fieldRepair', 'reserve', 'towerRate', 'archerDmg', 'chokeHold', 'extraSlot', 'lightPack', 'carry', 'torchRadius', 'quickSalvage', 'moveSpeed', 'coreHeal'];
const ROOM_PLAN: RoomType[] = ['house', 'workshop', 'barracks', 'watchtower', 'kitchen', 'range', 'storage', 'house', 'barracks', 'house', 'watchtower', 'house'];
const WANT = { peasant: 6, builder: 2, spear: 7, shield: 4, archer: 8 };

/**
 * Bot policies from GDD v1.2 §16: Hold camps as long as the land feeds it, Nomad moves every dawn,
 * Tactical weighs reserves against how well the enemy knows the camp.
 */
export type BotPolicy = 'hold' | 'nomad' | 'tactical';
export const BOT_POLICIES: BotPolicy[] = ['hold', 'nomad', 'tactical'];

function wantsToMove(sim: Sim, policy: BotPolicy): boolean {
  const s = sim.state;
  const stay = s.routes[0];
  if (policy === 'nomad') return true;
  if (policy === 'hold') return stay.resourcePct < 0.12;
  return stay.resourcePct < 0.4 || s.castle.nightsHere >= 3;
}

/** A simple headless commander used by `npm run sim`, the balance tests and the in-game AI player. */
export function botCommands(sim: Sim, policy: BotPolicy = 'tactical'): Command[] {
  const s = sim.state;
  const out: Command[] = [];
  if (s.phase === 'dawn') {
    if (s.doctrineOffer) out.push({ t: 'pickDoctrine', doctrine: policy === 'nomad' ? 'caravan' : 'fortress' });
    if (!s.cardPicked) {
      const pick = s.castle.coreHp / s.castle.coreMax < 0.5 && s.cards.includes('coreHeal') ? 'coreHeal' : CARD_PRIORITY.find((c) => s.cards.includes(c))!;
      out.push({ t: 'pickCard', id: pick });
    }
    if (!s.routePicked) {
      const stay = s.routes[0];
      const ahead = s.routes.slice(1).sort((a, b) => a.danger - b.danger || a.dirs - b.dirs)[0];
      const move = wantsToMove(sim, policy);
      out.push({ t: 'pickRoute', id: move && ahead ? ahead.id : stay.id });
    }
    return out;
  }
  if (s.phase === 'gameover' || s.phase === 'victory' || s.tick % 30 !== 0) return out;
  const c = s.castle;

  if (s.phase === 'day' && !c.moving && Math.abs(c.destX - c.x) > 0.5 && s.phaseTime > 3 && c.wheelHp > 0) {
    out.push(loadLevel(s) === 'overloaded' ? { t: 'dumpCargo' } : { t: 'toggleMove' });
  }

  // Rooms.
  const n = slotCount(s);
  for (let i = 0; i < n; i++) {
    if (s.rooms[i]) continue;
    const want = ROOM_PLAN[i];
    if (want && BALANCE.rooms[want].tier <= c.tier && canAfford(s, BALANCE.rooms[want].cost)) out.push({ t: 'placeRoom', slot: i, type: want });
    break;
  }
  if (c.tier === 1 && s.rooms.slice(0, n).every(Boolean) && canAfford(s, BALANCE.castle.tier2Cost)) out.push({ t: 'upgradeTier' });

  // Units.
  const counts = groupCounts(s);
  if (popUsed(s) < popCap(s)) {
    for (let i = 0; i < n; i++) {
      const r = s.rooms[i];
      if (!r || r.queue.length > 0) continue;
      const type = BALANCE.rooms[r.type].trains.find((t) => counts[t] < WANT[t]);
      if (!type) continue;
      if (canAfford(s, unitCost(s, type)) && s.res.food > 25) {
        out.push({ t: 'queueUnit', slot: i, type });
        break;
      }
    }
  }

  // Outside defences: towers and torches towards the coming directions.
  if (!c.moving && s.phase !== 'night' && counts.builder > 0) {
    const dirs = s.plan?.dirs ?? ['E', 'W'];
    const towers = s.structs.filter((x) => x.type === 'tower').length;
    const torches = s.structs.filter((x) => x.type === 'torch').length;
    const place = (type: StructType, r: number, idx: number) => {
      const d = dirs[idx % dirs.length];
      const k = Math.floor(idx / dirs.length);
      const off = k * 3 - 1.5;
      // East and west lanes run along the railway: build beside it, not on it.
      const side = (k % 2 ? 1 : -1) * (BALANCE.world.roadHalfWidth + 1.5);
      const pos = d === 'E' ? { x: c.x + r, z: side } : d === 'W' ? { x: c.x - r, z: side } : d === 'N' ? { x: c.x + off, z: -r } : { x: c.x + off, z: r };
      if (sim.canBuildAt(type, pos) && canAfford(s, structCost(s, type))) out.push({ t: 'build', type, pos });
    };
    if (torches < 4 && s.res.wood > 40) place('torch', 12, torches);
    else if (towers < 4 && s.res.wood > 90) place('tower', 7, towers);
  }

  // Tactical commander (GDD v1.2 §11.1): at dusk the melee forms a shield line across the heaviest lane,
  // the rest guard the castle; at daybreak everyone goes back to automatic work.
  if (policy === 'tactical') out.push(...tacticalOrders(sim));

  // Abilities.
  if (s.phase === 'night') {
    const near = s.monsters.filter((m) => Math.hypot(m.x - c.x, m.z - c.z) < 10);
    if (near.length >= 5 && s.cooldowns.arrowRain <= 0) {
      const x = near.reduce((a, m) => a + m.x, 0) / near.length;
      const z = near.reduce((a, m) => a + m.z, 0) / near.length;
      out.push({ t: 'ability', id: 'arrowRain', pos: { x, z } });
    }
    if (c.coreHp / c.coreMax < 0.35 && s.cooldowns.bell <= 0) out.push({ t: 'ability', id: 'bell' });
    // Emergency measures when the wall is about to go.
    if (c.wallHp / c.wallMax < 0.2 && s.cooldowns.seal <= 0) out.push({ t: 'ability', id: 'seal' });
    if (s.unlocked.includes('patch') && c.wallHp / c.wallMax < 0.4 && s.res.wood >= BALANCE.patch.wood && s.cooldowns.patch <= 0) out.push({ t: 'ability', id: 'patch' });
    if (s.unlocked.includes('reserve') && s.monsters.length > 12 && s.cooldowns.reserve <= 0) out.push({ t: 'ability', id: 'reserve' });
  }
  return out;
}

function tacticalOrders(sim: Sim): Command[] {
  const s = sim.state;
  const c = s.castle;
  const out: Command[] = [];
  const melee = s.units.filter((u) => (u.type === 'shield' || u.type === 'spear') && !s.reserveIds.includes(u.id));
  if (s.phase === 'dusk' && s.plan && s.phaseTime > 2 && melee.length >= 3 && !melee.some((u) => u.order?.kind === 'hold')) {
    const main = s.plan.weights.indexOf(Math.max(...s.plan.weights));
    const dir = s.plan.dirs[main];
    const v = dir === 'E' ? [1, 0] : dir === 'W' ? [-1, 0] : dir === 'N' ? [0, -1] : [0, 1];
    const pos = { x: c.x + v[0] * 6.5, z: c.z + v[1] * 6.5 };
    // Keep a couple of spears home when raiders are coming for the workers.
    const keep = s.plan.patterns.includes('harass') ? 2 : 0;
    const line = melee.slice(0, Math.max(3, melee.length - keep)).map((u) => u.id);
    out.push({ t: 'setFormation', formation: 'line' }, { t: 'selectUnits', ids: line }, { t: 'order', pos, mode: 'hold' }, { t: 'selectUnits', ids: [] });
  }
  if (s.phase === 'day' && s.phaseTime < 2 && s.units.some((u) => u.order?.kind === 'hold')) {
    out.push({ t: 'selectUnits', ids: s.units.filter((u) => u.order?.kind === 'hold').map((u) => u.id) }, { t: 'releaseUnits' });
  }
  return out;
}

export interface BotRun {
  seed: number;
  policy: BotPolicy;
  nights: number;
  kills: number;
  ticks: number;
  stays: number;
  moves: number;
  cause: string;
  hash: string;
}

export function runBot(seed: number, maxNights = 30, policy: BotPolicy = 'tactical', maxTicks = 60 * 60 * 150): BotRun {
  const sim = Sim.create(seed, 'endless');
  let ticks = 0;
  while (sim.state.phase !== 'gameover' && sim.state.night <= maxNights && ticks < maxTicks) {
    sim.apply(botCommands(sim, policy));
    sim.step();
    sim.drainEvents();
    ticks++;
  }
  const h = sim.state.history;
  return {
    seed,
    policy,
    nights: sim.state.stats.nightsSurvived,
    kills: sim.state.stats.kills,
    ticks,
    stays: h.filter((r) => r.route === 'stay').length,
    moves: h.filter((r) => r.route === 'move').length,
    cause: sim.state.phase === 'gameover' ? sim.state.nightStats.cause || 'overrun' : 'alive',
    hash: sim.hash(),
  };
}
