import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// KayKit models (CC0, Kay Lousberg, www.kaylousberg.com) and Kenney Nature Kit (CC0, www.kenney.nl). See CREDITS.md.
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
  | 'castle'
  | 'tower'
  | 'fence'
  | 'treeA'
  | 'treeB'
  | 'stump'
  | 'rockA'
  | 'rockB'
  | 'rockC'
  | 'mountain'
  | 'flag'
  | 'hillsA'
  | 'hillsB'
  | 'peak'
  | 'groveA'
  | 'groveB';

export type DecorName =
  | 'grass'
  | 'grassLarge'
  | 'grassLeafs'
  | 'flowerRed'
  | 'flowerYellow'
  | 'flowerPurple'
  | 'mushroomRed'
  | 'mushroomTan'
  | 'bushSmall'
  | 'pebble'
  | 'pebbleFlat'
  | 'log'
  | 'stumpOld'
  | 'campfire'
  | 'pumpkin'
  | 'wheat'
  | 'corn';

export interface Models {
  chars: Record<CharName, CharModel>;
  props: Record<PropName, Baked>;
  decor: Record<DecorName, Baked>;
}

// Kenney Nature Kit pieces, sized for the scene.
const DECOR_SIZE: Record<DecorName, ['h' | 'w', number]> = {
  grass: ['h', 0.35],
  grassLarge: ['h', 0.55],
  grassLeafs: ['h', 0.4],
  flowerRed: ['h', 0.45],
  flowerYellow: ['h', 0.45],
  flowerPurple: ['h', 0.45],
  mushroomRed: ['h', 0.35],
  mushroomTan: ['h', 0.35],
  bushSmall: ['h', 0.55],
  pebble: ['w', 0.4],
  pebbleFlat: ['w', 0.55],
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
  castle: ['h', 7.4],
  tower: ['h', 3.4],
  fence: ['w', 1.15],
  treeA: ['h', 2.8],
  treeB: ['h', 2.6],
  stump: ['h', 0.6],
  rockA: ['w', 1.5],
  rockB: ['w', 1.4],
  rockC: ['w', 1.3],
  mountain: ['w', 3.6],
  flag: ['h', 1.6],
  hillsA: ['w', 10],
  hillsB: ['w', 10],
  peak: ['w', 12],
  groveA: ['w', 4.5],
  groveB: ['w', 4.5],
};

// Kenney Nature Kit colours retuned to match the game's ground palette (by material name).
const KENNEY_COLORS: Record<string, number> = {
  grass: 0x5f9a3a,
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

function toLambert(m: THREE.Material): THREE.Material {
  const src = m as THREE.MeshStandardMaterial;
  const tuned = KENNEY_COLORS[src.name];
  if (tuned !== undefined) return new THREE.MeshLambertMaterial({ color: tuned, flatShading: true });
  if (src.name === 'Glow' || (src.emissive && src.emissive.getHex() !== 0 && !src.map)) {
    // Skeleton eyes: unlit so they glow in the dark.
    return new THREE.MeshBasicMaterial({ color: src.emissive?.getHex() || 0x60f0ff });
  }
  return new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.map ? 0xffffff : src.color });
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

/** Scale and centre so the model stands on y=0 at the origin with the requested size. */
function normalize(geos: THREE.BufferGeometry[], axis: 'h' | 'w', size: number): void {
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

async function loadProp(loader: GLTFLoader, base: string, name: PropName | DecorName, decor = false): Promise<Baked> {
  const gltf = await loader.loadAsync(`${base}${decor ? 'k_' : ''}${name}.glb`);
  const mats = new Map<THREE.Material, number>();
  const matList: THREE.Material[] = [];
  const geo = bake(gltf.scene, mats, matList);
  const [axis, size] = decor ? DECOR_SIZE[name as DecorName] : PROP_SIZE[name as PropName];
  normalize([geo], axis, size);
  return { geo, materials: matList };
}

export async function loadModels(): Promise<Models> {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/`;
  const charNames: CharName[] = ['peasant', 'builder', 'spear', 'archer', 'fast', 'brute', 'ranged'];
  const propNames = Object.keys(PROP_SIZE) as PropName[];
  const decorNames = Object.keys(DECOR_SIZE) as DecorName[];
  const [chars, props, decor] = await Promise.all([
    Promise.all(charNames.map((n) => loadChar(loader, base, n))),
    Promise.all(propNames.map((n) => loadProp(loader, base, n))),
    Promise.all(decorNames.map((n) => loadProp(loader, base, n, true))),
  ]);
  return {
    chars: Object.fromEntries(charNames.map((n, i) => [n, chars[i]])) as Record<CharName, CharModel>,
    props: Object.fromEntries(propNames.map((n, i) => [n, props[i]])) as Record<PropName, Baked>,
    decor: Object.fromEntries(decorNames.map((n, i) => [n, decor[i]])) as Record<DecorName, Baked>,
  };
}
