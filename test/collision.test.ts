import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { Sim } from '../src/sim/sim';

describe('bodies stay out of walls and the castle', () => {
  it('through a day and a night with a wooden wall beside the camp', () => {
    const sim = Sim.create(77);
    const s = sim.state;
    s.res.wood = 900;
    s.res.stone = 300;
    for (let x = -6; x <= 6; x++) sim.apply([{ t: 'build', type: 'wall', pos: { x: x + 0.5, z: 7.5 } }]);
    const h = BALANCE.castle.halfSize;
    const bad: string[] = [];
    for (let tick = 0; tick < 60 * 320; tick++) {
      sim.step();
      sim.drainEvents();
      if (s.phase === 'dawn') break;
      if (tick % 30) continue;
      const walls = s.structs.filter((st) => st.built >= 1 && BALANCE.structs[st.type].blocks);
      const check = (what: string, x: number, z: number) => {
        if (Math.abs(x - s.castle.x) < h + 0.2 && Math.abs(z - s.castle.z) < h - 0.05) bad.push(`${what} in castle at ${tick}`);
        if (walls.some((st) => Math.floor(x) === st.cx && Math.floor(z) === st.cz)) bad.push(`${what} in wall at ${tick}`);
      };
      for (const u of s.units) if (!u.inside && !(u.type === 'archer' && !u.order)) check(u.type, u.x, u.z);
      for (const m of s.monsters) check(m.type, m.x, m.z);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
