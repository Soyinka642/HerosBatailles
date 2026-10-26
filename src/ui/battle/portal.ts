// Le portail : une faille lumineuse verticale le long de sa colonne, qui pulse, avec des éclats
// qui montent en tournant à vitesse fixe. Redessinée à chaque image d'après l'heure de la scène.

import type Phaser from 'phaser';
import type { Battlefield } from '../../engine/data/types';
import { hash } from './hash';
import { HEX_SIZE, cellCenter } from './layout';
import { PALETTE } from './palette';

const GLINTS = 7;
/** Pixels par seconde, vers le haut. */
const GLINT_SPEED = 22;
const PULSE_PERIOD = 2400;

interface Rift {
  x: number;
  top: number;
  bottom: number;
  /** Décalage horizontal de la faille, tous les STEP pixels (déterministe). */
  wobble: number[];
}

const STEP = 14;

export function riftOf(field: Battlefield): Rift {
  const col = field.portal.fromCol;
  const xs = [0, 1].map((row) => cellCenter({ col, row }).x);
  const x = (xs[0]! + xs[1]!) / 2;
  const top = cellCenter({ col, row: 0 }).y - HEX_SIZE;
  const bottom = cellCenter({ col, row: field.height - 1 }).y + HEX_SIZE;
  const wobble = Array.from({ length: Math.ceil((bottom - top) / STEP) + 1 }, (_, i) => (hash(col, i, 99) - 0.5) * 10);
  return { x, top, bottom, wobble };
}

function band(g: Phaser.GameObjects.Graphics, rift: Rift, width: number, color: number, alpha: number): void {
  const left = rift.wobble.map((w, i) => ({ x: rift.x + w - width * (0.6 + 0.4 * Math.sin(i * 1.7)), y: rift.top + i * STEP }));
  const right = rift.wobble.map((w, i) => ({ x: rift.x + w + width * (0.6 + 0.4 * Math.cos(i * 1.3)), y: rift.top + i * STEP })).reverse();
  g.fillStyle(color, alpha);
  g.fillPoints([...left, ...right], true);
}

function glint(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, size: number): void {
  const points = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const r = i % 2 === 0 ? size : size * 0.3;
    const a = angle + (i * Math.PI) / 4;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  });
  g.fillStyle(PALETTE.riftCore, 0.9);
  g.fillPoints(points, true);
}

/** Dessine la faille à l'instant `time` (ms). */
export function drawRift(g: Phaser.GameObjects.Graphics, rift: Rift, time: number): void {
  g.clear();
  const pulse = 0.5 + 0.5 * Math.sin((time / PULSE_PERIOD) * Math.PI * 2);
  band(g, rift, 30 + pulse * 6, PALETTE.rift, 0.1);
  band(g, rift, 18 + pulse * 4, PALETTE.rift, 0.18);
  band(g, rift, 8 + pulse * 2, PALETTE.rift, 0.55);
  band(g, rift, 2.5 + pulse, PALETTE.riftCore, 0.9);
  const height = rift.bottom - rift.top;
  for (let i = 0; i < GLINTS; i++) {
    const travel = (time / 1000) * GLINT_SPEED + hash(i, 5) * height;
    const y = rift.bottom - (travel % height);
    const x = rift.x + Math.sin(time / 700 + i * 2.1) * 9;
    glint(g, x, y, time / 500 + i, 3 + hash(i, 6) * 3);
  }
}
