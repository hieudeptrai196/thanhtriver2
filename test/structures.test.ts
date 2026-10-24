import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { Sim } from '../src/sim/sim';
import { runUntil } from './helpers';

describe('outside buildings', () => {
  it('are left behind when the castle moves', () => {
    const sim = Sim.create(30);
    const s = sim.state;
    s.res.wood = 500;
    s.res.stone = 500;
    sim.apply([
      { t: 'build', type: 'tower', pos: { x: 10.5, z: 6.5 } },
      { t: 'build', type: 'torch', pos: { x: -10.5, z: 6.5 } },
    ]);
    expect(s.structs.length).toBe(2);
    const wood = s.res.wood;
    s.castle.destX = 48;
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(true);
    expect(s.structs.length).toBe(0);
    expect(s.res.wood).toBe(wood); // nothing refunded
  });

  it('refund 30% when builders dismantle them first', () => {
    const sim = Sim.create(31);
    const s = sim.state;
    s.res.wood = 500;
    s.res.stone = 500;
    sim.apply([{ t: 'build', type: 'tower', pos: { x: 8.5, z: 6.5 } }]);
    runUntil(sim, () => s.structs[0].built >= 1, 60 * 60);
    const before = { ...s.res };
    sim.apply([{ t: 'dismantle', pos: { x: 8.5, z: 6.5 } }]);
    runUntil(sim, () => s.structs.length === 0, 60 * 60);
    const cost = BALANCE.structs.tower.cost;
    expect(s.res.stone - before.stone).toBe(Math.floor(cost.stone! * 0.3));
    expect(s.res.wood - before.wood).toBeGreaterThanOrEqual(Math.floor(cost.wood! * 0.3));
  });

  it('cannot be built while the castle moves or without a workshop', () => {
    const sim = Sim.create(32);
    const s = sim.state;
    s.res.wood = 500;
    s.rooms = s.rooms.map((r) => (r?.type === 'workshop' ? null : r));
    sim.apply([{ t: 'build', type: 'wall', pos: { x: 10.5, z: 6.5 } }]);
    expect(s.structs.length).toBe(0);
  });

  it('rooms, synergy and tier 2', () => {
    const sim = Sim.create(33);
    const s = sim.state;
    s.res = { wood: 1000, stone: 1000, food: 1000, gold: 100 };
    // Slots: 0 house, 1 workshop (start). Slot 3 (1,1) touches the workshop at (1,0).
    sim.apply([{ t: 'placeRoom', slot: 3, type: 'barracks' }]);
    const spear = s.units.find((u) => u.type === 'spear')!;
    expect(spear.maxHp).toBe(Math.round(BALANCE.units.spear.hp * 1.15));
    sim.apply([{ t: 'placeRoom', slot: 2, type: 'range' }]);
    expect(s.rooms[2]).toBeNull(); // needs tier 2
    sim.apply([{ t: 'upgradeTier' }]);
    expect(s.castle.tier).toBe(2);
    sim.apply([{ t: 'placeRoom', slot: 5, type: 'range' }]);
    expect(s.rooms[5]?.type).toBe('range');
    const count = s.units.length;
    sim.apply([{ t: 'queueUnit', slot: 5 }]);
    runUntil(sim, () => s.units.length > count, 60 * 20);
    expect(s.units.some((u) => u.type === 'archer')).toBe(true);
  });
});
