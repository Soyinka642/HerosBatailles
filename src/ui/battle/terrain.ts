// Le sol du terrain, dessiné par le code : herbe, terre battue de la zone de déploiement et de
// l'abord du portail, dalles du cœur du campement avec le foyer. Les variations (teinte,
// touffes, cailloux) viennent d'un hasard déterministe tiré des coordonnées de la case.

import type Phaser from 'phaser';
import type { Area, Battlefield, Cell } from '../../engine/data/types';
import { hash } from './hash';
import { HEX_SIZE, HEX_WIDTH, cellCenter, hexCorners, type Point } from './layout';
import { PALETTE } from './palette';

type Ground = 'grass' | 'earth' | 'flagstone';

function inArea(area: Area, cell: Cell): boolean {
  return cell.col >= area.fromCol && cell.col <= area.toCol && cell.row >= area.fromRow && cell.row <= area.toRow;
}

function groundOf(field: Battlefield, cell: Cell): Ground {
  if (inArea(field.campHeart, cell)) return 'flagstone';
  if (inArea(field.deploymentZone, cell) || inArea(field.portal, cell) || cell.col === field.portal.fromCol - 1) return 'earth';
  return 'grass';
}

/** Mélange de deux couleurs 0xRRGGBB, t dans [0, 1]. */
export function mix(a: number, b: number, t: number): number {
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Un point au hasard (déterministe) dans le disque inscrit de la case. */
function spot(cell: Cell, at: Point, seed: number): Point {
  const angle = hash(cell.col, cell.row, seed, 1) * Math.PI * 2;
  const radius = Math.sqrt(hash(cell.col, cell.row, seed, 2)) * HEX_WIDTH * 0.42;
  return { x: at.x + Math.cos(angle) * radius, y: at.y + Math.sin(angle) * radius };
}

function tufts(g: Phaser.GameObjects.Graphics, cell: Cell, at: Point, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = spot(cell, at, 10 + i);
    const color = hash(cell.col, cell.row, i, 3) < 0.5 ? PALETTE.grassDark : PALETTE.grassLight;
    g.lineStyle(1.5, color, 0.8);
    for (const dx of [-3, 0, 3]) g.lineBetween(p.x, p.y, p.x + dx, p.y - (dx === 0 ? 6 : 4));
  }
}

function pebbles(g: Phaser.GameObjects.Graphics, cell: Cell, at: Point, count: number, color: number): void {
  for (let i = 0; i < count; i++) {
    const p = spot(cell, at, 40 + i);
    const size = 1.5 + hash(cell.col, cell.row, i, 4) * 2.5;
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(p.x + 1, p.y + 1, size * 2, size * 1.3);
    g.fillStyle(color, 1);
    g.fillEllipse(p.x, p.y, size * 2, size * 1.3);
  }
}

/** Dalles : des rangées de pierres jointoyées, décalées d'une rangée à l'autre. */
function flagstones(g: Phaser.GameObjects.Graphics, cell: Cell, at: Point): void {
  g.lineStyle(1, PALETTE.flagstoneJoint, 0.7);
  for (let row = -3; row <= 3; row++) {
    const y = at.y + row * 11;
    g.lineBetween(at.x - HEX_WIDTH / 2, y, at.x + HEX_WIDTH / 2, y);
    const shift = (row & 1) * 9 + hash(cell.col, cell.row, row) * 6;
    for (let x = -HEX_WIDTH / 2 + shift; x < HEX_WIDTH / 2; x += 17) g.lineBetween(at.x + x, y, at.x + x, y + 11);
  }
}

/** Le foyer du campement, sur la case centrale du cœur. */
function hearth(g: Phaser.GameObjects.Graphics, at: Point): void {
  for (const [radius, alpha] of [[30, 0.12], [20, 0.2], [11, 0.35]] as const) {
    g.fillStyle(PALETTE.hearth, alpha);
    g.fillCircle(at.x, at.y, radius);
  }
  g.fillStyle(0x3a3128, 1);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    g.fillCircle(at.x + Math.cos(angle) * 9, at.y + Math.sin(angle) * 6, 2.5);
  }
  g.fillStyle(0xffd27a, 0.9);
  g.fillCircle(at.x, at.y, 4);
}

/** Dessine tout le sol, puis la grille discrète. */
export function drawTerrain(g: Phaser.GameObjects.Graphics, field: Battlefield): void {
  g.clear();
  const cells: Cell[] = [];
  for (let row = 0; row < field.height; row++) for (let col = 0; col < field.width; col++) cells.push({ col, row });
  for (const cell of cells) {
    const at = cellCenter(cell);
    const ground = groundOf(field, cell);
    const shade = hash(cell.col, cell.row);
    const [from, to] = ground === 'flagstone' ? [PALETTE.flagstone, 0x9a8c72] : PALETTE[ground];
    const fill = mix(from, to, ground === 'flagstone' ? shade * 0.5 : shade);
    g.fillStyle(fill, 1);
    // Un peu plus grand que la case : pas de jour entre deux hexagones.
    g.fillPoints(hexCorners(at, HEX_SIZE + 0.6), true);
  }
  for (const cell of cells) {
    const at = cellCenter(cell);
    const ground = groundOf(field, cell);
    if (ground === 'grass') {
      tufts(g, cell, at, 3 + Math.floor(hash(cell.col, cell.row, 5) * 4));
      pebbles(g, cell, at, Math.floor(hash(cell.col, cell.row, 6) * 3), PALETTE.stone);
    } else if (ground === 'earth') {
      pebbles(g, cell, at, 2 + Math.floor(hash(cell.col, cell.row, 6) * 3), PALETTE.earthDark);
      tufts(g, cell, at, Math.floor(hash(cell.col, cell.row, 5) * 2));
    } else {
      flagstones(g, cell, at);
    }
  }
  const heart = field.campHeart;
  hearth(g, cellCenter({ col: heart.fromCol, row: Math.floor((heart.fromRow + heart.toRow) / 2) }));
  g.lineStyle(1, PALETTE.grid, 0.2);
  for (const cell of cells) g.strokePoints(hexCorners(cellCenter(cell), HEX_SIZE), true);
}
