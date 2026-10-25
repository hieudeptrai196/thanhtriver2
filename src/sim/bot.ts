import { BALANCE, type CardId, type RoomType, type StructType } from '../data/balance';
import { canAfford, groupCounts, popCap, popUsed, slotCount, Sim } from './sim';
import type { Command } from './types';

const CARD_PRIORITY: CardId[] = ['wallHp', 'soldierHp', 'towerRate', 'archerDmg', 'extraSlot', 'repairSpeed', 'carry', 'torchRadius', 'moveSpeed', 'coreHeal'];
const ROOM_PLAN: RoomType[] = ['house', 'workshop', 'barracks', 'watchtower', 'house', 'range', 'watchtower', 'house', 'barracks', 'house', 'watchtower', 'house'];
const WANT = { peasant: 6, builder: 2, spear: 10, archer: 8 };

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
  if (s.phase === 'gameover' || s.tick % 30 !== 0) return out;
  const c = s.castle;

  if (s.phase === 'day' && !c.moving && Math.abs(c.destX - c.x) > 0.5 && s.phaseTime > 3 && c.wheelHp > 0) out.push({ t: 'toggleMove' });

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
      const type = BALANCE.rooms[r.type].trains;
      if (!type || counts[type] >= WANT[type]) continue;
      if (canAfford(s, BALANCE.units[type].cost) && s.res.food > 25) {
        out.push({ t: 'queueUnit', slot: i });
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
      const off = Math.floor(idx / dirs.length) * 3 - 1.5;
      const pos = d === 'E' ? { x: c.x + r, z: off } : d === 'W' ? { x: c.x - r, z: off } : d === 'N' ? { x: c.x + off, z: -r } : { x: c.x + off, z: r };
      if (sim.canBuildAt(type, pos) && canAfford(s, BALANCE.structs[type].cost)) out.push({ t: 'build', type, pos });
    };
    if (torches < 4 && s.res.wood > 40) place('torch', 12, torches);
    else if (towers < 4 && s.res.wood > 90) place('tower', 7, towers);
  }

  // Abilities.
  if (s.phase === 'night') {
    const near = s.monsters.filter((m) => Math.hypot(m.x - c.x, m.z - c.z) < 10);
    if (near.length >= 5 && s.cooldowns.arrowRain <= 0) {
      const x = near.reduce((a, m) => a + m.x, 0) / near.length;
      const z = near.reduce((a, m) => a + m.z, 0) / near.length;
      out.push({ t: 'ability', id: 'arrowRain', pos: { x, z } });
    }
    if (c.coreHp / c.coreMax < 0.35 && s.cooldowns.bell <= 0) out.push({ t: 'ability', id: 'bell' });
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
  const sim = Sim.create(seed);
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
