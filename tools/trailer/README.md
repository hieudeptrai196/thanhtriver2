# Trailer tools

How `docs/trailer/thanh-tri-trailer.mp4` was made: every frame is rendered by the game itself.

1. `node tools/trailer/frameserver.mjs <frames dir>`: receives frames on port 5199 and serves `director.js`.
2. Run the dev server, open `http://localhost:5173/?seed=39`, start a game (`start('endless')` in the console), then
   `dir = await import('http://127.0.0.1:5199/director.js'); await dir.init()` and run the shots in
   `dir.shots` (prep, s01, s03a, s03b, s03c, s02, s04, s05, s06d, s06a, s06c, s06b, s07, s08, s09). The director stops
   the game loop, steps the simulation itself (the bot plays), flies a free camera, draws captions and letterbox, and
   posts 1920×1080 JPEG frames.
3. `node tools/trailer/music.mjs music.wav`: the score, synthesised from scratch to the cut times.
4. Edit with ffmpeg: the 14 shots in story order, dissolves into s02 and s08, music compressed and normalised to
   −14 LUFS (see the commit that added these tools for the exact command).
