import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { BattleEvent } from './events';
import { firePhase } from './fire';
import { meleePhase } from './melee';
import { findSquad, squadAt } from './state';
import { squad, stateWith } from './test-helpers';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';
const TIREURS = 'tireurs-du-portail';
const BRUTES = 'brutes-du-portail';

/** Résumé d'un coup : qui frappe qui, dégâts finaux, moral avant → après. */
function hits(events: BattleEvent[]) {
  return events.flatMap((e) =>
    e.type === 'shot' || e.type === 'strike' ? [[e.attacker, e.target, e.damage.final, e.applied.moraleBefore, e.applied.moraleAfter]] : [],
  );
}

describe('tir', () => {
  it('les archers tirent sur l’ennemi à portée', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 6, row: 2 } }]);
    const events = firePhase(data, state);
    expect(hits(events)).toEqual([['archers', 'fantassins-du-portail#1', 3, 16, 13]]);
    expect(events[0]).toMatchObject({ type: 'shot', distance: 3 });
  });

  it('hors de portée, pas de tir', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 7, row: 2 } }]);
    expect(firePhase(data, state)).toEqual([]);
  });

  it('vise le plus proche, puis le plus au nord, puis le plus à l’ouest', () => {
    const state = stateWith(
      data,
      [squad(data, 'archers', { col: 3, row: 2 })],
      [
        { enemy: FANTASSINS, cell: { col: 6, row: 2 } },
        { enemy: FANTASSINS, cell: { col: 5, row: 3 } },
        { enemy: FANTASSINS, cell: { col: 5, row: 1 } },
      ],
    );
    // (5,1) et (5,3) sont à 2 cases ; (5,1) est plus au nord.
    expect(hits(firePhase(data, state))[0]?.[1]).toBe('fantassins-du-portail#3');
  });

  it('un tireur au contact d’un ennemi ne tire pas', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    expect(firePhase(data, state)).toEqual([]);
  });

  it('on peut tirer sur un ennemi engagé avec un allié', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'archers', { col: 2, row: 2 })],
      [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }],
    );
    expect(hits(firePhase(data, state))).toEqual([['archers', 'fantassins-du-portail#1', 3, 16, 13]]);
  });

  it('les tirs sont simultanés : un tireur mis en déroute a quand même tiré', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 2 })], [{ enemy: TIREURS, cell: { col: 6, row: 2 } }]);
    findSquad(state, 'archers').morale = 2;
    const events = firePhase(data, state);
    // Archers vacillants : (5 − 1) × 0,8 = 3,2 → 3 ; tireurs : 3 − 1 = 2 (le moral de 2 tombe à 0).
    expect(hits(events)).toEqual([
      ['archers', 'tireurs-du-portail#1', 3, 14, 11],
      ['tireurs-du-portail#1', 'archers', 2, 2, 0],
    ]);
    expect(events.at(-1)).toEqual({ type: 'rout', squad: 'archers' });
  });
});

describe('mêlée', () => {
  it('simultanée : les deux camps frappent', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    expect(hits(meleePhase(data, state))).toEqual([
      ['epeistes', 'fantassins-du-portail#1', 4, 16, 12],
      ['fantassins-du-portail#1', 'epeistes', 3, 20, 17],
    ]);
  });

  it('Soutien : la pique maîtrisée juste derrière donne +2', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'piquiers', { col: 2, row: 2 })],
      [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }],
    );
    const strike = meleePhase(data, state)[0];
    expect(strike).toMatchObject({ type: 'strike', attacker: 'epeistes', damage: { final: 6, bonuses: [{ keyword: 'soutien', from: 'piquiers', amount: 2 }] } });
  });

  it('pas de Soutien d’une pique non maîtrisée', () => {
    const piquiers = squad(data, 'piquiers', { col: 2, row: 2 });
    piquiers.masteries = [];
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }), piquiers], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    expect(meleePhase(data, state)[0]).toMatchObject({ damage: { final: 4, bonuses: [] } });
  });

  it('pas de Soutien d’un piquier lui-même au contact', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'piquiers', { col: 2, row: 2 })],
      [
        { enemy: FANTASSINS, cell: { col: 4, row: 2 } },
        { enemy: FANTASSINS, cell: { col: 2, row: 3 } },
      ],
    );
    const strike = meleePhase(data, state).find((e) => e.type === 'strike' && e.attacker === 'epeistes');
    expect(strike).toMatchObject({ damage: { bonuses: [] } });
  });

  it('le Soutien vaut aussi pour un coup en diagonale', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'piquiers', { col: 2, row: 2 })],
      [{ enemy: FANTASSINS, cell: { col: 3, row: 1 } }],
    );
    expect(meleePhase(data, state)[0]).toMatchObject({ attacker: 'epeistes', damage: { final: 6 } });
  });

  it('cible : l’ennemi juste devant d’abord', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 })],
      [
        { enemy: FANTASSINS, cell: { col: 3, row: 1 } },
        { enemy: FANTASSINS, cell: { col: 4, row: 2 } },
      ],
    );
    expect(hits(meleePhase(data, state))[0]?.[1]).toBe('fantassins-du-portail#2');
  });

  it('cible : sinon E, NE, SE, NW, SW, W', () => {
    // Depuis (3,2) : NE = (3,1), SE = (3,3) ; NE passe avant.
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 })],
      [
        { enemy: FANTASSINS, cell: { col: 3, row: 3 } },
        { enemy: FANTASSINS, cell: { col: 3, row: 1 } },
      ],
    );
    expect(hits(meleePhase(data, state))[0]?.[1]).toBe('fantassins-du-portail#2');
  });

  it('prise par deux ennemis, une escouade reçoit deux coups et n’en rend qu’un', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 })],
      [
        { enemy: FANTASSINS, cell: { col: 4, row: 2 } },
        { enemy: FANTASSINS, cell: { col: 3, row: 1 } },
      ],
    );
    expect(hits(meleePhase(data, state))).toEqual([
      ['epeistes', 'fantassins-du-portail#1', 4, 16, 12],
      ['fantassins-du-portail#1', 'epeistes', 3, 20, 17],
      ['fantassins-du-portail#2', 'epeistes', 3, 17, 14],
    ]);
  });

  it('Perce-armure 2 des brutes', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: BRUTES, cell: { col: 4, row: 2 } }]);
    const brutes = meleePhase(data, state).find((e) => e.type === 'strike' && e.attacker === 'brutes-du-portail#1');
    expect(brutes).toMatchObject({ damage: { effectiveDefense: 0, final: 6, ignoreDefense: [{ keyword: 'perce-armure', amount: 2 }] } });
  });

  it('moral et blessés de l’attaquant réduisent ses dégâts', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    const epeistes = findSquad(state, 'epeistes');
    epeistes.morale = 10;
    epeistes.wounded = 10;
    // (6 − 2) × 0,9 × 0,5 = 1,8 → 2
    expect(meleePhase(data, state)[0]).toMatchObject({ damage: { tier: 'shaken', woundedFactor: 0.5, final: 2 } });
  });
});

describe('déroute', () => {
  it('à zéro de moral, l’escouade quitte le terrain', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }]);
    findSquad(state, 'fantassins-du-portail#1').morale = 3;
    const events = meleePhase(data, state);
    expect(events.at(-1)).toEqual({ type: 'rout', squad: 'fantassins-du-portail#1' });
    expect(findSquad(state, 'fantassins-du-portail#1').status).toBe('routed');
    expect(squadAt(state, { col: 4, row: 2 })).toBeUndefined();
  });

  it('une escouade en déroute au tir ne combat pas en mêlée', () => {
    const state = stateWith(
      data,
      [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'archers', { col: 2, row: 2 })],
      [{ enemy: FANTASSINS, cell: { col: 4, row: 2 } }],
    );
    findSquad(state, 'fantassins-du-portail#1').morale = 3;
    firePhase(data, state);
    expect(meleePhase(data, state)).toEqual([]);
  });
});
