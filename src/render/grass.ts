import * as THREE from 'three';
import { BALANCE } from '../data/balance';
import { hash01 } from '../sim/rng';
import { chunkCenter } from '../sim/world';
import { chunkLayout, noise, smooth, terrainHeight, terrainWeight, trackX } from './terrain';

// A meadow carpet: thousands of cheap blade clumps (7 triangles each) in one InstancedMesh, swaying in the wind.
// Short around the camp so units stay readable, taller towards the edges and in patches, golden in the wheat fields.
// Placement is a pure function of seed and position, cached per chunk; weak devices get half the blades.

const L = BALANCE.world.chunkLength;
const PER_CHUNK = 11000; // clumps in a full-density chunk
const RADIUS = 2; // chunks either side of the camera
const RAIL = 3.8;

function clumpGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 1.3;
    const r = 0.06 + (i % 3) * 0.05;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const w = 0.09;
    // Base edge across the blade, tip leaning outwards.
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    const lean = 0.22 + (i % 2) * 0.14;
    const h = 0.75 + ((i * 37) % 10) / 40;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 1.12, 1.12, 1.02);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Normals straight up: blades light like the ground they grow from, with no dark backsides.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  return g;
}

const COL = {
  greenA: new THREE.Color(0x5f8a3c),
  greenB: new THREE.Color(0x86a04e),
  forest: new THREE.Color(0x4a6e34),
  dry: new THREE.Color(0xa49a56),
  wheat: new THREE.Color(0xd2b25a),
  sand: new THREE.Color(0x9c9060),
};

interface ChunkGrass {
  m: Float32Array; // 16 per clump
  c: Float32Array; // 3 per clump
  n: number;
}

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 } };
  private cache = new Map<string, ChunkGrass>();
  private key = '';

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 root = instanceMatrix[3].xyz;
  float gust = sin(uTime * 1.6 + root.x * 0.32 + root.z * 0.21) * 0.6 + sin(uTime * 3.1 + root.x * 1.3 - root.z * 0.7) * 0.25;
  float bend = position.y * position.y;
  transformed.x += gust * bend * 0.22;
  transformed.z += gust * bend * 0.08;
#endif`,
        );
      // Both faces of a blade keep the upward normal (three would flip it on back faces and turn them black).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;',
      );
    };
    this.mesh = new THREE.InstancedMesh(clumpGeometry(), mat, Math.ceil(PER_CHUNK * (2 * RADIUS + 1)));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.mesh.instanceMatrix.count * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  /** Refill when the camera crosses into another chunk (or the density changes); sway every frame. */
  update(seed: number, camX: number, time: number, low: boolean): void {
    this.uniforms.uTime.value = time;
    const c0 = Math.round(camX / L);
    const key = `${seed}:${c0}:${low}`;
    if (key === this.key) return;
    this.key = key;
    if (this.cache.size > 24) this.cache.clear();
    const mats = this.mesh.instanceMatrix.array as Float32Array;
    const cols = this.mesh.instanceColor!.array as Float32Array;
    let n = 0;
    for (let k = c0 - RADIUS; k <= c0 + RADIUS; k++) {
      const share = (Math.abs(k - c0) <= 1 ? 1 : 0.4) * (low ? 0.5 : 1);
      const g = this.chunk(seed, k);
      const take = Math.min(g.n, Math.floor(g.n * share));
      // Clumps are stored in random order, so the first `take` are an even thinning.
      mats.set(g.m.subarray(0, take * 16), n * 16);
      cols.set(g.c.subarray(0, take * 3), n * 3);
      n += take;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  private chunk(seed: number, chunk: number): ChunkGrass {
    const key = `${seed}:${chunk}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = new Float32Array(PER_CHUNK * 16);
    const c = new Float32Array(PER_CHUNK * 3);
    const x0 = chunkCenter(chunk) - L / 2;
    const lay = chunkLayout(seed, chunk);
    const v = lay.village;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let i = 0; i < PER_CHUNK; i++) {
      const h = (salt: number) => hash01(seed, chunk, i, salt + 200);
      const x = x0 + h(1) * L;
      const z = (h(2) * 2 - 1) * 46;
      const az = Math.abs(z);
      if (az < RAIL) continue;
      const cw = terrainWeight(seed, x, 'canyon');
      if (cw > 0.5 && az > BALANCE.world.canyonCliffZ - 0.5) continue;
      if (cw > 0.5 && h(3) > 0.45) continue; // thinner, dry tufts on the sandy canyon floor
      // Keep the village track and the ploughed strips bare, thin out the trodden yard.
      if (v && z > v.z + 1 && z < -RAIL && Math.abs(x - trackX(v, z)) < 1) continue;
      if (v && Math.hypot(x - v.x, (z - v.z) * 1.3) < 6 && h(4) > 0.25) continue;
      const field = lay.fields.find((f) => x >= Math.min(f.x0, f.x1) && x <= Math.max(f.x0, f.x1) && z >= f.z0 && z <= f.z1);
      if (field && !field.crop) continue;
      // Height: short in the play area, tall at the edges and in meadow patches; ripe wheat in crop fields.
      const patch = az > 9 ? smooth((noise(seed, x, z, 11) - 0.6) * 5) : 0;
      const tall = Math.max(smooth((az - 22) / 12), patch);
      let height = 0.3 + h(5) * 0.2 + tall * (0.55 + h(6) * 0.45);
      const forest = terrainWeight(seed, x, 'forest');
      col.copy(COL.greenA).lerp(COL.greenB, noise(seed, x + 30, z, 7) * 0.8 + h(7) * 0.2);
      if (forest > 0) col.lerp(COL.forest, forest * 0.8);
      col.lerp(COL.dry, smooth((noise(seed, x, z - 40, 13) - 0.55) * 4) * 0.7 + tall * 0.15);
      if (cw > 0) col.lerp(COL.sand, cw);
      if (field) {
        height = 0.95 + h(5) * 0.3;
        col.copy(COL.wheat).multiplyScalar(0.9 + h(7) * 0.2);
      }
      const y = terrainHeight(seed, x, z) - 0.02;
      p.set(x, y, z);
      q.setFromAxisAngle(up, h(8) * Math.PI * 2);
      const w = 0.8 + h(9) * 0.5 + tall * 0.3;
      s.set(w, height, w);
      mat.compose(p, q, s);
      mat.toArray(m, n * 16);
      c[n * 3] = col.r;
      c[n * 3 + 1] = col.g;
      c[n * 3 + 2] = col.b;
      n++;
    }
    const out = { m, c, n };
    this.cache.set(key, out);
    return out;
  }
}
