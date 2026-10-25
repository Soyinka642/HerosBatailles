import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { Cell } from '../data/types';
import type { BattleEvent } from './events';
import { movementPhase } from './movement';
import { type BattleState, findSquad } from './state';
import { stepToward } from './targeting';
import { ADVANCE, HOLD, squad, stateWith } from './test-helpers';
import type { Order, PlannedStep } from './types';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';
const BRUTES = 'brutes-du-portail';

function cellOf(state: BattleState, id: string): Cell {
  return findSquad(state, id).cell;
}

function plan(...steps: PlannedStep[]): Order {
  return { plannedTurns: [{ steps }], posture: 'tenir' };
}

function eventsOf(events: BattleEvent[], type: BattleEvent['type']): BattleEvent[] {
  return events.filter((e) => e.type === type);
}

describe('Avancer', () => {
  it('va tout droit quand un ennemi est devant sur sa rangée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 11, row: 2 } }]);
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 5, row: 2 });
    // Les fantassins, en Assaut et de vitesse 1, ne font qu'un pas.
    expect(cellOf(state, 'fantassins-du-portail#1')).toEqual({ col: 10, row: 2 });
  });

  it('va tout droit quand il n’y a aucun ennemi', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)]);
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 5, row: 2 });
  });

  it('s’arrête au bord du terrain', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)]);
    findSquad(state, 'epeistes').cell = { col: 11, row: 2 };
    expect(movementPhase(data, state)).toEqual([]);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 11, row: 2 });
  });

  it('dévie vers l’ennemi le plus proche quand aucun n’est devant sur sa rangée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 0 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 9, row: 4 } }]);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    const events = movementPhase(data, state);
    expect(events[0]).toMatchObject({ type: 'move', why: { kind: 'deviate', toward: 'fantassins-du-portail#1' } });
  });

  it('un tireur s’arrête dès qu’une cible est à portée', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 7, row: 2 } }]);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    const events = movementPhase(data, state);
    // Pas 1 : cible à 4 cases, l'archer avance ; pas 2 : à 3 cases, il s'arrête.
    expect(cellOf(state, 'archers')).toEqual({ col: 4, row: 2 });
    expect(events[1]).toEqual({ type: 'halted', step: 2, squad: 'archers', reason: { kind: 'targetInRange', target: 'fantassins-du-portail#1' } });
  });

  it('nos escouades ne peuvent pas prendre Assaut', () => {
    expect(() => stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, { plannedTurns: [], posture: 'assaut' })])).toThrow(
      'la posture « assaut » est réservée aux ennemis',
    );
  });
});

describe('Assaut', () => {
  it('l’ennemi marche tout droit vers le campement', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 1, row: 2 })], [{ enemy: BRUTES, cell: { col: 11, row: 2 } }]);
    movementPhase(data, state);
    expect(cellOf(state, 'brutes-du-portail#1')).toEqual({ col: 9, row: 2 });
  });

  it('ne dévie jamais, même si notre escouade est sur une autre rangée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 1, row: 0 })], [{ enemy: BRUTES, cell: { col: 11, row: 4 } }]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'brutes-du-portail#1')).toEqual({ col: 9, row: 4 });
    expect(events.every((e) => e.type !== 'move' || e.why.kind === 'straight')).toBe(true);
  });

  it('un tireur ennemi s’arrête dès qu’une cible est à portée', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 0 })], [{ enemy: 'tireurs-du-portail', cell: { col: 7, row: 0 } }]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'tireurs-du-portail#1')).toEqual({ col: 6, row: 0 });
    expect(events.at(-1)).toMatchObject({ type: 'halted', reason: { kind: 'targetInRange', target: 'epeistes' } });
  });
});

describe('pas vers une cible', () => {
  it('préfère sa rangée, puis le nord, puis l’est', () => {
    // (3,0) → (9,3) : E (4,0) et SE (3,1) rapprochent autant ; la rangée l'emporte.
    expect(stepToward(data.battlefield, { col: 3, row: 0 }, { col: 9, row: 3 })).toEqual({ col: 4, row: 0 });
    // (3,2) → (3,0) : NE (3,1) et NW (2,1) rapprochent autant ; l'est l'emporte.
    expect(stepToward(data.battlefield, { col: 3, row: 2 }, { col: 3, row: 0 })).toEqual({ col: 3, row: 1 });
  });

  it('écarte les cases hors du terrain', () => {
    // (11,1) → (11,3) : SE (12,2) serait préférée, mais elle est hors du terrain.
    expect(stepToward(data.battlefield, { col: 11, row: 1 }, { col: 11, row: 3 })).toEqual({ col: 11, row: 2 });
  });
});

describe('contact', () => {
  it('une escouade au contact d’un ennemi ne bouge plus', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    const events = movementPhase(data, state);
    expect(events).toEqual([
      { type: 'halted', step: 1, squad: 'epeistes', reason: { kind: 'engaged', by: 'fantassins-du-portail#1' } },
      { type: 'halted', step: 1, squad: 'fantassins-du-portail#1', reason: { kind: 'engaged', by: 'epeistes' } },
    ]);
  });

  it('le contact pris au premier pas arrête le second', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 6, row: 2 } }]);
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 4, row: 2 });
    expect(cellOf(state, 'fantassins-du-portail#1')).toEqual({ col: 5, row: 2 });
  });

  it('on ne passe pas à côté d’un ennemi sur la rangée voisine', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 5, row: 1 } }]);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    movementPhase(data, state);
    // La déviation l'amène en (5,2), qui touche (5,1) : elle est engagée et ne bougera plus.
    expect(cellOf(state, 'epeistes')).toEqual({ col: 5, row: 2 });
    state.turn = 2;
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 5, row: 2 });
  });
});

describe('conflits de mouvement', () => {
  it('même case visée, même vitesse : la première déployée entre (nous avant l’ennemi)', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: BRUTES, cell: { col: 5, row: 2 } }]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 4, row: 2 });
    expect(cellOf(state, 'brutes-du-portail#1')).toEqual({ col: 5, row: 2 });
    expect(eventsOf(events, 'blocked')).toEqual([
      {
        type: 'blocked',
        step: 1,
        squad: 'brutes-du-portail#1',
        target: { col: 4, row: 2 },
        reason: { kind: 'conflict', winner: 'epeistes', why: 'deployedFirst' },
      },
    ]);
  });

  it('même case visée : la plus rapide entre', () => {
    const slow = squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE);
    slow.equipment.armure = 'plates';
    const state = stateWith(data, [slow], [{ enemy: BRUTES, cell: { col: 5, row: 2 } }]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'brutes-du-portail#1')).toEqual({ col: 4, row: 2 });
    expect(eventsOf(events, 'blocked')[0]).toMatchObject({ squad: 'epeistes', reason: { kind: 'conflict', winner: 'brutes-du-portail#1', why: 'faster' } });
  });

  it('un échange de cases ne se fait pas', () => {
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 2, row: 1 }, plan({ col: 3, row: 1 })),
      squad(data, 'piquiers', { col: 3, row: 1 }, plan({ col: 2, row: 1 })),
    ]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 2, row: 1 });
    expect(cellOf(state, 'piquiers')).toEqual({ col: 3, row: 1 });
    expect(eventsOf(events, 'blocked').map((e) => e.type === 'blocked' && e.reason)).toEqual([
      { kind: 'cycle', with: ['piquiers'] },
      { kind: 'cycle', with: ['epeistes'] },
    ]);
  });

  it('une rotation ne se fait pas', () => {
    // (2,1) → (3,1) → (2,2)… en odd-r, (2,1), (3,1) et (2,2) sont voisines deux à deux.
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 2, row: 1 }, plan({ col: 3, row: 1 })),
      squad(data, 'piquiers', { col: 3, row: 1 }, plan({ col: 3, row: 2 })),
      squad(data, 'archers', { col: 3, row: 2 }, plan({ col: 2, row: 1 })),
    ]);
    movementPhase(data, state);
    expect([cellOf(state, 'epeistes'), cellOf(state, 'piquiers'), cellOf(state, 'archers')]).toEqual([
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 3, row: 2 },
    ]);
  });

  it('on entre dans une case qui se libère au même pas', () => {
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE),
      squad(data, 'piquiers', { col: 2, row: 2 }, ADVANCE),
    ]);
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 5, row: 2 });
    expect(cellOf(state, 'piquiers')).toEqual({ col: 4, row: 2 });
  });

  it('une case tenue par une escouade immobile barre le chemin, et la chaîne suit', () => {
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 3, row: 2 }, HOLD),
      squad(data, 'piquiers', { col: 2, row: 2 }, ADVANCE),
      squad(data, 'archers', { col: 1, row: 2 }, ADVANCE),
    ]);
    const events = movementPhase(data, state);
    expect(cellOf(state, 'piquiers')).toEqual({ col: 2, row: 2 });
    expect(cellOf(state, 'archers')).toEqual({ col: 1, row: 2 });
    expect(eventsOf(events, 'blocked').map((e) => e.type === 'blocked' && e.reason)).toEqual([
      { kind: 'occupied', by: 'epeistes' },
      { kind: 'chain', ahead: 'piquiers' },
    ]);
  });

  it('le perdant d’un conflit bloque celui qui le suit', () => {
    // Fantassins et épéistes visent (5,2) ; les épéistes entrent, les fantassins restent,
    // et les fantassins n°2 qui les suivaient sont bloqués en chaîne.
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)],
      [
        { enemy: FANTASSINS, cell: { col: 6, row: 2 } },
        { enemy: FANTASSINS, cell: { col: 7, row: 2 } },
      ],
    );
    findSquad(state, 'epeistes').cell = { col: 4, row: 2 };
    const events = movementPhase(data, state);
    expect(eventsOf(events, 'blocked').map((e) => e.type === 'blocked' && [e.squad, e.reason.kind])).toEqual([
      ['fantassins-du-portail#1', 'conflict'],
      ['fantassins-du-portail#2', 'chain'],
    ]);
  });
});

describe('premier tour planifié', () => {
  it('suit le trajet, avec « wait », puis reprend la posture au tour suivant', () => {
    const order: Order = { plannedTurns: [{ steps: ['wait', { col: 4, row: 1 }] }], posture: 'avancer' };
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 1 }, order)]);
    const events = movementPhase(data, state);
    expect(events).toEqual([
      { type: 'wait', step: 1, squad: 'epeistes' },
      { type: 'move', step: 2, squad: 'epeistes', from: { col: 3, row: 1 }, to: { col: 4, row: 1 }, why: { kind: 'planned' } },
    ]);
    state.turn = 2;
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 6, row: 1 });
  });

  it('un plan plus court que la vitesse s’arrête à la fin du plan', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 1 }, { plannedTurns: [{ steps: [{ col: 4, row: 1 }] }], posture: 'avancer' })]);
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 4, row: 1 });
  });

  it('le plan prime sur l’arrêt du tireur à portée', () => {
    const order: Order = { plannedTurns: [{ steps: [{ col: 4, row: 2 }] }], posture: 'avancer' };
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 }, order)], [{ enemy: FANTASSINS, cell: { col: 6, row: 2 } }]);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    movementPhase(data, state);
    expect(cellOf(state, 'archers')).toEqual({ col: 4, row: 2 });
  });

  it('plan contrarié : l’escouade s’arrête pour la fin du tour', () => {
    const order: Order = { plannedTurns: [{ steps: [{ col: 4, row: 2 }, { col: 5, row: 2 }] }], posture: 'avancer' };
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, order)], [{ enemy: FANTASSINS, cell: { col: 5, row: 2 } }]);
    findSquad(state, 'fantassins-du-portail#1').movement = 'hold';
    const events = movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 4, row: 2 });
    expect(events[1]).toMatchObject({ type: 'halted', step: 2, reason: { kind: 'engaged' } });
  });
});

describe('cœur du campement', () => {
  it('un ennemi qui l’atteint quitte la bataille et l’incursion est comptée', () => {
    const state = stateWith(data, [], [{ enemy: FANTASSINS, cell: { col: 1, row: 0 } }]);
    const events = movementPhase(data, state);
    expect(eventsOf(events, 'breach')).toEqual([{ type: 'breach', squad: 'fantassins-du-portail#1', cell: { col: 0, row: 0 }, total: 1 }]);
    expect(findSquad(state, 'fantassins-du-portail#1').status).toBe('breached');
    expect(state.breaches).toBe(1);
  });
});

describe('fuite en déroute', () => {
  function fleeing(state: BattleState, id: string): void {
    const s = findSquad(state, id);
    s.status = 'fleeing';
    s.morale = 0;
  }

  it('tout droit vers le campement, puis quitte le terrain au cœur du campement', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 2, row: 2 })]);
    fleeing(state, 'epeistes');
    const events = movementPhase(data, state);
    expect(events).toEqual([
      { type: 'move', step: 1, squad: 'epeistes', from: { col: 2, row: 2 }, to: { col: 1, row: 2 }, why: { kind: 'flee' } },
      { type: 'move', step: 2, squad: 'epeistes', from: { col: 1, row: 2 }, to: { col: 0, row: 2 }, why: { kind: 'flee' } },
      { type: 'fled', squad: 'epeistes', cell: { col: 0, row: 2 } },
    ]);
    expect(findSquad(state, 'epeistes').status).toBe('routed');
  });

  it('contourne un allié par la diagonale arrière nord, puis sud', () => {
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 3, row: 2 }),
      squad(data, 'piquiers', { col: 2, row: 2 }),
      squad(data, 'archers', { col: 2, row: 1 }),
    ]);
    fleeing(state, 'epeistes');
    const events = movementPhase(data, state);
    // Droit derrière (2,2) : les Piquiers ; nord-ouest (2,1) : les Archers ; reste le sud-ouest (2,3).
    expect(events[0]).toMatchObject({ type: 'move', to: { col: 2, row: 3 }, why: { kind: 'flee' } });
  });

  it('reste sur place si toutes les cases arrière sont prises', () => {
    const state = stateWith(data, [
      squad(data, 'epeistes', { col: 3, row: 2 }),
      squad(data, 'piquiers', { col: 2, row: 2 }),
      squad(data, 'archers', { col: 2, row: 1 }),
      squad(data, 'archers', { col: 2, row: 3 }, HOLD, 'archers-2'),
    ]);
    fleeing(state, 'epeistes');
    expect(movementPhase(data, state)).toEqual([]);
  });

  it('rompt le contact, et l’ennemi voisin n’est pas retenu par elle', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: BRUTES, cell: { col: 4, row: 2 } }]);
    fleeing(state, 'epeistes');
    movementPhase(data, state);
    expect(cellOf(state, 'epeistes')).toEqual({ col: 1, row: 2 });
    expect(cellOf(state, 'brutes-du-portail#1')).toEqual({ col: 2, row: 2 });
  });

  it('un ennemi en déroute fuit vers le portail et le franchit', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 1, row: 2 })], [{ enemy: BRUTES, cell: { col: 9, row: 2 } }]);
    fleeing(state, 'brutes-du-portail#1');
    const events = movementPhase(data, state);
    expect(events.at(-1)).toEqual({ type: 'fled', squad: 'brutes-du-portail#1', cell: { col: 11, row: 2 } });
  });
});
