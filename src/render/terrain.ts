import * as THREE from 'three';
import { BALANCE, type TerrainType } from '../data/balance';
import { hash01 } from '../sim/rng';
import { chunkCenter, chunkTerrain } from '../sim/world';

// Continuous low-poly ground built in code: one mesh per chunk, vertex-coloured, flat in the play area
// and rising into hills (or canyon walls) towards the edges. Heights and colours are pure functions of
// the seed and world position, so chunk seams line up.

const L = BALANCE.world.chunkLength;
const DEPTH = 150;
const SEG_X = 48;
const SEG_Z = 75;
const PLAY_Z = 40; // flat area: monsters spawn at |z| = 37
const RAIL_Z = 3.4;

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Smooth value noise in [0, 1]. */
export function noise(seed: number, x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const a = hash01(seed, ix, iz, scale | 0);
  const b = hash01(seed, ix + 1, iz, scale | 0);
  const c = hash01(seed, ix, iz + 1, scale | 0);
  const d = hash01(seed, ix + 1, iz + 1, scale | 0);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/** How much the ground at x is of one terrain type, blended over 8 units around chunk borders. */
function terrainWeight(seed: number, x: number, type: TerrainType): number {
  const c = Math.round(x / L);
  const here = chunkTerrain(seed, c) === type ? 1 : 0;
  const edge = x - (chunkCenter(c) - L / 2);
  const toNext = chunkCenter(c) + L / 2 - x;
  if (edge < 4) {
    const prev = chunkTerrain(seed, c - 1) === type ? 1 : 0;
    return prev + (here - prev) * smooth((edge + 4) / 8);
  }
  if (toNext < 4) {
    const next = chunkTerrain(seed, c + 1) === type ? 1 : 0;
    return here + (next - here) * smooth((4 - toNext) / 8);
  }
  return here;
}

function canyonWeight(seed: number, x: number): number {
  return terrainWeight(seed, x, 'canyon');
}

export function terrainHeight(seed: number, x: number, z: number): number {
  const az = Math.abs(z);
  const hills = smooth((az - PLAY_Z) / 26) * (2.5 + noise(seed, x, z, 14) * 7 + noise(seed, x, z, 5) * 1.5);
  const cw = canyonWeight(seed, x);
  const cliffZ = BALANCE.world.canyonCliffZ;
  const walls = smooth((az - cliffZ) / 5) * (5 + noise(seed, x, z, 6) * 4);
  // The camera looks from the south, so the southern rise stays lower and never hides the camp.
  const south = z > 0 ? 0.45 : 1;
  return (hills * (1 - cw) + Math.max(hills, walls) * cw) * south;
}

/** Countryside of one chunk, shared by the ground colours and the scenery models so they line up. */
export interface ChunkLayout {
  village: { x: number; z: number; kind: 'farm' | 'wood' } | null;
  fields: { x0: number; x1: number; z0: number; z1: number; crop: boolean }[];
}

const layouts = new Map<string, ChunkLayout>();
export function chunkLayout(seed: number, chunk: number): ChunkLayout {
  const key = `${seed}:${chunk}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  if (layouts.size > 64) layouts.clear();
  const terrain = chunkTerrain(seed, chunk);
  const out: ChunkLayout = { village: null, fields: [] };
  if (terrain !== 'canyon') {
    const h = (salt: number) => hash01(seed, chunk, 9, salt + 80);
    const x0 = chunkCenter(chunk) - L / 2;
    // The village sits on the far (north) side, just past the area where resources grow.
    const vx = x0 + 12 + h(1) * (L - 24);
    out.village = { x: vx, z: -(35 + h(2) * 2), kind: terrain === 'plains' ? 'farm' : 'wood' };
    if (terrain === 'plains') {
      const side = h(3) < 0.5 ? -1 : 1;
      out.fields.push({ x0: vx + side * 7, x1: vx + side * (16 + h(4) * 4), z0: -41, z1: -31.5, crop: h(5) < 0.5 });
      // Low fields on the near side, never anything tall there.
      for (let i = 0; i < 2; i++) {
        if (h(6 + i) < 0.35) continue;
        const fx = x0 + 3 + h(8 + i) * (L - 18);
        out.fields.push({ x0: fx, x1: fx + 8 + h(10 + i) * 6, z0: 31.5, z1: 40, crop: h(12 + i) < 0.5 });
      }
    }
  }
  layouts.set(key, out);
  return out;
}

/** Centre line of the dirt track from a village down to the railway. */
export function trackX(v: { x: number; z: number }, z: number): number {
  return v.x + Math.sin(z * 0.18) * 1.6 + Math.sin(z * 0.07 + v.x) * 1.2;
}

const C = {
  grassA: new THREE.Color(0x6a8c44),
  grassB: new THREE.Color(0x82994f),
  forestA: new THREE.Color(0x4a6b35),
  forestB: new THREE.Color(0x5c7c3f),
  dirt: new THREE.Color(0x8f7350),
  sand: new THREE.Color(0xb09470),
  sandDark: new THREE.Color(0x8f7556),
  rock: new THREE.Color(0x7a6f62),
  hilltop: new THREE.Color(0x8fa058),
  track: new THREE.Color(0x7d6444),
  furrow: new THREE.Color(0x5e4a32),
  ridge: new THREE.Color(0x7a6442),
  wheat: new THREE.Color(0xb39a4c),
  wheatDark: new THREE.Color(0x96803e),
};

/** Ploughed strips, ripe wheat and dirt tracks from the nearby villages. */
function farmland(seed: number, x: number, z: number, out: THREE.Color): void {
  const c = Math.round(x / L);
  for (let k = c - 1; k <= c + 1; k++) {
    const lay = chunkLayout(seed, k);
    for (const f of lay.fields) {
      const lo = Math.min(f.x0, f.x1);
      const hi = Math.max(f.x0, f.x1);
      if (x < lo || x > hi || z < f.z0 || z > f.z1) continue;
      const stripe = Math.floor((x - lo) / 1.5) % 2 === 0;
      out.copy(f.crop ? (stripe ? C.wheat : C.wheatDark) : stripe ? C.furrow : C.ridge);
      return;
    }
    const v = lay.village;
    if (v && z > v.z + 1 && z < -RAIL_Z) {
      const d = Math.abs(x - trackX(v, z));
      if (d < 1.1) out.lerp(C.track, smooth((1.1 - d) / 0.5) * 0.85);
    }
    // Trodden yard around the village.
    if (v) {
      const d = Math.hypot(x - v.x, (z - v.z) * 1.3);
      if (d < 6) out.lerp(C.track, smooth((6 - d) / 3) * 0.55);
    }
  }
}

const tmp = new THREE.Color();

function colorAt(seed: number, cw: number, x: number, z: number, h: number, out: THREE.Color): void {
  const n = noise(seed, x, z, 9);
  const n2 = noise(seed, x + 100, z, 3.5);
  // Meadow and woodland greens fade into each other across chunk borders.
  const fw = terrainWeight(seed, x, 'forest');
  const t = n * 0.8 + n2 * 0.2;
  out.copy(C.grassA).lerp(C.grassB, t);
  if (fw > 0) out.lerp(tmp.copy(C.forestA).lerp(C.forestB, t), fw);
  // Worn dirt patches and the trampled strip along the railway.
  const patch = smooth((noise(seed, x, z + 50, 7) - 0.62) * 6);
  out.lerp(C.dirt, Math.max(patch * 0.7, smooth((RAIL_Z + 1.5 - Math.abs(z)) / 2) * 0.8));
  if (cw < 1) farmland(seed, x, z, out);
  // Higher ground gets drier.
  out.lerp(C.hilltop, smooth(h / 9) * 0.5);
  if (cw > 0) {
    const sand = new THREE.Color().copy(C.sand).lerp(C.sandDark, n2);
    sand.lerp(C.rock, smooth((h - 1.5) / 4));
    out.lerp(sand, cw);
  }
}

/** One ground mesh per visible chunk, rebuilt when the chunk under it changes. */
export class Terrain {
  private meshes: THREE.Mesh[] = [];
  private chunkOf: number[] = [];
  private seedOf = -1;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  constructor(scene: THREE.Scene, count = 7) {
    for (let i = 0; i < count; i++) {
      const g = new THREE.PlaneGeometry(L, DEPTH, SEG_X, SEG_Z);
      g.rotateX(-Math.PI / 2);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3));
      const m = new THREE.Mesh(g, this.material);
      m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.push(m);
      this.chunkOf.push(Number.NaN);
    }
  }

  update(seed: number, cameraX: number): void {
    const first = Math.round(cameraX / L) - Math.floor(this.meshes.length / 2);
    for (let i = 0; i < this.meshes.length; i++) {
      const chunk = first + i;
      // Reuse a mesh already showing this chunk.
      const slot = this.chunkOf.indexOf(chunk);
      if (slot >= 0 && this.seedOf === seed) continue;
      // Take a mesh that shows a chunk no longer needed.
      let free = this.chunkOf.findIndex((c) => Number.isNaN(c) || c < first || c >= first + this.meshes.length);
      if (this.seedOf !== seed) free = i;
      if (free < 0) continue;
      this.build(this.meshes[free], seed, chunk);
      this.chunkOf[free] = chunk;
    }
    if (this.seedOf !== seed) this.seedOf = seed;
  }

  private build(mesh: THREE.Mesh, seed: number, chunk: number): void {
    const g = mesh.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const cx = chunkCenter(chunk);
    const c = new THREE.Color();
    // Base grid in local coordinates: x in [-L/2, L/2], z in [-DEPTH/2, DEPTH/2].
    for (let iz = 0; iz <= SEG_Z; iz++) {
      for (let ix = 0; ix <= SEG_X; ix++) {
        const k = iz * (SEG_X + 1) + ix;
        const lx = -L / 2 + (ix / SEG_X) * L;
        const z = -DEPTH / 2 + (iz / SEG_Z) * DEPTH;
        const x = cx + lx;
        const h = terrainHeight(seed, x, z);
        pos.setXYZ(k, lx, h - 0.02, z);
        colorAt(seed, canyonWeight(seed, x), x, z, h, c);
        col.setXYZ(k, c.r, c.g, c.b);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    mesh.position.set(cx, 0, 0);
  }
}
