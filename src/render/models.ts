import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// KayKit models (CC0, Kay Lousberg, www.kaylousberg.com), Kenney Nature/Castle/Fantasy Town kits (CC0, www.kenney.nl)
// and Quaternius Ultimate Fantasy RTS (CC0, quaternius.com). See CREDITS.md.
// Characters are baked into a handful of static poses per animation so crowds can be drawn with InstancedMesh.

export interface Baked {
  geo: THREE.BufferGeometry;
  materials: THREE.Material[];
}

export interface CharModel {
  idle: Baked;
  move: Baked[];
  act: Baked[];
}

export type CharName = 'peasant' | 'builder' | 'spear' | 'archer' | 'fast' | 'brute' | 'ranged';
export type PropName =
  | 'fence'
  | 'treeA'
  | 'treeB'
  | 'stump'
  | 'rockA'
  | 'rockB'
  | 'rockC'
  | 'mountain'
  | 'groveA'
  | 'groveB';

export type DecorName =
  | 'flowerRed'
  | 'flowerYellow'
  | 'flowerPurple'
  | 'mushroomRed'
  | 'mushroomTan'
  | 'bushSmall'
  | 'pebble'
  | 'log'
  | 'stumpOld'
  | 'campfire'
  | 'pumpkin'
  | 'wheat'
  | 'corn';

// Medieval buildings and props (files m_*.glb), sized for the scene: [axis, size] like PROP_SIZE.
export const MED_SIZE = {
  // Castle Kit
  // Modular pieces on Kenney's 1-unit grid keep their origin and get one shared scale ('s') so they stack.
  stoneNarrow: ['s', 1],
  portcullis: ['s', 1],
  towerBase: ['s', 1],
  towerMid: ['s', 1],
  towerDoor: ['s', 1],
  towerTop: ['s', 1],
  towerRoof: ['s', 1],
  hexTower: ['s', 1],
  hexRoof: ['s', 1],
  pennant: ['h', 1.8],
  rubble: ['w', 1.6],
  ruinTrebuchet: ['w', 3.6],
  ruinRam: ['w', 2.8],
  ruinTower: ['w', 3.2],
  // Fantasy Town Kit
  windmill: ['h', 6.5],
  cart: ['w', 1.6],
  lantern: ['h', 1.4],
  bannerRed: ['h', 2.0],
  fenceBroken: ['w', 1.6],
  fence: ['s', 1.6],
  hedge: ['s', 1.6],
  stall: ['w', 2.2],
  treeCrooked: ['h', 4],
  treeHigh: ['h', 4.6],
  wheel: ['h', 0.9],
  // Ultimate Fantasy RTS (Quaternius)
  house: ['w', 2.2],
  house2: ['w', 2.2],
  hut: ['w', 2.2],
  barracks: ['w', 2.4],
  barracks2: ['w', 2.4],
  range: ['w', 2.4],
  range2: ['w', 2.4],
  storage: ['w', 2.4],
  storage2: ['w', 2.4],
  market: ['w', 2.4],
  market2: ['w', 2.4],
  watch: ['h', 3.6],
  watch2: ['h', 3.9],
  barrel: ['h', 0.6],
  crates: ['w', 1.0],
  logs: ['w', 1.4],
  mill: ['h', 6],
  mine: ['w', 4],
  towerHouse: ['h', 4.5],
  pines: ['w', 4.5],
} satisfies Record<string, ['h' | 'w' | 's', number]>;
export type MedName = keyof typeof MED_SIZE;

export interface Models {
  chars: Record<CharName, CharModel>;
  props: Record<PropName, Baked>;
  decor: Record<DecorName, Baked>;
  med: Record<MedName, Baked>;
}

// Kenney Nature Kit pieces, sized for the scene.
const DECOR_SIZE: Record<DecorName, ['h' | 'w', number]> = {
  flowerRed: ['h', 0.45],
  flowerYellow: ['h', 0.45],
  flowerPurple: ['h', 0.45],
  mushroomRed: ['h', 0.35],
  mushroomTan: ['h', 0.35],
  bushSmall: ['h', 0.55],
  pebble: ['w', 0.4],
  log: ['w', 1.4],
  stumpOld: ['h', 0.5],
  campfire: ['w', 1.0],
  pumpkin: ['w', 0.75],
  wheat: ['h', 1.0],
  corn: ['h', 1.5],
};

const CHAR_ANIMS: Record<CharName, { move: string; act: string; height: number }> = {
  peasant: { move: 'Walking_A', act: 'Interact', height: 1.95 },
  builder: { move: 'Walking_A', act: '1H_Melee_Attack_Chop', height: 2.0 },
  spear: { move: 'Walking_A', act: '1H_Melee_Attack_Chop', height: 2.1 },
  archer: { move: 'Walking_A', act: '1H_Ranged_Shoot', height: 2.0 },
  fast: { move: 'Running_A', act: '1H_Melee_Attack_Chop', height: 1.8 },
  brute: { move: 'Walking_A', act: '1H_Melee_Attack_Chop', height: 2.4 },
  ranged: { move: 'Walking_A', act: 'Spellcast_Shoot', height: 2.2 },
};

export const MOVE_FRAMES = 6;
export const ACT_FRAMES = 4;

// Target size of each prop: [axis, size]. 'h' = height, 'w' = largest horizontal extent.
const PROP_SIZE: Record<PropName, ['h' | 'w', number]> = {
  fence: ['w', 1.15],
  treeA: ['h', 2.8],
  treeB: ['h', 2.6],
  stump: ['h', 0.6],
  rockA: ['w', 1.5],
  rockB: ['w', 1.4],
  rockC: ['w', 1.3],
  mountain: ['w', 3.6],
  groveA: ['w', 4.5],
  groveB: ['w', 4.5],
};

// Kenney Nature Kit colours retuned to match the game's ground palette (by material name).
const KENNEY_COLORS: Record<string, number> = {
  grass: 0x5c7a36,
  dirt: 0x8a6440,
  wood: 0xa0703f,
  woodDark: 0x6e4a2a,
  woodBark: 0x7a5232,
  woodInner: 0xd9b98a,
  corn: 0xd8b04a,
  leafsFall: 0xd9782c,
  colorRed: 0xc9343a,
  colorYellow: 0xe8b830,
  colorPurple: 0x8c6ad8,
  colorTan: 0xc8935a,
  _defaultMat: 0x9a9a9e,
};

// Quaternius materials (by name) in an earthy medieval palette: dark timber, weathered stone, plaster, rust-red roofs.
const MED_COLORS: Record<string, number> = {
  Wood: 0x6b4a2e,
  Wood_Light: 0x94704a,
  Stone: 0x7a766c,
  Stone_Light: 0xa49d8c,
  Main: 0x8c3b28,
  Red: 0x7a2018,
  White: 0xd6c9a8,
  Walls: 0xcbbb98,
  Gold: 0xb08a3a,
  Metal_Light: 0x5a5852,
  Metal: 0x4a4038,
  Green: 0x4f6a2a,
  Yellow: 0xa8903a,
  Fabric: 0xc4ad80,
  Wheat: 0xc29c48,
  Dirt: 0x5e4a30,
  Snow: 0xb4b0a4,
  Water: 0x3e6670,
};

/** Kenney's colour atlas, shifted to the medieval palette: blue/purple → rust-red, pale sand → grey stone, teal → olive. */
function medievalPixel(r: number, g: number, b: number): [number, number, number] {
  const c = new THREE.Color(r / 255, g / 255, b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  let { h, s, l } = hsl;
  const deg = h * 360;
  if (s > 0.25 && deg >= 190 && deg <= 300) {
    h = 8 / 360;
    s = Math.min(0.5, s * 0.75);
    l *= 0.78;
  } else if (s > 0.45 && (deg < 12 || deg > 340)) {
    l *= 0.8;
    s *= 0.85;
  } else if (deg < 55 && l > 0.6) {
    h = 36 / 360;
    s = 0.1;
    l *= 0.74;
  } else if (deg < 55) {
    s *= 0.72;
    l *= 0.82;
  } else if (deg >= 80 && deg < 190) {
    h = 90 / 360;
    s *= 0.6;
    l *= 0.8;
  } else s *= 0.6;
  c.setHSL(h, s, l);
  return [c.r * 255, c.g * 255, c.b * 255];
}

const recoloured = new Map<unknown, THREE.Texture>();
function medievalMap(src: THREE.Texture): THREE.Texture {
  const cached = recoloured.get(src.image);
  if (cached) return cached;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = medievalPixel(px[i], px[i + 1], px[i + 2]);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.magFilter = src.magFilter;
  tex.minFilter = src.minFilter;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  recoloured.set(src.image, tex);
  return tex;
}

let medieval = false; // set while loading m_* files

function toLambert(m: THREE.Material): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  if (medieval) {
    const tuned = MED_COLORS[src.name];
    if (tuned !== undefined) return new THREE.MeshLambertMaterial({ color: tuned });
    if (src.map) {
      // Kenney atlas: keep the per-texture transform (offset/repeat) on a clone of the recoloured texture.
      const map = medievalMap(src.map).clone();
      map.offset.copy(src.map.offset);
      map.repeat.copy(src.map.repeat);
      map.rotation = src.map.rotation;
      map.center.copy(src.map.center);
      map.needsUpdate = true;
      return new THREE.MeshLambertMaterial({ map });
    }
  }
  const tuned = KENNEY_COLORS[src.name];
  if (tuned !== undefined) return new THREE.MeshLambertMaterial({ color: tuned, flatShading: true });
  if (src.name === 'Glow' || (src.emissive && src.emissive.getHex() !== 0 && !src.map)) {
    // Skeleton eyes: unlit so they glow in the dark.
    return new THREE.MeshBasicMaterial({ color: src.emissive?.getHex() || 0x60f0ff });
  }
  // KayKit atlas: a warm, slightly muted multiply so it sits in the medieval palette.
  return new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.map ? 0xe8dfcf : src.color });
}

/** Bake every visible mesh under `root` (skinned or not) in its current pose into one geometry with material groups. */
function bake(root: THREE.Object3D, mats: Map<THREE.Material, number>, matList: THREE.Material[]): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    const pos = src.getAttribute('position');
    const out = new THREE.BufferGeometry();
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      mesh.getVertexPosition(i, v); // applies skinning for SkinnedMesh
      v.applyMatrix4(mesh.matrixWorld);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const srcNormal = src.getAttribute('normal');
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    // Copy uvs by hand: the source may be interleaved, and cloning that logs a warning per mesh.
    const uv = src.getAttribute('uv');
    const uvArr = new Float32Array(pos.count * 2);
    if (uv) for (let i = 0; i < pos.count; i++) {
      uvArr[i * 2] = uv.getX(i);
      uvArr[i * 2 + 1] = uv.getY(i);
    }
    out.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    if (src.index) out.setIndex(src.index.clone());
    if (!skinned && srcNormal) {
      // Static parts keep the artist's normals.
      const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const n = new THREE.Vector3();
      const narr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        n.fromBufferAttribute(srcNormal, i).applyMatrix3(nm).normalize();
        narr[i * 3] = n.x;
        narr[i * 3 + 1] = n.y;
        narr[i * 3 + 2] = n.z;
      }
      out.setAttribute('normal', new THREE.BufferAttribute(narr, 3));
    } else out.computeVertexNormals();
    // One group per source material, mapped to the shared material list.
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : pos.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = srcMats[g.materialIndex ?? 0];
      let idx = mats.get(m);
      if (idx === undefined) {
        idx = matList.length;
        mats.set(m, idx);
        matList.push(toLambert(m));
      }
      out.addGroup(g.start, g.count, idx);
    }
    parts.push(out);
  });
  return mergeWithGroups(parts);
}

function mergeWithGroups(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const indexed = parts.map((p) => (p.index ? p : p.setIndex([...Array(p.getAttribute('position').count).keys()])));
  const merged = mergeGeometries(indexed.map((p) => {
    const c = p.clone();
    c.clearGroups();
    return c;
  }), false)!;
  // Re-create groups with offsets in the merged index buffer, then sort by material so draw calls stay few.
  const ranges: { start: number; count: number; mat: number }[] = [];
  let offset = 0;
  for (const p of indexed) {
    for (const g of p.groups) ranges.push({ start: offset + g.start, count: g.count, mat: g.materialIndex ?? 0 });
    offset += p.index!.count;
  }
  const index = merged.index!.array as ArrayLike<number>;
  const byMat = new Map<number, number[]>();
  for (const r of ranges) {
    const list = byMat.get(r.mat) ?? [];
    for (let i = 0; i < r.count; i++) list.push(index[r.start + i]);
    byMat.set(r.mat, list);
  }
  const newIndex: number[] = [];
  merged.clearGroups();
  for (const [mat, list] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) {
    merged.addGroup(newIndex.length, list.length, mat);
    for (const i of list) newIndex.push(i);
  }
  merged.setIndex(newIndex);
  return merged;
}

/** Scale and centre so the model stands on y=0 at the origin with the requested size ('s': plain scale, origin kept). */
function normalize(geos: THREE.BufferGeometry[], axis: 'h' | 'w' | 's', size: number): void {
  if (axis === 's') {
    for (const g of geos) {
      g.scale(size, size, size);
      g.computeBoundingSphere();
    }
    return;
  }
  geos[0].computeBoundingBox();
  const b = geos[0].boundingBox!;
  const h = b.max.y - b.min.y;
  const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const s = size / (axis === 'h' ? h : w);
  const cx = (b.max.x + b.min.x) / 2;
  const cz = (b.max.z + b.min.z) / 2;
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-cx, -b.min.y, -cz));
  for (const g of geos) {
    g.applyMatrix4(m);
    g.computeBoundingSphere();
  }
}

async function loadChar(loader: GLTFLoader, base: string, name: CharName): Promise<CharModel> {
  const gltf = await loader.loadAsync(`${base}${name}.glb`);
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  const clip = (n: string) => gltf.animations.find((a) => a.name === n) ?? gltf.animations[0];
  const mats = new Map<THREE.Material, number>();
  const matList: THREE.Material[] = [];
  const pose = (c: THREE.AnimationClip, t: number) => {
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    const a = mixer.clipAction(c);
    a.play();
    mixer.setTime(t);
    return bake(root, mats, matList);
  };
  const cfg = CHAR_ANIMS[name];
  const idleClip = clip('Idle');
  const moveClip = clip(cfg.move);
  const actClip = clip(cfg.act);
  const idle = pose(idleClip, idleClip.duration * 0.25);
  const move = Array.from({ length: MOVE_FRAMES }, (_, i) => pose(moveClip, (moveClip.duration * i) / MOVE_FRAMES));
  // Attack clips: sample the busy middle part.
  const act = Array.from({ length: ACT_FRAMES }, (_, i) => pose(actClip, actClip.duration * (0.15 + (0.6 * i) / ACT_FRAMES)));
  normalize([idle, ...move, ...act], 'h', cfg.height);
  const wrap = (geo: THREE.BufferGeometry): Baked => ({ geo, materials: matList });
  return { idle: wrap(idle), move: move.map(wrap), act: act.map(wrap) };
}

async function loadProp(loader: GLTFLoader, base: string, name: PropName | DecorName | MedName, kind: 'prop' | 'decor' | 'med' = 'prop'): Promise<Baked> {
  const prefix = kind === 'decor' ? 'k_' : kind === 'med' ? 'm_' : '';
  const gltf = await loader.loadAsync(`${base}${prefix}${name}.glb`);
  const mats = new Map<THREE.Material, number>();
  const matList: THREE.Material[] = [];
  medieval = kind === 'med';
  const geo = bake(gltf.scene, mats, matList);
  medieval = false;
  const [axis, size] =
    kind === 'decor' ? DECOR_SIZE[name as DecorName] : kind === 'med' ? MED_SIZE[name as MedName] : PROP_SIZE[name as PropName];
  normalize([geo], axis, size);
  return { geo, materials: matList };
}

export async function loadModels(): Promise<Models> {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/`;
  const charNames: CharName[] = ['peasant', 'builder', 'spear', 'archer', 'fast', 'brute', 'ranged'];
  const propNames = Object.keys(PROP_SIZE) as PropName[];
  const decorNames = Object.keys(DECOR_SIZE) as DecorName[];
  const medNames = Object.keys(MED_SIZE) as MedName[];
  const [chars, props, decor, med] = await Promise.all([
    Promise.all(charNames.map((n) => loadChar(loader, base, n))),
    Promise.all(propNames.map((n) => loadProp(loader, base, n))),
    Promise.all(decorNames.map((n) => loadProp(loader, base, n, 'decor'))),
    Promise.all(medNames.map((n) => loadProp(loader, base, n, 'med'))),
  ]);
  return {
    chars: Object.fromEntries(charNames.map((n, i) => [n, chars[i]])) as Record<CharName, CharModel>,
    props: Object.fromEntries(propNames.map((n, i) => [n, props[i]])) as Record<PropName, Baked>,
    decor: Object.fromEntries(decorNames.map((n, i) => [n, decor[i]])) as Record<DecorName, Baked>,
    med: Object.fromEntries(medNames.map((n, i) => [n, med[i]])) as Record<MedName, Baked>,
  };
}
