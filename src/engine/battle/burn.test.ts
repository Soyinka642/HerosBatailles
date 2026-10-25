import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { Wave } from '../data/types';
import { playTurn, runBattle } from './battle';
import { burnPhase, decideFire, ignite } from './burn';
import type { BattleEvent } from './events';
import { firePhase } from './fire';
import { meleePhase } from './melee';
import { createBattle } from './setup';
import { type BattleState, findSquad } from './state';
import { ALL_FORTIFICATIONS, NO_ARRIVALS, fireArchers, squad, stateWith } from './test-helpers';

const data = loadGameData();
const PATE = 'pate-incendiaire';

function ofType<T extends BattleEvent['type']>(events: BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

function withBrute(paste = 4): BattleState {
  return stateWith(data, [fireArchers(data, { col: 1, row: 2 }, paste)], [{ enemy: 'brutes-du-portail', cell: { col: 4, row: 2 } }]);
}

describe('flèches enflammées au déploiement', () => {
  it('donnent Feu, sans exiger la maîtrise de l’arc', () => {
    const archers = fireArchers(data, { col: 1, row: 2 }, 2);
    archers.masteries = [];
    const state = stateWith(data, [archers]);
    expect(findSquad(state, 'archers').keywords.map((k) => k.id)).toEqual(['feu']);
    expect(findSquad(state, 'archers').carried).toEqual({ [PATE]: 2 });
  });

  it('exigent le forgeron, un sous-emplacement existant et un consommable connu', () => {
    const archers = fireArchers(data, { col: 1, row: 2 }, 2);
    archers.carried = { 'poudre': 1 };
    expect(() => createBattle(data, { wave: NO_ARRIVALS, squads: [archers] })).toThrow(
      /archers : amélioration arme.fleches : verrouillé \(forgeron\)[\s\S]*archers : consommable inconnu « poudre »/,
    );
    const epeistes = squad(data, 'epeistes', { col: 3, row: 2 });
    epeistes.upgrades = { arme: { fleches: 'fleches-enflammees' } };
    expect(() => createBattle(data, { wave: NO_ARRIVALS, squads: [epeistes], unlocks: ['forgeron'] })).toThrow(
      "epeistes : amélioration arme.fleches : aucun sous-emplacement « fleches » sur l'objet porté",
    );
  });
});

describe('règle par défaut', () => {
  it('enflamme une cible assez cuirassée qui ne brûle pas', () => {
    const state = withBrute();
    expect(decideFire(data, state, findSquad(state, 'archers'), findSquad(state, 'brutes-du-portail#1'))).toEqual({
      keyword: 'feu',
      consumable: PATE,
      used: true,
    });
  });

  it('pas de Feu sans pâte', () => {
    const state = withBrute(0);
    expect(decideFire(data, state, findSquad(state, 'archers'), findSquad(state, 'brutes-du-portail#1'))).toMatchObject({ used: false, why: 'noConsumable' });
  });

  it('pas de Feu sur une cible peu cuirassée', () => {
    const state = stateWith(data, [fireArchers(data, { col: 1, row: 2 }, 4)], [{ enemy: 'fantassins-du-portail', cell: { col: 4, row: 2 } }]);
    expect(decideFire(data, state, findSquad(state, 'archers'), findSquad(state, 'fantassins-du-portail#1'))).toMatchObject({
      used: false,
      why: 'lowDefense',
      defense: 2,
    });
  });

  it('pas de Feu sur une cible qui brûle déjà', () => {
    const state = withBrute();
    findSquad(state, 'brutes-du-portail#1').burning = { amount: 2, turnsLeft: 1 };
    expect(decideFire(data, state, findSquad(state, 'archers'), findSquad(state, 'brutes-du-portail#1'))).toMatchObject({ why: 'alreadyBurning' });
  });

  it('la défense réelle compte : des tireurs (1) dans la tour (+2) atteignent le seuil', () => {
    const state = stateWith(data, [fireArchers(data, { col: 1, row: 0 }, 4)], [{ enemy: 'tireurs-du-portail', cell: { col: 2, row: 2 } }], 1, ALL_FORTIFICATIONS);
    expect(decideFire(data, state, findSquad(state, 'archers'), findSquad(state, 'tireurs-du-portail#1'))).toMatchObject({ used: true });
  });
});

describe('volée enflammée', () => {
  it('dégâts, puis perte de moral pure, puis brûlure ; une unité de pâte consommée', () => {
    const state = withBrute();
    const events = firePhase(data, state);
    // (5 − 3) = 2 dégâts : 24 → 22 ; puis Feu : −2 de moral, 22 → 20, sans blessé.
    expect(events.map((e) => e.type)).toEqual(['shot', 'ignite']);
    expect(ofType(events, 'ignite')[0]).toEqual({
      type: 'ignite',
      attacker: 'archers',
      target: 'brutes-du-portail#1',
      keyword: 'feu',
      moraleBefore: 22,
      moraleAfter: 20,
      burn: { amount: 2, turnsLeft: 2 },
      consumed: { consumable: PATE, left: 3 },
    });
    const brutes = findSquad(state, 'brutes-du-portail#1');
    expect([brutes.morale, brutes.wounded, brutes.burning]).toEqual([20, 0, { amount: 2, turnsLeft: 2 }]);
  });

  it('la brûlure tombe deux tours, puis s’éteint', () => {
    const state = withBrute();
    findSquad(state, 'brutes-du-portail#1').burning = { amount: 2, turnsLeft: 2 };
    expect(burnPhase(data, state)).toMatchObject([{ type: 'burn', amount: 2, applied: { moraleBefore: 24, moraleAfter: 22 }, turnsLeft: 1 }]);
    expect(burnPhase(data, state)).toMatchObject([{ type: 'burn', turnsLeft: 0 }]);
    expect(findSquad(state, 'brutes-du-portail#1').burning).toBeUndefined();
    expect(burnPhase(data, state)).toEqual([]);
  });

  it('rafraîchie, sans cumul', () => {
    const state = withBrute();
    const brutes = findSquad(state, 'brutes-du-portail#1');
    brutes.burning = { amount: 2, turnsLeft: 1 };
    ignite(data, state, findSquad(state, 'archers'), brutes, { keyword: 'feu', consumable: PATE, used: true });
    expect(brutes.burning).toEqual({ amount: 2, turnsLeft: 2 });
  });

  it('une cible abritée dans la tour la fait brûler aussi', () => {
    const state = stateWith(data, [fireArchers(data, { col: 1, row: 0 }, 4)], [{ enemy: 'tireurs-du-portail', cell: { col: 2, row: 2 } }], 1, ALL_FORTIFICATIONS);
    const events = firePhase(data, state);
    expect(ofType(events, 'ignite')[0]).toMatchObject({ site: 'tour' });
    expect(burnPhase(data, state)).toMatchObject([
      { type: 'burn', squad: 'tireurs-du-portail#1' },
      { type: 'fortificationBurn', site: 'tour', before: 30, after: 28, turnsLeft: 1 },
    ]);
  });

  it('les flèches ne brûlent pas en mêlée', () => {
    const state = stateWith(data, [fireArchers(data, { col: 3, row: 2 }, 4)], [{ enemy: 'brutes-du-portail', cell: { col: 4, row: 2 } }]);
    expect(meleePhase(data, state).map((e) => e.type)).toEqual(['strike', 'strike']);
  });

  it('la brûlure tombe au début du tour, avant le mouvement', () => {
    const state = withBrute();
    state.turn = 0;
    findSquad(state, 'brutes-du-portail#1').burning = { amount: 2, turnsLeft: 2 };
    const types = playTurn(data, state).events.map((e) => e.type);
    expect(types.slice(0, 3)).toEqual(['turnStart', 'burn', 'move']);
  });
});

describe('pâte en sortie', () => {
  it('la bataille rend ce qui reste à chaque escouade', () => {
    const wave: Wave = { id: 'w', index: 1, kind: 'wave', arrivals: [{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }] };
    const result = runBattle(data, {
      wave,
      squads: [fireArchers(data, { col: 1, row: 2 }, 3), squad(data, 'epeistes', { col: 3, row: 2 })],
      unlocks: ['forgeron'],
    });
    const left = result.carried.find((c) => c.squad === 'archers')?.carried[PATE];
    const volleys = result.events.filter((e) => e.type === 'ignite').length;
    expect(volleys).toBeGreaterThan(0);
    expect(left).toBe(3 - volleys);
    expect(result.carried.find((c) => c.squad === 'epeistes')).toEqual({ squad: 'epeistes', carried: {} });
  });
});
