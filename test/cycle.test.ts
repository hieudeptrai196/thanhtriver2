import { describe, expect, it } from 'vitest';
import { dayLength, duskLength, nightLength } from '../src/sim/difficulty';
import { Sim } from '../src/sim/sim';
import { passDawn, runUntil } from './helpers';

describe('day / night cycle', () => {
  it('phase lengths follow the three GDD stages', () => {
    expect([dayLength(1), dayLength(2), dayLength(3), dayLength(6), dayLength(7), dayLength(30)]).toEqual([150, 150, 165, 165, 180, 180]);
    expect([duskLength(1), duskLength(4), duskLength(9)]).toEqual([20, 25, 30]);
    expect([nightLength(1), nightLength(5), nightLength(12)]).toEqual([100, 130, 150]);
  });

  it('runs day → dusk → night → dawn → day with the right durations', () => {
    const sim = Sim.create(5);
    const s = sim.state;
    expect(s.phase).toBe('day');
    const dayTicks = runUntil(sim, () => s.phase === 'dusk');
    expect(dayTicks / 60).toBeCloseTo(dayLength(1), 0);
    const duskTicks = runUntil(sim, () => s.phase === 'night');
    expect(duskTicks / 60).toBeCloseTo(duskLength(1), 0);
    const nightTicks = runUntil(sim, () => s.phase !== 'night');
    expect(s.phase).toBe('dawn');
    expect(nightTicks / 60).toBeCloseTo(nightLength(1), 0);
    expect(s.night).toBe(2);
    expect(s.stats.nightsSurvived).toBe(1);
    // Dawn waits for both choices.
    const tick = s.tick;
    sim.step();
    expect(s.tick).toBe(tick);
    passDawn(sim);
    expect(s.phase).toBe('day');
    expect(s.phaseLength).toBeCloseTo(dayLength(2), 5);
  });

  it('the castle cannot start moving at dusk or night', () => {
    const sim = Sim.create(6);
    const s = sim.state;
    s.castle.destX = 48;
    runUntil(sim, () => s.phase === 'dusk');
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(false);
    runUntil(sim, () => s.phase === 'night');
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(false);
    expect(sim.drainEvents().some((e) => e.key === 'msg.cantMoveNight')).toBe(true);
  });

  it('a moving castle is forced to stop at dusk', () => {
    const sim = Sim.create(7);
    const s = sim.state;
    s.castle.destX = 480;
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(true);
    runUntil(sim, () => s.phase === 'dusk');
    expect(s.castle.moving).toBe(false);
  });

  it('a broken wheel blocks moving until repaired', () => {
    const sim = Sim.create(8);
    const s = sim.state;
    s.castle.destX = 48;
    s.castle.wheelHp = 0;
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(false);
    // The builder repairs it on their own.
    runUntil(sim, () => s.castle.wheelHp > 0, 60 * 30);
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(true);
  });
});
