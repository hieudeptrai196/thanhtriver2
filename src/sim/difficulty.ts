import { BALANCE, lerpByNight, type Dir, type TerrainType } from '../data/balance';

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

export function dayLength(night: number): number {
  return lerpByNight(night, P.dayStart, P.dayEnd);
}

export function nightLength(night: number): number {
  return lerpByNight(night, P.nightStart, P.nightEnd);
}

export function monsterHpMult(night: number, danger: number): number {
  return danger * (1 + BALANCE.monsterGrowthPerNight * (night - 1));
}
