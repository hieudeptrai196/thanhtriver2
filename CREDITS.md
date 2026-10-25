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
| KayKit : Medieval Hexagon Pack (1.0) | [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | `fence_wood_straight`, `tree_single_A`, `tree_single_B`, `tree_single_A_cut`, `rock_single_A/B/C`, `mountain_A`, `trees_A_large`, `trees_B_large` (+ `hexagons_medieval.png`) | Wooden wall, trees, stumps, rocks, canyon boulders, woods on the hills |

## Kenney Nature Kit by Kenney

**Nature Kit (2.1)** by **Kenney** — [www.kenney.nl](https://www.kenney.nl),
[kenney.nl/assets/nature-kit](https://kenney.nl/assets/nature-kit), [Patreon](https://patreon.com/kenney). Thank you,
Kenney!

| Files used | Used in game as |
| --- | --- |
| `grass`, `grass_large`, `grass_leafs`, `flower_redA`, `flower_yellowA`, `flower_purpleA`, `mushroom_redGroup`, `mushroom_tanGroup`, `plant_bushSmall`, `rock_smallA`, `log`, `stump_old`, `campfire_logs` | Ground decoration (grass, flowers, mushrooms, pebbles, logs) |
| `crop_pumpkin`, `crops_wheatStageB`, `crops_cornStageD` | Food fields (the food resource nodes) |

## Kenney Castle Kit and Fantasy Town Kit by Kenney

**Castle Kit (2.0)** and **Fantasy Town Kit (2.0)** by **Kenney** — [kenney.nl/assets/castle-kit](https://kenney.nl/assets/castle-kit),
[kenney.nl/assets/fantasy-town-kit](https://kenney.nl/assets/fantasy-town-kit). CC0.

| Kit | Files used | Used in game as |
| --- | --- | --- |
| Castle Kit | `wall-narrow`, `gate`, `tower-square-base`, `tower-square-mid-door`, `tower-square-mid-windows`, `tower-square-top-roof-high`, `tower-square-roof`, `tower-hexagon-base`, `tower-hexagon-roof`, `flag-pennant`, `rocks-small`, `siege-trebuchet-demolished`, `siege-ram-demolished`, `siege-tower-demolished` | The castle's stone curtain wall, gate and corner towers; the keep (one storey and a high roof more at tier 2); broken stretches of old wall and wrecks of old sieges in the countryside |
| Fantasy Town Kit | `windmill`, `cart`, `lantern`, `banner-red`, `fence`, `fence-broken`, `hedge`, `stall-red`, `tree-crooked`, `tree-high-round`, `wheel` | Gate banners, lanterns along the railway, villages (fences, hedges, market stalls, trees), windmills, carts and battlefield debris |

## Ultimate Fantasy RTS by Quaternius

**Ultimate Fantasy RTS** by **Quaternius** — [quaternius.com/packs/ultimatefantasyrts.html](https://quaternius.com/packs/ultimatefantasyrts.html),
[Patreon](https://www.patreon.com/quaternius). CC0. Thank you, Quaternius!

| Files used | Used in game as |
| --- | --- |
| `Houses_FirstAge_1_Level3`, `Houses_SecondAge_1_Level1`, `Houses_FirstAge_2_Level3`, `Barracks_FirstAge_Level3`, `Barracks_SecondAge_Level1`, `Archery_FirstAge_Level3`, `Archery_SecondAge_Level1`, `Storage_FirstAge_Leve3`, `Storage_SecondAge_Level1`, `Market_FirstAge_Level3`, `Market_SecondAge_Level1`, `WatchTower_FirstAge_Level3`, `WatchTower_SecondAge_Level1` | The rooms on the castle deck (house, workshop, barracks, archery range, storage, kitchen, watchtower) — timber at tier 1, stone at tier 2 — and the arrow towers you build |
| `Barrel`, `Crate_Stack1`, `Logs`, `Windmill_FirstAge`, `Mine`, `TowerHouse_FirstAge`, `Resource_PineTree_Group` | Empty plots on the deck; the villages beside the railway (their houses reuse the room buildings), mills, mines, woodcutters' towers and pine stands on the hills |

## Font

**Alegreya SC** by Juan Pablo del Peral (Huerta Tipográfica), [SIL Open Font License 1.1](https://openfontlicense.org), bundled
from the [`@fontsource/alegreya-sc`](https://fontsource.org/fonts/alegreya-sc) package. Used for titles.

## Changes made for this game

`scripts/build-models.mjs` removes unused weapons and animations and repacks the files as `.glb`
(`public/models/*.glb`; Kenney Nature Kit files are prefixed `k_`, the medieval buildings and props `m_`, and those are
also quantized to make them smaller). Colours are retuned to the game's earthy medieval palette in `src/render/models.ts`:
Kenney's colour atlas is shifted at load time (blue roofs to rust red, pale sand to grey stone) and Quaternius materials
are recoloured by name. At runtime a few frames of the Idle, Walk/Run and attack animations are baked into static
meshes so crowds can be drawn with instancing. To rebuild from the original downloads, see `README.md`.

## Everything else

The ground terrain (with its ploughed fields, wheat and village tracks), railway, torches, the castle's timber deck,
chimneys and wheels, effects, UI and sounds are made in code for this project. Built with [three.js](https://threejs.org) (MIT) and [Vite](https://vite.dev) (MIT).
