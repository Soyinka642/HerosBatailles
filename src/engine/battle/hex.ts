// Géométrie de la grille hexagonale « pointe en haut », en coordonnées décalées « odd-r » :
// les rangées impaires sont décalées d'un demi-hexagone vers l'est. Seul ce module connaît
// les coordonnées cubiques ; le reste du moteur ne manipule que des cases { col, row }.

import type { Battlefield, Cell } from '../data/types';

/** Camp d'une escouade : le joueur regarde vers l'est (le portail), l'ennemi vers l'ouest. */
export type Side = 'player' | 'enemy';

export interface Cube {
  x: number;
  y: number;
  z: number;
}

export function toCube(cell: Cell): Cube {
  const x = cell.col - (cell.row - (cell.row & 1)) / 2;
  const z = cell.row;
  return { x, y: -x - z, z };
}

/** Nombre de pas d'hexagone entre deux cases. */
export function hexDistance(a: Cell, b: Cell): number {
  const ca = toCube(a);
  const cb = toCube(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

/** Les six directions, dans un ordre fixe : E, NE, NW, W, SW, SE. */
export const DIRECTIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
export type Direction = (typeof DIRECTIONS)[number];

type Offset = readonly [dCol: number, dRow: number];

const EVEN_ROW: Record<Direction, Offset> = {
  E: [1, 0],
  NE: [0, -1],
  NW: [-1, -1],
  W: [-1, 0],
  SW: [-1, 1],
  SE: [0, 1],
};

const ODD_ROW: Record<Direction, Offset> = {
  E: [1, 0],
  NE: [1, -1],
  NW: [0, -1],
  W: [-1, 0],
  SW: [0, 1],
  SE: [1, 1],
};

/** Case voisine dans une direction (peut être hors du terrain). */
export function neighbor(cell: Cell, direction: Direction): Cell {
  const [dCol, dRow] = (cell.row & 1 ? ODD_ROW : EVEN_ROW)[direction];
  return { col: cell.col + dCol, row: cell.row + dRow };
}

/** Les six voisines, dans l'ordre de DIRECTIONS (certaines peuvent être hors du terrain). */
export function neighbors(cell: Cell): Cell[] {
  return DIRECTIONS.map((direction) => neighbor(cell, direction));
}

/** La case juste devant, sur la même rangée : vers le portail pour le joueur, vers le campement pour l'ennemi. */
export function ahead(cell: Cell, side: Side): Cell {
  return neighbor(cell, side === 'player' ? 'E' : 'W');
}

/** La case juste derrière, sur la même rangée. */
export function behind(cell: Cell, side: Side): Cell {
  return neighbor(cell, side === 'player' ? 'W' : 'E');
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function isOnField(field: Pick<Battlefield, 'width' | 'height'>, cell: Cell): boolean {
  return cell.col >= 0 && cell.col < field.width && cell.row >= 0 && cell.row < field.height;
}

/** Texte court d'une case pour le journal : « (3,2) » = colonne 3, rangée 2. */
export function formatCell(cell: Cell): string {
  return `(${cell.col},${cell.row})`;
}
