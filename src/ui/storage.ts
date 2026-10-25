// localStorage wrappers. Every access is guarded: private mode or blocked storage must not break the game.

const SAVE_KEY = 'thanhtri.save';
const SCORES_KEY = 'thanhtri.scores';

export interface ScoreRow {
  nights: number;
  kills: number;
  bosses: number;
  score: number;
  date: number;
  mode?: string;
  won?: boolean;
}

export function loadSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function writeSave(json: string): boolean {
  try {
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function loadScores(): ScoreRow[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const rows = raw ? (JSON.parse(raw) as ScoreRow[]) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Adds a score and returns true when it is the new best. */
export function addScore(row: ScoreRow): boolean {
  const rows = loadScores();
  const best = rows.reduce((m, r) => Math.max(m, r.score), 0);
  rows.push(row);
  rows.sort((a, b) => b.score - a.score);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(rows.slice(0, 10)));
  } catch {
    // ignore
  }
  return row.score > best;
}
