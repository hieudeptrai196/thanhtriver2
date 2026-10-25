import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { runSeconds } from './helpers';

describe('economy', () => {
  it('peasants gather and deliver to the castle', () => {
    const sim = Sim.create(1);
    const before = { ...sim.state.res };
    runSeconds(sim, 40);
    const after = sim.state.res;
    const gained = after.wood + after.stone + after.food - (before.wood + before.stone + before.food);
    expect(gained).toBeGreaterThan(20);
  });

  it('gathering drains finite node reserves', () => {
    const sim = Sim.create(2);
    const total = () => sim.state.nodes.reduce((a, n) => a + n.amount, 0);
    const start = total();
    runSeconds(sim, 60);
    expect(total()).toBeLessThan(start);
  });

  it('a node can be emptied and is then skipped', () => {
    const sim = Sim.create(3);
    const s = sim.state;
    // Leave a single tiny node near the castle.
    s.nodes = [{ id: 9999, type: 'tree', x: 6.5, z: 6.5, amount: 12, max: 12, chunk: 0 }];
    runSeconds(sim, 40);
    expect(s.nodes[0].amount).toBe(0);
    expect(s.units.filter((u) => u.type === 'peasant').every((u) => u.targetId !== 9999 || u.job !== 'gather')).toBe(true);
  });

  it('reserves never regrow, and dawn warns when the camp runs dry', () => {
    const sim = Sim.create(5);
    const s = sim.state;
    for (const n of s.nodes) if (Math.abs(n.x - s.castle.x) <= 30) n.amount = Math.floor(n.max * 0.1);
    const node = s.nodes[0];
    const before = node.amount;
    s.units = []; // nobody gathers
    s.night = 2;
    s.phase = 'night';
    s.phaseTime = s.phaseLength;
    sim.step();
    expect(s.phase).toBe('dawn');
    expect(node.amount).toBe(before);
    expect(s.routes[0].exhausted).toBe(true);
  });

  it('a short dawn weakens, a second one makes a villager leave; eating clears it', () => {
    const sim = Sim.create(6);
    const s = sim.state;
    const dawnNow = () => {
      s.phase = 'night';
      s.phaseTime = s.phaseLength;
      sim.step();
    };
    const hp = s.units.map((u) => u.hp);
    s.res.food = 0;
    dawnNow();
    expect(s.hunger).toBe(1);
    expect(s.units.map((u) => u.hp)).toEqual(hp); // no sudden HP loss
    const count = s.units.length;
    s.res.food = 0;
    dawnNow();
    expect(s.hunger).toBe(2);
    expect(s.units.length).toBe(count - 1);
    s.res.food = 500;
    dawnNow();
    expect(s.hunger).toBe(0);
  });

  it('flagged peasants gather near the flag', () => {
    const sim = Sim.create(4);
    const s = sim.state;
    const far = s.nodes.filter((n) => n.x > 15).sort((a, b) => a.x - b.x)[0];
    sim.apply([{ t: 'selectGroup', group: 0 }, { t: 'order', pos: { x: far.x, z: far.z } }]);
    runSeconds(sim, 20);
    const peasants = s.units.filter((u) => u.type === 'peasant');
    const ids = new Set(peasants.map((p) => p.targetId));
    const targets = s.nodes.filter((n) => ids.has(n.id));
    expect(targets.length).toBeGreaterThan(0);
    for (const n of targets) expect(Math.hypot(n.x - far.x, n.z - far.z)).toBeLessThan(15);
  });
});

describe('labour policy and cargo', () => {
  it('priority Off keeps peasants away from that resource', () => {
    const sim = Sim.create(60);
    const s = sim.state;
    sim.apply([{ t: 'setLabor', res: 'wood', priority: 0 }, { t: 'setLabor', res: 'stone', priority: 0 }, { t: 'setLabor', res: 'food', priority: 3 }]);
    const before = { ...s.res };
    runSeconds(sim, 50);
    expect(s.res.food).toBeGreaterThan(before.food);
    expect(s.res.wood).toBeLessThanOrEqual(before.wood); // repairs may spend wood, nobody gathers it
    expect(s.res.stone).toBe(before.stone);
  });

  it('a carried load drops where the peasant dies and only counts once delivered', () => {
    const sim = Sim.create(61);
    const s = sim.state;
    const p = s.units.find((u) => u.type === 'peasant')!;
    p.carry = 7;
    p.carryRes = 'wood';
    const wood = s.res.wood;
    p.hp = 1;
    // A monster bite kills it.
    s.monsters.push({ id: s.nextId++, type: 'fast', x: p.x + 0.5, z: p.z, hp: 50, maxHp: 50, dmgMult: 1, cooldown: 0, targetId: -1, slamTimer: 0, slamAt: null, wander: false });
    runSeconds(sim, 0.2);
    expect(s.units.includes(p)).toBe(false);
    expect(s.drops.length).toBe(1);
    expect(s.drops[0].amount).toBe(7);
    expect(s.res.wood).toBe(wood);
  });

  it('repairs cost wood and stop when it runs out', () => {
    const sim = Sim.create(62);
    const s = sim.state;
    s.units = s.units.filter((u) => u.type === 'builder'); // nobody brings wood in
    s.castle.wallHp = 100;
    s.res.wood = 0;
    s.repairDebt = 1;
    runSeconds(sim, 10);
    expect(s.castle.wallHp).toBe(100);
    s.res.wood = 20;
    runSeconds(sim, 30);
    expect(s.castle.wallHp).toBeGreaterThan(100);
    expect(s.res.wood).toBeLessThan(20);
  });
});
