import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { GameData, Wave } from '../data/types';
import { playTurn, portalRows, runBattle } from './battle';
import type { BattleEvent } from './events';
import { createBattle } from './setup';
import { findSquad } from './state';
import { ADVANCE, HOLD, squad, stateWith } from './test-helpers';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';

function wave(arrivals: Wave['arrivals'], kind: Wave['kind'] = 'wave'): Wave {
  return { id: 'essai', index: 1, kind, arrivals };
}

function ofType<T extends BattleEvent['type']>(events: BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

function withConfig(change: (config: GameData['config']) => void): GameData {
  const copy = structuredClone(data);
  change(copy.config);
  return copy;
}

describe('arrivées par le portail', () => {
  it('rangées : le centre, puis en alternant nord et sud', () => {
    expect(portalRows(data.battlefield.portal)).toEqual([2, 1, 3, 0, 4]);
    expect(portalRows({ fromCol: 11, toCol: 11, fromRow: 0, toRow: 3 })).toEqual([1, 0, 2, 3]);
  });

  it('les ennemis sortent au début du tour et agissent aussitôt', () => {
    const state = createBattle(data, { wave: data.waves[0]!, squads: [squad(data, 'epeistes', { col: 1, row: 2 })] });
    const { state: after, events } = playTurn(data, state);
    expect(ofType(events, 'arrival')).toEqual([
      { type: 'arrival', squad: 'fantassins-du-portail#1', cell: { col: 11, row: 2 } },
      { type: 'arrival', squad: 'fantassins-du-portail#2', cell: { col: 11, row: 1 } },
    ]);
    expect(findSquad(after, 'fantassins-du-portail#1').cell).toEqual({ col: 10, row: 2 });
  });

  it('la rangée imposée passe d’abord', () => {
    const state = createBattle(data, { wave: wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 4 }]), squads: [squad(data, 'epeistes', { col: 1, row: 2 })] });
    expect(ofType(playTurn(data, state).events, 'arrival')[0]?.cell).toEqual({ col: 11, row: 4 });
  });

  it('portail plein : l’arrivée attend le tour suivant', () => {
    const state = createBattle(data, { wave: wave([{ turn: 1, enemy: FANTASSINS, count: 6 }]), squads: [squad(data, 'epeistes', { col: 1, row: 2 })] });
    const turn1 = playTurn(data, state);
    expect(ofType(turn1.events, 'arrival')).toHaveLength(5);
    expect(ofType(turn1.events, 'arrivalDelayed')).toEqual([{ type: 'arrivalDelayed', squad: 'fantassins-du-portail#6' }]);
    const turn2 = playTurn(data, turn1.state);
    expect(ofType(turn2.events, 'arrival').map((e) => e.squad)).toEqual(['fantassins-du-portail#6']);
  });

  it('une case du portail tenue par une de nos escouades est occupée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 1, row: 2 }, HOLD)], [], 0);
    findSquad(state, 'epeistes').cell = { col: 11, row: 2 };
    state.pending = [{ id: 'fantassins-du-portail#1', name: 'Fantassins du portail n°1', enemy: FANTASSINS, rank: 1, turn: 1 }];
    expect(ofType(playTurn(data, state).events, 'arrival')[0]?.cell).toEqual({ col: 11, row: 1 });
  });
});

describe('fin de bataille', () => {
  it('victoire quand il ne reste aucun ennemi, ni sur le terrain ni à venir', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }], 0);
    findSquad(state, 'fantassins-du-portail#1').morale = 1;
    const { state: after, events } = playTurn(data, state);
    expect(after.outcome).toEqual({ kind: 'victory', reason: 'noEnemiesLeft' });
    expect(events.at(-1)).toEqual({ type: 'battleEnd', turn: 1, outcome: after.outcome, breaches: 0 });
  });

  it('pas de victoire tant que des ennemis doivent encore arriver', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }], 0);
    findSquad(state, 'fantassins-du-portail#1').morale = 1;
    state.pending = [{ id: 'fantassins-du-portail#2', name: 'Fantassins du portail n°2', enemy: FANTASSINS, rank: 2, turn: 3 }];
    expect(playTurn(data, state).state.outcome).toBeUndefined();
  });

  it('défaite quand toutes nos escouades sont en déroute', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }], 0);
    findSquad(state, 'epeistes').morale = 1;
    expect(playTurn(data, state).state.outcome).toEqual({ kind: 'defeat', reason: 'allSquadsRouted' });
  });

  it('les deux camps en déroute à la même phase : défaite', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }], 0);
    findSquad(state, 'epeistes').morale = 1;
    findSquad(state, 'fantassins-du-portail#1').morale = 1;
    expect(playTurn(data, state).state.outcome).toEqual({ kind: 'defeat', reason: 'allSquadsRouted' });
  });

  it('la bataille s’arrête à la phase qui la décide', () => {
    const state = stateWith(
      data,
      [squad(data, 'archers', { col: 3, row: 2 }), squad(data, 'epeistes', { col: 2, row: 4 })],
      [{ enemy: FANTASSINS, cell: { col: 6, row: 2 } }],
      0,
    );
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    findSquad(state, 'fantassins-du-portail#1').morale = 2;
    const { events } = playTurn(data, state);
    expect(events.map((e) => e.type)).toEqual(['turnStart', 'shot', 'rout', 'turnEnd', 'battleEnd']);
  });

  it('une incursion est comptée et la bataille continue', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 4 })], [
      { enemy: FANTASSINS, cell: { col: 1, row: 0 } },
      { enemy: FANTASSINS, cell: { col: 9, row: 0 } },
    ], 0);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    findSquad(state, 'fantassins-du-portail#1').cell = { col: 0, row: 0 };
    const { state: after, events } = playTurn(data, state);
    expect(ofType(events, 'breach')).toHaveLength(1);
    expect(after.breaches).toBe(1);
    expect(after.outcome).toBeUndefined();
  });

  it('bataille finale : victoire quand le rituel est tenu, même s’il reste des ennemis', () => {
    const short = withConfig((c) => {
      c.finalBattle.ritualTurns = 2;
    });
    const result = runBattle(short, { wave: wave([{ turn: 1, enemy: FANTASSINS, count: 1 }], 'final'), squads: [squad(short, 'epeistes', { col: 1, row: 0 })] });
    expect(result.outcome).toEqual({ kind: 'victory', reason: 'ritualHeld' });
    expect(result.final.turn).toBe(2);
  });

  it('bataille finale : victoire anticipée si tous les ennemis sont partis', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }], 0);
    state.kind = 'final';
    findSquad(state, 'fantassins-du-portail#1').morale = 1;
    expect(playTurn(data, state).state.outcome).toEqual({ kind: 'victory', reason: 'noEnemiesLeft' });
  });

  it('maxTurns atteint : issue indécise', () => {
    const short = withConfig((c) => {
      c.maxTurns = 2;
    });
    const state = stateWith(short, [squad(short, 'epeistes', { col: 1, row: 0 })], [{ enemy: FANTASSINS, cell: { col: 11, row: 4 } }], 0);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    const turn1 = playTurn(short, state);
    expect(playTurn(short, turn1.state).state.outcome).toEqual({ kind: 'undecided', reason: 'maxTurns' });
  });
});

describe('playTurn', () => {
  it('ne modifie pas l’état reçu', () => {
    const state = createBattle(data, { wave: data.waves[0]!, squads: [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)] });
    const before = structuredClone(state);
    playTurn(data, state);
    expect(state).toEqual(before);
  });

  it('refuse de jouer une bataille terminée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [], 0);
    const { state: ended } = playTurn(data, state);
    expect(() => playTurn(data, ended)).toThrow('terminée');
  });
});
