import { BALANCE } from '../data/balance';
import { isCliff } from './world';
import type { GameState, Vec } from './types';

export const FREE = 0;
export const STRUCT = 1;
export const CLIFF = 2;
export const CASTLE = 3;

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** Coarse 1×1 navigation grid centered on where the castle stands. Derived from state, never saved. */
export class NavGrid {
  readonly size = BALANCE.world.gridSize;
  ox = 0;
  oz = 0;
  cells: Uint8Array;
  structAt: Int32Array;
  version = 0;
  private pathCache = new Map<string, Vec[] | null>();
  private flow: Float32Array | null = null;

  constructor() {
    this.cells = new Uint8Array(this.size * this.size);
    this.structAt = new Int32Array(this.size * this.size).fill(-1);
  }

  rebuild(state: GameState): void {
    const s = this.size;
    this.ox = Math.round(state.castle.anchorX) - s / 2;
    this.oz = -s / 2;
    this.cells.fill(FREE);
    this.structAt.fill(-1);
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        if (isCliff(state.seed, this.ox + i + 0.5, this.oz + j + 0.5)) this.cells[j * s + i] = CLIFF;
      }
    }
    if (!state.castle.moving) {
      const h = BALANCE.castle.halfSize;
      const cx = Math.round(state.castle.x);
      for (let z = -h; z < h; z++) {
        for (let x = cx - h; x < cx + h; x++) {
          const k = this.index(x, z);
          if (k >= 0) this.cells[k] = CASTLE;
        }
      }
    }
    for (const st of state.structs) {
      if (!BALANCE.structs[st.type].blocks) continue;
      const k = this.index(st.cx, st.cz);
      if (k >= 0 && this.cells[k] === FREE) {
        this.cells[k] = STRUCT;
        this.structAt[k] = st.id;
      }
    }
    this.touch();
  }

  touch(): void {
    this.version++;
    this.pathCache.clear();
    this.flow = null;
  }

  index(wx: number, wz: number): number {
    const i = Math.floor(wx) - this.ox;
    const j = Math.floor(wz) - this.oz;
    if (i < 0 || j < 0 || i >= this.size || j >= this.size) return -1;
    return j * this.size + i;
  }

  cellAt(wx: number, wz: number): number {
    const k = this.index(wx, wz);
    return k < 0 ? FREE : this.cells[k];
  }

  walkable(wx: number, wz: number): boolean {
    return this.cellAt(wx, wz) === FREE;
  }

  setStruct(cx: number, cz: number, id: number): void {
    const k = this.index(cx, cz);
    if (k < 0) return;
    this.cells[k] = id >= 0 ? STRUCT : FREE;
    this.structAt[k] = id;
    this.touch();
  }

  private center(k: number): Vec {
    return { x: this.ox + (k % this.size) + 0.5, z: this.oz + Math.floor(k / this.size) + 0.5 };
  }

  /**
   * A* for units. Units never walk through structures; if the goal cell is blocked
   * (a wall to repair, the castle) reaching any neighbour counts. Results are cached per grid version.
   */
  findPath(from: Vec, to: Vec): Vec[] | null {
    const sk = this.index(from.x, from.z);
    const gk = this.index(to.x, to.z);
    if (sk < 0 || gk < 0) return [to];
    const key = sk + ':' + gk;
    const cached = this.pathCache.get(key);
    if (cached !== undefined) return cached;
    const path = this.astar(sk, gk);
    if (path) path[path.length - 1] = this.cells[gk] === FREE ? { x: to.x, z: to.z } : path[path.length - 1];
    if (this.pathCache.size > 2000) this.pathCache.clear();
    this.pathCache.set(key, path);
    return path;
  }

  private astar(sk: number, gk: number): Vec[] | null {
    const s = this.size;
    const n = s * s;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gx = gk % s;
    const gz = Math.floor(gk / s);
    const goalBlocked = this.cells[gk] !== FREE;
    const heap = new MinHeap();
    g[sk] = 0;
    heap.push(sk, 0);
    let found = -1;
    let expanded = 0;
    while (heap.size > 0) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      const x = k % s;
      const z = Math.floor(k / s);
      if (k === gk || (goalBlocked && Math.max(Math.abs(x - gx), Math.abs(z - gz)) <= 1)) {
        found = k;
        break;
      }
      if (++expanded > 4000) break;
      for (const [dx, dz, cost] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= s || nz >= s) continue;
        const nk = nz * s + nx;
        if (closed[nk] || (this.cells[nk] !== FREE && nk !== gk)) continue;
        if (nk === gk && goalBlocked) continue;
        // No corner cutting.
        if (dx !== 0 && dz !== 0 && (this.cells[z * s + nx] !== FREE || this.cells[nz * s + x] !== FREE)) continue;
        const ng = g[k] + cost;
        if (ng < g[nk]) {
          g[nk] = ng;
          came[nk] = k;
          const h = Math.hypot(nx - gx, nz - gz);
          heap.push(nk, ng + h);
        }
      }
    }
    if (found < 0) return null;
    const out: Vec[] = [];
    for (let k = found; k !== sk && k >= 0; k = came[k]) out.push(this.center(k));
    out.reverse();
    if (out.length === 0) out.push(this.center(found));
    return out;
  }

  /** Distance field towards the castle for monsters. Walls are passable at a cost (they get smashed). */
  flowField(): Float32Array {
    if (this.flow) return this.flow;
    const s = this.size;
    const dist = new Float32Array(s * s).fill(Infinity);
    const heap = new MinHeap();
    for (let k = 0; k < s * s; k++) {
      if (this.cells[k] === CASTLE) {
        dist[k] = 0;
        heap.push(k, 0);
      }
    }
    while (heap.size > 0) {
      const k = heap.pop();
      const d = dist[k];
      const x = k % s;
      const z = Math.floor(k / s);
      for (const [dx, dz, cost] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= s || nz >= s) continue;
        const nk = nz * s + nx;
        const c = this.cells[nk];
        if (c === CLIFF || c === CASTLE) continue;
        if (dx !== 0 && dz !== 0 && (this.cells[z * s + nx] === CLIFF || this.cells[nz * s + x] === CLIFF)) continue;
        const step = cost * (c === STRUCT || this.cells[k] === STRUCT ? BALANCE.wallPathCost : 1);
        if (d + step < dist[nk]) {
          dist[nk] = d + step;
          heap.push(nk, d + step);
        }
      }
    }
    this.flow = dist;
    return dist;
  }

  /** Next cell centre a monster should walk to. Returns null when it is at the castle or off-grid. */
  flowStep(wx: number, wz: number): Vec | null {
    const k = this.index(wx, wz);
    if (k < 0) return null;
    const dist = this.flowField();
    const s = this.size;
    const x = k % s;
    const z = Math.floor(k / s);
    let best = dist[k];
    let bestK = -1;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= s || nz >= s) continue;
      const nk = nz * s + nx;
      if (dist[nk] < best) {
        best = dist[nk];
        bestK = nk;
      }
    }
    return bestK < 0 ? null : this.center(bestK);
  }
}

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, p: number): void {
    const a = this.keys;
    const b = this.pri;
    a.push(k);
    b.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (b[parent] <= b[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      [b[parent], b[i]] = [b[i], b[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.keys;
    const b = this.pri;
    const top = a[0];
    const lk = a.pop()!;
    const lp = b.pop()!;
    if (a.length > 0) {
      a[0] = lk;
      b[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [b[m], b[i]] = [b[i], b[m]];
        i = m;
      }
    }
    return top;
  }
}
