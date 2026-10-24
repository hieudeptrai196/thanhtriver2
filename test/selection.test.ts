import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { runSeconds } from './helpers';

describe('hand-picked units', () => {
  it('only the picked units take the order, spread around the point', () => {
    const sim = Sim.create(50);
    const s = sim.state;
    const spears = s.units.filter((u) => u.type === 'spear');
    const picked = spears.slice(0, 2).map((u) => u.id);
    sim.apply([{ t: 'selectUnits', ids: picked }, { t: 'order', pos: { x: 15.5, z: 9.5 } }]);
    const ordered = s.units.filter((u) => picked.includes(u.id));
    for (const u of ordered) expect(u.order?.kind).toBe('move');
    expect(ordered[0].order!.pos).not.toEqual(ordered[1].order!.pos);
    expect(spears[2].order).toBeNull();
    expect(s.groupOrders.spear).toBeNull();
    runSeconds(sim, 8);
    for (const u of s.units.filter((x) => picked.includes(x.id))) expect(Math.hypot(u.x - 15.5, u.z - 9.5)).toBeLessThan(3);
  });

  it('mixed types each read the order their own way', () => {
    const sim = Sim.create(51);
    const s = sim.state;
    const peasant = s.units.find((u) => u.type === 'peasant')!;
    const spear = s.units.find((u) => u.type === 'spear')!;
    sim.apply([{ t: 'selectUnits', ids: [peasant.id, spear.id] }, { t: 'order', pos: { x: -12.5, z: 8.5 } }]);
    expect(peasant.order?.kind).toBe('gather');
    expect(spear.order?.kind).toBe('move');
  });

  it('release puts them back to automatic work and clears the pick', () => {
    const sim = Sim.create(52);
    const s = sim.state;
    const spear = s.units.find((u) => u.type === 'spear')!;
    sim.apply([{ t: 'selectUnits', ids: [spear.id] }, { t: 'order', pos: { x: 10.5, z: 10.5 } }, { t: 'releaseUnits' }]);
    expect(spear.order).toBeNull();
    expect(s.selectedIds).toEqual([]);
  });

  it('picking a group clears the hand-picked units and vice versa', () => {
    const sim = Sim.create(53);
    const s = sim.state;
    sim.apply([{ t: 'selectUnits', ids: [s.units[0].id] }]);
    expect(s.selected).toBe(-1);
    sim.apply([{ t: 'selectGroup', group: 2 }]);
    expect(s.selectedIds).toEqual([]);
  });

  it('old saves without the field still load', () => {
    const sim = Sim.create(54);
    const raw = JSON.parse(sim.save());
    delete raw.selectedIds;
    const loaded = Sim.load(JSON.stringify(raw));
    expect(loaded.state.selectedIds).toEqual([]);
  });
});
