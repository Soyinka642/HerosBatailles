// Outils pour les tests du moteur : fabriquer un état de bataille à la main.

import type { Cell, GameData, Id, Wave } from '../data/types';
import type { FortificationSetup } from './fortifications';
import { type PlayerSquadSetup, createBattle, enemySquad, fromTemplate } from './setup';
import type { BattleState } from './state';
import type { Order } from './types';

export const HOLD: Order = { plannedTurns: [], posture: 'tenir' };
export const ADVANCE: Order = { plannedTurns: [], posture: 'avancer' };
/** Tous les sites du terrain, bâtis et intacts. */
export const ALL_FORTIFICATIONS: FortificationSetup[] = [
  { site: 'tour' },
  { site: 'palissade-nord' },
  { site: 'palissade-centre-nord' },
  { site: 'palissade-centre-sud' },
  { site: 'palissade-sud' },
];
export const NO_ARRIVALS: Wave = { id: 'essai', index: 1, kind: 'wave', arrivals: [] };

export function squad(data: GameData, template: Id, cell: Cell, order: Order = HOLD, id?: string): PlayerSquadSetup {
  return fromTemplate(data, template, { cell, order, ...(id === undefined ? {} : { id }) });
}

/**
 * État au début du tour `turn` : nos escouades, puis des ennemis déjà sur le terrain
 * (numérotés par type, rangs à la suite des nôtres). Aucune vérification de zone pour les ennemis.
 */
export function stateWith(
  data: GameData,
  players: PlayerSquadSetup[],
  enemies: { enemy: Id; cell: Cell }[] = [],
  turn = 1,
  fortifications: FortificationSetup[] = [],
): BattleState {
  const state = createBattle(data, { wave: NO_ARRIVALS, squads: players, fortifications });
  const counters: Record<Id, number> = {};
  for (const { enemy, cell } of enemies) {
    const number = (counters[enemy] ?? 0) + 1;
    counters[enemy] = number;
    const name = data.enemies.find((e) => e.id === enemy)?.name ?? enemy;
    const arrival = { id: `${enemy}#${number}`, name: `${name} n°${number}`, enemy, rank: state.squads.length, turn };
    state.squads.push(enemySquad(data, arrival, cell));
  }
  state.turn = turn;
  return state;
}
