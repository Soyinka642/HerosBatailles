// « Celui qui tient le terrain relève les siens » : une de nos escouades qui part en déroute
// abandonne une part de ses blessés sur sa case. À la fin de chaque tour :
// - si un ennemi se tient sur la case et qu'aucune de nos escouades n'est sur la case ou à son
//   contact, l'ennemi la tient : au bout de fallen.turnsHeldBeforeDeath tours consécutifs, les
//   tombés meurent ;
// - sinon l'horloge repart à zéro ; et si aucun ennemi n'est sur la case et qu'une de nos
//   escouades est dessus ou au contact, les tombés sont relevés et rejoignent leur escouade, blessés.
// À la fin de la bataille, les tombés restés à terre sont relevés en cas de victoire, meurent en
// cas de défaite, et suivent la règle de la case tenue en cas d'issue indécise.
// L'ennemi n'abandonne pas de tombés.

import type { GameData } from '../data/types';
import type { BattleEvent } from './events';
import { hexDistance, sameCell } from './hex';
import { type BattleSquad, type BattleState, type FallenGroup, findSquad, type Outcome } from './state';

/** Une de nos escouades part en déroute : elle abandonne une part de ses blessés sur sa case. */
export function abandonWounded(data: GameData, state: BattleState, squad: BattleSquad): BattleEvent | undefined {
  if (squad.side !== 'player') return undefined;
  const count = Math.floor(squad.wounded * data.config.fallen.abandonedShare);
  if (count <= 0) return undefined;
  squad.wounded -= count;
  state.fallen.push({ squad: squad.id, cell: { ...squad.cell }, count, heldTurns: 0 });
  return { type: 'fallen', squad: squad.id, cell: { ...squad.cell }, count };
}

function enemyOn(state: BattleState, group: FallenGroup): BattleSquad | undefined {
  return state.squads.find((s) => s.status === 'active' && s.side === 'enemy' && sameCell(s.cell, group.cell));
}

/** La première de nos escouades au combat qui se tient sur la case ou à son contact. */
function ourNear(state: BattleState, group: FallenGroup): BattleSquad | undefined {
  return state.squads.find((s) => s.status === 'active' && s.side === 'player' && hexDistance(s.cell, group.cell) <= 1);
}

function recover(state: BattleState, group: FallenGroup, extra: { by?: string; atEnd?: boolean }): BattleEvent {
  const squad = findSquad(state, group.squad);
  squad.wounded = Math.min(squad.stats.soldiers, squad.wounded + group.count);
  return { type: 'fallenRecovered', squad: group.squad, cell: { ...group.cell }, count: group.count, ...extra };
}

function die(state: BattleState, group: FallenGroup, atEnd: boolean): BattleEvent {
  findSquad(state, group.squad).dead += group.count;
  return { type: 'fallenDied', squad: group.squad, cell: { ...group.cell }, count: group.count, ...(atEnd ? { atEnd } : {}) };
}

/** Fin de tour : l'horloge des cases tenues par l'ennemi, et les tombés relevés. */
export function fallenPhase(data: GameData, state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  const remaining: FallenGroup[] = [];
  for (const group of state.fallen) {
    const enemy = enemyOn(state, group);
    const ours = ourNear(state, group);
    if (enemy && !ours) {
      group.heldTurns += 1;
      if (group.heldTurns >= data.config.fallen.turnsHeldBeforeDeath) {
        events.push(die(state, group, false));
        continue;
      }
      events.push({ type: 'fallenHeld', squad: group.squad, cell: { ...group.cell }, count: group.count, by: enemy.id, turns: group.heldTurns });
      remaining.push(group);
      continue;
    }
    group.heldTurns = 0;
    if (!enemy && ours) {
      events.push(recover(state, group, { by: ours.id }));
      continue;
    }
    remaining.push(group);
  }
  state.fallen = remaining;
  return events;
}

/** Fin de bataille : celui qui reste maître du terrain relève les siens. */
export function resolveFallenAtEnd(state: BattleState, outcome: Outcome): BattleEvent[] {
  const events = state.fallen.map((group) => {
    const held = enemyOn(state, group) !== undefined && ourNear(state, group) === undefined;
    const lost = outcome.kind === 'defeat' || (outcome.kind === 'undecided' && held);
    return lost ? die(state, group, true) : recover(state, group, { atEnd: true });
  });
  state.fallen = [];
  return events;
}
