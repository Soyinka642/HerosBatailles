// Scénarios du lot 1.2c : comportement Assaut des ennemis, palissade, tour, Feu et pâte.
// Mêmes principes que scenarios.test.ts : chaque journal est un .txt versionné, à relire.

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data/load';
import type { Wave } from '../../data/types';
import { type BattleResult, runBattle } from '../battle';
import { narrateBattle } from '../narrate';
import type { BattleSetup } from '../setup';
import { fireArchers, squad } from '../catalog';

const data = loadGameData();

function wave(arrivals: Wave['arrivals']): Wave {
  return { id: 'scenario', index: 1, kind: 'wave', arrivals };
}

async function play(file: string, setup: BattleSetup): Promise<BattleResult> {
  const result = runBattle(data, setup);
  await expect(narrateBattle(data, result)).toMatchFileSnapshot(`./${file}.txt`);
  return result;
}

function count(result: BattleResult, type: string): number {
  return result.events.filter((e) => e.type === type).length;
}

describe('scénarios du lot 1.2c', () => {
  it('le Feu sur une brute', async () => {
    const result = await play('feu-sur-une-brute', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), fireArchers(data, { col: 1, row: 2 }, 4)],
      unlocks: ['forgeron'],
    });
    expect(count(result, 'ignite')).toBeGreaterThan(0);
  });

});

