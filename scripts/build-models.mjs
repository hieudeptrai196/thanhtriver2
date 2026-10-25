// Trims the source models down to what the game uses and writes public/models/*.glb.
// KayKit (CC0, Kay Lousberg) and Kenney Nature Kit (CC0, Kenney) — see CREDITS.md for every source file.
// Usage: node scripts/build-models.mjs <folder with the KayKit files | -> [<Kenney "Models/GLTF format" folder>]
import { mkdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, resample } from '@gltf-transform/functions';

const src = process.argv[2];
if (!src) throw new Error('pass the folder with the downloaded KayKit files, or - to skip KayKit');
const out = 'public/models';
mkdirSync(out, { recursive: true });
const io = new NodeIO();

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
  castle: 'building_castle_blue',
  tower: 'building_tower_A_blue',
  fence: 'fence_wood_straight',
  treeA: 'tree_single_A',
  treeB: 'tree_single_B',
  stump: 'tree_single_A_cut',
  rockA: 'rock_single_A',
  rockB: 'rock_single_B',
  rockC: 'rock_single_C',
  mountain: 'mountain_A',
  flag: 'flag_blue',
  hillsA: 'hills_A_trees',
  hillsB: 'hills_B_trees',
  peak: 'mountain_A_grass_trees',
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
  pebbleFlat: 'rock_smallFlatA',
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
if (kenneyDir) {
  for (const [name, file] of Object.entries(KENNEY)) {
    const doc = await io.read(`${kenneyDir}/${file}.glb`);
    await doc.transform(prune(), dedup());
    const path = `${out}/k_${name}.glb`;
    await io.write(path, doc);
    console.log(path, Math.round(statSync(path).size / 1024) + 'KB');
  }
}
