// Trims the source models down to what the game uses and writes public/models/*.glb.
// KayKit (CC0, Kay Lousberg), Kenney Nature/Castle/Fantasy Town kits (CC0, Kenney) and Quaternius Ultimate Fantasy RTS
// (CC0, Quaternius) — see CREDITS.md for every source file.
// Usage: node scripts/build-models.mjs <KayKit folder | -> [<Nature Kit "Models/GLTF format" | ->]
//          [<Castle Kit "Models/GLB format" | ->] [<Fantasy Town Kit "Models/GLB format" | ->] [<Ultimate Fantasy RTS glTF folder | ->]
// Any folder can be "-" to keep the files already in public/models.
import { mkdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, weld } from '@gltf-transform/functions';

const src = process.argv[2];
if (!src) throw new Error('pass the folder with the downloaded KayKit files, or - to skip KayKit');
const out = 'public/models';
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const CHARACTERS = {
  peasant: { file: 'Rogue_Hooded.glb', drop: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'], anims: ['Idle', 'Walking_A', 'Interact'] },
  builder: { file: 'Barbarian.glb', drop: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '2H_Axe', 'Mug'], anims: ['Idle', 'Walking_A', '1H_Melee_Attack_Chop'] },
  spear: { file: 'Knight.glb', drop: ['1H_Sword_Offhand', 'Badge_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword'], anims: ['Idle', 'Walking_A', '1H_Melee_Attack_Chop'] },
  archer: { file: 'Rogue.glb', drop: ['Knife_Offhand', '2H_Crossbow', 'Knife', 'Throwable'], anims: ['Idle', 'Walking_A', '1H_Ranged_Shoot'] },
  fast: { file: 'Skeleton_Minion.glb', drop: [], anims: ['Idle', 'Running_A', '1H_Melee_Attack_Chop'] },
  brute: { file: 'Skeleton_Warrior.glb', drop: [], anims: ['Idle', 'Walking_A', '1H_Melee_Attack_Chop'] },
  ranged: { file: 'Skeleton_Mage.glb', drop: [], anims: ['Idle', 'Walking_A', 'Spellcast_Shoot'] },
};

const PROPS = {
  fence: 'fence_wood_straight',
  treeA: 'tree_single_A',
  treeB: 'tree_single_B',
  stump: 'tree_single_A_cut',
  rockA: 'rock_single_A',
  rockB: 'rock_single_B',
  rockC: 'rock_single_C',
  mountain: 'mountain_A',
  groveA: 'trees_A_large',
  groveB: 'trees_B_large',
};

// Kenney Nature Kit: ground decoration and crop fields for food nodes.
const KENNEY = {
  grass: 'grass',
  grassLarge: 'grass_large',
  grassLeafs: 'grass_leafs',
  flowerRed: 'flower_redA',
  flowerYellow: 'flower_yellowA',
  flowerPurple: 'flower_purpleA',
  mushroomRed: 'mushroom_redGroup',
  mushroomTan: 'mushroom_tanGroup',
  bushSmall: 'plant_bushSmall',
  pebble: 'rock_smallA',
  log: 'log',
  stumpOld: 'stump_old',
  campfire: 'campfire_logs',
  pumpkin: 'crop_pumpkin',
  wheat: 'crops_wheatStageB',
  corn: 'crops_cornStageD',
};

for (const [name, c] of src === '-' ? [] : Object.entries(CHARACTERS)) {
  const doc = await io.read(`${src}/${c.file}`);
  const root = doc.getRoot();
  for (const node of root.listNodes()) if (c.drop.includes(node.getName())) node.dispose();
  for (const a of root.listAnimations()) {
    if (c.anims.includes(a.getName())) continue;
    // Samplers keep their keyframe accessors alive unless disposed explicitly.
    for (const ch of a.listChannels()) ch.dispose();
    for (const sm of a.listSamplers()) sm.dispose();
    a.dispose();
  }
  await doc.transform(resample(), prune(), dedup());
  const path = `${out}/${name}.glb`;
  await io.write(path, doc);
  console.log(path, Math.round(statSync(path).size / 1024) + 'KB');
}

for (const [name, file] of src === '-' ? [] : Object.entries(PROPS)) {
  const doc = await io.read(`${src}/med/${file}.gltf`);
  await doc.transform(prune(), dedup());
  const path = `${out}/${name}.glb`;
  await io.write(path, doc);
  console.log(path, Math.round(statSync(path).size / 1024) + 'KB');
}

const kenneyDir = process.argv[3];
if (kenneyDir && kenneyDir !== '-') {
  for (const [name, file] of Object.entries(KENNEY)) {
    const doc = await io.read(`${kenneyDir}/${file}.glb`);
    await doc.transform(prune(), dedup());
    const path = `${out}/k_${name}.glb`;
    await io.write(path, doc);
    console.log(path, Math.round(statSync(path).size / 1024) + 'KB');
  }
}

// Medieval buildings and props (prefix m_): rooms on the castle deck, the keep, walls, towers and scenery.
const CASTLE_KIT = {
  stoneNarrow: 'wall-narrow',
  portcullis: 'gate',
  towerBase: 'tower-square-base',
  towerMid: 'tower-square-mid-windows',
  towerDoor: 'tower-square-mid-door',
  towerTop: 'tower-square-top-roof-high',
  towerRoof: 'tower-square-roof',
  hexTower: 'tower-hexagon-base',
  hexRoof: 'tower-hexagon-roof',
  pennant: 'flag-pennant',
  rubble: 'rocks-small',
  ruinTrebuchet: 'siege-trebuchet-demolished',
  ruinRam: 'siege-ram-demolished',
  ruinTower: 'siege-tower-demolished',
};
const TOWN_KIT = {
  windmill: 'windmill',
  cart: 'cart',
  lantern: 'lantern',
  bannerRed: 'banner-red',
  fenceBroken: 'fence-broken',
  fence: 'fence',
  hedge: 'hedge',
  stall: 'stall-red',
  treeCrooked: 'tree-crooked',
  treeHigh: 'tree-high-round',
  wheel: 'wheel',
};
const RTS = {
  house: 'Houses_FirstAge_1_Level3',
  house2: 'Houses_SecondAge_1_Level1',
  hut: 'Houses_FirstAge_2_Level3',
  barracks: 'Barracks_FirstAge_Level3',
  barracks2: 'Barracks_SecondAge_Level1',
  range: 'Archery_FirstAge_Level3',
  range2: 'Archery_SecondAge_Level1',
  storage: 'Storage_FirstAge_Leve3',
  storage2: 'Storage_SecondAge_Level1',
  market: 'Market_FirstAge_Level3',
  market2: 'Market_SecondAge_Level1',
  watch: 'WatchTower_FirstAge_Level3',
  watch2: 'WatchTower_SecondAge_Level1',
  barrel: 'Barrel',
  crates: 'Crate_Stack1',
  logs: 'Logs',
  mill: 'Windmill_FirstAge',
  mine: 'Mine',
  towerHouse: 'TowerHouse_FirstAge',
  pines: 'Resource_PineTree_Group',
};
for (const [dir, list, ext] of [[process.argv[4], CASTLE_KIT, 'glb'], [process.argv[5], TOWN_KIT, 'glb'], [process.argv[6], RTS, 'gltf']]) {
  if (!dir || dir === '-') continue;
  for (const [name, file] of Object.entries(list)) {
    const doc = await io.read(`${dir}/${file}.${ext}`);
    // Quantized attributes (KHR_mesh_quantization, read natively by three.js) roughly halve the files.
    await doc.transform(prune(), dedup(), weld(), quantize());
    const path = `${out}/m_${name}.glb`;
    await io.write(path, doc);
    console.log(path, Math.round(statSync(path).size / 1024) + 'KB');
  }
}
