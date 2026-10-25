import * as THREE from 'three';
import { BALANCE, UNIT_TYPES, type MonsterType, type NodeType, type StructType, type UnitType } from '../data/balance';
import { isLit, lights, type Sim } from '../sim/sim';
import type { GameEvent, Vec } from '../sim/types';
import { hash01 } from '../sim/rng';
import { chunkCenter, chunkTerrain } from '../sim/world';
import { Terrain, terrainHeight } from './terrain';
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
import { ACT_FRAMES, loadModels, MOVE_FRAMES, type Baked, type CharModel, type DecorName, type Models } from './models';

export interface Overlay {
  ghost: { type: StructType; pos: Vec; valid: boolean } | null;
  skillTarget: { pos: Vec; radius: number } | null;
}

const MAX_POINT_LIGHTS = 6;
// Height of the castle deck where archers stand once the KayKit castle is loaded.
const WALL_WALK_Y = 1.2;
// Rails sit under the castle's wheels.
const RAIL_Z = 2.1;
const RAIL_LEN = 200;

class Instanced {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], max: number, scene: THREE.Scene, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.castShadow = shadow;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  setModel(b: Baked): void {
    this.mesh.geometry = b.geo;
    this.mesh.material = b.materials;
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
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

type Pose = 'idle' | 'move' | 'act';

/** One unit or monster kind: a single code-built mesh until the KayKit model loads, then one mesh per baked pose. */
class Crowd {
  private slots: Instanced[];
  private animated = false;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private max: number, private scene: THREE.Scene) {
    this.slots = [new Instanced(geo, mat, max, scene)];
  }

  get hasModel(): boolean {
    return this.animated;
  }

  setModel(m: CharModel): void {
    this.slots[0].setModel(m.idle);
    for (const b of [...m.move, ...m.act]) {
      const inst = new Instanced(b.geo, b.materials, this.max, this.scene);
      this.slots.push(inst);
    }
    this.animated = true;
  }

  begin(): void {
    for (const s of this.slots) s.begin();
  }

  /** `phase` is a running animation clock; each pose cycles through its frames. */
  add(pose: Pose, phase: number, x: number, y: number, z: number, rot: number, sc: number, color: number): void {
    let i = 0;
    if (this.animated && pose === 'move') i = 1 + (Math.floor(phase * MOVE_FRAMES) % MOVE_FRAMES);
    else if (this.animated && pose === 'act') i = 1 + MOVE_FRAMES + (Math.floor(phase * ACT_FRAMES) % ACT_FRAMES);
    this.slots[i].add(x, y, z, rot, sc, sc, sc, color);
  }

  end(): void {
    for (const s of this.slots) s.end();
  }
}

interface Motion {
  x: number;
  z: number;
  rot: number;
  moving: number; // seconds since it last moved, for a little hysteresis
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
  private terrain: Terrain;
  private decor = new Map<DecorName, Instanced>();
  private decorKey = '';
  private crops: Instanced[] = [];
  private railway: THREE.Group;
  private scenery: Instanced[] = [];
  private groves: Instanced[] = [];
  private castle: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private fire: THREE.Mesh;
  private core: THREE.Mesh;
  private units = {} as Record<UnitType, Crowd>;
  private monsters = {} as Record<MonsterType, Crowd>;
  private nodes = {} as Record<NodeType, Instanced[]>;
  private stumps: Instanced;
  private structs = {} as Record<StructType, Instanced>;
  private castleCode: THREE.Mesh;
  private flags: THREE.Group;
  private models: Models | null = null;
  private motion = new Map<number, Motion>();
  private blueprint: Instanced;
  private cliffs: Instanced[];
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.scene.background = new THREE.Color(0x9cc8e8);
    this.scene.fog = new THREE.Fog(0x9cc8e8, 60, 140);

    this.terrain = new Terrain(this.scene);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6a5a40, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
    this.sun.position.set(-20, 40, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
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

    this.railway = this.buildRailway();
    this.scene.add(this.railway);

    this.castle = new THREE.Group();
    this.castleCode = new THREE.Mesh(castleGeometry(), mat);
    this.castle.add(this.castleCode);
    this.flags = new THREE.Group();
    this.castle.add(this.flags);
    const wg = wheelGeometry();
    for (const [x, z] of [[-2.2, -RAIL_Z], [0, -RAIL_Z], [2.2, -RAIL_Z], [-2.2, RAIL_Z], [0, RAIL_Z], [2.2, RAIL_Z]]) {
      const w = new THREE.Mesh(wg, mat);
      w.position.set(x, 1.0, z);
      if (z < 0) w.rotation.y = Math.PI;
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

    for (const t of UNIT_TYPES) this.units[t] = new Crowd(unitGeometry(t), mat, 96, this.scene);
    for (const t of ['fast', 'brute', 'ranged', 'boss'] as MonsterType[]) {
      this.monsters[t] = new Crowd(monsterGeometry(t), flat(), t === 'boss' ? 8 : 160, this.scene);
    }
    for (const t of ['tree', 'rock', 'bush'] as NodeType[]) this.nodes[t] = [new Instanced(nodeGeometry(t), mat, 800, this.scene)];
    const stumpGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.3, 6);
    stumpGeo.translate(0, 0.15, 0);
    this.stumps = new Instanced(stumpGeo, new THREE.MeshLambertMaterial({ color: 0x806040 }), 800, this.scene);
    for (const t of ['wall', 'tower', 'torch'] as StructType[]) this.structs[t] = new Instanced(structGeometry(t), flat(), 300, this.scene);
    this.blueprint = new Instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.35, depthWrite: false }), 300, this.scene, false);
    this.cliffs = [new Instanced(cliffGeometry(), mat, 600, this.scene)];

    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowGeo = new THREE.PlaneGeometry(2, 2);
    glowGeo.rotateX(-Math.PI / 2);
    this.glows = new Instanced(glowGeo, glowMat, 200, this.scene, false);
    this.glows.mesh.renderOrder = 1;

    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new Instanced(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff080, transparent: true, opacity: 0.9, depthWrite: false }), 96, this.scene, false);
    this.puffs = new Instanced(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 128, this.scene, false);

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

  private applyModels(m: Models): void {
    this.models = m;
    this.units.peasant.setModel(m.chars.peasant);
    this.units.builder.setModel(m.chars.builder);
    this.units.spear.setModel(m.chars.spear);
    // Shieldbearers reuse the knight, a size up and steel-blue (see CREDITS.md).
    this.units.shield.setModel(m.chars.spear);
    this.units.archer.setModel(m.chars.archer);
    this.monsters.fast.setModel(m.chars.fast);
    this.monsters.brute.setModel(m.chars.brute);
    this.monsters.ranged.setModel(m.chars.ranged);
    this.monsters.boss.setModel(m.chars.brute);
    const max = 800;
    this.nodes.tree = [m.props.treeA, m.props.treeB].map((b) => new Instanced(b.geo, b.materials, max, this.scene));
    this.nodes.rock = [m.props.rockA, m.props.rockB, m.props.rockC].map((b) => new Instanced(b.geo, b.materials, max, this.scene));
    this.stumps.setModel(m.props.stump);
    this.structs.wall.setModel(m.props.fence);
    this.structs.tower.setModel(m.props.tower);
    this.cliffs = [m.props.mountain, m.props.rockA, m.props.rockC].map((b) => new Instanced(b.geo, b.materials, 600, this.scene));
    this.scenery = [m.props.hillsA, m.props.hillsB, m.props.peak].map((b) => new Instanced(b.geo, b.materials, 80, this.scene));
    this.groves = [m.props.groveA, m.props.groveB].map((b) => new Instanced(b.geo, b.materials, 120, this.scene));
    // Kenney Nature Kit: ground clutter (no shadows, it is small and plentiful) and crop fields for food.
    for (const [name, b] of Object.entries(m.decor) as [DecorName, Baked][]) {
      if (name === 'pumpkin' || name === 'wheat' || name === 'corn') continue;
      const big = name === 'log' || name === 'stumpOld' || name === 'campfire';
      this.decor.set(name, new Instanced(b.geo, b.materials, big ? 120 : 1600, this.scene, big));
    }
    this.crops = [m.decor.pumpkin, m.decor.wheat, m.decor.corn].map((b) => new Instanced(b.geo, b.materials, 800, this.scene));
    for (const v of this.nodes.bush) v.mesh.visible = false;
    this.nodes.bush = this.crops;
    this.decorKey = '';
    // Castle: KayKit keep on the code-built wooden platform with wheels.
    this.castleCode.visible = false;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 6.4), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
    deck.position.y = 0.95;
    const keep = new THREE.Mesh(m.props.castle.geo, m.props.castle.materials);
    keep.position.y = 1.2;
    this.castle.add(deck, keep);
    deck.castShadow = keep.castShadow = true;
    // Palisade along the deck edge: the castle wall.
    for (let i = 0; i < 5; i++) {
      const o = -2.6 + i * 1.3;
      for (const [x, z, r] of [[o, -3.05, 0], [o, 3.05, 0], [-3.05, o, Math.PI / 2], [3.05, o, Math.PI / 2]]) {
        if (Math.abs(o) < 0.7 && z === 3.05) continue; // gate gap facing the camera
        const f = new THREE.Mesh(m.props.fence.geo, m.props.fence.materials);
        f.position.set(x, 1.2, z);
        f.rotation.y = r;
        f.scale.set(1.15, 1.1, 1.15);
        f.castShadow = true;
        this.flags.add(f);
      }
    }
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const f = new THREE.Mesh(m.props.flag.geo, m.props.flag.materials);
      f.position.set(x, 1.2, z);
      this.flags.add(f);
    }
    this.core.position.y = 9.2;
  }

  /** Shadows cost the most on weak GPUs; main turns them off when frames stay slow. */
  setShadows(on: boolean): void {
    if (this.renderer.shadowMap.enabled === on) return;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
  }

  get shadows(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  /** Starts loading the KayKit models; until then (or if loading fails) the code-built shapes are used. */
  loadModels(): void {
    loadModels()
      .then((m) => this.applyModels(m))
      .catch((e: unknown) => console.warn('models not loaded, using built-in shapes', e));
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
    this.railway.position.x = Math.round(t.x);

    this.updateGround(s.seed, t.x);

    // Castle.
    const c = s.castle;
    this.castle.position.set(c.x, 0, c.z);
    const roll = c.moving ? this.time * 2.2 : 0;
    for (const w of this.wheels) w.rotation.z = w.position.z < 0 ? roll : -roll;
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
    const seen = new Set<number>();
    for (const u of s.units) {
      if (u.inside) continue;
      seen.add(u.id);
      const crowd = this.units[u.type];
      const target = u.targetId >= 0 && u.type !== 'peasant' && u.type !== 'builder' ? s.monsters.find((m) => m.id === u.targetId) : undefined;
      const mo = this.track(u.id, u.x, u.z, dt, target);
      const working = u.job === 'gather' || u.job === 'build' || u.job === 'repair' || u.job === 'attack';
      const pose: Pose = mo.moving < 0.15 ? 'move' : working ? 'act' : 'idle';
      const hurt = u.hp / u.maxHp;
      const col = hurt > 0.5 ? (u.type === 'shield' ? 0xa8c0ff : 0xffffff) : hurt > 0.25 ? 0xffb0a0 : 0xff6050;
      const onWall = crowd.hasModel && u.type === 'archer' && Math.abs(u.x - c.x) < 3.2 && Math.abs(u.z - c.z) < 3.2;
      const bob = crowd.hasModel ? 0 : pose === 'act' ? Math.abs(Math.sin(this.time * 8 + u.id)) * 0.1 : 0;
      const size = (crowd.hasModel ? 1 : 1.35) * (u.type === 'shield' ? 1.12 : 1);
      crowd.add(pose, this.time * (pose === 'move' ? 1.1 : 1.4) + u.id * 0.37, u.x, (onWall ? WALL_WALK_Y : 0) + bob, u.z, mo.rot, size, col);
      if (u.type === selType) this.rings.add(u.x, onWall ? WALL_WALK_Y + 0.05 : 0.06, u.z, 0, 1, 1, 1, 0xfff080);
      else if (s.selectedIds.includes(u.id)) this.rings.add(u.x, onWall ? WALL_WALK_Y + 0.05 : 0.06, u.z, 0, 1.1, 1, 1.1, 0x80f0ff);
    }
    for (const type of UNIT_TYPES) this.units[type].end();

    // Monsters (only in the light at night).
    for (const k of Object.keys(this.monsters) as MonsterType[]) this.monsters[k].begin();
    for (const m of s.monsters) {
      seen.add(m.id);
      const mo = this.track(m.id, m.x, m.z, dt);
      if (dark2 && !isLit(s, ls, m.x, m.z)) continue;
      const crowd = this.monsters[m.type];
      const hurt = m.hp / m.maxHp;
      // Overflow-buffed monsters look bigger.
      let sc = Math.min(1.6, Math.sqrt(m.maxHp / BALANCE.monsters[m.type].hp / (1 + (s.night - 1) * BALANCE.monsterGrowthPerNight)));
      if (m.type === 'boss') sc = crowd.hasModel ? 2.4 : 1.25;
      else if (!crowd.hasModel) sc *= 1.25;
      const base = m.type === 'boss' && crowd.hasModel ? 0xff8070 : 0xffffff;
      const col = hurt > 0.5 ? base : 0xff9090;
      const pose: Pose = m.slamAt ? 'act' : mo.moving < 0.15 ? 'move' : 'act';
      const bob = crowd.hasModel ? 0 : Math.abs(Math.sin(this.time * 9 + m.id)) * 0.12;
      crowd.add(pose, this.time * (m.type === 'fast' ? 1.6 : 1.1) + m.id * 0.29, m.x, bob, m.z, mo.rot, sc, col);
    }
    for (const id of this.motion.keys()) if (!seen.has(id)) this.motion.delete(id);
    for (const k of Object.keys(this.monsters) as MonsterType[]) this.monsters[k].end();

    // Resource nodes shrink as they deplete.
    for (const k of Object.keys(this.nodes) as NodeType[]) for (const v of this.nodes[k]) v.begin();
    this.stumps.begin();
    for (const nd of s.nodes) {
      if (Math.abs(nd.x - t.x) > 90) continue;
      const r = nd.amount / nd.max;
      if (r <= 0) {
        if (nd.type === 'tree') this.stumps.add(nd.x, 0, nd.z, nd.id, 1, 1, 1, 0xffffff);
        continue;
      }
      const sc = 0.45 + 0.55 * r;
      const variants = this.nodes[nd.type];
      variants[nd.id % variants.length].add(nd.x, 0, nd.z, nd.id * 1.7, sc, sc, sc, 0xffffff);
    }
    for (const k of Object.keys(this.nodes) as NodeType[]) for (const v of this.nodes[k]) v.end();
    this.stumps.end();

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
      let rot = 0;
      if (st.type === 'wall') {
        // Fences run along neighbouring wall cells.
        const has = (dx: number, dz: number) => s.structs.some((o) => o.type === 'wall' && o.cx === st.cx + dx && o.cz === st.cz + dz);
        if ((has(0, 1) || has(0, -1)) && !has(1, 0) && !has(-1, 0)) rot = Math.PI / 2;
      }
      const tall = this.models && st.type === 'wall' ? 1.6 : 1;
      this.structs[st.type].add(x, 0, z, rot, 1, tall, 1, col);
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

  private updateGround(seed: number, cx: number): void {
    const L = BALANCE.world.chunkLength;
    const first = Math.round(cx / L) - 3;
    this.terrain.update(seed, cx);
    for (const c of this.cliffs) c.begin();
    for (const v of this.scenery) v.begin();
    for (const v of this.groves) v.begin();
    for (let i = 0; i < 7; i++) {
      const chunk = first + i;
      const terrain = chunkTerrain(seed, chunk);
      if (this.scenery.length) this.placeScenery(seed, chunk, terrain);
      if (terrain !== 'canyon') continue;
      // Boulders along the foot of the canyon walls.
      const cz = BALANCE.world.canyonCliffZ;
      for (let x = 0; x < L; x += 2.2) {
        const wx = chunkCenter(chunk) - L / 2 + x + 1.1;
        const v = this.cliffs[Math.floor(x * 1.7) % this.cliffs.length];
        const r = hash01(seed, chunk, Math.round(x * 10), 7);
        const north = this.models ? 0.6 + r * 0.5 : 1 + r;
        v.add(wx, terrainHeight(seed, wx, -(cz + 1)) - 0.2, -(cz + 1 + r), x * 3, north, north, north);
        // The camera looks from the south: keep that side low so it does not hide the camp.
        const south = this.models ? 0.35 + r * 0.25 : 0.8;
        v.add(wx, terrainHeight(seed, wx, cz + 1) - 0.2, cz + 1 + r, x * 5, south, south * 0.8, south);
      }
    }
    for (const c of this.cliffs) c.end();
    for (const v of this.scenery) v.end();
    for (const v of this.groves) v.end();
    this.placeDecor(seed, first);
  }

  /** Grass, flowers, mushrooms, pebbles and logs. Deterministic per chunk; rebuilt only when the view shifts a chunk. */
  private placeDecor(seed: number, first: number): void {
    if (this.decor.size === 0) return;
    const key = `${seed}:${first}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    for (const v of this.decor.values()) v.begin();
    const L = BALANCE.world.chunkLength;
    const pick: [DecorName, number][] = [
      ['grass', 30], ['grassLarge', 14], ['grassLeafs', 10], ['flowerRed', 5], ['flowerYellow', 6], ['flowerPurple', 5],
      ['mushroomRed', 2], ['mushroomTan', 2], ['bushSmall', 6], ['pebble', 6], ['pebbleFlat', 5], ['log', 1], ['stumpOld', 1],
    ];
    const total = pick.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < 7; i++) {
      const chunk = first + i;
      const terrain = chunkTerrain(seed, chunk);
      const count = terrain === 'forest' ? 520 : terrain === 'plains' ? 460 : 140;
      const maxZ = terrain === 'canyon' ? BALANCE.world.canyonCliffZ - 0.5 : 46;
      const x0 = chunkCenter(chunk) - L / 2;
      for (let k = 0; k < count; k++) {
        const h = (salt: number) => hash01(seed, chunk, k, salt + 40);
        const z = (h(1) * 2 - 1) * maxZ;
        if (Math.abs(z) < 3.8) continue; // keep the railway bed clean
        const x = x0 + h(2) * L;
        let r = h(3) * total;
        let name: DecorName = 'grass';
        for (const [n, w] of pick) {
          r -= w;
          if (r < 0) {
            name = n;
            break;
          }
        }
        if (terrain === 'canyon' && (name.startsWith('flower') || name.startsWith('mushroom'))) name = 'pebble';
        if (terrain === 'forest' && name === 'flowerYellow') name = 'mushroomTan';
        const sc = 0.75 + h(4) * 0.6;
        this.decor.get(name)!.add(x, terrainHeight(seed, x, z), z, h(5) * Math.PI * 2, sc, sc, sc, 0xffffff);
      }
    }
    for (const v of this.decor.values()) v.end();
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

  /** Ballast bed, sleepers and two steel rails. Built once around x = 0 and slid along with the camera. */
  private buildRailway(): THREE.Group {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(RAIL_LEN, 0.12, RAIL_Z * 2 + 1.6), new THREE.MeshLambertMaterial({ color: 0x8c8274 }));
    bed.position.y = 0.0;
    g.add(bed);
    const n = RAIL_LEN;
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, RAIL_Z * 2 + 1.0), new THREE.MeshLambertMaterial({ color: 0x5a3e28 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(i - n / 2 + 0.5, 0.1, 0);
      sleepers.setMatrixAt(i, m);
    }
    sleepers.frustumCulled = false;
    g.add(sleepers);
    const steel = new THREE.MeshLambertMaterial({ color: 0xb4b8c0 });
    for (const z of [-RAIL_Z, RAIL_Z]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RAIL_LEN, 0.14, 0.14), steel);
      rail.position.set(0, 0.22, z);
      g.add(rail);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(RAIL_LEN, 0.04, 0.3), steel);
      foot.position.set(0, 0.17, z);
      g.add(foot);
    }
    return g;
  }

  /** Hills and mountains beside the road, and groves in forest chunks. Deterministic per chunk. */
  private placeScenery(seed: number, chunk: number, terrain: 'plains' | 'forest' | 'canyon'): void {
    const L = BALANCE.world.chunkLength;
    const x0 = chunkCenter(chunk) - L / 2;
    for (let k = 0; k < 6; k++) {
      const h = (salt: number) => hash01(seed, chunk, k, salt);
      const side = k % 2 === 0 ? -1 : 1;
      const z = side * (37 + h(1) * 16);
      const v = this.scenery[Math.floor(h(2) * this.scenery.length)];
      const sc = 0.8 + h(3) * 0.6;
      const x = x0 + h(4) * L;
      v.add(x, terrainHeight(seed, x, z) - 0.3, z, h(5) * Math.PI * 2, sc, sc, sc, 0xffffff);
    }
    if (terrain === 'forest') {
      for (let k = 0; k < 8; k++) {
        const h = (salt: number) => hash01(seed, chunk, k, salt + 10);
        const side = k % 2 === 0 ? -1 : 1;
        const v = this.groves[k % this.groves.length];
        const sc = 0.8 + h(3) * 0.5;
        v.add(x0 + h(4) * L, 0, side * (30 + h(1) * 8), h(5) * Math.PI * 2, sc, sc, sc, 0xffffff);
      }
    }
  }

  /** Facing and "is moving" for an entity, from its position change between frames. */
  private track(id: number, x: number, z: number, dt: number, faceTarget?: { x: number; z: number }): Motion {
    let m = this.motion.get(id);
    if (!m) {
      m = { x, z, rot: (id * 2.39996) % (Math.PI * 2), moving: 1 };
      this.motion.set(id, m);
    }
    const dx = x - m.x;
    const dz = z - m.z;
    if (dx * dx + dz * dz > 1e-5) {
      m.moving = 0;
      const want = Math.atan2(dx, dz);
      let d = want - m.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.rot += d * Math.min(1, dt * 12);
    } else m.moving += dt;
    if (faceTarget && m.moving > 0.15) m.rot = Math.atan2(faceTarget.x - x, faceTarget.z - z);
    m.x = x;
    m.z = z;
    return m;
  }

  /** Screen-space position of a world point, in CSS pixels. */
  project(x: number, z: number, w: number, h: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, 0, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 };
  }
}
