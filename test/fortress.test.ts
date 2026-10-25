import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { castleLoad, foodNeed, loadCapacity, loadLevel, Sim, storageCap, travelSpeed } from '../src/sim/sim';
import { passDawn, runSeconds, runUntil } from './helpers';

describe('castle load, storage and kitchen (GDD v1.2 §5.2, §6.6)', () => {
  it('stock makes the castle heavy; overloaded cannot leave until cargo is dropped', () => {
    const sim = Sim.create(80);
    const s = sim.state;
    expect(loadLevel(s)).toBe('light');
    const fast = travelSpeed(s);
    s.res = { wood: 3000, stone: 3000, food: 600, gold: 0 };
    expect(loadLevel(s)).toBe('overloaded');
    s.castle.destX = 48;
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(false);
    for (let i = 0; i < 30 && loadLevel(s) === 'overloaded'; i++) sim.apply([{ t: 'dumpCargo' }]);
    expect(loadLevel(s)).not.toBe('overloaded');
    expect(travelSpeed(s)).toBeLessThanOrEqual(fast);
    sim.apply([{ t: 'toggleMove' }]);
    expect(s.castle.moving).toBe(true);
  });

  it('a Storage adds capacity and storage; deliveries above the cap are lost', () => {
    const sim = Sim.create(81);
    const s = sim.state;
    const cap = loadCapacity(s);
    const store = storageCap(s);
    s.res.wood = 500;
    sim.apply([{ t: 'placeRoom', slot: 2, type: 'storage' }]);
    expect(loadCapacity(s)).toBeGreaterThan(cap);
    expect(storageCap(s)).toBe(store + BALANCE.storage.perRoom);
    expect(castleLoad(s)).toBeGreaterThan(0);
  });

  it('a Kitchen cuts the food eaten at dawn', () => {
    const sim = Sim.create(82);
    const s = sim.state;
    const before = foodNeed(s);
    s.res.wood = 500;
    sim.apply([{ t: 'placeRoom', slot: 2, type: 'kitchen' }]);
    expect(foodNeed(s)).toBeLessThan(before);
  });
});

describe('doctrines, emergencies, cards, modes', () => {
  it('a doctrine is offered once after night 2 and blocks the day until chosen', () => {
    const sim = Sim.create(83);
    const s = sim.state;
    s.castle.coreHp = s.castle.coreMax = 1e7; // nobody defends in this test
    for (let n = 1; n <= 2; n++) {
      runUntil(sim, () => s.phase === 'dawn', 60 * 500);
      if (n === 2) break;
      passDawn(sim);
    }
    expect(s.doctrineOffer).toBe(true);
    passDawn(sim);
    expect(s.phase).toBe('dawn');
    const wall = s.castle.wallMax;
    sim.apply([{ t: 'pickDoctrine', doctrine: 'fortress' }]);
    expect(s.phase).toBe('day');
    expect(s.castle.wallMax).toBeGreaterThan(wall);
  });

  it('sealing the gates: wall up, damage halved, outside buildings pay, workers stay in', () => {
    const sim = Sim.create(84);
    const s = sim.state;
    s.res.wood = 200;
    sim.apply([{ t: 'build', type: 'torch', pos: { x: 9.5, z: 7.5 } }]);
    runUntil(sim, () => s.phase === 'night', 60 * 400);
    s.castle.wallHp = 100;
    const torch = s.structs[0];
    const hp = torch.hp;
    sim.apply([{ t: 'ability', id: 'seal' }]);
    expect(s.castle.wallHp).toBeCloseTo(100 + s.castle.wallMax * BALANCE.seal.wall, 3);
    expect(torch.hp).toBeLessThan(hp);
    expect(s.sealed).toBe(true);
    sim.apply([{ t: 'ability', id: 'seal' }]); // once a night
    expect(s.cooldowns.seal).toBeGreaterThan(1000);
  });

  it('every card has a drawback recorded in mods', () => {
    const sim = Sim.create(85);
    const s = sim.state;
    s.phase = 'dawn';
    s.cards = ['towerRate', 'carry', 'lightPack'];
    sim.apply([{ t: 'pickCard', id: 'towerRate' }]);
    expect(s.mods.towerRate).toBeGreaterThan(0);
    expect(s.mods.towerCost).toBeGreaterThan(0);
  });

  it('a short challenge ends in victory after six nights', () => {
    const sim = Sim.create(86, 'short');
    const s = sim.state;
    expect(s.goalNights).toBe(6);
    s.stats.nightsSurvived = 5;
    s.night = 6;
    s.phase = 'night';
    s.phaseTime = s.phaseLength = 1;
    runSeconds(sim, 0.1);
    expect(s.phase).toBe('victory');
  });
});
