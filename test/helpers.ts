import { Sim } from '../src/sim/sim';

export function runUntil(sim: Sim, pred: () => boolean, maxTicks = 60 * 60 * 10): number {
  let n = 0;
  while (!pred() && n < maxTicks) {
    sim.step();
    sim.drainEvents();
    n++;
  }
  if (!pred()) throw new Error('condition not reached');
  return n;
}

export function runSeconds(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    sim.drainEvents();
  }
}

/** Finish dawn by taking the first card and the given route. */
export function passDawn(sim: Sim, route = 0): void {
  sim.apply([{ t: 'pickCard', id: sim.state.cards[0] }, { t: 'pickRoute', id: route }]);
}
