// Headless balance run: `npm run sim`. Prints nights survived by the bot over 10 seeds.
import { runBot } from '../src/sim/bot';

const seeds = Array.from({ length: 10 }, (_, i) => 1000 + i * 7919);
const results: number[] = [];
const t0 = Date.now();
for (const seed of seeds) {
  const r = runBot(seed);
  results.push(r.nights);
  console.log(`seed ${seed}: ${r.nights} nights, ${r.kills} kills`);
}
const avg = results.reduce((a, b) => a + b, 0) / results.length;
console.log(`average nights: ${avg.toFixed(2)} (target 5–8), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
