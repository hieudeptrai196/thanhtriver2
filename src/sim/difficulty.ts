import { BALANCE, type Dir, type TerrainType } from '../data/balance';

const D = BALANCE.difficulty;
const P = BALANCE.phases;

export function monsterCount(night: number): number {
  return Math.round(D.baseCount * Math.pow(D.growth, night - 1));
}

export function baseDirs(night: number): number {
  let dirs = 2;
  for (const step of D.dirsByNight) if (night >= step.from) dirs = step.dirs;
  return dirs;
}

/** Number of attack directions for a night, given where the castle stands. */
export function dirCount(night: number, stayed: boolean, newRegion: boolean, terrain: TerrainType): number {
  let dirs = baseDirs(night);
  if (stayed) dirs += D.stayExtraDirs;
  if (newRegion) dirs = Math.min(dirs, D.newRegionMaxDirs);
  return Math.max(1, Math.min(dirs, BALANCE.world.terrainDirs[terrain].length));
}

export function allowedDirs(terrain: TerrainType): Dir[] {
  return BALANCE.world.terrainDirs[terrain];
}

export function waveCount(night: number): number {
  return night >= P.wavesThreeFrom ? P.wavesLate : P.wavesEarly;
}

export function isBossNight(night: number): boolean {
  return night % D.bossEvery === 0;
}

export function stage(night: number): number {
  let i = 0;
  P.stageFrom.forEach((from, k) => {
    if (night >= from) i = k;
  });
  return i;
}

export function dayLength(night: number): number {
  return P.day[stage(night)];
}

export function duskLength(night: number): number {
  return P.dusk[stage(night)];
}

export function nightLength(night: number): number {
  return P.night[stage(night)];
}

/** Monsters grow with each night camped at the same spot beyond the second ("they learn the way"). */
export function awarenessMult(nightsHere: number): number {
  return 1 + Math.max(0, nightsHere - 1) * BALANCE.difficulty.awarenessPerNight;
}

export function monsterHpMult(night: number, danger: number): number {
  return danger * (1 + BALANCE.monsterGrowthPerNight * (night - 1));
}
