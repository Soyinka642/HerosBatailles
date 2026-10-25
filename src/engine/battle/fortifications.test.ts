import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { BattleEvent } from './events';
import { firePhase } from './fire';
import { defenseBonuses, effectiveRange } from './fortifications';
import { meleePhase } from './melee';
import { movementPhase } from './movement';
import { createBattle } from './setup';
import { type BattleState, findSquad } from './state';
import { ADVANCE, ALL_FORTIFICATIONS, HOLD, NO_ARRIVALS, squad, stateWith } from './test-helpers';
import type { Order } from './types';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';
const TIREURS = 'tireurs-du-portail';
const BRUTES = 'brutes-du-portail';

function structureOf(state: BattleState, site: string): number | undefined {
  return state.fortifications.find((f) => f.site === site)?.structure;
}

function ofType<T extends BattleEvent['type']>(events: BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

describe('fortifications au déploiement', () => {
  it('seuls les sites demandés sont bâtis, intacts par défaut', () => {
    const state = createBattle(data, { wave: NO_ARRIVALS, squads: [], fortifications: [{ site: 'palissade-sud', structure: 10 }, { site: 'tour' }] });
    expect(state.fortifications.map((f) => [f.site, f.structure, f.maxStructure])).toEqual([
      ['tour', 30, 30],
      ['palissade-sud', 10, 36],
    ]);
  });

  it('refuse un site inconnu, en double ou une structure hors limites', () => {
    expect(() =>
      createBattle(data, { wave: NO_ARRIVALS, squads: [], fortifications: [{ site: 'donjon' }, { site: 'tour', structure: 31 }, { site: 'tour' }] }),
    ).toThrow(/site de fortification inconnu « donjon »[\s\S]*site de fortification en double « tour »[\s\S]*tour : structure 31 hors de 0..30/);
  });

  it('on ne se déploie pas sur une palissade debout, et la tour est réservée à nos tireurs', () => {
    expect(() => stateWith(data, [squad(data, 'epeistes', { col: 2, row: 2 })], [], 1, ALL_FORTIFICATIONS)).toThrow(
      'epeistes : (2,2) est une tour, réservée aux tireurs',
    );
    expect(() => stateWith(data, [squad(data, 'archers', { col: 2, row: 2 })], [], 1, ALL_FORTIFICATIONS)).not.toThrow();
    const plan: Order = { plannedTurns: [{ steps: [{ col: 4, row: 1 }] }], posture: 'tenir' };
    expect(() => stateWith(data, [squad(data, 'epeistes', { col: 3, row: 1 }, plan)], [], 1, ALL_FORTIFICATIONS)).toThrow(
      'epeistes : pas 1 : (4,1) est une palissade, infranchissable',
    );
  });

  it('une palissade détruite ne gêne plus le déploiement', () => {
    const plan: Order = { plannedTurns: [{ steps: [{ col: 4, row: 1 }] }], posture: 'tenir' };
    expect(() =>
      stateWith(data, [squad(data, 'epeistes', { col: 3, row: 1 }, plan)], [], 1, [{ site: 'palissade-centre-nord', structure: 0 }]),
    ).not.toThrow();
  });
});

describe('palissade', () => {
  it('barre le passage de l’ennemi, qui la frappe à la mêlée', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 1, row: 4 })], [{ enemy: FANTASSINS, cell: { col: 5, row: 1 } }], 1, ALL_FORTIFICATIONS);
    const moves = movementPhase(data, state);
    expect(moves).toEqual([
      {
        type: 'blocked',
        step: 1,
        squad: 'fantassins-du-portail#1',
        target: { col: 4, row: 1 },
        reason: { kind: 'fortification', site: 'palissade-centre-nord' },
      },
    ]);
    const melee = meleePhase(data, state);
    expect(melee).toMatchObject([{ type: 'fortificationHit', site: 'palissade-centre-nord', before: 36, after: 31, damage: { final: 5 } }]);
    expect(structureOf(state, 'palissade-centre-nord')).toBe(31);
  });

  it('détruite, la case redevient libre', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 1, row: 4 })], [{ enemy: BRUTES, cell: { col: 5, row: 1 } }], 1, [
      { site: 'palissade-centre-nord', structure: 4 },
    ]);
    movementPhase(data, state);
    const melee = meleePhase(data, state);
    expect(ofType(melee, 'fortificationDestroyed')).toEqual([{ type: 'fortificationDestroyed', site: 'palissade-centre-nord' }]);
    state.turn = 2;
    movementPhase(data, state);
    expect(findSquad(state, 'brutes-du-portail#1').cell).toEqual({ col: 3, row: 1 });
  });

  it('bloque aussi nos escouades, qui ne la frappent pas', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 1 }, ADVANCE)], [], 1, ALL_FORTIFICATIONS);
    expect(ofType(movementPhase(data, state), 'blocked')[0]?.reason).toEqual({ kind: 'fortification', site: 'palissade-centre-nord' });
    expect(meleePhase(data, state)).toEqual([]);
  });

  it('un ennemi bloqué par la palissade mais au contact d’une escouade frappe l’escouade', () => {
    const state = stateWith(data, [squad(data, 'epeistes', { col: 3, row: 2 }, ADVANCE)], [{ enemy: FANTASSINS, cell: { col: 5, row: 1 } }], 1, ALL_FORTIFICATIONS);
    findSquad(state, 'epeistes').cell = { col: 4, row: 2 };
    movementPhase(data, state);
    // Au pas 1, les fantassins butent sur la palissade pendant que les épéistes entrent en (5,2), à leur contact.
    expect(findSquad(state, 'epeistes').cell).toEqual({ col: 5, row: 2 });
    const melee = meleePhase(data, state);
    expect(ofType(melee, 'fortificationHit')).toEqual([]);
    expect(ofType(melee, 'strike').map((e) => [e.attacker, e.target])).toContainEqual(['fantassins-du-portail#1', 'epeistes']);
  });

  it('protège des tirs l’escouade juste derrière, côté campement', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 3, row: 1 })], [{ enemy: TIREURS, cell: { col: 6, row: 1 } }], 1, ALL_FORTIFICATIONS);
    const archers = findSquad(state, 'archers');
    expect(defenseBonuses(data, state, archers, true)).toEqual([{ site: 'palissade-centre-nord', amount: 2 }]);
    expect(defenseBonuses(data, state, archers, false)).toEqual([]);
    const shot = ofType(firePhase(data, state), 'shot').find((e) => e.attacker === 'tireurs-du-portail#1');
    // 3 − (1 + 2) = 0 → minimum 1
    expect(shot?.damage).toMatchObject({ effectiveDefense: 3, final: 1 });
  });
});

describe('tour', () => {
  it('donne à nos tireurs +1 en portée et +2 en défense', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 2, row: 2 })], [{ enemy: FANTASSINS, cell: { col: 6, row: 2 } }], 1, ALL_FORTIFICATIONS);
    const archers = findSquad(state, 'archers');
    expect(effectiveRange(data, state, archers)).toBe(4);
    expect(ofType(firePhase(data, state), 'shot')).toHaveLength(1);
    findSquad(state, 'fantassins-du-portail#1').cell = { col: 3, row: 2 };
    const strike = ofType(meleePhase(data, state), 'strike').find((e) => e.attacker === 'fantassins-du-portail#1');
    // 5 − (1 + 2) = 2
    expect(strike?.damage).toMatchObject({ effectiveDefense: 3, final: 2 });
  });

  it('un non-tireur dans la tour n’y gagne rien', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 1, row: 0 })], [{ enemy: FANTASSINS, cell: { col: 2, row: 2 } }], 1, ALL_FORTIFICATIONS);
    const fantassins = findSquad(state, 'fantassins-du-portail#1');
    expect(defenseBonuses(data, state, fantassins, true)).toEqual([]);
  });

  it('un ennemi qui n’est pas tireur traverse la tour vide', () => {
    const state = stateWith(data, [], [{ enemy: BRUTES, cell: { col: 3, row: 2 } }], 1, ALL_FORTIFICATIONS);
    const moves = movementPhase(data, state);
    expect(ofType(moves, 'move').map((e) => e.to)).toEqual([
      { col: 2, row: 2 },
      { col: 1, row: 2 },
    ]);
  });

  it('un tireur ennemi qui entre dans la tour y reste', () => {
    const state = stateWith(data, [], [{ enemy: TIREURS, cell: { col: 3, row: 2 } }], 1, ALL_FORTIFICATIONS);
    movementPhase(data, state);
    expect(findSquad(state, 'tireurs-du-portail#1').cell).toEqual({ col: 2, row: 2 });
    state.turn = 2;
    expect(movementPhase(data, state)).toEqual([]);
    expect(effectiveRange(data, state, findSquad(state, 'tireurs-du-portail#1'))).toBe(4);
  });

  it('prise en mêlée : l’occupant en déroute, l’ennemi entre', () => {
    const state = stateWith(data, [squad(data, 'archers', { col: 2, row: 2 }, HOLD)], [{ enemy: BRUTES, cell: { col: 3, row: 2 } }], 1, ALL_FORTIFICATIONS);
    findSquad(state, 'archers').morale = 1;
    meleePhase(data, state);
    expect(findSquad(state, 'archers').status).toBe('fleeing');
    state.turn = 2;
    movementPhase(data, state);
    // Les Archers fuient (1,2) puis (0,2) et quittent le terrain ; la Brute entre dans la tour puis les suit.
    expect(findSquad(state, 'archers').status).toBe('routed');
    expect(findSquad(state, 'brutes-du-portail#1').cell).toEqual({ col: 1, row: 2 });
  });
});
