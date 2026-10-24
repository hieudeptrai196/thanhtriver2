import { BALANCE, type NodeType, type Res, type TerrainType } from '../data/balance';
import { hash01 } from './rng';
import type { GameState } from './types';

const W = BALANCE.world;

export function chunkCenter(chunk: number): number {
  return chunk * W.chunkLength;
}

export function chunkOf(x: number): number {
  return Math.round(x / W.chunkLength);
}

export function chunkTerrain(seed: number, chunk: number): TerrainType {
  if (chunk <= 0) return 'plains';
  const weights = W.terrainWeights;
  const total = weights.plains + weights.forest + weights.canyon;
  let r = hash01(seed, chunk, 17) * total;
  for (const t of ['plains', 'forest', 'canyon'] as TerrainType[]) {
    r -= weights[t];
    if (r < 0) return t;
  }
  return 'plains';
}

export function richness(chunk: number): number {
  return 1 + Math.max(0, chunk) * W.richnessPerChunk;
}

export function danger(chunk: number): number {
  return 1 + Math.max(0, chunk) * BALANCE.difficulty.dangerPerChunk;
}

export function mainResource(terrain: TerrainType): Res {
  return terrain === 'plains' ? 'food' : terrain === 'forest' ? 'wood' : 'stone';
}

/** Impassable canyon walls. Pure function of the seed so it never needs saving. */
export function isCliff(seed: number, x: number, z: number): boolean {
  const c = chunkOf(x);
  if (chunkTerrain(seed, c) !== 'canyon') return false;
  return Math.abs(z) >= W.canyonCliffZ;
}

export function generateChunk(state: GameState, chunk: number): void {
  const terrain = chunkTerrain(state.seed, chunk);
  const counts = W.nodes[terrain];
  const center = chunkCenter(chunk);
  const half = W.chunkLength / 2;
  const maxZ = terrain === 'canyon' ? W.canyonCliffZ - 1.5 : 30;
  const rich = richness(chunk);
  let salt = 0;
  for (const type of ['tree', 'rock', 'bush'] as NodeType[]) {
    for (let i = 0; i < counts[type]; i++) {
      // Rejection-sample a spot off the road and away from the castle stop.
      for (let attempt = 0; attempt < 12; attempt++) {
        salt++;
        const x = Math.floor(center - half + hash01(state.seed, chunk, salt, 1) * W.chunkLength) + 0.5;
        const z = Math.floor((hash01(state.seed, chunk, salt, 2) * 2 - 1) * maxZ) + 0.5;
        if (Math.abs(z) < W.roadHalfWidth + 1.5) continue;
        if (Math.abs(x - center) < 7 && Math.abs(z) < 7) continue;
        if (state.nodes.some((n) => n.x === x && n.z === z)) continue;
        const amount = Math.round(W.nodeAmount[type] * rich);
        state.nodes.push({ id: state.nextId++, type, x, z, amount, max: amount, chunk });
        break;
      }
    }
  }
}

/** Generate chunks ahead of the castle and drop the ones far behind. */
export function ensureChunks(state: GameState): void {
  const current = chunkOf(state.castle.x);
  while (state.genChunk < current + W.genChunksAhead) {
    state.genChunk++;
    generateChunk(state, state.genChunk);
  }
  const minKeep = current - W.keepChunksBehind;
  if (state.nodes.some((n) => n.chunk < minKeep)) {
    state.nodes = state.nodes.filter((n) => n.chunk >= minKeep);
  }
}
