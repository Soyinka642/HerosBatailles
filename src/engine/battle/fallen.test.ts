import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import { routBroken } from './combat';
import { fallenPhase, resolveFallenAtEnd } from './fallen';
import { type BattleState, findSquad } from './state';
import { squad, stateWith } from './test-helpers';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';
const GAP = { col: 4, row: 2 };

/** Des Épéistes en (4,2) qui viennent de céder avec 13 blessés, plus des Piquiers placés à volonté. */
function broken(piquiers?: { col: number; row: number }): BattleState {
  const squads = [squad(data, 'epeistes', GAP), ...(piquiers ? [squad(data, 'piquiers', piquiers)] : [])];
  const state = createLike(squads);
  const epeistes = findSquad(state, 'epeistes');
  epeistes.morale = 0;
  epeistes.wounded = 13;
  routBroken(data, state);
  return state;
}

function createLike(squads: ReturnType<typeof squad>[]): BattleState {
  // La brèche (4,2) est hors de la zone de déploiement : on déploie puis on déplace.
  const state = stateWith(
    data,
    squads.map((s) => ({ ...s, cell: s.id === 'epeistes' ? { col: 3, row: 4 } : s.cell })),
  );
  findSquad(state, 'epeistes').cell = { ...GAP };
  return state;
}

function enemyAt(state: BattleState, cell: { col: number; row: number }): void {
  const withEnemy = stateWith(data, [], [{ enemy: FANTASSINS, cell }]);
  state.squads.push({ ...withEnemy.squads[0]!, rank: state.squads.length });
}

describe('abandon des blessés', () => {
  it('une de nos escouades en déroute abandonne la moitié de ses blessés, arrondie à l’inférieur', () => {
    const state = broken();
    expect(state.fallen).toEqual([{ squad: 'epeistes', cell: GAP, count: 6, heldTurns: 0 }]);
    expect(findSquad(state, 'epeistes').wounded).toBe(7);
  });

  it('l’ennemi n’abandonne pas de tombés', () => {
    const state = stateWith(data, [], [{ enemy: FANTASSINS, cell: GAP }]);
    const fantassins = findSquad(state, 'fantassins-du-portail#1');
    fantassins.morale = 0;
    fantassins.wounded = 10;
    expect(routBroken(data, state).map((e) => e.type)).toEqual(['rout']);
    expect(state.fallen).toEqual([]);
  });
});

describe('case tenue', () => {
  it('un ennemi sur la case, aucun des nôtres au contact : les tombés meurent au bout de deux tours', () => {
    const state = broken();
    findSquad(state, 'epeistes').status = 'routed';
    enemyAt(state, GAP);
    expect(fallenPhase(data, state)).toMatchObject([{ type: 'fallenHeld', count: 6, turns: 1, by: 'fantassins-du-portail#1' }]);
    expect(fallenPhase(data, state)).toEqual([{ type: 'fallenDied', squad: 'epeistes', cell: GAP, count: 6 }]);
    expect(findSquad(state, 'epeistes').dead).toBe(6);
    expect(state.fallen).toEqual([]);
  });

  it('une case disputée (un des nôtres au contact) n’est pas tenue', () => {
    const state = broken({ col: 3, row: 2 });
    enemyAt(state, GAP);
    expect(fallenPhase(data, state)).toEqual([]);
    expect(state.fallen[0]?.heldTurns).toBe(0);
  });

  it('l’horloge compte des tours consécutifs', () => {
    const state = broken();
    findSquad(state, 'epeistes').status = 'routed';
    enemyAt(state, GAP);
    fallenPhase(data, state);
    findSquad(state, 'fantassins-du-portail#1').cell = { col: 5, row: 2 };
    fallenPhase(data, state);
    expect(state.fallen[0]?.heldTurns).toBe(0);
  });

  it('nos escouades en fuite ne disputent ni ne relèvent', () => {
    const state = broken();
    enemyAt(state, GAP);
    // Les Épéistes, en fuite, sont encore sur la case voisine.
    findSquad(state, 'epeistes').cell = { col: 3, row: 2 };
    expect(fallenPhase(data, state)).toMatchObject([{ type: 'fallenHeld' }]);
  });
});

describe('tombés relevés', () => {
  it('sans ennemi sur la case, une de nos escouades au contact les relève : ils rejoignent leur escouade', () => {
    const state = broken({ col: 3, row: 2 });
    expect(fallenPhase(data, state)).toEqual([{ type: 'fallenRecovered', squad: 'epeistes', cell: GAP, count: 6, by: 'piquiers' }]);
    expect(findSquad(state, 'epeistes').wounded).toBe(13);
    expect(state.fallen).toEqual([]);
  });

  it('personne au contact : ils restent à terre', () => {
    const state = broken({ col: 1, row: 0 });
    expect(fallenPhase(data, state)).toEqual([]);
    expect(state.fallen).toHaveLength(1);
  });
});

describe('fin de bataille', () => {
  it('victoire : relevés', () => {
    const state = broken();
    expect(resolveFallenAtEnd(state, { kind: 'victory', reason: 'noEnemiesLeft' })).toMatchObject([{ type: 'fallenRecovered', atEnd: true }]);
    expect(findSquad(state, 'epeistes')).toMatchObject({ wounded: 13, dead: 0 });
  });

  it('défaite : morts', () => {
    const state = broken();
    expect(resolveFallenAtEnd(state, { kind: 'defeat', reason: 'allSquadsRouted' })).toMatchObject([{ type: 'fallenDied', atEnd: true }]);
    expect(findSquad(state, 'epeistes').dead).toBe(6);
  });

  it('issue indécise : morts si la case est tenue, relevés sinon', () => {
    const held = broken();
    findSquad(held, 'epeistes').status = 'routed';
    enemyAt(held, GAP);
    expect(resolveFallenAtEnd(held, { kind: 'undecided', reason: 'maxTurns' })).toMatchObject([{ type: 'fallenDied' }]);
    const free = broken();
    expect(resolveFallenAtEnd(free, { kind: 'undecided', reason: 'maxTurns' })).toMatchObject([{ type: 'fallenRecovered' }]);
  });
});
