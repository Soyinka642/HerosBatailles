// Scénarios du lot 1.2c : comportement Assaut des ennemis, palissade, tour, Feu et pâte.
// Mêmes principes que scenarios.test.ts : chaque journal est un .txt versionné, à relire.

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data/load';
import type { Wave } from '../../data/types';
import { type BattleResult, runBattle } from '../battle';
import { narrateBattle } from '../narrate';
import type { BattleSetup } from '../setup';
import { ALL_FORTIFICATIONS, fireArchers, squad } from '../test-helpers';
import { sensibleSetup, sensibleSquads } from './deployment';

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
  it('la vague 1 derrière la palissade', async () => {
    const result = await play('vague-1-derriere-la-palissade', sensibleSetup(data, data.waves[0]!));
    expect(result.outcome.kind).toBe('victory');
  });

  it('la palissade assiégée puis brisée', async () => {
    const result = await play('palissade-assiegee-puis-brisee', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 1 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 1 }), squad(data, 'archers', { col: 2, row: 2 })],
      fortifications: ALL_FORTIFICATIONS,
    });
    expect(count(result, 'fortificationDestroyed')).toBe(1);
  });

  it('la tour prise par l’ennemi', async () => {
    const result = await play('tour-prise-par-l-ennemi', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'archers', { col: 2, row: 2 }), squad(data, 'epeistes', { col: 3, row: 0 })],
      fortifications: ALL_FORTIFICATIONS,
    });
    expect(result.final.breaches).toBe(1);
  });

  it('le Feu sur une brute', async () => {
    const result = await play('feu-sur-une-brute', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), fireArchers(data, { col: 1, row: 2 }, 4)],
      unlocks: ['forgeron'],
    });
    expect(count(result, 'ignite')).toBeGreaterThan(0);
  });

  it('le Feu sur un ennemi abrité dans la tour', async () => {
    const result = await play('feu-sur-la-tour', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 1, row: 2 }), fireArchers(data, { col: 1, row: 0 }, 4)],
      fortifications: ALL_FORTIFICATIONS,
      unlocks: ['forgeron'],
    });
    expect(result.events.some((e) => e.type === 'ignite' && e.site === 'tour')).toBe(true);
  });

  it('une incursion par une brèche', async () => {
    const result = await play('incursion-par-une-breche', {
      wave: wave([{ turn: 1, enemy: 'fantassins-du-portail', count: 1, row: 3 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 1 }), squad(data, 'archers', { col: 2, row: 0 })],
      fortifications: [...ALL_FORTIFICATIONS.filter((f) => f.site !== 'palissade-centre-sud'), { site: 'palissade-centre-sud', structure: 6 }],
    });
    expect(result.final.breaches).toBe(1);
  });

  it('la pâte épuisée', async () => {
    const squads = sensibleSquads(data, 2);
    const result = await play('pate-epuisee', {
      wave: wave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 1 },
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 3 },
      ]),
      squads,
      fortifications: ALL_FORTIFICATIONS,
      unlocks: ['forgeron'],
    });
    expect(result.events.some((e) => e.type === 'shot' && e.fire?.used === false && e.fire.why === 'noConsumable')).toBe(true);
  });

  it.each([
    ['vague-2-complete', 1],
    ['vague-3-complete', 2],
    ['vague-4-complete', 3],
    ['bataille-finale-complete', 4],
  ])('%s', async (file, index) => {
    await play(file, sensibleSetup(data, data.waves[index]!));
  });
});

