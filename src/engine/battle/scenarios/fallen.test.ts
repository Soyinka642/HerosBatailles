// Scénarios du lot 1.2d : soldats tombés et fuite en déroute.
// Mêmes principes que scenarios.test.ts : chaque journal est un .txt versionné, à relire.

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data/load';
import type { Wave } from '../../data/types';
import { type BattleResult, runBattle } from '../battle';
import { narrateBattle } from '../narrate';
import type { BattleSetup } from '../setup';
import { ALL_FORTIFICATIONS, squad } from '../test-helpers';
import type { Order } from '../types';

const data = loadGameData();
const HOLD_AFTER = (steps: Order['plannedTurns'][number]['steps']): Order => ({ plannedTurns: [{ steps }], posture: 'tenir' });

function wave(arrivals: Wave['arrivals']): Wave {
  return { id: 'scenario', index: 1, kind: 'wave', arrivals };
}

async function play(file: string, setup: BattleSetup): Promise<BattleResult> {
  const result = runBattle(data, setup);
  await expect(narrateBattle(data, result)).toMatchFileSnapshot(`./${file}.txt`);
  return result;
}

function has(result: BattleResult, type: string, atEnd = false): boolean {
  return result.events.some((e) => e.type === type && (('atEnd' in e && e.atEnd === true) === atEnd));
}

describe('scénarios du lot 1.2d', () => {
  it('des tombés repris à temps', async () => {
    const result = await play('tombes-repris-a-temps', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }, HOLD_AFTER([{ col: 4, row: 2 }])), squad(data, 'piquiers', { col: 3, row: 1 }, HOLD_AFTER([{ col: 3, row: 2 }]))],
      fortifications: ALL_FORTIFICATIONS,
    });
    expect(has(result, 'fallenRecovered')).toBe(true);
  });

  it('des tombés perdus : l’ennemi tient la case', async () => {
    const result = await play('tombes-perdus', {
      wave: wave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 2, enemy: 'tireurs-du-portail', count: 1, row: 2 },
      ]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'archers', { col: 1, row: 4 })],
    });
    expect(has(result, 'fallenDied')).toBe(true);
  });

  it('une fuite qui contourne ses alliés', async () => {
    const result = await play('fuite-qui-contourne', {
      wave: wave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 2, enemy: 'brutes-du-portail', count: 1, row: 2 },
      ]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'piquiers', { col: 2, row: 2 }), squad(data, 'archers', { col: 2, row: 1 })],
    });
    expect(has(result, 'fled')).toBe(true);
  });

  it('une débandade : la fuite bloquée tout un tour', async () => {
    const result = await play('fuite-debandade', {
      wave: wave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 2, enemy: 'brutes-du-portail', count: 1, row: 2 },
      ]),
      squads: [
        squad(data, 'epeistes', { col: 3, row: 2 }),
        squad(data, 'piquiers', { col: 2, row: 2 }),
        squad(data, 'archers', { col: 2, row: 1 }),
        squad(data, 'archers', { col: 2, row: 3 }, undefined, 'archers-2'),
      ],
    });
    expect(result.events.some((e) => e.type === 'dispersed' && e.squad === 'epeistes')).toBe(true);
  });

  it('une fuite ennemie vers le portail', async () => {
    const result = await play('fuite-ennemie-vers-le-portail', {
      wave: wave([
        { turn: 1, enemy: 'fantassins-du-portail', count: 1, row: 2 },
        { turn: 7, enemy: 'fantassins-du-portail', count: 1, row: 2 },
      ]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'piquiers', { col: 2, row: 2 }), squad(data, 'archers', { col: 2, row: 1 })],
    });
    expect(result.events.some((e) => e.type === 'move' && e.why.kind === 'flee' && e.squad.startsWith('fantassins'))).toBe(true);
  });

  it('une défaite : les tombés restés à terre meurent', async () => {
    const result = await play('defaite-tombes-perdus', {
      wave: wave([{ turn: 1, enemy: 'brutes-du-portail', count: 2, row: 2 }]),
      squads: [squad(data, 'archers', { col: 3, row: 2 })],
    });
    expect(result.outcome.kind).toBe('defeat');
    expect(has(result, 'fallenDied', true)).toBe(true);
  });
});
