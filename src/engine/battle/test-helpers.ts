// Outils pour les tests du moteur : fabriquer un état de bataille à la main.

import type { Cell, GameData, Id, Wave } from '../data/types';
import type { FortificationSetup } from './fortifications';
import { ALL_FORTIFICATIONS, HOLD, fireArchers, squad } from './catalog';
import { type PlayerSquadSetup, createBattle, enemySquad } from './setup';
import type { BattleState } from './state';
import type { Order } from './types';

export const ADVANCE: Order = { plannedTurns: [], posture: 'avancer' };
export const NO_ARRIVALS: Wave = { id: 'essai', index: 1, kind: 'wave', arrivals: [] };

/**
 * État au début du tour `turn` : nos escouades, puis des ennemis déjà sur le terrain
 * (numérotés par type, rangs à la suite des nôtres). Aucune vérification de zone pour les ennemis.
 * Tous les déblocages sont obtenus.
 */
export function stateWith(
  data: GameData,
  players: PlayerSquadSetup[],
  enemies: { enemy: Id; cell: Cell }[] = [],
  turn = 1,
  fortifications: FortificationSetup[] = [],
): BattleState {
  const unlocks = data.unlocks.map((u) => u.id);
  const state = createBattle(data, { wave: NO_ARRIVALS, squads: players, fortifications, unlocks });
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

export { ALL_FORTIFICATIONS, HOLD, fireArchers, squad };
