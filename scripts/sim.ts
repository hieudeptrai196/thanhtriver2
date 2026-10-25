// Headless balance run (GDD v1.2 §16.3): every bot policy over many seeds.
// npm run sim                       → 20 seeds per policy
// npm run sim -- --seeds 100        → the GDD's 100 seeds per policy (slow: run it in the background)
// npm run sim -- --policy tactical  → one policy only
import { BOT_POLICIES, runBot, type BotPolicy, type BotRun } from '../src/sim/bot';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const count = Number(arg('seeds') ?? 20);
const only = arg('policy') as BotPolicy | undefined;
const policies = only ? [only] : BOT_POLICIES;
const seeds = Array.from({ length: count }, (_, i) => 1000 + i * 7919);

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
const t0 = Date.now();
for (const policy of policies) {
  const runs: BotRun[] = seeds.map((seed) => runBot(seed, 30, policy));
  const nights = runs.map((r) => r.nights).sort((a, b) => a - b);
  const stays = runs.reduce((a, r) => a + r.stays, 0);
  const moves = runs.reduce((a, r) => a + r.moves, 0);
  const causes = new Map<string, number>();
  for (const r of runs) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  const avg = nights.reduce((a, b) => a + b, 0) / nights.length;
  console.log(
    `${policy.padEnd(9)} seeds ${count}  nights median ${pct(nights, 0.5)}  P10 ${pct(nights, 0.1)}  P90 ${pct(nights, 0.9)}  avg ${avg.toFixed(2)}` +
      `  stay ${Math.round((stays / Math.max(1, stays + moves)) * 100)}%  causes ${[...causes].map(([k, v]) => `${k}:${v}`).join(' ')}`,
  );
}
console.log(`target: median 5–8 nights for tactical · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
