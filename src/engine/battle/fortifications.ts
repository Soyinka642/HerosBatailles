// Fortifications en bataille : la palissade (barrière) et la tour (à occuper).
// Leurs effets viennent de fortifications.json (déclencheurs whileBehind et whileOccupying) ;
// ce module dit seulement quand une escouade en profite.

import type { Cell, Fortification, GameData, Id } from '../data/types';
import { ahead, sameCell } from './hex';
import { type BattleSquad, type BattleState, type FortificationState, isShooter } from './state';

/** État voulu d'une fortification bâtie ; structure absente = intacte. */
export interface FortificationSetup {
  site: Id;
  structure?: number;
}

export function fortificationData(data: GameData, id: Id): Fortification {
  const fortification = data.fortifications.find((f) => f.id === id);
  if (!fortification) throw new Error(`Fortification inconnue : ${id}`);
  return fortification;
}

/** Fortifications bâties au début de la bataille, dans l'ordre des sites ; lève une liste de problèmes. */
export function buildFortifications(data: GameData, setups: readonly FortificationSetup[], issues: string[]): FortificationState[] {
  setups.forEach((setup, index) => {
    if (!data.battlefield.fortificationSites.some((s) => s.id === setup.site)) issues.push(`site de fortification inconnu « ${setup.site} »`);
    if (setups.findIndex((s) => s.site === setup.site) !== index) issues.push(`site de fortification en double « ${setup.site} »`);
  });
  return data.battlefield.fortificationSites.flatMap((site) => {
    const setup = setups.find((s) => s.site === site.id);
    if (!setup) return [];
    const fortification = fortificationData(data, site.fortification);
    const max = fortification.structure ?? 0;
    const structure = setup.structure ?? max;
    if (structure < 0 || structure > max) issues.push(`${site.id} : structure ${structure} hors de 0..${max}`);
    return [
      {
        site: site.id,
        fortification: fortification.id,
        name: fortification.name,
        kind: fortification.kind,
        cell: { ...site.cell },
        structure,
        maxStructure: max,
      },
    ];
  });
}

export function isStanding(fort: FortificationState): boolean {
  return fort.structure > 0;
}

/** Fortification debout sur une case. */
export function fortificationAt(state: BattleState, cell: Cell): FortificationState | undefined {
  return state.fortifications.find((f) => isStanding(f) && sameCell(f.cell, cell));
}

/** Une barrière debout (palissade) bloque le passage des deux camps. */
export function barrierAt(data: GameData, state: BattleState, cell: Cell): FortificationState | undefined {
  const fort = fortificationAt(state, cell);
  return fort && fortificationData(data, fort.fortification).blocksMovement ? fort : undefined;
}

/** Peut-on occuper cette fortification ? La tour ne profite qu'aux tireurs. */
function canBenefit(data: GameData, fort: FortificationState, squad: BattleSquad): boolean {
  const occupants = fortificationData(data, fort.fortification).occupants;
  return occupants === undefined || (occupants === 'ranged' && isShooter(squad));
}

/** La fortification à occuper où l'escouade se tient et dont elle profite (la tour, pour un tireur). */
export function occupiedFortification(data: GameData, state: BattleState, squad: BattleSquad): FortificationState | undefined {
  const fort = fortificationAt(state, squad.cell);
  return fort && fort.kind === 'occupiable' && canBenefit(data, fort, squad) ? fort : undefined;
}

/** La barrière juste devant, côté portail : l'escouade est derrière elle, côté campement. */
export function barrierInFront(data: GameData, state: BattleState, squad: BattleSquad): FortificationState | undefined {
  return barrierAt(data, state, ahead(squad.cell, 'player'));
}

/** Un bonus d'une fortification, avec sa source pour le journal. */
export interface FortificationBonus {
  site: Id;
  amount: number;
}

function bonuses(data: GameData, fort: FortificationState | undefined, trigger: 'whileOccupying' | 'whileBehind', kind: 'defenseBonus' | 'rangeBonus', ranged: boolean): FortificationBonus[] {
  if (!fort) return [];
  return fortificationData(data, fort.fortification)
    .effects.filter((e) => e.trigger === trigger && e.target === 'self' && e.action.kind === kind)
    .filter((e) => e.condition === undefined || (e.condition.kind === 'incomingRanged' && ranged))
    .map((e) => ({ site: fort.site, amount: typeof e.action.amount === 'number' ? e.action.amount : 0 }));
}

/** Bonus de défense des fortifications contre une attaque (tour occupée, palissade devant contre les tirs). */
export function defenseBonuses(data: GameData, state: BattleState, squad: BattleSquad, ranged: boolean): FortificationBonus[] {
  return [
    ...bonuses(data, occupiedFortification(data, state, squad), 'whileOccupying', 'defenseBonus', ranged),
    ...bonuses(data, barrierInFront(data, state, squad), 'whileBehind', 'defenseBonus', ranged),
  ];
}

/** Portée réelle : la portée de l'escouade, plus le bonus de la tour qu'elle occupe. */
export function effectiveRange(data: GameData, state: BattleState, squad: BattleSquad): number {
  const fort = occupiedFortification(data, state, squad);
  return squad.stats.range + bonuses(data, fort, 'whileOccupying', 'rangeBonus', false).reduce((sum, b) => sum + b.amount, 0);
}
