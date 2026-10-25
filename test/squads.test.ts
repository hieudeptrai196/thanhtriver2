import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { Sim } from '../src/sim/sim';
import type { GameState, Monster } from '../src/sim/types';
import { runSeconds } from './helpers';

function monster(s: GameState, x: number, z: number, type: Monster['type'] = 'fast', hp = 400): Monster {
  const m: Monster = { id: s.nextId++, type, x, z, hp, maxHp: hp, dmgMult: 1, cooldown: 0, targetId: -1, slamTimer: 0, slamAt: null, wander: false, harass: false };
  s.monsters.push(m);
  return m;
}

describe('squads and tactical orders', () => {
  it('new soldiers join their default squad; squads can be selected and reassigned', () => {
    const sim = Sim.create(70);
    const s = sim.state;
    const spears = s.units.filter((u) => u.type === 'spear');
    expect(spears.every((u) => u.squad === BALANCE.squads.defaultOf.spear)).toBe(true);
    sim.apply([{ t: 'selectSquad', squad: 1 }]);
    expect(s.selectedIds.sort()).toEqual(spears.map((u) => u.id).sort());
    sim.apply([{ t: 'assignSquad', ids: [spears[0].id], squad: 4 }, { t: 'selectSquad', squad: 4 }]);
    expect(s.selectedIds).toEqual([spears[0].id]);
  });

  it('hold stands its ground and does not chase', () => {
    const sim = Sim.create(71);
    const s = sim.state;
    const u = s.units.find((x) => x.type === 'spear')!;
    sim.apply([{ t: 'selectUnits', ids: [u.id] }, { t: 'order', pos: { x: 12.5, z: 8.5 }, mode: 'hold' }]);
    runSeconds(sim, 12);
    expect(Math.hypot(u.x - 12.5, u.z - 8.5)).toBeLessThan(0.8);
    const m = monster(s, 16.5, 8.5);
    m.cooldown = 99; // it just stands there
    runSeconds(sim, 3);
    expect(Math.hypot(u.x - 12.5, u.z - 8.5)).toBeLessThan(0.8);
  });

  it('focus hunts one monster; retreat runs home without fighting', () => {
    const sim = Sim.create(72);
    const s = sim.state;
    const spears = s.units.filter((x) => x.type === 'spear');
    const target = monster(s, 14.5, 6.5, 'brute', 60);
    target.cooldown = 99;
    sim.apply([{ t: 'selectUnits', ids: spears.map((x) => x.id) }, { t: 'order', pos: { x: 14.5, z: 6.5 }, targetId: target.id, mode: 'focus' }]);
    runSeconds(sim, 10);
    expect(s.monsters.includes(target)).toBe(false);
    const u = spears[0];
    s.units = [u]; // only the retreating spearman is around
    u.x = 15.5;
    u.z = 10.5;
    const pest = monster(s, 16, 10.5, 'fast', 500);
    pest.cooldown = 99;
    sim.apply([{ t: 'order', pos: { x: 0, z: 0 }, mode: 'retreat' }]);
    const hp = pest.hp;
    runSeconds(sim, 2.5);
    expect(pest.hp).toBe(hp); // no fighting on the way back
    expect(u.order?.kind).toBe('retreat');
    runSeconds(sim, 6);
    expect(Math.hypot(u.x - s.castle.x, u.z - s.castle.z)).toBeLessThan(6);
  });

  it('guard protects a unit', () => {
    const sim = Sim.create(73);
    const s = sim.state;
    const peasant = s.units.find((x) => x.type === 'peasant')!;
    const spear = s.units.find((x) => x.type === 'spear')!;
    sim.apply([{ t: 'selectUnits', ids: [spear.id] }, { t: 'order', pos: { x: peasant.x, z: peasant.z }, targetId: peasant.id, mode: 'guard' }]);
    peasant.order = { kind: 'move', pos: { x: peasant.x, z: peasant.z } }; // keep the charge still
    runSeconds(sim, 10);
    expect(Math.hypot(spear.x - peasant.x, spear.z - peasant.z)).toBeLessThan(2);
    const m = monster(s, peasant.x + 4, peasant.z);
    m.cooldown = 99;
    const hp = m.hp;
    runSeconds(sim, 3);
    expect(m.hp).toBeLessThan(hp);
  });

  it('line formation puts melee in front and archers behind', () => {
    const sim = Sim.create(74);
    const s = sim.state;
    s.res = { wood: 999, stone: 999, food: 999, gold: 999 };
    const a = s.units.find((x) => x.type === 'spear')!;
    // Make two archers by hand.
    for (let i = 0; i < 2; i++) {
      s.units.push({ ...a, id: s.nextId++, type: 'archer', squad: 3, order: null });
    }
    const ids = s.units.filter((u) => u.type === 'spear' || u.type === 'archer').map((u) => u.id);
    sim.apply([{ t: 'setFormation', formation: 'line' }, { t: 'selectUnits', ids }, { t: 'order', pos: { x: 20.5, z: 0.5 } }]);
    const front = s.units.filter((u) => u.type === 'spear').map((u) => u.order!.pos.x);
    const back = s.units.filter((u) => u.type === 'archer').map((u) => u.order!.pos.x);
    expect(Math.min(...front)).toBeGreaterThan(Math.max(...back));
  });

  it('shieldbearers take half damage from arrows and stand their ground', () => {
    const sim = Sim.create(75);
    const s = sim.state;
    const base = s.units.find((x) => x.type === 'spear')!;
    const shield = { ...base, id: s.nextId++, type: 'shield' as const, hp: 190, maxHp: 190, x: 10.5, z: 6.5, order: { kind: 'hold' as const, pos: { x: 10.5, z: 6.5 } } };
    s.units = [shield];
    const r = monster(s, 15.5, 6.5, 'ranged', 999);
    runSeconds(sim, 3);
    const lost = 190 - shield.hp;
    const shots = Math.floor(3 / BALANCE.monsters.ranged.cooldown) + 1;
    expect(lost).toBeLessThanOrEqual(shots * BALANCE.monsters.ranged.dmg * r.dmgMult * 0.5 + 0.01);
    expect(Math.hypot(shield.x - 10.5, shield.z - 6.5)).toBeLessThan(0.8);
  });
});
