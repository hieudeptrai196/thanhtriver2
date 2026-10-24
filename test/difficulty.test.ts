import { describe, expect, it } from 'vitest';
import { dirCount, monsterCount } from '../src/sim/difficulty';
import { Sim } from '../src/sim/sim';
import { passDawn, runUntil } from './helpers';

describe('difficulty', () => {
  it('monster count grows by 1.25 per night', () => {
    expect(monsterCount(1)).toBe(20);
    expect(monsterCount(2)).toBe(25);
    expect(monsterCount(5)).toBe(Math.round(20 * 1.25 ** 4));
  });

  it('attack directions by night, stay bonus, new region cap and terrain cap', () => {
    expect(dirCount(1, false, false, 'plains')).toBe(2);
    expect(dirCount(3, false, false, 'plains')).toBe(3);
    expect(dirCount(7, false, false, 'plains')).toBe(4);
    expect(dirCount(2, true, false, 'plains')).toBe(3);
    expect(dirCount(5, false, true, 'plains')).toBe(2);
    expect(dirCount(8, true, false, 'canyon')).toBe(2);
  });

  it('staying in place adds one direction to the next night plan', () => {
    const sim = Sim.create(11);
    const s = sim.state;
    runUntil(sim, () => s.phase === 'dawn', 60 * 400);
    passDawn(sim, 0);
    runUntil(sim, () => s.phase === 'dusk', 60 * 400);
    expect(s.plan!.dirs.length).toBe(3); // night 2: base 2 + 1 for staying
  });

  it('moving to a new stop caps the first night at two directions', () => {
    const sim = Sim.create(11);
    const s = sim.state;
    runUntil(sim, () => s.phase === 'dawn', 60 * 400);
    passDawn(sim, 1);
    s.night = 7; // would be 4 directions on old ground
    sim.apply([{ t: 'toggleMove' }]);
    runUntil(sim, () => s.phase === 'dusk', 60 * 400);
    expect(s.newRegion).toBe(true);
    expect(s.plan!.dirs.length).toBeLessThanOrEqual(2);
  });

  it('the night plan spawns about the planned number of monsters', () => {
    const sim = Sim.create(12);
    const s = sim.state;
    runUntil(sim, () => s.phase === 'night', 60 * 400);
    const plan = s.plan!;
    runUntil(sim, () => s.phase !== 'night', 60 * 400);
    const spawned = plan.waves.reduce((a, w) => a + w.spawned, 0);
    expect(Math.abs(spawned - plan.total)).toBeLessThanOrEqual(plan.waves.length);
  });
});
