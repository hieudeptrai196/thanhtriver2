import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

describe('pathfinding', () => {
  it('A* walks around a wall line', () => {
    const sim = Sim.create(20);
    const s = sim.state;
    s.res.wood = 1000;
    // A vertical wall from z=-5 to z=5 at x=12.
    for (let z = -5; z <= 5; z++) sim.apply([{ t: 'build', type: 'wall', pos: { x: 12.5, z: z + 0.5 } }]);
    expect(s.structs.length).toBe(11);
    const path = sim.grid.findPath({ x: 9.5, z: 0.5 }, { x: 15.5, z: 0.5 })!;
    expect(path).not.toBeNull();
    // Every step is walkable and the route goes around an end of the wall.
    for (const p of path) expect(sim.grid.walkable(p.x, p.z)).toBe(true);
    expect(path.some((p) => Math.abs(p.z) > 5)).toBe(true);
    expect(path[path.length - 1]).toEqual({ x: 15.5, z: 0.5 });
  });

  it('the monster flow field prefers going around but can smash through', () => {
    const sim = Sim.create(21);
    const s = sim.state;
    s.res.wood = 1000;
    for (let z = -2; z <= 2; z++) sim.apply([{ t: 'build', type: 'wall', pos: { x: 8.5, z: z + 0.5 } }]);
    const step = sim.grid.flowStep(12.5, 0.5)!;
    expect(step).not.toBeNull();
    // A short wall: going around is cheaper, so the first step must not be into the wall cell.
    expect(sim.grid.walkable(step.x, step.z)).toBe(true);
  });

  it('paths are cached per grid version and invalidated by building', () => {
    const sim = Sim.create(22);
    const a = sim.grid.findPath({ x: 9.5, z: 0.5 }, { x: 15.5, z: 0.5 });
    const b = sim.grid.findPath({ x: 9.5, z: 0.5 }, { x: 15.5, z: 0.5 });
    expect(a).toBe(b);
    sim.state.res.wood = 100;
    sim.apply([{ t: 'build', type: 'wall', pos: { x: 12.5, z: 0.5 } }]);
    const c = sim.grid.findPath({ x: 9.5, z: 0.5 }, { x: 15.5, z: 0.5 });
    expect(c).not.toBe(a);
  });
});
