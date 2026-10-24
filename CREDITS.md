# Credits

## 3D models: KayKit by Kay Lousberg

All 3D models in `public/models/` come from **KayKit** game assets by **Kay Lousberg**
([www.kaylousberg.com](https://www.kaylousberg.com), [kaylousberg.itch.io](https://kaylousberg.itch.io),
[Patreon](https://patreon.com/kaylousberg)), released under
**[Creative Commons Zero (CC0 1.0)](http://creativecommons.org/publicdomain/zero/1.0/)**.
Credit is not required by the license; we give it gladly. Thank you, Kay!

| Pack | Source | Files used | Used in game as |
| --- | --- | --- | --- |
| KayKit : Adventurers Character Pack (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | `Rogue_Hooded.glb`, `Barbarian.glb`, `Knight.glb`, `Rogue.glb` | Peasant, builder, spearman, archer |
| KayKit Character Pack : Skeletons (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | `Skeleton_Minion.glb`, `Skeleton_Warrior.glb`, `Skeleton_Mage.glb` | Fast monster, brute and boss, ranged monster |
| KayKit : Medieval Hexagon Pack (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | `building_castle_blue`, `building_tower_A_blue`, `fence_wood_straight`, `tree_single_A`, `tree_single_B`, `tree_single_A_cut`, `rock_single_A/B/C`, `mountain_A`, `flag_blue` (+ `hexagons_medieval.png`) | Castle keep, arrow tower, wooden wall and castle palisade, trees, stumps, rocks, canyon cliffs, flags |

Changes made for this game (`scripts/build-models.mjs`): unused weapons and animations removed, files repacked as
`.glb`. At runtime a few frames of the Idle, Walk/Run and attack animations are baked into static meshes so crowds
can be drawn with instancing.

## Everything else

Torches, berry bushes, the castle's wooden deck and wheels, effects, UI and sounds are made in code for this project.
Built with [three.js](https://threejs.org) (MIT) and [Vite](https://vite.dev) (MIT).
