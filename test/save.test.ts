import { describe, expect, it } from 'vitest';
import { botCommands } from '../src/sim/bot';
import { Sim } from '../src/sim/sim';
import type { Command } from '../src/sim/types';

function play(sim: Sim, ticks: number, log?: Command[][]): void {
  for (let i = 0; i < ticks; i++) {
    const cmds = botCommands(sim);
    log?.push(cmds);
    sim.apply(cmds);
    sim.step();
    sim.drainEvents();
  }
}

describe('save / load and determinism', () => {
  it('a loaded save continues exactly like the original', () => {
    const a = Sim.create(40);
    play(a, 60 * 200); // into the first night
    const b = Sim.load(a.save());
    expect(b.save()).toBe(a.save());
    play(a, 60 * 120);
    play(b, 60 * 120);
    expect(b.save()).toBe(a.save());
  });

  it('same seed and same commands give the same state', () => {
    const log: Command[][] = [];
    const a = Sim.create(41);
    play(a, 60 * 260, log);
    const b = Sim.create(41);
    for (const cmds of log) {
      b.apply(cmds);
      b.step();
      b.drainEvents();
    }
    expect(b.save()).toBe(a.save());
  });

  it('different seeds give different worlds', () => {
    expect(Sim.create(1).save()).not.toBe(Sim.create(2).save());
  });
});
