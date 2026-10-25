import * as THREE from 'three';
import { BALANCE, UNIT_TYPES, type MonsterType, type NodeType, type RoomType, type StructType, type UnitType } from '../data/balance';
import { isLit, lights, slotCount, SLOT_POS, type Sim } from '../sim/sim';
import type { GameEvent, GameState, Vec } from '../sim/types';
import { hash01 } from '../sim/rng';
import { chunkCenter, chunkTerrain } from '../sim/world';
import { Grass } from './grass';
import { Particles } from './particles';
import { chunkLayout, Terrain, terrainHeight, trackX } from './terrain';
import {
  castleGeometry,
  cliffGeometry,
  glowTexture,
  monsterGeometry,
  nodeGeometry,
  scaffoldGeometry,
  blobGeometry,
  furrowTexture,
  structGeometry,
  unitGeometry,
  wheelGeometry,
} from './geometry';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ACT_FRAMES, loadModels, MOVE_FRAMES, type Baked, type CharModel, type DecorName, type MedName, type Models, sharedStandard } from './models';

export interface Overlay {
  ghost: { type: StructType; pos: Vec; valid: boolean } | null;
  skillTarget: { pos: Vec; radius: number } | null;
}

// Medieval landmark models placed as countryside scenery.
const LANDMARKS: MedName[] = [
  'windmill', 'mill', 'cart', 'mine', 'towerHouse', 'pines', 'logs', 'ruinTrebuchet', 'ruinRam', 'ruinTower', 'wheel', 'fenceBroken',
  'house', 'house2', 'hut', 'storage', 'market', 'stall', 'barrel', 'crates', 'treeCrooked', 'treeHigh', 'fence', 'hedge',
  'lantern', 'stoneNarrow', 'hexTower', 'rubble',
];
// Soft corner darkening, kept off the middle of the screen where the castle and the fight are.
const VIGNETTE = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.55 }, uSize: { value: 0.78 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uSize; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, smoothstep(uSize, uSize - 0.45, d), uStrength);
      gl_FragColor = c;
    }`,
};
const MAX_POINT_LIGHTS = 6;
// Height of the castle deck where archers stand once the KayKit castle is loaded.
const WALL_WALK_Y = 1.9;
// The castle rides on a train chassis: wheel radius and centre, deck top.
const WHEEL_R = 0.6;
const WHEEL_Y = 0.29 + WHEEL_R;
const DECK_Y = 1.9;
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
  private side = new THREE.Vector3(1, 0, 0);
  private qt = new THREE.Quaternion();
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

  /** Take the mesh out of the scene (its last instances would otherwise stay frozen in place). */
  remove(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }

  begin(): void {
    this.n = 0;
  }

  add(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx, color?: number | THREE.Color, tilt = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromAxisAngle(this.up, rot);
    if (tilt) this.q.multiply(this.qt.setFromAxisAngle(this.side, tilt));
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
  add(pose: Pose, phase: number, x: number, y: number, z: number, rot: number, sc: number, color: number | THREE.Color, tilt = 0): void {
    let i = 0;
    if (this.animated && pose === 'move') i = 1 + (Math.floor(phase * MOVE_FRAMES) % MOVE_FRAMES);
    else if (this.animated && pose === 'act') i = 1 + MOVE_FRAMES + (Math.floor(phase * ACT_FRAMES) % ACT_FRAMES);
    this.slots[i].add(x, y, z, rot, sc, sc, sc, color, tilt);
  }

  end(): void {
    for (const s of this.slots) s.end();
  }
}

/** Short-lived points: smoke from the stacks, flames, sparks. Drawn as shrinking blobs. */
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  color: number;
}

interface Projectile {
  a: Vec;
  b: Vec;
  t: number;
  ttl: number;
  arc: number;
  kind: 'arrow' | 'spit' | 'rain';
}

interface Corpse {
  crowd: Crowd;
  x: number;
  z: number;
  rot: number;
  t: number;
  scale: number;
  color: number;
}

interface Motion {
  x: number;
  z: number;
  rot: number;
  moving: number; // seconds since it last moved, for a little hysteresis
  hp: number;
  flash: number; // seconds of hit flash left
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
  camDist = 32;
  // Pitch follows zoom: low and cinematic up close, near top-down when zoomed out for the overview.
  autoPitch = true;
  private camSmooth = new THREE.Vector3();
  private pitch = 0.95;
  pixelRatio = Math.min(window.devicePixelRatio, 2);

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private pointLights: THREE.PointLight[] = [];
  private terrain: Terrain;
  private grass: Grass;
  private fxp: Particles;
  private smokeIndex = 0;
  private shake = 0;
  private decor = new Map<DecorName, Instanced>();
  private decorKey = '';
  private crops: Instanced[] = [];
  private railway: THREE.Group;
  private scenery: Instanced[] = [];
  private groves: Instanced[] = [];
  private landmarks = new Map<MedName, Instanced>();
  private castle: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private fire: THREE.Mesh;
  private units = {} as Record<UnitType, Crowd>;
  private monsters = {} as Record<MonsterType, Crowd>;
  private nodes = {} as Record<NodeType, Instanced[]>;
  private stumps: Instanced;
  // Ground under resource nodes: leaf litter, gravel (blob) and ploughed soil (furrowed plot).
  private nodeBlobs: Instanced;
  private nodePlots: Instanced;
  private structs = {} as Record<StructType, Instanced>;
  private castleCode: THREE.Mesh;
  private flags: THREE.Group;
  private roomGroup: THREE.Group | null = null;
  // Static castle parts (hidden sources) and the one merged mesh that draws them.
  private castleStatic: THREE.Object3D[] = [];
  private castleMerged: THREE.Mesh | null = null;
  // Post: bloom on authored emissive (torches, fire, eyes, lanterns) and a light vignette. Off on weak devices.
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  post = true;
  // Lighting look, tuned against active play (day and night).
  look = { exposure: 0.85, envDay: 0.3, envNight: 0.12, hemiDay: 0.7, hemiNight: 0.3, sunDay: 2.3, sunNight: 0.5 };
  private roomKey = '';
  private keepTop = DECK_Y + 7;
  private models: Models | null = null;
  private motion = new Map<number, Motion>();
  private particles: Particle[] = [];
  private smokeMesh!: Instanced;
  private flameMesh!: Instanced;
  private projectiles: Projectile[] = [];
  private arrowMesh!: Instanced;
  private spitMesh!: Instanced;
  private corpses: Corpse[] = [];
  private torchFlames!: Instanced;
  private rods: THREE.Mesh[] = [];
  private stacks: THREE.Vector3[] = [];
  private lanterns: THREE.Mesh[] = [];
  private flashCol = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  private smokeTimer = 0;
  private wheelRoll = 0;
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
    // Filmic tone mapping and a soft studio environment so PBR materials (iron, brass, stone) read as materials.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(VIGNETTE));
    this.composer.addPass(new OutputPass());
    this.scene.background = new THREE.Color(0xaabfc6);
    this.scene.fog = new THREE.Fog(0xaabfc6, 60, 140);

    this.terrain = new Terrain(this.scene);
    this.grass = new Grass(this.scene);
    this.fxp = new Particles(this.scene);
    this.hemi = new THREE.HemisphereLight(0xf0e6d4, 0x5e4c34, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe4bc, 1.9);
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

    const flat = () => sharedStandard({ vertexColors: true, flat: true, roughness: 0.85 });
    const mat = flat();

    this.railway = this.buildRailway();
    this.scene.add(this.railway);

    this.castle = new THREE.Group();
    this.castleCode = new THREE.Mesh(castleGeometry(), mat);
    this.castle.add(this.castleCode);
    this.flags = new THREE.Group();
    this.castle.add(this.flags);
    // Train undercarriage: two bogies of two axles per side, on the rails, with coupling rods.
    const wg = wheelGeometry();
    const iron = sharedStandard({ color: 0x34343a, roughness: 0.45, metalness: 0.7 });
    const brass = sharedStandard({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 });
    for (const z of [-RAIL_Z, RAIL_Z]) {
      for (const x of [-2.7, -1.5, 1.5, 2.7]) {
        const w = new THREE.Mesh(wg, mat);
        w.position.set(x, WHEEL_Y, z);
        w.scale.setScalar(WHEEL_R / 0.7);
        if (z < 0) w.rotation.y = Math.PI;
        w.castShadow = true;
        this.castle.add(w);
        this.wheels.push(w);
      }
      for (const x of [-2.1, 2.1]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 0.22), iron);
        frame.position.set(x, WHEEL_Y + 0.15, z * 0.86);
        this.castle.add(frame);
        this.castleStatic.push(frame);
        const rod = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.09, 0.09), brass);
        rod.position.set(x, WHEEL_Y, z + Math.sign(z) * 0.2);
        this.castle.add(rod);
        this.rods.push(rod);
      }
    }
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.32, 3.9), iron);
    chassis.position.y = DECK_Y - 0.36;
    chassis.castShadow = true;
    this.castle.add(chassis);
    this.castleStatic.push(chassis);
    // Cowcatcher at the front (+x) and two brass lanterns.
    const plowGeo = new THREE.ConeGeometry(1.4, 1.1, 4);
    plowGeo.rotateZ(-Math.PI / 2);
    plowGeo.rotateX(Math.PI / 4);
    plowGeo.scale(1, 0.55, 1.6);
    const plow = new THREE.Mesh(plowGeo, sharedStandard({ color: 0x8a2a20, flat: true, roughness: 0.6, metalness: 0.3 }));
    plow.position.set(3.85, 0.62, 0);
    this.castle.add(plow);
    this.castleStatic.push(plow);
    for (const z of [-2.2, 2.2]) {
      const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      lamp.position.set(3.45, DECK_Y + 0.35, z);
      this.castle.add(lamp);
      this.lanterns.push(lamp);
    }
    // Stone chimneys in the back wall; smoke is spawned from their tops.
    const chimStone = sharedStandard({ color: 0x8a8274, roughness: 0.95 });
    const chimCap = sharedStandard({ color: 0x4a3b2e, roughness: 0.9 });
    for (const z of [-1.1, 1.1]) {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.1, 0.5), chimStone);
      stack.position.set(-3.1, DECK_Y + 1.05, z);
      stack.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), chimCap);
      cap.position.set(-3.1, DECK_Y + 2.15, z);
      this.castle.add(stack, cap);
      this.castleStatic.push(stack, cap);
      this.stacks.push(new THREE.Vector3(-3.1, DECK_Y + 2.3, z));
    }
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.85 }));
    this.fire.position.y = 6.2;
    this.fire.visible = false; // fire is drawn with particles
    this.castle.add(this.fire);
    this.scene.add(this.castle);

    for (const t of UNIT_TYPES) this.units[t] = new Crowd(unitGeometry(t), mat, 96, this.scene);
    for (const t of ['fast', 'brute', 'ranged', 'boss'] as MonsterType[]) {
      this.monsters[t] = new Crowd(monsterGeometry(t), flat(), t === 'boss' ? 8 : 160, this.scene);
    }
    for (const t of ['tree', 'rock', 'bush'] as NodeType[]) this.nodes[t] = [new Instanced(nodeGeometry(t), mat, 800, this.scene)];
    const stumpGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.3, 6);
    stumpGeo.translate(0, 0.15, 0);
    this.stumps = new Instanced(stumpGeo, sharedStandard({ color: 0x806040, roughness: 0.9 }), 800, this.scene);
    this.nodeBlobs = new Instanced(blobGeometry(), new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 800, this.scene, false);
    this.nodeBlobs.mesh.receiveShadow = true;
    this.nodePlots = new Instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: furrowTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 400, this.scene, false);
    this.nodePlots.mesh.receiveShadow = true;
    for (const t of ['wall', 'tower', 'torch'] as StructType[]) this.structs[t] = new Instanced(structGeometry(t), flat(), 300, this.scene);
    // Building sites: a timber scaffold that grows with progress around the rising structure.
    this.blueprint = new Instanced(scaffoldGeometry(), sharedStandard({ vertexColors: true, flat: true, roughness: 0.9 }), 300, this.scene, true);
    this.cliffs = [new Instanced(cliffGeometry(), mat, 600, this.scene)];

    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffc898, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowGeo = new THREE.PlaneGeometry(2, 2);
    glowGeo.rotateX(-Math.PI / 2);
    this.glows = new Instanced(glowGeo, glowMat, 200, this.scene, false);
    this.glows.mesh.renderOrder = 1;

    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new Instanced(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff080, transparent: true, opacity: 0.9, depthWrite: false }), 96, this.scene, false);
    this.puffs = new Instanced(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 128, this.scene, false);
    this.smokeMesh = new Instanced(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.75 }), 400, this.scene, false);
    this.flameMesh = new Instanced(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 400, this.scene, false);
    this.torchFlames = new Instanced(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.8, 2.8), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), 300, this.scene, false);
    const arrowGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 4);
    const tip = new THREE.ConeGeometry(0.08, 0.22, 4);
    tip.translate(0, 0.55, 0);
    const arrow = mergeGeometries([arrowGeo, tip])!;
    arrow.rotateX(Math.PI / 2); // points along +z
    this.arrowMesh = new Instanced(arrow, new THREE.MeshBasicMaterial({ color: 0xf2e2b6 }), 300, this.scene, false);
    this.spitMesh = new Instanced(new THREE.IcosahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0x9cff60 }), 120, this.scene, false);

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
    const max = 1800; // nodes are drawn as small clusters (up to six props each)
    // The code-built stand-ins go away: left in the scene they would keep showing where things were before loading.
    for (const v of [...this.nodes.tree, ...this.nodes.rock, ...this.nodes.bush, ...this.cliffs]) v.remove();
    this.nodes.tree = [m.props.treeA, m.props.treeB].map((b) => new Instanced(b.geo, b.materials, max, this.scene));
    this.nodes.rock = [m.props.rockA, m.props.rockB, m.props.rockC].map((b) => new Instanced(b.geo, b.materials, max, this.scene));
    this.stumps.setModel(m.props.stump);
    this.structs.wall.setModel(m.props.fence);
    this.structs.tower.setModel(m.med.watch);
    this.cliffs = [m.props.mountain, m.props.rockA, m.props.rockC].map((b) => new Instanced(b.geo, b.materials, 600, this.scene));
    // Far hillsides: pine stands and woods (not the hexagon-based hill tiles).
    this.scenery = [m.med.pines, m.props.groveA, m.props.groveB].map((b) => new Instanced(b.geo, b.materials, 160, this.scene, false));
    this.groves = [m.props.groveA, m.props.groveB].map((b) => new Instanced(b.geo, b.materials, 120, this.scene, false));
    // Far scenery casts no shadow: it sits outside the sun's shadow box almost all the time.
    for (const n of LANDMARKS) this.landmarks.set(n, new Instanced(m.med[n].geo, m.med[n].materials, 120, this.scene, false));
    // Kenney Nature Kit: ground clutter (no shadows, it is small and plentiful) and crop fields for food.
    for (const [name, b] of Object.entries(m.decor) as [DecorName, Baked][]) {
      if (name === 'pumpkin' || name === 'wheat' || name === 'corn') continue;
      const big = name === 'log' || name === 'stumpOld' || name === 'campfire';
      this.decor.set(name, new Instanced(b.geo, b.materials, big ? 120 : 3600, this.scene, false));
    }
    this.crops = [m.decor.pumpkin, m.decor.wheat, m.decor.corn].map((b) => new Instanced(b.geo, b.materials, 800, this.scene, false));
    this.nodes.bush = this.crops;
    this.decorKey = '';
    // Castle: a walled medieval keep on the code-built timber deck with wheels (Kenney Castle Kit + Quaternius).
    this.castleCode.visible = false;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.4, 4.7), sharedStandard({ color: 0x5e4029, roughness: 0.85 }));
    deck.position.y = DECK_Y - 0.2;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 4.9), sharedStandard({ color: 0x3a2516, roughness: 0.85 }));
    trim.position.y = DECK_Y - 0.42;
    // Cobbled courtyard inside the walls.
    const yard = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.04, 4.1), sharedStandard({ color: 0x6f6658, roughness: 0.95 }));
    yard.position.y = DECK_Y + 0.02;
    yard.receiveShadow = true;
    this.castle.add(trim, deck, yard);
    this.castleStatic.push(trim, deck, yard);
    deck.castShadow = true;
    this.buildWalls(m);
    this.roomKey = '';
  }

  private medMesh(name: MedName, x: number, y: number, z: number, rot = 0, scale: number | [number, number, number] = 1): THREE.Mesh {
    const b = this.models!.med[name];
    const mesh = new THREE.Mesh(b.geo, b.materials);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    if (typeof scale === 'number') mesh.scale.setScalar(scale);
    else mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Stone curtain wall along the deck edge, round corner towers, a gatehouse gap facing the camera. */
  private buildWalls(m: Models): void {
    void m;
    const S = 0.75; // wall scale: Kenney pieces are 1 unit wide and 1.31 tall
    const ex = 3.3;
    const ez = 2.35;
    const g = this.flags;
    const run = (from: number, to: number, place: (c: number, step: number) => void) => {
      const len = to - from;
      const count = Math.max(1, Math.round(len / S));
      const step = len / count;
      for (let i = 0; i < count; i++) place(from + step * (i + 0.5), step);
    };
    // North and south (along x), west and east (along z). Narrow pieces are thick toward local -x.
    run(-ex + 0.5, ex - 0.5, (x, step) => {
      g.add(this.medMesh('stoneNarrow', x, DECK_Y, -ez, Math.PI / 2, [S, S, step]));
      if (Math.abs(x) > 0.6) g.add(this.medMesh('stoneNarrow', x, DECK_Y, ez, -Math.PI / 2, [S, S, step]));
    });
    run(-ez + 0.5, ez - 0.5, (z, step) => {
      g.add(this.medMesh('stoneNarrow', -ex, DECK_Y, z, Math.PI, [S, S, step]));
      g.add(this.medMesh('stoneNarrow', ex, DECK_Y, z, 0, [S, S, step]));
    });
    for (const [x, z] of [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]]) {
      const cx = x * 0.97;
      const cz = z * 0.96;
      g.add(this.medMesh('hexTower', cx, DECK_Y, cz, 0, 0.95));
      g.add(this.medMesh('hexRoof', cx, DECK_Y + 1.31 * 0.95, cz, 0, 0.95));
    }
    // Gate: portcullis between two banners, lanterns either side.
    g.add(this.medMesh('portcullis', 0, DECK_Y, ez - 0.2, Math.PI / 2, 1.1));
    for (const x of [-0.75, 0.75]) {
      g.add(this.medMesh('bannerRed', x, DECK_Y, ez + 0.05, 0, 0.55));
      g.add(this.medMesh('lantern', x * 1.5, DECK_Y, ez + 0.25, 0, 0.6));
    }
  }

  /** Keep and room buildings follow the castle tier and the rooms built; rebuilt only when those change. */
  private updateRooms(s: GameState): void {
    if (!this.models) return;
    const open = slotCount(s);
    const key = `${s.castle.tier}|${open}|${s.rooms.map((r) => r?.type ?? '-').join(',')}`;
    if (key === this.roomKey) return;
    this.roomKey = key;
    if (this.roomGroup) this.castle.remove(this.roomGroup);
    const g = (this.roomGroup = new THREE.Group());
    this.castle.add(g);
    const t2 = s.castle.tier >= 2;
    // Keep: stacked tower sections; tier 2 adds a storey, a high roof and pennants.
    const K = 1.35;
    const kz = -0.15;
    const storeys: MedName[] = t2 ? ['towerBase', 'towerDoor', 'towerMid'] : ['towerBase', 'towerDoor'];
    let y = DECK_Y;
    for (const p of storeys) {
      g.add(this.medMesh(p, 0, y, kz, 0, K));
      y += 1.0 * K;
    }
    g.add(this.medMesh(t2 ? 'towerRoof' : 'towerTop', 0, y, kz, 0, K));
    this.keepTop = y + (t2 ? 2.0 : 1.35) * K;
    if (t2) for (const x of [-0.72, 0.72]) g.add(this.medMesh('pennant', x * K, y, kz + 0.72 * K, 0, 0.8));
    // Rooms: one small building per built room, in the slot grid around the keep (4 columns x 3 rows).
    const colX = [-2.35, -1.2, 1.2, 2.35];
    const rowZ = [-1.3, 0.05, 1.35];
    const pick: Record<RoomType, [MedName, MedName]> = {
      house: ['house', 'house2'],
      barracks: ['barracks', 'barracks2'],
      range: ['range', 'range2'],
      workshop: ['hut', 'hut'],
      watchtower: ['watch', 'watch2'],
      storage: ['storage', 'storage2'],
      kitchen: ['market', 'market2'],
    };
    for (let i = 0; i < open; i++) {
      const [col, row] = SLOT_POS[i];
      const x = colX[col];
      const z = rowZ[row];
      const r = s.rooms[i];
      if (!r) {
        // Empty plot: a few crates and a barrel.
        g.add(this.medMesh('crates', x - 0.15, DECK_Y, z, i, 0.45));
        g.add(this.medMesh('barrel', x + 0.3, DECK_Y, z + 0.2, 0, 0.6));
        continue;
      }
      const name = pick[r.type][t2 ? 1 : 0];
      const b = this.models.med[name];
      b.geo.computeBoundingBox();
      const bb = b.geo.boundingBox!;
      const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const size = r.type === 'watchtower' ? 0.9 : 1.2;
      // Face the courtyard: rooms north of the keep look south, the rest face the camera.
      g.add(this.medMesh(name, x, DECK_Y, z, row === 0 ? 0 : Math.PI, size / w));
    }
    this.mergeCastle();
  }

  /**
   * Bake every static castle part (undercarriage, deck, walls, towers, keep, rooms) into one mesh with one draw group
   * per shared material: ~15 draw calls instead of ~120. Sources stay in the scene graph, hidden.
   */
  private mergeCastle(): void {
    const sources: THREE.Mesh[] = [];
    const collect = (o: THREE.Object3D) => o.traverse((c) => { if ((c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh) sources.push(c as THREE.Mesh); });
    for (const o of this.castleStatic) collect(o);
    collect(this.flags);
    if (this.roomGroup) collect(this.roomGroup);
    this.castle.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.castle.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const mesh of sources) {
      // Sources were hidden by the previous merge; their transforms are still current.
      rel.multiplyMatrices(inv, mesh.matrixWorld);
      const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(rel);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.getAttribute('position').count, materialIndex: 0 }];
      for (const gr of groups) {
        // A single material covers every group (a BoxGeometry has six groups but one material).
        const m = Array.isArray(mesh.material) ? mats[gr.materialIndex ?? 0] ?? mats[0] : mesh.material;
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv'] as const) {
          const a = geo.getAttribute(name);
          const size = name === 'uv' ? 2 : 3;
          const arr = new Float32Array(gr.count * size);
          if (a) for (let i = 0; i < gr.count; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.array[(gr.start + i) * a.itemSize + k];
          part.setAttribute(name, new THREE.BufferAttribute(arr, size));
        }
        const list = byMat.get(m) ?? [];
        list.push(part);
        byMat.set(m, list);
      }
      geo.dispose();
      mesh.visible = false;
    }
    const materials = [...byMat.keys()];
    const merged = mergeGeometries(materials.map((m) => mergeGeometries(byMat.get(m)!, false)!), true)!;
    merged.computeBoundingSphere();
    if (this.castleMerged) {
      this.castleMerged.geometry.dispose();
      this.castle.remove(this.castleMerged);
    }
    this.castleMerged = new THREE.Mesh(merged, materials);
    this.castleMerged.castShadow = true;
    this.castleMerged.receiveShadow = true;
    this.castle.add(this.castleMerged);
  }

  /** Shadows cost the most on weak GPUs; main turns them off when frames stay slow. */
  setShadows(on: boolean): void {
    if (this.renderer.shadowMap.enabled === on) return;
    // Weak device: post goes with the shadows.
    this.post = on;
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
  loadModels(): Promise<void> {
    return loadModels()
      .then((m) => this.applyModels(m))
      .catch((e: unknown) => console.warn('models not loaded, using built-in shapes', e));
  }

  resize(w: number, h: number): void {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.fxp.setViewport(h * this.pixelRatio, this.camera.fov);
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
          if (e.to) this.projectiles.push({ a: p, b: e.to, t: 0, ttl: 0.28, arc: 0.9, kind: 'arrow' });
          break;
        case 'fx.spit':
          if (e.to) this.projectiles.push({ a: p, b: e.to, t: 0, ttl: 0.35, arc: 0.6, kind: 'spit' });
          break;
        case 'fx.monsterDie': {
          const type = String(e.params?.type ?? 'fast') as MonsterType;
          const crowd = this.monsters[type];
          this.corpses.push({ crowd, x: p.x, z: p.z, rot: Math.random() * Math.PI * 2, t: 0, scale: type === 'boss' && crowd.hasModel ? 2.4 : 1, color: 0xb0a0a0 });
          this.fx.push({ kind: 'puff', a: p, t: 0, ttl: 0.45, r: type === 'boss' ? 3 : 0.8, color: 0x403038 });
          this.fxp.death(p.x, p.z, type === 'boss');
          if (type === 'boss') this.shake = Math.max(this.shake, 0.6);
          break;
        }
        case 'fx.hit':
          if (e.to) this.fxp.hit(e.to.x, e.to.z);
          break;
        case 'fx.bite':
          this.fxp.bite(p.x, p.z);
          break;
        case 'fx.castleHit':
          this.fxp.chips(p.x + Math.sign(this.castle.position.x - p.x) * 0.6, p.z + Math.sign(this.castle.position.z - p.z) * 0.6);
          this.shake = Math.max(this.shake, 0.12);
          break;
        case 'fx.structHit':
          this.fxp.chips(p.x, p.z, true);
          break;
        case 'fx.gather':
          if (Math.abs(p.x - this.camSmooth.x) < 40) this.fxp.gather(p.x, p.z);
          break;
        case 'msg.unitLost': {
          const crowd = this.units[String(e.params?.unit ?? 'peasant') as UnitType];
          if (crowd) this.corpses.push({ crowd, x: p.x, z: p.z, rot: Math.random() * Math.PI * 2, t: 0, scale: 1, color: 0x9a9090 });
          break;
        }
        case 'fx.structDie':
          this.fx.push({ kind: 'puff', a: p, t: 0, ttl: 0.4, r: 1.2, color: 0xc0a080 });
          this.fxp.chips(p.x, p.z, true);
          this.fxp.ring(p.x, p.z, 1.2);
          break;
        case 'fx.built':
          this.fx.push({ kind: 'puff', a: p, t: 0, ttl: 0.4, r: 1.2, color: 0xc0a080 });
          this.fxp.built(p.x, p.z);
          break;
        case 'fx.order':
        case 'fx.place':
          this.fx.push({ kind: 'ring', a: p, t: 0, ttl: 0.6, r: 1, color: 0xfff080 });
          break;
        case 'fx.telegraph':
          this.fx.push({ kind: 'telegraph', a: p, t: 0, ttl: Number(e.params?.t ?? 1.5), r: Number(e.params?.r ?? 4), color: 0xff3020 });
          break;
        case 'fx.arrowRain':
          // A volley falling from the sky over the area.
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * BALANCE.abilities.arrowRain.radius!;
            const to = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
            this.projectiles.push({ a: { x: to.x - 3, z: to.z + 2 }, b: to, t: -Math.random() * 0.3, ttl: 0.45, arc: 7, kind: 'rain' });
          }
          this.fx.push({ kind: 'slam', a: p, t: 0, ttl: 0.6, r: BALANCE.abilities.arrowRain.radius!, color: 0xfff0a0 });
          break;
        case 'fx.slam':
          this.fxp.ring(p.x, p.z, Number(e.params?.r ?? 4));
          this.shake = Math.max(this.shake, 0.45);
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
    const day = new THREE.Color(0xaabfc6);
    const dusk = new THREE.Color(0xd08a5a);
    const dark = new THREE.Color(0x0d1a33);
    const sky = n < 0.5 ? day.clone().lerp(dusk, n * 2) : dusk.clone().lerp(dark, (n - 0.5) * 2);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    // Night is moonlit blue, not black: the lit areas stay warm, the rest reads as cold and dangerous.
    const L = this.look;
    this.renderer.toneMappingExposure = L.exposure;
    this.hemi.intensity = L.hemiDay * (1 - n) + L.hemiNight * n;
    // The studio environment fills shadows by day; at night it fades so the torchlight carries the scene.
    this.scene.environmentIntensity = L.envDay * (1 - n) + L.envNight * n;
    this.hemi.color.setHex(n > 0.5 ? 0x5a70b0 : 0xf0e6d4);
    this.hemi.groundColor.setHex(n > 0.5 ? 0x1a1a28 : 0x5e4c34);
    this.sun.intensity = L.sunDay * (1 - n) + L.sunNight * n;
    this.sun.color.setHex(n > 0.5 ? 0x7c92ff : n > 0.2 ? 0xffa868 : 0xffe4bc);

    // Camera.
    if (this.autoPitch) this.pitch = 0.62 + 0.4 * Math.min(1, Math.max(0, (this.camDist - 14) / 56));
    this.camSmooth.lerp(this.camTarget, Math.min(1, dt * 10));
    const t = this.camSmooth;
    this.camera.position.set(t.x, Math.sin(this.pitch) * this.camDist, t.z + Math.cos(this.pitch) * this.camDist);
    this.camera.lookAt(t.x, 0, t.z);
    // Impact shake: decays fast, never moves the aim far.
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.max(0, 1 - dt * 7);
    }
    this.sun.position.set(t.x - 20, 40, t.z + 15);
    this.sun.target.position.set(t.x, 0, t.z);
    this.railway.position.x = Math.round(t.x);

    this.updateGround(s.seed, t.x);
    this.grass.update(s.seed, t.x, this.time, !this.renderer.shadowMap.enabled, s.nodes);

    // Castle.
    const c = s.castle;
    this.updateRooms(s);
    this.castle.position.set(c.x, 0, c.z);
    this.wheelRoll += c.moving ? dt * 3.2 : 0;
    const roll = this.wheelRoll;
    for (const w of this.wheels) w.rotation.z = w.position.z < 0 ? roll : -roll;
    // Coupling rods follow the crank pins; the body rocks a little on the move.
    this.rods.forEach((r, i) => {
      const ph = roll + (i % 2) * 0.4;
      r.position.y = WHEEL_Y + Math.sin(ph) * WHEEL_R * 0.45;
      r.position.x = (r.position.x > 0 ? 2.1 : -2.1) + Math.cos(ph) * WHEEL_R * 0.45;
    });
    this.castle.position.y = c.moving ? Math.abs(Math.sin(this.time * 6)) * 0.05 : 0;
    this.castle.rotation.x = c.moving ? Math.sin(this.time * 2.7) * 0.008 : 0;
    this.castle.rotation.z = c.moving ? Math.sin(this.time * 3.3) * 0.01 : 0;
    // Smoke: thick while rolling, a lazy wisp when parked.
    this.smokeTimer += dt * (c.moving ? 14 : 1.5);
    while (this.smokeTimer >= 1) {
      this.smokeTimer -= 1;
      const st = this.stacks[this.smokeIndex++ % Math.max(1, this.stacks.length)];
      if (!st) break;
      this.fxp.smoke(c.x + st.x + (Math.random() - 0.5) * 0.2, st.y, c.z + st.z + (Math.random() - 0.5) * 0.2, c.moving ? -1.6 : 0.1, n > 0.5);
    }
    // Roof fire: flames and dark smoke from the keep.
    if (c.fire > 0) {
      for (let i = 0; i < 3; i++) {
        this.fxp.flame(c.x + (Math.random() - 0.5) * 1.6, this.keepTop - 1.4 + Math.random(), c.z + (Math.random() - 0.5) * 1.6, 2.2);
      }
      if (Math.random() < 0.25) this.fxp.smoke(c.x, this.keepTop + 0.5, c.z, 0.6, true, 1.1);
    }
    for (const l of this.lanterns) (l.material as THREE.MeshBasicMaterial).color.setHex(n > 0.3 ? 0xffe0a0 : 0xb08a3a).multiplyScalar(n > 0.3 ? 2.4 : 1);
    // The cone only stands in for the flame particles on the code-built fallback castle.
    this.fire.visible = c.fire > 0 && !this.models;
    if (this.fire.visible) this.fire.scale.set(1, 0.8 + Math.sin(this.time * 18) * 0.2, 1);

    const ls = lights(s);
    const dark2 = s.phase === 'night';

    this.ageCorpses(dt);
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
      const col = this.hitTint(mo, u.hp, hurt > 0.5 ? (u.type === 'shield' ? 0xa8c0ff : 0xffffff) : hurt > 0.25 ? 0xffb0a0 : 0xff6050);
      const onWall = crowd.hasModel && u.type === 'archer' && Math.abs(u.x - c.x) < 3.3 && Math.abs(u.z - c.z) < 2.35;
      const bob = crowd.hasModel ? 0 : pose === 'act' ? Math.abs(Math.sin(this.time * 8 + u.id)) * 0.1 : 0;
      const size = (crowd.hasModel ? 1 : 1.35) * (u.type === 'shield' ? 1.12 : 1);
      // Archers on the castle stand behind the battlements, not inside the stone.
      const ux = onWall ? c.x + Math.max(-2.7, Math.min(2.7, u.x - c.x)) : u.x;
      const uz = onWall ? c.z + Math.max(-1.8, Math.min(1.8, u.z - c.z)) : u.z;
      crowd.add(pose, this.time * (pose === 'move' ? 1.1 : 1.4) + u.id * 0.37, ux, (onWall ? WALL_WALK_Y : 0) + bob, uz, mo.rot, size, col);
      if (u.type === selType) this.rings.add(ux, onWall ? WALL_WALK_Y + 0.05 : 0.06, uz, 0, 1, 1, 1, 0xfff080);
      else if (s.selectedIds.includes(u.id)) this.rings.add(ux, onWall ? WALL_WALK_Y + 0.05 : 0.06, uz, 0, 1.1, 1, 1.1, 0x80f0ff);
    }
    this.drawCorpses(new Set(Object.values(this.units)));
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
      const col = this.hitTint(mo, m.hp, hurt > 0.5 ? base : 0xff9090);
      const pose: Pose = m.slamAt ? 'act' : mo.moving < 0.15 ? 'move' : 'act';
      const bob = crowd.hasModel ? 0 : Math.abs(Math.sin(this.time * 9 + m.id)) * 0.12;
      crowd.add(pose, this.time * (m.type === 'fast' ? 1.6 : 1.1) + m.id * 0.29, m.x, bob, m.z, mo.rot, sc, col);
    }
    for (const id of this.motion.keys()) if (!seen.has(id)) this.motion.delete(id);
    this.drawCorpses(new Set(Object.values(this.monsters)));
    for (const k of Object.keys(this.monsters) as MonsterType[]) this.monsters[k].end();

    // Resource nodes are small clusters on their own ground, and they visibly run down:
    // a copse loses trees to stumps, an outcrop breaks into rubble, a field is harvested row by row.
    for (const k of Object.keys(this.nodes) as NodeType[]) for (const v of this.nodes[k]) v.begin();
    this.stumps.begin();
    this.nodeBlobs.begin();
    this.nodePlots.begin();
    for (const nd of s.nodes) {
      if (Math.abs(nd.x - t.x) > 90) continue;
      const r = Math.max(0, nd.amount / nd.max);
      const hv = (k: number) => {
        const v = Math.sin(nd.id * 12.9898 + k * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      const variants = this.nodes[nd.type];
      if (nd.type === 'tree') {
        this.nodeBlobs.add(nd.x, 0.02, nd.z, hv(1) * 6, 1.5 + hv(2) * 0.3, 1, 1.2 + hv(3) * 0.3, 0x7a6a40);
        const spots: [number, number][] = [[0, 0], [0.8, 0.35], [-0.55, 0.7]];
        const alive = r > 0 ? Math.ceil(r * 3) : 0;
        spots.forEach(([ox, oz], i) => {
          const a = hv(4) * 6;
          const x = nd.x + ox * Math.cos(a) - oz * Math.sin(a);
          const z = nd.z + ox * Math.sin(a) + oz * Math.cos(a);
          if (i < alive) {
            const sc = (i === 0 ? 1.2 : 0.95 + hv(5 + i) * 0.2) * (i === alive - 1 && r < 1 ? 0.85 + 0.15 * ((r * 3) % 1 || 1) : 1);
            variants[(nd.id + i) % variants.length].add(x, 0, z, hv(8 + i) * 6, sc, sc, sc, 0xd8e6d0);
          } else this.stumps.add(x, 0, z, hv(8 + i) * 6, 1.1, 1, 1.1, 0xffffff);
        });
      } else if (nd.type === 'rock') {
        const mined = 1 - r;
        this.nodeBlobs.add(nd.x, 0.02, nd.z, hv(1) * 6, 1.2 + mined * 0.8, 1, 1.0 + mined * 0.7, 0xa69c88);
        if (r > 0) {
          const sc = 0.6 + 0.6 * r;
          // Fresh-cut stone shows lighter as the outcrop is worked.
          variants[nd.id % variants.length].add(nd.x, 0, nd.z, nd.id * 1.7, sc, sc, sc, mined > 0.05 ? 0xf2ece0 : 0xd8d2c6);
        }
        const chips = Math.round(mined * 4) + (r <= 0 ? 1 : 0);
        for (let i = 0; i < chips; i++) {
          const a = hv(10 + i) * 6.28;
          const d = 0.6 + hv(20 + i) * 0.5;
          const cs = 0.22 + hv(30 + i) * 0.16;
          variants[(nd.id + i + 1) % variants.length].add(nd.x + Math.cos(a) * d, 0, nd.z + Math.sin(a) * d, a * 3, cs, cs, cs, 0xe6e0d4);
        }
      } else {
        // A small ploughed plot in rows; harvested plants leave bare soil.
        const rot = Math.floor(hv(1) * 4) * (Math.PI / 2);
        this.nodePlots.add(nd.x, 0.025, nd.z, rot, 1.9, 1, 1.5, r > 0 ? 0xffffff : 0xc8b8a0);
        const plant = variants[nd.id % variants.length];
        const total = 6;
        const alive = r > 0 ? Math.ceil(r * total) : 0;
        const pumpkin = nd.id % variants.length === 0;
        for (let i = 0; i < alive; i++) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const lx = (col - 1) * 0.55;
          const lz = (row - 0.5) * 0.6;
          const x = nd.x + lx * Math.cos(rot) - lz * Math.sin(rot);
          const z = nd.z + lx * Math.sin(rot) + lz * Math.cos(rot);
          const sc = (pumpkin ? 0.62 : 0.85) * (0.9 + hv(40 + i) * 0.2);
          plant.add(x, 0, z, hv(50 + i) * 6, sc, sc, sc, 0xffffff);
        }
      }
    }
    for (const k of Object.keys(this.nodes) as NodeType[]) for (const v of this.nodes[k]) v.end();
    this.stumps.end();
    this.nodeBlobs.end();
    this.nodePlots.end();

    // Structures and blueprints.
    for (const k of Object.keys(this.structs) as StructType[]) this.structs[k].begin();
    this.blueprint.begin();
    for (const st of s.structs) {
      const x = st.cx + 0.5;
      const z = st.cz + 0.5;
      if (st.built < 1) {
        const tall = st.type === 'tower' ? 3.4 : st.type === 'wall' ? 1.5 : 1.1;
        this.blueprint.add(x, 0, z, 0, 1.08, 0.35 + st.built * tall, 1.08);
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
      for (const l of ls) this.glows.add(l.x, 0.04, l.z, 0, l.r * 1.15, 1, l.r * 1.15);
    }
    this.glows.end();
    (this.glows.mesh.material as THREE.MeshBasicMaterial).opacity = 0.17 * n;
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
      pl.intensity = (i === 0 ? 32 : 13) * n * (0.9 + Math.sin(this.time * 11 + i) * 0.06 + Math.sin(this.time * 23 + i * 2) * 0.04);
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

    // Torch flames flicker on top of every lit torch (brighter at night).
    this.torchFlames.begin();
    for (const st of s.structs) {
      if (st.type !== 'torch' || st.built < 1) continue;
      const f = 0.85 + Math.sin(this.time * 17 + st.id) * 0.15 + Math.sin(this.time * 29 + st.id * 3) * 0.08;
      const y = this.models ? 1.45 : 1.55;
      // A small core plus licking flame particles (they bloom at night).
      this.torchFlames.add(st.cx + 0.5, y, st.cz + 0.5, this.time * 2 + st.id, 0.5 * f, 0.8 * f, 0.5 * f, n > 0.2 ? 0xffa040 : 0xc87830);
      if (dt > 0 && Math.random() < 0.8) this.fxp.flame(st.cx + 0.5, y, st.cz + 0.5, 0.8);
    }
    this.torchFlames.end();
    this.updateParticles(dt);
    this.fxp.update(dt);
    this.updateProjectiles(dt);
    this.updateFx(dt);
    if (this.post) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private updateGround(seed: number, cx: number): void {
    const L = BALANCE.world.chunkLength;
    const first = Math.round(cx / L) - 3;
    this.terrain.update(seed, cx);
    for (const c of this.cliffs) c.begin();
    for (const v of this.scenery) v.begin();
    for (const v of this.groves) v.begin();
    for (const v of this.landmarks.values()) v.begin();
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
    for (const v of this.landmarks.values()) v.end();
    this.placeDecor(seed, first);
  }

  /** Grass, flowers, mushrooms, pebbles and logs. Deterministic per chunk; rebuilt only when the view shifts a chunk. */
  private placeDecor(seed: number, first: number): void {
    if (this.decor.size === 0) return;
    const low = !this.renderer.shadowMap.enabled;
    const key = `${seed}:${first}:${low}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    for (const v of this.decor.values()) v.begin();
    const L = BALANCE.world.chunkLength;
    const pick: [DecorName, number][] = [
      ['flowerRed', 5], ['flowerYellow', 6], ['flowerPurple', 5],
      ['mushroomRed', 2], ['mushroomTan', 2], ['bushSmall', 6], ['pebble', 8], ['log', 1], ['stumpOld', 1],
    ];
    const total = pick.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < 7; i++) {
      const chunk = first + i;
      const terrain = chunkTerrain(seed, chunk);
      // The meadow itself is the Grass carpet; these are the flowers, mushrooms and pebbles in it.
      const count = (terrain === 'forest' ? 220 : terrain === 'plains' ? 240 : 60) * (low ? 0.4 : 1);
      const maxZ = terrain === 'canyon' ? BALANCE.world.canyonCliffZ - 0.5 : 46;
      const x0 = chunkCenter(chunk) - L / 2;
      for (let k = 0; k < count; k++) {
        const h = (salt: number) => hash01(seed, chunk, k, salt + 40);
        const z = (h(1) * 2 - 1) * maxZ;
        if (Math.abs(z) < 3.8) continue; // keep the railway bed clean
        const x = x0 + h(2) * L;
        let r = h(3) * total;
        let name: DecorName = 'pebble';
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

  private updateParticles(dt: number): void {
    this.smokeMesh.begin();
    this.flameMesh.begin();
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 1 - dt * 0.3;
      const k = p.age / p.life;
      if (k >= 1) continue;
      const size = Math.max(0.02, p.size + p.grow * k) * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.6) / 0.4);
      const flame = p.color === 0xff7a20 || p.color === 0xffc040 || p.color === 0xffd060;
      (flame ? this.flameMesh : this.smokeMesh).add(p.x, p.y, p.z, p.age * 2, size, size, size, p.color);
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.smokeMesh.end();
    this.flameMesh.end();
  }

  /** Arrows fly on a small arc and point along their path; spit is a green blob. */
  private updateProjectiles(dt: number): void {
    this.arrowMesh.begin();
    this.spitMesh.begin();
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.ttl);
      const x = p.a.x + (p.b.x - p.a.x) * k;
      const z = p.a.z + (p.b.z - p.a.z) * k;
      const base = p.kind === 'rain' ? 0.2 : 1.1;
      const y = base + Math.sin(Math.PI * k) * p.arc + (p.kind === 'rain' ? p.arc * (1 - k) : 0);
      if (p.kind === 'spit') {
        this.spitMesh.add(x, y, z, 0, 1, 1, 1);
        continue;
      }
      const yaw = Math.atan2(p.b.x - p.a.x, p.b.z - p.a.z);
      const len = Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z) || 1;
      const dy = p.kind === 'rain' ? -p.arc * 1.6 : Math.cos(Math.PI * k) * Math.PI * p.arc;
      const pitch = -Math.atan2(dy, len);
      this.arrowMesh.add(x, y, z, yaw, 1, 1, 1, undefined, pitch);
    }
    for (const p of this.projectiles) if (p.t >= p.ttl && p.kind !== 'spit') this.fxp.thud(p.b.x, p.b.z);
    this.projectiles = this.projectiles.filter((p) => p.t < p.ttl);
    this.arrowMesh.end();
    this.spitMesh.end();
  }

  private ageCorpses(dt: number): void {
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 2.2);
    if (this.corpses.length > 60) this.corpses.splice(0, this.corpses.length - 60);
  }

  /** The fallen tip over, lie still, then sink into the ground. */
  private drawCorpses(crowds: Set<Crowd>): void {
    for (const c of this.corpses) {
      if (!crowds.has(c.crowd)) continue;
      const fall = Math.min(1, c.t / 0.35);
      const sink = Math.max(0, c.t - 1.2) / 1.0;
      c.crowd.add('idle', 0, c.x, -sink * 0.9, c.z, c.rot, c.scale, c.color, -fall * Math.PI * 0.48);
    }
  }

  /** Ballast bed, sleepers and two steel rails. Built once around x = 0 and slid along with the camera. */
  private buildRailway(): THREE.Group {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(RAIL_LEN, 0.12, RAIL_Z * 2 + 1.6), sharedStandard({ color: 0x8c8274, roughness: 0.97 }));
    bed.position.y = 0.0;
    g.add(bed);
    const n = RAIL_LEN;
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, RAIL_Z * 2 + 1.0), sharedStandard({ color: 0x5a3e28, roughness: 0.9 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(i - n / 2 + 0.5, 0.1, 0);
      sleepers.setMatrixAt(i, m);
    }
    sleepers.frustumCulled = false;
    g.add(sleepers);
    const steel = sharedStandard({ color: 0xb4b8c0, roughness: 0.32, metalness: 0.85 });
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
    const low = !this.renderer.shadowMap.enabled;
    for (let k = 0; k < 12; k++) {
      if (low && k % 2) continue; // weak device: half the far woods
      const h = (salt: number) => hash01(seed, chunk, k, salt);
      const side = k % 3 === 0 ? 1 : -1;
      const z = side * (42 + h(1) * 16);
      const v = this.scenery[Math.floor(h(2) * this.scenery.length)];
      const sc = 1.2 + h(3) * 0.8;
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
    if (this.landmarks.size) this.placeLandmarks(seed, chunk, terrain);
  }

  /** Medieval countryside beside the line: villages with fields and a track to the railway, old ruins and siege wrecks. */
  private placeLandmarks(seed: number, chunk: number, terrain: 'plains' | 'forest' | 'canyon'): void {
    const L = BALANCE.world.chunkLength;
    const x0 = chunkCenter(chunk) - L / 2;
    const h = (salt: number) => hash01(seed, chunk, 7, salt + 60);
    const put = (name: MedName, x: number, z: number, rot: number, sc = 1, sy = sc) =>
      this.landmarks.get(name)!.add(x, terrainHeight(seed, x, z) - 0.05, z, rot, sc, sy, sc, 0xffffff);
    // Lantern posts along the far side of the line.
    for (let x = Math.ceil(x0 / 12) * 12; x < x0 + L; x += 12) put('lantern', x + 0.5, -4.4, 0, 1.3);
    if (terrain === 'canyon') {
      if (h(1) < 0.6) put('ruinTower', x0 + h(2) * L, -8.5, h(3) * 6, 0.8);
      return;
    }
    const v = chunkLayout(seed, chunk).village!;
    const houses: MedName[] = v.kind === 'farm' ? ['house2', 'house', 'hut', 'storage', 'market'] : ['hut', 'house', 'storage'];
    // Houses around a yard, facing the track that leads down to the railway.
    const spots: [number, number][] = [[-5, -1.2], [-1.6, -3.6], [2.4, -2.8], [5.6, -0.6], [-4.2, 3.2]];
    spots.forEach(([dx, dz], i) => {
      if (i === 4 && h(20) < 0.5) return;
      const name = houses[Math.floor(h(21 + i) * houses.length)];
      put(name, v.x + dx, v.z + dz, Math.atan2(-dx, 6 - dz) + Math.PI + (h(30 + i) - 0.5) * 0.4, 1.55);
    });
    put('stall', v.x + 1.8, v.z + 1.6, Math.PI + h(40), 0.9);
    put('barrel', v.x + 3.4, v.z + 2.2, 0, 1.2);
    put('crates', v.x - 2.2, v.z + 2.4, h(41) * 6, 1.1);
    put('treeCrooked', v.x - 8, v.z - 2 + h(42) * 2, h(43) * 6);
    put('treeHigh', v.x + 8.5, v.z - 3, h(44) * 6);
    // A fence (or hedge) on the near side of the village, with a gap for the track.
    const fenceName: MedName = v.kind === 'farm' && h(45) < 0.5 ? 'hedge' : 'fence';
    const fz = v.z + 4.8;
    const gap = trackX(v, fz);
    for (let fx = v.x - 7.2; fx < v.x + 7.2; fx += 1.6) {
      if (Math.abs(fx + 0.8 - gap) < 1.4) continue;
      put(fenceName, fx + 0.8, fz, 0);
    }
    if (v.kind === 'farm') {
      put(h(3) < 0.5 ? 'windmill' : 'mill', v.x + (h(46) < 0.5 ? -11 : 11), v.z - 2.5, h(4) * 0.6 - 0.3);
      put('cart', trackX(v, v.z + 9) + 1.6, v.z + 9, Math.PI / 2 + h(47) * 0.4);
    } else {
      put(h(3) < 0.5 ? 'mine' : 'towerHouse', v.x + (h(46) < 0.5 ? -10 : 10), v.z - 2, h(4) * 0.6 - 0.3);
      put('pines', v.x - 12, v.z - 4, h(5) * 6);
      put('logs', v.x + 4, v.z + 3, h(6) * 6, 1.2);
    }
    // Something from the old wars on the open ground, now and then.
    const r = h(10);
    const side = h(11) < 0.5 ? -1 : 1;
    const wx = x0 + 6 + h(12) * (L - 12);
    const wz = side * (16 + h(13) * 10);
    if (r < 0.35) {
      const wreck: MedName[] = ['ruinTrebuchet', 'ruinRam', 'ruinTower'];
      put(wreck[Math.floor(h(14) * wreck.length)], wx, wz, h(15) * 6, side < 0 ? 1 : 0.8);
      put('wheel', wx + 2.2, wz + 1, h(16) * 6);
      put('fenceBroken', wx - 2.4, wz - 0.5, h(17) * 6);
    } else if (r < 0.7) {
      // A broken stretch of old curtain wall with a tower stump and rubble.
      const rot = (h(18) - 0.5) * 0.8;
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      for (let i = 0; i < 5; i++) {
        const tall = h(50 + i);
        if (tall < 0.2) continue;
        const along = (i - 2) * 1.3;
        put('stoneNarrow', wx + along * ca, wz - along * sa, rot + Math.PI / 2, 1.3, 1.3 * (0.35 + tall * 0.65));
      }
      put('hexTower', wx + 3.6 * ca, wz - 3.6 * sa, h(19) * 6, 1.4, 0.8);
      put('rubble', wx + 0.8, wz + 1.6 * side, h(56) * 6, 1.2);
      put('rubble', wx - 2.6, wz + 1.2, h(57) * 6);
    }
  }

  /** Facing and "is moving" for an entity, from its position change between frames. */
  /** Hit flash: a short white-hot tint whenever hp drops. */
  private hitTint(m: Motion, hp: number, base: number): number | THREE.Color {
    if (hp < m.hp - 0.01) m.flash = 0.12;
    m.hp = hp;
    if (m.flash <= 0) return base;
    return this.flashCol.setHex(base).lerp(this.white, m.flash / 0.12);
  }

  private track(id: number, x: number, z: number, dt: number, faceTarget?: { x: number; z: number }): Motion {
    let m = this.motion.get(id);
    if (!m) {
      m = { x, z, rot: (id * 2.39996) % (Math.PI * 2), moving: 1, hp: Infinity, flash: 0 };
      this.motion.set(id, m);
    }
    m.flash = Math.max(0, m.flash - dt);
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
