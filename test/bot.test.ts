import { describe, expect, it } from 'vitest';
import { runBot } from '../src/sim/bot';

describe('bot', () => {
  it('survives the first nights headlessly', () => {
    const r = runBot(1000, 3);
    expect(r.nights).toBeGreaterThanOrEqual(2);
  });
});
