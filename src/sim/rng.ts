// Seeded mulberry32. The generator state lives in GameState.rng so it is saved with the game.

export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(holder: { rng: number }, min: number, max: number): number {
  return min + (max - min) * nextRandom(holder);
}

export function pickIndex(holder: { rng: number }, n: number): number {
  return Math.min(n - 1, Math.floor(nextRandom(holder) * n));
}

/** Stateless hash of a few integers into [0, 1). */
export function hash01(...ns: number[]): number {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

export function shuffle<T>(holder: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = pickIndex(holder, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
