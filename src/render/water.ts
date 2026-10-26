import * as THREE from 'three';
import { pondRadius, roadZ, ROAD_HALF, terrainHeight, type Pond } from './terrain';

// Ponds and the cart road. Ponds are one instanced draw: each disc is cut to its pond's outline in the shader, ripples
// are analytic, and the surface reflects the sky dome's own colours and the sun (or moon), so the sky reads even from
// the high gameplay camera. The road is one ribbon of cobbles following the railway.

const WATER_VERT = `
  attribute vec2 aPond; // outline phase, unused
  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vPhase;
  #include <fog_pars_vertex>
  void main() {
    vLocal = position.xz;
    vPhase = aPond.x;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const WATER_FRAG = `
  uniform float uTime, uNight;
  uniform vec3 uTop, uHorizon, uSunColor, uSunDir, uDeep, uShallow;
  varying vec2 vLocal;
  varying vec3 vWorld;
  varying float vPhase;
  #include <fog_pars_fragment>
  void main() {
    float a = atan(vLocal.y, vLocal.x);
    float d = length(vLocal) / (1.0 + 0.16 * sin(3.0 * a + vPhase) + 0.09 * sin(5.0 * a + vPhase * 2.1));
    if (d > 1.04) discard;
    vec2 p = vWorld.xz;
    float t = uTime;
    vec3 n = normalize(vec3(
      sin(p.x * 2.1 + t * 1.3) * 0.05 + sin((p.x + p.y) * 3.7 - t * 1.9) * 0.035 + sin(p.y * 6.3 + t * 2.3) * 0.02,
      1.0,
      cos(p.y * 2.4 - t * 1.1) * 0.05 + sin((p.x - p.y) * 4.1 + t * 1.7) * 0.035 + cos(p.x * 5.7 - t * 2.1) * 0.02));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.25 + 0.75 * pow(1.0 - max(dot(n, V), 0.0), 2.5);
    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.55));
    float sd = max(dot(R, normalize(uSunDir)), 0.0);
    float spec = pow(sd, 220.0) * 2.5 + pow(sd, 28.0) * 0.2;
    float depth = smoothstep(1.0, 0.4, d);
    vec3 col = mix(uShallow, uDeep, depth);
    col = mix(col, sky, fres * 0.8) + uSunColor * spec;
    // A broken line of foam and glints along the bank.
    float foam = smoothstep(0.84, 0.95, d) * (1.0 - smoothstep(0.97, 1.03, d)) * (0.55 + 0.45 * sin(a * 23.0 + t * 1.6 + vPhase));
    col = mix(col, vec3(0.86, 0.88, 0.8) * mix(1.0, 0.3, uNight), foam * 0.55);
    float alpha = (1.0 - smoothstep(0.95, 1.04, d)) * mix(0.6, 0.94, depth);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Water {
  private mesh: THREE.InstancedMesh;
  private phase: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  readonly material: THREE.ShaderMaterial;

  /** `sky` is the sky dome's uniforms: the water shares them, so it always reflects the current sky. */
  constructor(scene: THREE.Scene, sky: { uTop: THREE.IUniform; uHorizon: THREE.IUniform; uSunColor: THREE.IUniform; uSunDir: THREE.IUniform }, max = 16) {
    const g = new THREE.CircleGeometry(1.32, 72);
    g.rotateX(-Math.PI / 2);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    g.setAttribute('aPond', this.phase);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uNight: { value: 0 },
          uDeep: { value: new THREE.Color(0x1f3a3c) },
          uShallow: { value: new THREE.Color(0x4f6a52) },
        },
      ]),
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // Live links to the sky's colours and sun direction (merge() would have copied them).
    Object.assign(this.material.uniforms, { uTop: sky.uTop, uHorizon: sky.uHorizon, uSunColor: sky.uSunColor, uSunDir: sky.uSunDir });
    this.mesh = new THREE.InstancedMesh(g, this.material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(ponds: readonly Pond[], time: number, night: number): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uNight.value = night;
    let n = 0;
    for (const p of ponds) {
      if (n >= this.mesh.instanceMatrix.count) break;
      this.m.makeScale(p.r, 1, p.r).setPosition(p.x, -0.09, p.z);
      this.mesh.setMatrixAt(n, this.m);
      this.phase.setXY(n, p.phase, 0);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.phase.needsUpdate = true;
  }
}

/** Is (x, z) under water? Uses the same outline as the shader. */
export function inPond(p: Pond, x: number, z: number, margin = 0.9): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  if (Math.abs(dx) > p.r * 1.4 || Math.abs(dz) > p.r * 1.4) return false;
  return Math.hypot(dx, dz) < pondRadius(p, Math.atan2(dz, dx)) * margin;
}

function cobbleTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Packed earth and grit between the stones, fading out at the verges.
  g.fillStyle = '#6f6150';
  g.fillRect(0, 6, W, H - 12);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${60 + rnd() * 60},${52 + rnd() * 50},${40 + rnd() * 40},0.6)`;
    g.fillRect(rnd() * W, 6 + rnd() * (H - 12), 2, 2);
  }
  // Cobbles in staggered rows, worn smooth down the wheel ruts.
  const rows = 4;
  const rh = (H - 16) / rows;
  for (let r = 0; r < rows; r++) {
    const y = 8 + r * rh;
    let x = r % 2 ? -6 : 0;
    while (x < W) {
      const w = 9 + rnd() * 7;
      const v = 120 + rnd() * 50;
      const rut = r === 1 || r === 2 ? 0.85 : 1;
      g.fillStyle = `rgb(${v * rut},${(v - 8) * rut},${(v - 22) * rut})`;
      g.beginPath();
      g.roundRect(x + 1, y + 1, w - 2, rh - 2, 3);
      g.fill();
      g.fillStyle = 'rgba(255,245,220,0.12)';
      g.fillRect(x + 2, y + 2, w - 5, 2);
      x += w;
    }
  }
  // Kerbstones along both edges.
  for (const y of [2, H - 8]) {
    let x = 0;
    while (x < W) {
      const w = 14 + rnd() * 10;
      const v = 95 + rnd() * 30;
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      g.fillRect(x + 1, y, w - 2, 6);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class Road {
  private mesh: THREE.Mesh;
  private key = '';

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ map: cobbleTexture(), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Rebuild the ribbon over [x0, x1] when that span changes. */
  update(seed: number, x0: number, x1: number): void {
    const key = `${seed}:${x0}:${x1}`;
    if (key === this.key) return;
    this.key = key;
    const n = Math.ceil(x1 - x0);
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + i;
      const zc = roadZ(x);
      for (let s = 0; s < 2; s++) {
        const z = zc + (s ? ROAD_HALF : -ROAD_HALF);
        const k = i * 2 + s;
        pos.set([x, terrainHeight(seed, x, z) + 0.035, z], k * 3);
        uv.set([x / 2.6, s], k * 2);
      }
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}
