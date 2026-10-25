// Une bataille entièrement calculée par le moteur, tour par tour, avant d'être regardée.
// L'affichage rejoue ces tours ; il ne recalcule jamais une règle.

import type { BattleEvent } from '../../engine/battle/events';
import { playTurn } from '../../engine/battle/battle';
import { type BattleSetup, createBattle } from '../../engine/battle/setup';
import type { BattleState } from '../../engine/battle/state';
import type { GameData } from '../../engine/data/types';

export interface RecordedTurn {
  events: BattleEvent[];
  /** État rendu par le moteur à la fin du tour. */
  state: BattleState;
}

export interface RecordedBattle {
  initial: BattleState;
  turns: RecordedTurn[];
}

export function recordBattle(data: GameData, setup: BattleSetup): RecordedBattle {
  const initial = createBattle(data, setup);
  const turns: RecordedTurn[] = [];
  let state = initial;
  while (!state.outcome) {
    const turn = playTurn(data, state);
    turns.push(turn);
    state = turn.state;
  }
  return { initial, turns };
}
