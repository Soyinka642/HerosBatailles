import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import type { Wave } from '../data/types';
import { BattleSetupError, computeSquadStats, createBattle, fromTemplate, pendingArrivals } from './setup';
import type { Order } from './types';

const data = loadGameData();
const hold: Order = { plannedTurns: [], posture: 'tenir' };
const advance: Order = { plannedTurns: [], posture: 'avancer' };
const emptyWave: Wave = { id: 'test', index: 1, kind: 'wave', arrivals: [] };

describe('stats réelles', () => {
  it('épéistes : base + épée + mailles', () => {
    const { stats, keywords, unmastered } = computeSquadStats(data, { arme: 'epee', armure: 'mailles' }, ['maitrise-epee']);
    expect(stats).toEqual({ meleeAttack: 6, rangedAttack: 0, range: 0, defense: 2, speed: 2, soldiers: 20, maxMorale: 20 });
    expect(keywords).toEqual([]);
    expect(unmastered).toEqual([]);
  });

  it('archers : tir et portée de l’arc, mêlée de base', () => {
    const { stats } = computeSquadStats(data, { arme: 'arc-court', armure: 'cuir' }, ['maitrise-arc']);
    expect(stats).toMatchObject({ meleeAttack: 2, rangedAttack: 5, range: 3, defense: 1 });
  });

  it('piquiers : la pique maîtrisée donne Soutien', () => {
    const { stats, keywords } = computeSquadStats(data, { arme: 'pique', armure: 'cuir' }, ['maitrise-pique']);
    expect(stats.meleeAttack).toBe(5);
    expect(keywords.map((k) => k.id)).toEqual(['soutien']);
  });

  it('pique non maîtrisée : malus de mêlée et pas de Soutien', () => {
    const { stats, keywords, unmastered } = computeSquadStats(data, { arme: 'pique', armure: 'cuir' }, ['maitrise-epee']);
    expect(stats.meleeAttack).toBe(3);
    expect(keywords).toEqual([]);
    expect(unmastered).toEqual([{ item: 'pique', penalty: 2, lostKeywords: ['soutien'] }]);
  });

  it('arc non maîtrisé : le malus porte sur le tir, pas sur la mêlée', () => {
    const { stats } = computeSquadStats(data, { arme: 'arc-court' }, []);
    expect(stats).toMatchObject({ meleeAttack: 2, rangedAttack: 3, range: 3 });
  });

  it('le malus ne fait pas descendre l’attaque sous 0', () => {
    const tweaked = structuredClone(data);
    tweaked.config.mastery.unmasteredAttackPenalty = 50;
    expect(computeSquadStats(tweaked, { arme: 'epee' }, []).stats.meleeAttack).toBe(0);
  });

  it('les plates ralentissent', () => {
    expect(computeSquadStats(data, { arme: 'epee', armure: 'plates' }, ['maitrise-epee']).stats).toMatchObject({ defense: 4, speed: 1 });
  });

  it('sans équipement : mains nues', () => {
    expect(computeSquadStats(data, {}, []).stats).toMatchObject({ meleeAttack: 2, defense: 0, speed: 2 });
  });

  it('moral maximum = base + modificateurs', () => {
    expect(computeSquadStats(data, {}, [], []).stats.maxMorale).toBe(20);
    expect(computeSquadStats(data, {}, [], [{ source: 'étendard', amount: 3 }]).stats.maxMorale).toBe(23);
  });
});

describe('ennemis annoncés', () => {
  it('par tour puis dans l’ordre de la liste, numérotés par type', () => {
    const wave: Wave = {
      id: 'w',
      index: 1,
      kind: 'wave',
      arrivals: [
        { turn: 3, enemy: 'tireurs-du-portail', count: 1 },
        { turn: 1, enemy: 'fantassins-du-portail', count: 2 },
        { turn: 3, enemy: 'fantassins-du-portail', count: 1, row: 4 },
      ],
    };
    const pending = pendingArrivals(data, wave, 2);
    expect(pending.map((p) => [p.id, p.name, p.rank, p.turn, p.row])).toEqual([
      ['fantassins-du-portail#1', 'Fantassins du portail n°1', 2, 1, undefined],
      ['fantassins-du-portail#2', 'Fantassins du portail n°2', 3, 1, undefined],
      ['tireurs-du-portail#1', 'Tireurs du portail n°1', 4, 3, undefined],
      ['fantassins-du-portail#3', 'Fantassins du portail n°3', 5, 3, 4],
    ]);
  });
});

describe('état initial', () => {
  it('nos escouades dans l’ordre de déploiement, moral plein, aucun blessé', () => {
    const state = createBattle(data, {
      wave: data.waves[0]!,
      squads: [
        fromTemplate(data, 'archers', { cell: { col: 1, row: 2 }, order: hold }),
        fromTemplate(data, 'epeistes', { cell: { col: 3, row: 2 }, order: advance }),
      ],
    });
    expect(state.turn).toBe(0);
    expect(state.squads.map((s) => [s.id, s.rank, s.side, s.morale, s.wounded, s.movement])).toEqual([
      ['archers', 0, 'player', 20, 0, 'hold'],
      ['epeistes', 1, 'player', 20, 0, 'advance'],
    ]);
    expect(state.pending.map((p) => p.rank)).toEqual([2, 3]);
  });

  it('rassemble tous les problèmes de déploiement', () => {
    const plan: Order = { plannedTurns: [{ steps: [{ col: 3, row: 2 }, { col: 5, row: 2 }, 'wait'] }], posture: 'tenir' };
    const build = () =>
      createBattle(data, {
        wave: emptyWave,
        squads: [
          fromTemplate(data, 'epeistes', { cell: { col: 3, row: 2 }, order: hold }),
          fromTemplate(data, 'archers', { cell: { col: 2, row: 2 }, order: plan }),
          fromTemplate(data, 'piquiers', { cell: { col: 5, row: 0 }, order: { plannedTurns: [], posture: 'charger' } }),
          fromTemplate(data, 'epeistes', { cell: { col: 3, row: 2 }, order: hold }),
          fromTemplate(data, 'piquiers', { id: 'p2', cell: { col: 1, row: 0 }, order: hold }),
        ],
      });
    expect(build).toThrow(BattleSetupError);
    try {
      build();
    } catch (error) {
      expect((error as BattleSetupError).issues).toEqual([
        '5 escouades pour 4 au plus',
        'archers : 3 pas pour une vitesse de 2',
        'archers : pas 1 : (3,2) est la case de epeistes, qui ne bouge pas',
        'archers : pas 2 : (5,2) n\'est pas voisine de la case précédente',
        'piquiers : (5,0) est hors de la zone de déploiement',
        'piquiers : posture inconnue « charger »',
        'id en double « epeistes »',
        'epeistes : même case que epeistes',
      ]);
    }
  });

  it('refuse plus de tours planifiés que d’emplacements débloqués', () => {
    const order: Order = { plannedTurns: [{ steps: [] }, { steps: [] }], posture: 'tenir' };
    expect(() =>
      createBattle(data, { wave: emptyWave, squads: [fromTemplate(data, 'epeistes', { cell: { col: 3, row: 2 }, order })] }),
    ).toThrow('2 tours planifiés pour 1 autorisé(s)');
  });

  it('refuse un objet dans le mauvais emplacement', () => {
    const squad = fromTemplate(data, 'epeistes', { cell: { col: 3, row: 2 }, order: hold });
    squad.equipment = { arme: 'mailles' };
    expect(() => createBattle(data, { wave: emptyWave, squads: [squad] })).toThrow('« mailles » ne va pas dans l\'emplacement arme');
  });
});
