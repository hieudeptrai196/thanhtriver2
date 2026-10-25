import * as THREE from 'three';

// Ground marks left by the fight (scorch, cracks, bone dust, pockmarks) and arrows stuck in the turf. One instanced
// draw call each; marks fade out over their life so the field reads as fought over without filling up for good.

export type DecalKind = 'scorch' | 'cracks' | 'bones' | 'pocks';
const TILE: Record<DecalKind, number> = { scorch: 0, cracks: 1, bones: 2, pocks: 3 };

function atlas(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cx = S / 2;
  // Scorch: a burnt blot with a ragged edge and ash flecks.
  {
    const grd = g.createRadialGradient(cx, cx, 4, cx, cx, cx);
    grd.addColorStop(0, 'rgba(20,14,10,0.95)');
    grd.addColorStop(0.55, 'rgba(38,26,16,0.75)');
    grd.addColorStop(1, 'rgba(50,36,22,0)');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = cx * (0.72 + rnd() * 0.28);
      g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
    }
    g.fill();
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${90 + rnd() * 40},${80 + rnd() * 30},${70},${0.5 * rnd()})`;
      g.fillRect(cx + (rnd() - 0.5) * 80, cx + (rnd() - 0.5) * 80, 2, 2);
    }
  }
  // Cracks: radial fissures from a crushed centre.
  {
    const ox = S;
    const grd = g.createRadialGradient(ox + cx, cx, 2, ox + cx, cx, cx * 0.5);
    grd.addColorStop(0, 'rgba(30,22,14,0.8)');
    grd.addColorStop(1, 'rgba(30,22,14,0)');
    g.fillStyle = grd;
    g.fillRect(ox, 0, S, S);
    g.strokeStyle = 'rgba(24,18,12,0.9)';
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
      let x = ox + cx;
      let y = cx;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        a += (rnd() - 0.5) * 0.7;
        const l = 6 + rnd() * 6;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        g.lineTo(x, y);
        g.lineWidth = Math.max(1, 4 - j * 0.6);
      }
      g.stroke();
    }
  }
  // Bone dust: pale grit and a few shards.
  {
    const ox = S * 2;
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.7) * cx * 0.9;
      const v = 200 + rnd() * 40;
      g.fillStyle = `rgba(${v},${v - 8},${v - 28},${0.35 + rnd() * 0.5})`;
      const sz = rnd() < 0.1 ? 5 : 2;
      g.fillRect(ox + cx + Math.cos(a) * r, cx + Math.sin(a) * r, sz, sz * (rnd() < 0.5 ? 1 : 2));
    }
  }
  // Pockmarks: small dark divots where arrows struck.
  {
    const ox = S * 3;
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * cx * 0.8;
      const x = ox + cx + Math.cos(a) * r;
      const y = cx + Math.sin(a) * r;
      const grd = g.createRadialGradient(x, y, 0, x, y, 9);
      grd.addColorStop(0, 'rgba(34,24,14,0.85)');
      grd.addColorStop(1, 'rgba(34,24,14,0)');
      g.fillStyle = grd;
      g.fillRect(x - 10, y - 10, 20, 20);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Mark {
  x: number;
  z: number;
  r: number;
  rot: number;
  tile: number;
  age: number;
  life: number;
}

interface Stuck {
  x: number;
  z: number;
  yaw: number;
  tilt: number;
  age: number;
  life: number;
}

export class Decals {
  private mesh: THREE.InstancedMesh;
  private tile: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private marks: Mark[] = [];
  private arrows: THREE.InstancedMesh;
  private stuck: Stuck[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(scene: THREE.Scene, private max = 120) {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    this.tile = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aTile', this.tile);
    g.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas() } },
      vertexShader: `attribute float aTile; attribute float aAlpha; varying vec2 vUv; varying float vA;
        void main() {
          vUv = vec2((uv.x + aTile) * 0.25, uv.y); vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying float vA;
        void main() {
          vec4 c = texture2D(uMap, vUv);
          gl_FragColor = vec4(c.rgb, c.a * vA);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    // A fletched shaft, base at the origin, pointing up.
    const shaft = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5);
    shaft.translate(0, 0.35, 0);
    const fl = new THREE.BoxGeometry(0.16, 0.16, 0.01);
    fl.translate(0, 0.6, 0);
    const fl2 = fl.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const parts = [shaft, fl, fl2].map((p) => p.toNonIndexed());
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    parts.forEach((p, i) => {
      pos.push(...(p.getAttribute('position').array as Float32Array));
      nor.push(...(p.getAttribute('normal').array as Float32Array));
      const c = new THREE.Color(i === 0 ? 0x7a5634 : 0xe8e0cc);
      for (let k = 0; k < p.getAttribute('position').count; k++) col.push(c.r, c.g, c.b);
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.arrows = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 160);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    scene.add(this.arrows);
  }

  /** A mark on the ground of radius r that fades over `life` seconds. */
  add(kind: DecalKind, x: number, z: number, r: number, life = 22): void {
    if (this.marks.length >= this.max) this.marks.shift();
    this.marks.push({ x, z, r, rot: Math.random() * Math.PI * 2, tile: TILE[kind], age: 0, life });
  }

  /** An arrow left standing in the turf where it landed. */
  arrow(x: number, z: number, fromX: number, fromZ: number): void {
    if (this.stuck.length >= 160) this.stuck.shift();
    const yaw = Math.atan2(x - fromX, z - fromZ);
    this.stuck.push({ x, z, yaw, tilt: 0.45 + Math.random() * 0.35, age: 0, life: 7 + Math.random() * 2 });
  }

  update(dt: number, heightAt: (x: number, z: number) => number): void {
    let n = 0;
    for (const d of this.marks) {
      d.age += dt;
      if (d.age >= d.life) continue;
      const k = d.age / d.life;
      // Pop in fast, hold, then fade over the last half of life.
      const a = Math.min(1, d.age / 0.25) * (k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), d.rot);
      this.m.compose(this.v.set(d.x, heightAt(d.x, d.z) + 0.04, d.z), this.q, this.sc.set(d.r, 1, d.r));
      this.mesh.setMatrixAt(n, this.m);
      this.tile.setX(n, d.tile);
      this.alpha.setX(n, a);
      n++;
    }
    this.marks = this.marks.filter((d) => d.age < d.life);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tile.needsUpdate = true;
    this.alpha.needsUpdate = true;

    let m = 0;
    for (const s of this.stuck) {
      s.age += dt;
      if (s.age >= s.life) continue;
      // Sink into the ground over the last second instead of popping out.
      const sink = Math.max(0, s.age - (s.life - 1)) * 0.6;
      this.e.set(s.tilt, s.yaw, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(s.x, heightAt(s.x, s.z) - 0.12 - sink, s.z), this.q, this.sc.set(1, 1, 1));
      this.arrows.setMatrixAt(m++, this.m);
    }
    this.stuck = this.stuck.filter((s) => s.age < s.life);
    this.arrows.count = m;
    this.arrows.instanceMatrix.needsUpdate = true;
  }
}

// Ground telegraphs: a dashed rim that turns, a fill that grows toward the rim as the strike lands (time to impact at a
// glance), and a crosshair while the player is aiming. Mode 0 = aim, 1 = incoming strike, 2 = shockwave after impact.

const TELE_FRAG = `uniform vec3 uColor; uniform float uProgress, uTime, uMode, uOpacity; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);
    float aa = fwidth(r) * 1.5;
    float rim = smoothstep(0.9 - aa, 0.92, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
    float dash = step(0.42, fract(ang * 24.0 / 6.2831853 + uTime * (uMode < 0.5 ? 0.25 : -0.6)));
    float a = 0.0;
    if (uMode < 1.5) {
      a += rim * mix(1.0, dash, 0.75) * 0.95;
      float inner = smoothstep(0.86, 0.8, r);
      a += inner * (uMode < 0.5 ? 0.12 : 0.16);
    }
    if (uMode > 0.5 && uMode < 1.5) {
      // Fill closing in on the rim; its leading edge is a bright line.
      float f = uProgress * 0.9;
      a += smoothstep(f + aa, f, r) * 0.22;
      a += (smoothstep(f - 0.05, f, r) - smoothstep(f, f + aa + 0.01, r)) * 0.8;
    } else if (uMode < 0.5) {
      // Crosshair and a centre pip.
      float cx = (1.0 - smoothstep(0.012, 0.02, abs(p.x))) * step(0.2, abs(p.y)) * step(abs(p.y), 0.55);
      float cy = (1.0 - smoothstep(0.012, 0.02, abs(p.y))) * step(0.2, abs(p.x)) * step(abs(p.x), 0.55);
      a += (cx + cy) * 0.8 + smoothstep(0.06, 0.04, r) * 0.9;
    } else {
      // Shockwave: a thick bright band that travels outward.
      float w = 0.12 * (1.0 - uProgress) + 0.03;
      float c = 0.35 + uProgress * 0.65;
      a += smoothstep(w, 0.0, abs(r - c)) * 0.9;
    }
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;

export class Telegraphs {
  private pool: THREE.Mesh[] = [];
  private used = 0;

  constructor(private scene: THREE.Scene, size = 14) {
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < size; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uProgress: { value: 0 }, uTime: { value: 0 }, uMode: { value: 0 }, uOpacity: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: TELE_FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(g, mat);
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      this.pool.push(m);
    }
  }

  begin(): void {
    for (let i = 0; i < this.used; i++) this.pool[i].visible = false;
    this.used = 0;
  }

  add(mode: 0 | 1 | 2, x: number, y: number, z: number, r: number, color: number, progress: number, time: number, opacity = 1): void {
    if (this.used >= this.pool.length) return;
    const m = this.pool[this.used++];
    m.visible = true;
    // Above the grass tips so the meadow never hides a warning.
    m.position.set(x, y + 0.32, z);
    m.scale.set(r, 1, r);
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uColor.value.setHex(color);
    u.uProgress.value = progress;
    u.uTime.value = time;
    u.uMode.value = mode;
    u.uOpacity.value = opacity;
  }
}
