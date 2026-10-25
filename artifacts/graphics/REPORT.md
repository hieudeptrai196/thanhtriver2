# Graphics pass — evidence (threejs-aaa-graphics-builder)

Game: Thành Trì (Vite + TypeScript + three.js 0.186). Seed 39, endless mode, the built-in bot playing; captures are the
game's own camera during active play (day of night 3, and night with 8+ monsters at the castle). Sources were existing
CC0 models and procedural work only: no external generation services were used (no API keys were requested).

Pixel metrics use the skill inspector's formulas (`threejs-qa-release/scripts/inspect-threejs-canvas.mjs`,
`computePixelMetrics`) computed in the page; the inspector itself was not run because the project has no Playwright.
Renderer counts are summed over the whole frame (scene, shadow map, post passes).

## Measurements

| Capture | Draw calls | Triangles | Mean lum | Contrast | Entropy | Edges | Dominant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before day desktop 1600×900 | 419 | 1.31 M | 115 | 69 | 3.42 | 0.277 | 0.41 |
| before night desktop | 449 | 1.32 M | 48 | 93 | 4.94 | 0.29 | 0.27 |
| after day desktop | 215 | 0.97 M | 124 | 102 | 5.02 | 0.44 | 0.18 |
| after day mobile 812×375 | 213 | 0.97 M | 124 | 102 | 4.94 | 0.45 | 0.20 |
| after day mobile, low tier | 149 | 0.54 M | 132 | 99 | 3.96 | 0.30 | 0.33 |
| after night desktop | 260 | 1.15 M | 63 | 125 | 5.80 | 0.43 | 0.15 |
| after night mobile | 255 | 1.15 M | 58 | 118 | 5.49 | 0.40 | 0.17 |
| after night mobile, low tier | 173 | 0.62 M | 61 | 108 | 5.27 | 0.29 | 0.25 |

Budget notes: desktop draw calls are inside 300. Triangles stay over the 750 k desktop starting budget (the counts
include the shadow pass; the meadow carpet alone is 229 k at 7 triangles a clump, the castle and crowds take most of
the rest) — accepted for desktop, where frames hold. The low tier (chosen automatically when frames are slow: shadows,
bloom and vignette off, 30 % grass, half the far woods and ground flowers) is at 149–173 calls and 0.54–0.62 M
triangles, still above the 150 / 300 k mobile starting budget; the remaining cost is the characters (KayKit, ~5 k
triangles each) and the castle. Shadow map 2048, one shadow-casting light, DPR capped at 2, post passes: bloom +
vignette + output (desktop), none (low tier). Materials in the scene graph 189 → 89 (61 in use in the measured night view).

## Scorecard (0–3; genre terms: hero = the castle-train, enemies = the skeleton horde, interactables = resource nodes and building sites)

| Category | Before | After | Evidence |
| --- | --- | --- | --- |
| Art direction | 1.5 | 2 | earthy medieval palette carried into materials, VFX colour code (orange fire, green souls, gold glints) |
| Hero (castle) | 1.5 | 2 | readable walled keep at the default camera, layered rooms by tier, smoke, roof fire, stone chips when hit |
| Enemies | 1.5 | 2 | distinct skeleton roles, boss slam telegraph and dust ring, bone-shard and soul death burst |
| Interactables | 1 | 1.5 | building sites are timber scaffolds that grow; resource nodes are still small stock props |
| World | 1.5 | 2 | dense meadow, villages, fields, ruins; near/mid/far layers; less empty framing at the closer default zoom |
| Materials | 1 | 2 | shared PBR roles (stone, timber, iron, brass, cloth), procedural world-space wear and ground grime |
| Lighting/render | 1.5 | 2 | ACES tone mapping, studio environment light, sun key + hemisphere fill, night practicals with bloom, vignette |
| VFX/motion | 1.5 | 2 | event-driven sparks, bone shards, souls, chips, splinters, dust rings, arrow impacts, camera shake, soft smoke and fire |
| UI/HUD | 1.5 | 1.5 | unchanged in this pass; emoji resource icons still read as placeholder |
| Performance evidence | 1 | 2 | before/after counts, budgets, low tier and its trade-offs (this report) |

Average 1.4 → 1.9. Not premium yet (premium needs every category ≥ 2 and an average ≥ 2.3).

Still weak, and the pass that fixes each:
- UI/HUD 1.5: authored icon set and HUD frames in place of emoji (threejs-game-ui-designer; icon art needs either an
  image service or hand-drawn SVG).
- Interactables 1.5: resource nodes need depletion states and readable silhouettes at the gameplay zoom.
- Mixed art sources (KayKit characters beside Quaternius and Kenney buildings) cap art direction; a single authored
  character and building set is the real fix.
- Mobile triangle budget: lighter character LODs.

## Files changed

`src/render/models.ts` (shared material kit, PBR surfaces, wear shader), `src/render/renderer.ts` (castle merge,
render pipeline, look parameters, shadow casters, zoom-tilt camera, scaffold sites, VFX wiring, camera shake, low tier),
`src/render/particles.ts` (new GPU particle system and authored effects), `src/render/geometry.ts` (scaffold),
`src/render/terrain.ts`, `src/render/grass.ts` (PBR, low-tier density).

Captures: `before-*.jpg`, `after-*.jpg`, `s2-*-close.jpg`, `compare-before-after.jpg` in this folder.
