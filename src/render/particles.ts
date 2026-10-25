import * as THREE from 'three';

// Soft camera-facing particles drawn as GPU points: two pools, one additive (fire, sparks, embers, magic) and one
// alpha-blended (smoke, dust, debris). One draw call each, no textures: the soft disc is computed in the shader.

export interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  /** Size change over life, in world units (negative shrinks). */
  grow?: number;
  color: number;
  /** Downward acceleration (debris falls, smoke rises with negative values). */
  gravity?: number;
  /** Velocity damping per second. */
  drag?: number;
  /** Peak opacity. */
  alpha?: number;
  /** Hard-edged chip instead of a soft blob. */
  hard?: boolean;
}

interface Live extends Spark {
  age: number;
}

const VERT = `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aHard;
  uniform float uScale;
  varying vec4 vColor;
  varying float vHard;
  void main() {
    vColor = aColor;
    vHard = aHard;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = `
  varying vec4 vColor;
  varying float vHard;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float soft = pow(1.0 - d, 1.6);
    float a = mix(soft, step(d, 0.8), vHard);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

class Pool {
  readonly points: THREE.Points;
  private live: Live[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private hard: Float32Array;
  private c = new THREE.Color();
  readonly material: THREE.ShaderMaterial;

  constructor(private max: number, additive: boolean, scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.hard = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aHard', new THREE.BufferAttribute(this.hard, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  add(s: Spark): void {
    if (this.live.length >= this.max) this.live.shift();
    this.live.push({ ...s, age: 0 });
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.live) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.max(0, 1 - (p.drag ?? 0.6) * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03 && (p.gravity ?? 0) > 0) {
        // Debris settles on the ground.
        p.y = 0.03;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const k = p.age / p.life;
      const fade = k < 0.12 ? k / 0.12 : 1 - Math.max(0, k - 0.5) / 0.5;
      this.c.setHex(p.color);
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = this.c.r;
      this.col[n * 4 + 1] = this.c.g;
      this.col[n * 4 + 2] = this.c.b;
      this.col[n * 4 + 3] = (p.alpha ?? 1) * fade;
      this.size[n] = Math.max(0.01, p.size + (p.grow ?? 0) * k);
      this.hard[n] = p.hard ? 1 : 0;
      n++;
    }
    this.live = this.live.filter((p) => p.age < p.life);
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const name of ['position', 'aColor', 'aSize', 'aHard']) g.getAttribute(name).needsUpdate = true;
  }
}

export class Particles {
  readonly glow: Pool;
  readonly soft: Pool;

  constructor(scene: THREE.Scene) {
    this.soft = new Pool(1600, false, scene);
    this.glow = new Pool(1600, true, scene);
  }

  /** Point sizes are in world units: scale by the viewport height and field of view. */
  setViewport(heightPx: number, fovDeg: number): void {
    const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.soft.material.uniforms.uScale.value = scale;
    this.glow.material.uniforms.uScale.value = scale;
  }

  update(dt: number): void {
    this.soft.update(dt);
    this.glow.update(dt);
  }

  // ------------------------------------------------------------------ authored effects

  private burst(pool: Pool, n: number, x: number, y: number, z: number, speed: number, up: number, base: Omit<Spark, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz'>, spread = 0.2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      pool.add({
        ...base,
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s,
        vy: up * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * s,
        life: base.life * (0.7 + Math.random() * 0.6),
      });
    }
  }

  /** Steel on bone: a bright spray of sparks. */
  hit(x: number, z: number): void {
    this.burst(this.glow, 7, x, 1.1, z, 4.5, 2.5, { life: 0.28, size: 0.16, grow: -0.12, color: 0xffd890, gravity: 9, drag: 2 });
  }

  /** A monster lands a blow: a puff of dust and a dull red flash. */
  bite(x: number, z: number): void {
    this.burst(this.soft, 4, x, 0.9, z, 1.2, 0.8, { life: 0.5, size: 0.5, grow: 0.5, color: 0x8a7a66, alpha: 0.55 });
    this.burst(this.glow, 3, x, 1.0, z, 2, 1.5, { life: 0.2, size: 0.25, grow: -0.2, color: 0xff5030, drag: 3 });
  }

  /** A skeleton falls apart: bone shards, a dust cloud and its soul escaping as green wisps. */
  death(x: number, z: number, big: boolean): void {
    const k = big ? 3 : 1;
    this.burst(this.soft, 10 * k, x, 0.9 * k, z, 3.2 * k, 3.5, { life: 1.1, size: 0.13 * k, color: 0xe6dccb, gravity: 11, drag: 0.8, hard: true }, 0.4 * k);
    this.burst(this.soft, 6 * k, x, 0.4, z, 1.6 * k, 0.5, { life: 0.9, size: 0.7 * k, grow: 1.0 * k, color: 0x6e6252, alpha: 0.5 }, 0.5 * k);
    this.burst(this.glow, 5 * k, x, 1.0, z, 0.6, 1.8, { life: 1.2, size: 0.32, grow: -0.25, color: 0x6cff9c, gravity: -0.6, drag: 1.2 }, 0.5 * k);
  }

  /** Stone chips and grit off the castle wall. */
  chips(x: number, z: number, wood = false): void {
    const color = wood ? 0x8a6038 : 0x8c8478;
    this.burst(this.soft, 6, x, 1.4, z, 2.6, 3, { life: 0.8, size: 0.11, color, gravity: 12, drag: 0.6, hard: true });
    this.burst(this.soft, 2, x, 1.2, z, 0.8, 0.4, { life: 0.8, size: 0.5, grow: 0.7, color: 0x9a8f80, alpha: 0.45 });
  }

  /** Arrow hits the ground. */
  thud(x: number, z: number): void {
    this.burst(this.soft, 3, x, 0.1, z, 0.9, 0.6, { life: 0.45, size: 0.25, grow: 0.3, color: 0x9a8a6a, alpha: 0.5 });
  }

  /** Shockwave dust ring (boss slam, arrow rain). */
  ring(x: number, z: number, r: number, color = 0x9a8a70): void {
    const n = Math.round(10 + r * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.soft.add({ x: x + Math.cos(a) * r * 0.3, y: 0.2, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 1.6, vy: 0.4, vz: Math.sin(a) * r * 1.6, life: 0.8, size: 0.6, grow: 1.4, color, alpha: 0.5, drag: 3 });
    }
  }

  /** Something was finished: a little dust and golden glints. */
  built(x: number, z: number): void {
    this.burst(this.soft, 8, x, 0.3, z, 2, 0.6, { life: 0.8, size: 0.5, grow: 0.8, color: 0xb8a078, alpha: 0.5 }, 0.8);
    this.burst(this.glow, 8, x, 1.0, z, 1.2, 2.5, { life: 0.9, size: 0.16, grow: -0.1, color: 0xffe08a, gravity: 2, drag: 1 }, 0.8);
  }

  /** Woodchips at a tree being cut, grit at a rock. */
  gather(x: number, z: number): void {
    this.burst(this.soft, 2, x, 0.8, z, 1.5, 2, { life: 0.5, size: 0.08, color: 0xc29a62, gravity: 10, hard: true });
  }

  /** A torch or brazier: flame tongue plus the odd ember. */
  flame(x: number, y: number, z: number, scale = 1): void {
    this.glow.add({ x: x + (Math.random() - 0.5) * 0.08 * scale, y, z: z + (Math.random() - 0.5) * 0.08 * scale, vx: 0, vy: 1.1 * scale, vz: 0, life: 0.32 + Math.random() * 0.12, size: 0.42 * scale, grow: -0.36 * scale, color: Math.random() < 0.5 ? 0xff8a2a : 0xffc050, drag: 0.5 });
    if (Math.random() < 0.08) this.glow.add({ x, y: y + 0.2, z, vx: (Math.random() - 0.5) * 0.4, vy: 1.4, vz: (Math.random() - 0.5) * 0.4, life: 1.2, size: 0.07, color: 0xffb060, drag: 0.3 });
  }

  /** Chimney or fire smoke. */
  smoke(x: number, y: number, z: number, vx: number, dark: boolean, big = 1): void {
    // Thin and rising fast enough that it never hides the castle it comes from.
    this.soft.add({ x, y, z, vx, vy: 1.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3, life: 2.2, size: 0.45 * big, grow: 1.1 * big, color: dark ? 0x3a3438 : 0xa8a49e, alpha: dark ? 0.38 : 0.4, drag: 0.15 });
  }
}
