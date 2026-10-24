import * as THREE from 'three';
import { BALANCE, UNIT_TYPES, type MonsterType, type NodeType, type StructType, type UnitType } from '../data/balance';
import { isLit, lights, type Sim } from '../sim/sim';
import type { GameEvent, Vec } from '../sim/types';
import { chunkCenter, chunkTerrain } from '../sim/world';
import {
  castleGeometry,
  cliffGeometry,
  glowTexture,
  monsterGeometry,
  nodeGeometry,
  structGeometry,
  unitGeometry,
  wheelGeometry,
} from './geometry';

export interface Overlay {
  ghost: { type: StructType; pos: Vec; valid: boolean } | null;
  skillTarget: { pos: Vec; radius: number } | null;
}

const TERRAIN_COLOR = { plains: 0x7fae5a, forest: 0x4f7f3e, canyon: 0xa48a68 };
const NIGHT_TERRAIN = 0.35;
const MAX_POINT_LIGHTS = 6;

class Instanced {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  add(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx, color?: number | THREE.Color): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromAxisAngle(this.up, rot);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    if (color !== undefined) {
      if (typeof color === 'number') this.c.setHex(color);
      else this.c.copy(color);
      this.mesh.setColorAt(this.n, this.c);
    }
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface Fx {
  kind: 'tracer' | 'puff' | 'ring' | 'slam' | 'telegraph';
  a: Vec;
  b?: Vec;
  t: number;
  ttl: number;
  r: number;
  color: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  // Camera rig: target on the ground, distance along a fixed pitch. North (-z) is up on screen.
  camTarget = new THREE.Vector3(0, 0, 0);
  camDist = 40;
  private camSmooth = new THREE.Vector3();
  private pitch = 0.95;
  pixelRatio = Math.min(window.devicePixelRatio, 2);

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private pointLights: THREE.PointLight[] = [];
  private ground: THREE.Mesh[] = [];
  private groundChunk: number[] = [];
  private road: THREE.Mesh;
  private castle: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private fire: THREE.Mesh;
  private core: THREE.Mesh;
  private units = {} as Record<UnitType, Instanced>;
  private monsters = {} as Record<MonsterType, Instanced>;
  private nodes = {} as Record<NodeType, Instanced>;
  private structs = {} as Record<StructType, Instanced>;
  private blueprint: Instanced;
  private cliffs: Instanced;
  private glows: Instanced;
  private rings: Instanced;
  private puffs: Instanced;
  private ghost: THREE.Mesh;
  private skillRing: THREE.Mesh;
  private tracer: THREE.LineSegments;
  private tracerPos: Float32Array;
  private tracerCol: Float32Array;
  private fx: Fx[] = [];
  private fxRings: THREE.Mesh[] = [];
  private time = 0;
  private nightMix = 0;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.scene.background = new THREE.Color(0x9cc8e8);
    this.scene.fog = new THREE.Fog(0x9cc8e8, 60, 140);

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6a5a40, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
    this.sun.position.set(-20, 40, 15);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 14, 1.2);
      l.position.y = 3;
      this.scene.add(l);
      this.pointLights.push(l);
    }

    const flat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
    const mat = flat();

    this.road = new THREE.Mesh(new THREE.PlaneGeometry(400, BALANCE.world.roadHalfWidth * 2), new THREE.MeshLambertMaterial({ color: 0xb09868 }));
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.y = 0.02;
    this.scene.add(this.road);

    this.castle = new THREE.Group();
    this.castle.add(new THREE.Mesh(castleGeometry(), mat));
    const wg = wheelGeometry();
    for (const [x, z] of [[-3.1, -2], [3.1, -2], [-3.1, 2], [3.1, 2]]) {
      const w = new THREE.Mesh(wg, mat);
      w.position.set(x, 0.7, z);
      this.castle.add(w);
      this.wheels.push(w);
    }
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0x60e0ff }));
    this.core.position.y = 7.2;
    this.castle.add(this.core);
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.85 }));
    this.fire.position.y = 6.2;
    this.castle.add(this.fire);
    this.scene.add(this.castle);

    for (const t of UNIT_TYPES) this.units[t] = new Instanced(unitGeometry(t), mat, 96, this.scene);
    for (const t of ['fast', 'brute', 'ranged', 'boss'] as MonsterType[]) {
      this.monsters[t] = new Instanced(monsterGeometry(t), flat(), t === 'boss' ? 8 : 160, this.scene);
    }
    for (const t of ['tree', 'rock', 'bush'] as NodeType[]) this.nodes[t] = new Instanced(nodeGeometry(t), mat, 800, this.scene);
    for (const t of ['wall', 'tower', 'torch'] as StructType[]) this.structs[t] = new Instanced(structGeometry(t), flat(), 300, this.scene);
    this.blueprint = new Instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.35, depthWrite: false }), 300, this.scene);
    this.cliffs = new Instanced(cliffGeometry(), mat, 600, this.scene);

    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowGeo = new THREE.PlaneGeometry(2, 2);
    glowGeo.rotateX(-Math.PI / 2);
    this.glows = new Instanced(glowGeo, glowMat, 200, this.scene);
    this.glows.mesh.renderOrder = 1;

    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new Instanced(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff080, transparent: true, opacity: 0.9, depthWrite: false }), 96, this.scene);
    this.puffs = new Instanced(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 128, this.scene);

    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    const skillGeo = new THREE.RingGeometry(0.92, 1, 40);
    skillGeo.rotateX(-Math.PI / 2);
    this.skillRing = new THREE.Mesh(skillGeo, new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.8, depthWrite: false }));
    this.skillRing.visible = false;
    this.scene.add(this.skillRing);

    const maxSeg = 256;
    this.tracerPos = new Float32Array(maxSeg * 6);
    this.tracerCol = new Float32Array(maxSeg * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracer = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.tracer.frustumCulled = false;
    this.scene.add(this.tracer);

    for (let i = 0; i < 12; i++) {
      const g = new THREE.CircleGeometry(1, 32);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.3, depthWrite: false }));
      m.visible = false;
      m.position.y = 0.05;
      this.scene.add(m);
      this.fxRings.push(m);
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Ground point under a screen position (normalised device coords). */
  pick(ndcX: number, ndcY: number): Vec | null {
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /** World units per screen pixel at the camera target, used for panning. */
  worldPerPixel(screenH: number): number {
    const fov = (this.camera.fov * Math.PI) / 180;
    return (2 * this.camDist * Math.tan(fov / 2)) / screenH;
  }

  zoom(factor: number): void {
    this.camDist = Math.max(14, Math.min(70, this.camDist * factor));
  }

  pan(dx: number, dz: number): void {
    this.camTarget.x += dx;
    this.camTarget.z = Math.max(-40, Math.min(40, this.camTarget.z + dz));
  }

  centerOn(x: number, z: number): void {
    this.camTarget.set(x, 0, z);
    this.camSmooth.copy(this.camTarget);
  }

  onEvents(events: GameEvent[]): void {
    for (const e of events) {
      const p = e.pos;
      if (!p) continue;
      switch (e.key) {
        case 'fx.arrow':
          this.fx.push({ kind: 'tracer', a: p, b: e.to, t: 0, ttl: 0.18, r: 0, color: 0xfff0b0 });
          break;
        case 'fx.spit':
          this.fx.push({ kind: 'tracer', a: p, b: e.to, t: 0, ttl: 0.25, r: 0, color: 0x90ff60 });
          break;
        case 'fx.monsterDie':
          this.fx.push({ kind: 'puff', a: p, t: 0, ttl: 0.45, r: e.params?.type === 'boss' ? 3 : 1, color: 0x402030 });
          break;
        case 'fx.structDie':
        case 'fx.built':
          this.fx.push({ kind: 'puff', a: p, t: 0, ttl: 0.4, r: 1.2, color: 0xc0a080 });
          break;
        case 'fx.order':
        case 'fx.place':
          this.fx.push({ kind: 'ring', a: p, t: 0, ttl: 0.6, r: 1, color: 0xfff080 });
          break;
        case 'fx.telegraph':
          this.fx.push({ kind: 'telegraph', a: p, t: 0, ttl: Number(e.params?.t ?? 1.5), r: Number(e.params?.r ?? 4), color: 0xff3020 });
          break;
        case 'fx.slam':
        case 'fx.arrowRain':
          this.fx.push({ kind: 'slam', a: p, t: 0, ttl: 0.5, r: Number(e.params?.r ?? BALANCE.abilities.arrowRain.radius), color: e.key === 'fx.slam' ? 0xff6030 : 0xfff0a0 });
          break;
        case 'fx.bell':
          this.fx.push({ kind: 'slam', a: p, t: 0, ttl: 0.8, r: 10, color: 0x80d0ff });
          break;
      }
    }
  }

  render(sim: Sim, dt: number, overlay: Overlay): void {
    const s = sim.state;
    this.time += dt;
    const night = s.phase === 'night' ? 1 : s.phase === 'dusk' ? Math.min(1, s.phaseTime / s.phaseLength) * 0.6 : 0;
    this.nightMix += (night - this.nightMix) * Math.min(1, dt * 2);
    const n = this.nightMix;

    // Sky and lights.
    const day = new THREE.Color(0x9cc8e8);
    const dusk = new THREE.Color(0xe89a6a);
    const dark = new THREE.Color(0x0a0f1e);
    const sky = n < 0.5 ? day.clone().lerp(dusk, n * 2) : dusk.clone().lerp(dark, (n - 0.5) * 2);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.intensity = 1.6 * (1 - n) + 0.12 * n;
    this.sun.intensity = 1.8 * (1 - n) + 0.15 * n;
    this.sun.color.setHex(n > 0.5 ? 0x8090ff : 0xfff2d8);

    // Camera.
    this.camSmooth.lerp(this.camTarget, Math.min(1, dt * 10));
    const t = this.camSmooth;
    this.camera.position.set(t.x, Math.sin(this.pitch) * this.camDist, t.z + Math.cos(this.pitch) * this.camDist);
    this.camera.lookAt(t.x, 0, t.z);
    this.sun.position.set(t.x - 20, 40, t.z + 15);
    this.sun.target.position.set(t.x, 0, t.z);
    this.road.position.x = t.x;

    this.updateGround(s.seed, t.x, n);

    // Castle.
    const c = s.castle;
    this.castle.position.set(c.x, 0, c.z);
    const roll = c.moving ? this.time * 2.2 : 0;
    for (const w of this.wheels) w.rotation.x = roll;
    this.castle.position.y = c.moving ? Math.abs(Math.sin(this.time * 4)) * 0.08 : 0;
    this.core.rotation.y = this.time;
    const coreRatio = c.coreHp / c.coreMax;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(coreRatio > 0.5 ? 0x60e0ff : coreRatio > 0.3 ? 0xffc040 : 0xff3030);
    this.fire.visible = c.fire > 0;
    if (this.fire.visible) this.fire.scale.set(1, 0.8 + Math.sin(this.time * 18) * 0.2, 1);

    const ls = lights(s);
    const dark2 = s.phase === 'night';

    // Units.
    for (const type of UNIT_TYPES) this.units[type].begin();
    this.rings.begin();
    const selType = s.selected >= 0 ? UNIT_TYPES[s.selected] : null;
    for (const u of s.units) {
      if (u.inside) continue;
      const bob = u.job === 'gather' || u.job === 'build' || u.job === 'repair' ? Math.abs(Math.sin(this.time * 8 + u.id)) * 0.1 : 0;
      const hurt = u.hp / u.maxHp;
      const col = hurt > 0.5 ? 0xffffff : hurt > 0.25 ? 0xffb0a0 : 0xff6050;
      this.units[u.type].add(u.x, bob, u.z, u.id, 1.35, 1.35, 1.35, col);
      if (u.type === selType) this.rings.add(u.x, 0.06, u.z, 0, 1, 1, 1, 0xfff080);
    }
    for (const type of UNIT_TYPES) this.units[type].end();

    // Monsters (only in the light at night).
    for (const k of Object.keys(this.monsters) as MonsterType[]) this.monsters[k].begin();
    for (const m of s.monsters) {
      if (dark2 && !isLit(s, ls, m.x, m.z)) continue;
      const rot = Math.atan2(c.x - m.x, c.z - m.z);
      const hurt = m.hp / m.maxHp;
      const sc = 1.25 * (m.type === 'boss' ? 1 : Math.min(1.6, Math.sqrt(m.maxHp / BALANCE.monsters[m.type].hp / (1 + (s.night - 1) * BALANCE.monsterGrowthPerNight))));
      const col = hurt > 0.5 ? 0xffffff : 0xff9090;
      this.monsters[m.type].add(m.x, Math.abs(Math.sin(this.time * 9 + m.id)) * 0.12, m.z, rot, sc, sc, sc, col);
    }
    for (const k of Object.keys(this.monsters) as MonsterType[]) this.monsters[k].end();

    // Resource nodes shrink as they deplete.
    for (const k of Object.keys(this.nodes) as NodeType[]) this.nodes[k].begin();
    for (const nd of s.nodes) {
      if (Math.abs(nd.x - t.x) > 90) continue;
      const r = nd.amount / nd.max;
      if (r <= 0) {
        if (nd.type === 'tree') this.nodes.tree.add(nd.x, -1.6, nd.z, nd.id, 0.6, 0.6, 0.6, 0x806040);
        continue;
      }
      const sc = 0.45 + 0.55 * r;
      this.nodes[nd.type].add(nd.x, 0, nd.z, nd.id * 1.7, sc, sc, sc, 0xffffff);
    }
    for (const k of Object.keys(this.nodes) as NodeType[]) this.nodes[k].end();

    // Structures and blueprints.
    for (const k of Object.keys(this.structs) as StructType[]) this.structs[k].begin();
    this.blueprint.begin();
    for (const st of s.structs) {
      const x = st.cx + 0.5;
      const z = st.cz + 0.5;
      if (st.built < 1) {
        const h = 0.2 + st.built * 1.2;
        this.blueprint.add(x, h / 2, z, 0, 0.95, h, 0.95);
        if (st.built > 0) this.structs[st.type].add(x, 0, z, 0, 1, Math.max(0.05, st.built), 1, 0xb0b0b0);
        continue;
      }
      const hurt = st.hp / st.maxHp;
      const col = st.dismantle ? 0xffe060 : hurt > 0.6 ? 0xffffff : hurt > 0.3 ? 0xffb080 : 0xff6040;
      this.structs[st.type].add(x, 0, z, 0, 1, 1, 1, col);
    }
    for (const k of Object.keys(this.structs) as StructType[]) this.structs[k].end();
    this.blueprint.end();

    // Light discs and point lights.
    this.glows.begin();
    if (n > 0.05) {
      for (const l of ls) this.glows.add(l.x, 0.04, l.z, 0, l.r, 1, l.r);
    }
    this.glows.end();
    (this.glows.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * n;
    const sorted = ls
      .map((l) => ({ l, d: (l.x - t.x) ** 2 + (l.z - t.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.pointLights.forEach((pl, i) => {
      const e = sorted[i];
      if (!e || n < 0.05) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(e.l.x, i === 0 ? 7 : 2.5, e.l.z);
      pl.distance = e.l.r * 1.7;
      pl.intensity = (i === 0 ? 40 : 14) * n * (0.92 + Math.sin(this.time * 11 + i) * 0.08);
    });

    // Overlay.
    if (overlay.ghost) {
      this.ghost.visible = true;
      const g = overlay.ghost;
      this.ghost.position.set(Math.floor(g.pos.x) + 0.5, 0.6, Math.floor(g.pos.z) + 0.5);
      (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(g.valid ? 0x40ff60 : 0xff4040);
    } else this.ghost.visible = false;
    if (overlay.skillTarget) {
      this.skillRing.visible = true;
      this.skillRing.position.set(overlay.skillTarget.pos.x, 0.08, overlay.skillTarget.pos.z);
      this.skillRing.scale.setScalar(overlay.skillTarget.radius);
    } else this.skillRing.visible = false;

    this.updateFx(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateGround(seed: number, cx: number, night: number): void {
    const L = BALANCE.world.chunkLength;
    const first = Math.round(cx / L) - 3;
    if (this.ground.length === 0) {
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(L, 140), new THREE.MeshLambertMaterial({ color: 0x7fae5a }));
        m.rotation.x = -Math.PI / 2;
        this.scene.add(m);
        this.ground.push(m);
        this.groundChunk.push(Number.NaN);
      }
    }
    this.cliffs.begin();
    for (let i = 0; i < 7; i++) {
      const chunk = first + i;
      const m = this.ground[i];
      const terrain = chunkTerrain(seed, chunk);
      if (this.groundChunk[i] !== chunk) {
        this.groundChunk[i] = chunk;
        m.position.set(chunkCenter(chunk), 0, 0);
      }
      const col = new THREE.Color(TERRAIN_COLOR[terrain]);
      if (night > 0) col.multiplyScalar(1 - night * (1 - NIGHT_TERRAIN));
      (m.material as THREE.MeshLambertMaterial).color.copy(col);
      if (terrain === 'canyon') {
        const cz = BALANCE.world.canyonCliffZ;
        for (let x = 0; x < L; x += 1.6) {
          const wx = chunkCenter(chunk) - L / 2 + x + 0.8;
          for (let row = 0; row < 3; row++) {
            const sc = 1 + row * 0.5 + ((x * 7.3 + row) % 1) * 0.4;
            this.cliffs.add(wx, 0, -(cz + 0.8 + row * 2.2), x * 3 + row, sc, sc * (1 + row * 0.3), sc);
            this.cliffs.add(wx, 0, cz + 0.8 + row * 2.2, x * 5 + row, sc, sc * (1 + row * 0.3), sc);
          }
        }
      }
    }
    this.cliffs.end();
  }

  private updateFx(dt: number): void {
    let seg = 0;
    this.puffs.begin();
    let ringIdx = 0;
    for (const r of this.fxRings) r.visible = false;
    const col = new THREE.Color();
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.ttl;
      if (k >= 1) continue;
      if (f.kind === 'tracer' && f.b && seg < 256) {
        const i = seg * 6;
        // A short bolt travelling from a to b.
        const h0 = Math.max(0, k - 0.35);
        const h1 = k;
        this.tracerPos[i] = f.a.x + (f.b.x - f.a.x) * h0;
        this.tracerPos[i + 1] = 1.2;
        this.tracerPos[i + 2] = f.a.z + (f.b.z - f.a.z) * h0;
        this.tracerPos[i + 3] = f.a.x + (f.b.x - f.a.x) * h1;
        this.tracerPos[i + 4] = 0.8;
        this.tracerPos[i + 5] = f.a.z + (f.b.z - f.a.z) * h1;
        col.setHex(f.color);
        for (let j = 0; j < 2; j++) {
          this.tracerCol[i + j * 3] = col.r;
          this.tracerCol[i + j * 3 + 1] = col.g;
          this.tracerCol[i + j * 3 + 2] = col.b;
        }
        seg++;
      } else if (f.kind === 'puff') {
        const sc = f.r * (0.6 + k * 1.4) * (1 - k);
        this.puffs.add(f.a.x, 0.5 + k, f.a.z, 0, sc * 2, sc * 2, sc * 2, f.color);
      } else if (f.kind === 'ring') {
        this.rings.add(f.a.x, 0.07, f.a.z, 0, f.r * (1 + k * 1.5), 1, f.r * (1 + k * 1.5), f.color);
      } else if ((f.kind === 'telegraph' || f.kind === 'slam') && ringIdx < this.fxRings.length) {
        const m = this.fxRings[ringIdx++];
        m.visible = true;
        m.position.set(f.a.x, 0.06, f.a.z);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(f.color);
        if (f.kind === 'telegraph') {
          m.scale.setScalar(f.r * Math.min(1, 0.3 + k));
          mat.opacity = 0.25 + 0.25 * Math.sin(k * 20) ** 2;
        } else {
          m.scale.setScalar(f.r * (0.6 + k * 0.6));
          mat.opacity = 0.6 * (1 - k);
        }
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.ttl);
    this.puffs.end();
    this.rings.end();
    const g = this.tracer.geometry;
    g.setDrawRange(0, seg * 2);
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
  }

  /** Screen-space position of a world point, in CSS pixels. */
  project(x: number, z: number, w: number, h: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, 0, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 };
  }
}
