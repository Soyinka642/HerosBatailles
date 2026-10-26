// Géométrie de l'écran de bataille : case → pixels, sans Phaser (testable).
// Hexagones « pointe en haut », coordonnées décalées « odd-r » : les rangées impaires sont
// décalées d'un demi-hexagone vers l'est, comme dans le moteur.

import type { Cell } from '../../engine/data/types';

/** Rayon d'un hexagone (du centre à une pointe), en pixels à taille réelle. */
export const HEX_SIZE = 44;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const ROW_STEP = 1.5 * HEX_SIZE;
/** Marges autour du terrain (place pour les têtes des figurines de la première rangée). */
export const MARGIN = { left: 8, top: 40, right: 8, bottom: 12 };

export interface Point {
  x: number;
  y: number;
}

export function cellCenter(cell: Cell): Point {
  const shift = cell.row & 1 ? HEX_WIDTH / 2 : 0;
  return {
    x: MARGIN.left + HEX_WIDTH / 2 + cell.col * HEX_WIDTH + shift,
    y: MARGIN.top + HEX_SIZE + cell.row * ROW_STEP,
  };
}

/** Les six sommets d'un hexagone pointe en haut, de rayon `size`. */
export function hexCorners(center: Point, size = HEX_SIZE): Point[] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return { x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) };
  });
}

/** Taille du canevas pour un terrain de `width` × `height` cases. */
export function fieldSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.ceil(MARGIN.left + width * HEX_WIDTH + HEX_WIDTH / 2 + MARGIN.right),
    height: Math.ceil(MARGIN.top + 2 * HEX_SIZE + (height - 1) * ROW_STEP + MARGIN.bottom),
  };
}
