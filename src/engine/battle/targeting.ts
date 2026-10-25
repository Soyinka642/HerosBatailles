// Choix des cibles et des cases, avec des départages explicites (déterminisme).

import type { Battlefield, Cell } from '../data/types';
import { type Direction, ahead, hexDistance, isOnField, neighbor, neighbors, sameCell } from './hex';
import { type BattleSquad, type BattleState, activeEnemiesOf, isShooter } from './state';

/** Départage commun : la plus proche, puis la rangée la plus au nord, puis la plus à l'ouest. */
function closestFirst(from: Cell) {
  return (a: BattleSquad, b: BattleSquad): number =>
    hexDistance(from, a.cell) - hexDistance(from, b.cell) || a.cell.row - b.cell.row || a.cell.col - b.cell.col;
}

/** Ennemi actif le plus proche, ou undefined s'il n'y en a aucun sur le terrain. */
export function nearestEnemy(state: BattleState, squad: BattleSquad): BattleSquad | undefined {
  return [...activeEnemiesOf(state, squad)].sort(closestFirst(squad.cell))[0];
}

/** Ennemi actif au contact (case voisine), dans l'ordre des directions. */
export function adjacentEnemies(state: BattleState, squad: BattleSquad): BattleSquad[] {
  const enemies = activeEnemiesOf(state, squad);
  return neighbors(squad.cell).flatMap((cell) => enemies.filter((e) => sameCell(e.cell, cell)));
}

export function isEngaged(state: BattleState, squad: BattleSquad): boolean {
  return adjacentEnemies(state, squad).length > 0;
}

/** Cible de tir par défaut : l'ennemi à portée le plus proche (départage nord, puis ouest). */
export function rangedTarget(state: BattleState, squad: BattleSquad): BattleSquad | undefined {
  if (!isShooter(squad)) return undefined;
  return activeEnemiesOf(state, squad)
    .filter((e) => hexDistance(squad.cell, e.cell) <= squad.stats.range)
    .sort(closestFirst(squad.cell))[0];
}

/** Priorité de mêlée après la case juste devant : E, NE, SE, NW, SW, W. */
const MELEE_PRIORITY: readonly Direction[] = ['E', 'NE', 'SE', 'NW', 'SW', 'W'];

/** Cible de mêlée : l'ennemi juste devant, sinon le premier voisin dans l'ordre E, NE, SE, NW, SW, W. */
export function meleeTarget(state: BattleState, squad: BattleSquad): BattleSquad | undefined {
  const enemies = activeEnemiesOf(state, squad);
  const cells = [ahead(squad.cell, squad.side), ...MELEE_PRIORITY.map((d) => neighbor(squad.cell, d))];
  for (const cell of cells) {
    const enemy = enemies.find((e) => sameCell(e.cell, cell));
    if (enemy) return enemy;
  }
  return undefined;
}

/** Un ennemi actif se trouve devant l'escouade, sur sa rangée. */
export function enemyAheadOnRow(state: BattleState, squad: BattleSquad): boolean {
  return activeEnemiesOf(state, squad).some(
    (e) => e.cell.row === squad.cell.row && (squad.side === 'player' ? e.cell.col > squad.cell.col : e.cell.col < squad.cell.col),
  );
}

/**
 * Pas vers une case cible : parmi les voisines qui rapprochent le plus, la case de sa propre
 * rangée, puis la plus au nord, puis la plus à l'est. Les alliés présents ne comptent pas :
 * une case prise sera un chemin barré. Les cases hors du terrain sont écartées.
 */
export function stepToward(field: Pick<Battlefield, 'width' | 'height'>, from: Cell, target: Cell): Cell {
  const candidates = neighbors(from)
    .filter((cell) => isOnField(field, cell))
    .sort(
      (a, b) =>
        hexDistance(a, target) - hexDistance(b, target) ||
        Number(a.row !== from.row) - Number(b.row !== from.row) ||
        a.row - b.row ||
        b.col - a.col,
    );
  return candidates[0]!;
}
