# Credits

All third-party 3D models in this game are **CC0 (public domain)**
([Creative Commons Zero 1.0](http://creativecommons.org/publicdomain/zero/1.0/)). Credit is not required by the
license; we give it gladly. The same credits are shown in the game under **Menu → Credits**.

## KayKit by Kay Lousberg

**KayKit** game assets by **Kay Lousberg** — [www.kaylousberg.com](https://www.kaylousberg.com),
[kaylousberg.itch.io](https://kaylousberg.itch.io), [Patreon](https://patreon.com/kaylousberg). Thank you, Kay!

| Pack | Source | Files used | Used in game as |
| --- | --- | --- | --- |
| KayKit : Adventurers Character Pack (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | `Rogue_Hooded.glb`, `Barbarian.glb`, `Knight.glb`, `Rogue.glb` | Peasant, builder, spearman and shieldbearer (the knight, tinted and a size up), archer |
| KayKit Character Pack : Skeletons (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | `Skeleton_Minion.glb`, `Skeleton_Warrior.glb`, `Skeleton_Mage.glb` | Fast monster, brute and boss, ranged monster |
| KayKit : Medieval Hexagon Pack (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | `building_castle_blue`, `building_tower_A_blue`, `fence_wood_straight`, `tree_single_A`, `tree_single_B`, `tree_single_A_cut`, `rock_single_A/B/C`, `mountain_A`, `flag_blue`, `hills_A_trees`, `hills_B_trees`, `mountain_A_grass_trees`, `trees_A_large`, `trees_B_large` (+ `hexagons_medieval.png`) | Castle keep, arrow tower, wooden wall and castle palisade, trees, stumps, rocks, canyon boulders, flags, hills and groves beside the railway |

## Kenney Nature Kit by Kenney

**Nature Kit (2.1)** by **Kenney** — [www.kenney.nl](https://www.kenney.nl),
[kenney.nl/assets/nature-kit](https://kenney.nl/assets/nature-kit), [Patreon](https://patreon.com/kenney). Thank you,
Kenney!

| Files used | Used in game as |
| --- | --- |
| `grass`, `grass_large`, `grass_leafs`, `flower_redA`, `flower_yellowA`, `flower_purpleA`, `mushroom_redGroup`, `mushroom_tanGroup`, `plant_bushSmall`, `rock_smallA`, `rock_smallFlatA`, `log`, `stump_old`, `campfire_logs` | Ground decoration (grass, flowers, mushrooms, pebbles, logs) |
| `crop_pumpkin`, `crops_wheatStageB`, `crops_cornStageD` | Food fields (the food resource nodes) |

## Changes made for this game

`scripts/build-models.mjs` removes unused weapons and animations and repacks the files as `.glb`
(`public/models/*.glb`; Kenney files are prefixed `k_`). Kenney material colours are retuned to the game's palette
in `src/render/models.ts`. At runtime a few frames of the Idle, Walk/Run and attack animations are baked into static
meshes so crowds can be drawn with instancing. To rebuild from the original downloads, see `README.md`.

## Everything else

The ground terrain, railway, torches, the castle's wooden deck and wheels, effects, UI and sounds are made in code for
this project. Built with [three.js](https://threejs.org) (MIT) and [Vite](https://vite.dev) (MIT).
