// Les fortifications, dessinées par le code. Palissade : des pieux pointus ; plus elle est
// abîmée, plus il en manque ou en penche (choix déterministes : site et structure restante).
// Détruite : des débris à terre. Tour : un cylindre de pierre vu de trois quarts, créneaux
// en haut ; les archers s'y tiennent, surélevés.

import type Phaser from 'phaser';
import { code, hash } from './hash';
import { HEX_SIZE } from './layout';
import type { FortView } from './mirror';
import { PALETTE } from './palette';
import { mix } from './terrain';

const STAKES = 12;
/** Hauteur à laquelle se tiennent les figurines sur la tour. */
export const TOWER_RAISE = 34;
const TOWER_RADIUS = 27;
const TOWER_HEIGHT = 46;

function stake(g: Phaser.GameObjects.Graphics, x: number, y: number, height: number, tilt: number, color: number): void {
  // Un pieu : un fût et une pointe, penché de `tilt` (décalage du haut, en pixels).
  const w = 4.5;
  const top = y - height;
  g.fillStyle(PALETTE.stakeDark, 1);
  g.fillPoints(
    [
      { x: x - w - 1, y: y + 1 },
      { x: x + w + 1, y: y + 1 },
      { x: x + w + 1 + tilt, y: top + 6 },
      { x: x + tilt, y: top - 2 },
      { x: x - w - 1 + tilt, y: top + 6 },
    ],
    true,
  );
  g.fillStyle(color, 1);
  g.fillPoints(
    [
      { x: x - w, y },
      { x: x + w, y },
      { x: x + w + tilt, y: top + 6 },
      { x: x + tilt, y: top },
      { x: x - w + tilt, y: top + 6 },
    ],
    true,
  );
  g.fillStyle(0xffffff, 0.12);
  g.fillRect(x - w + 1 + tilt * 0.5, top + 8, 2, height - 10);
}

/** Palissade debout : une rangée de pieux qui descend la case, du nord au sud. */
function palisade(g: Phaser.GameObjects.Graphics, fort: FortView): void {
  const seed = code(fort.site);
  const damage = 1 - fort.structure / fort.maxStructure;
  // Pieux manquants : jusqu'à la moitié quand la structure est presque à zéro.
  const missing = Math.round(damage * STAKES * 0.5);
  const order = Array.from({ length: STAKES }, (_, i) => i).sort((a, b) => hash(seed, a, 7) - hash(seed, b, 7));
  const gone = new Set(order.slice(0, missing));
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(6, 6, 30, HEX_SIZE * 1.8);
  // Deux rangs décalés, du nord au sud : ceux du fond d'abord.
  for (let i = 0; i < STAKES; i++) {
    if (gone.has(i)) continue;
    const y = -HEX_SIZE * 0.62 + (i * HEX_SIZE * 1.3) / (STAKES - 1);
    const x = (i % 2 === 0 ? -5 : 5) + (hash(seed, i, 1) - 0.5) * 3;
    const leans = hash(seed, i, fort.structure) < damage * 0.8;
    const tilt = leans ? (hash(seed, i, 2) - 0.5) * 18 : (hash(seed, i, 3) - 0.5) * 3;
    const color = mix(PALETTE.stake[0], PALETTE.stake[1], hash(seed, i, 4));
    stake(g, x, y + 10, 26 + hash(seed, i, 5) * 6, tilt, color);
  }
}

/** Palissade détruite : des pieux brisés couchés sur une terre retournée. */
function rubble(g: Phaser.GameObjects.Graphics, fort: FortView): void {
  const seed = code(fort.site);
  g.fillStyle(PALETTE.earthDark, 0.8);
  g.fillEllipse(0, 4, 50, 34);
  for (let i = 0; i < 6; i++) {
    const x = (hash(seed, i, 11) - 0.5) * 34;
    const y = (hash(seed, i, 12) - 0.5) * 30;
    const angle = hash(seed, i, 13) * Math.PI;
    const length = 10 + hash(seed, i, 14) * 12;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length * 0.6;
    g.lineStyle(6, PALETTE.stakeDark, 1);
    g.lineBetween(x - dx / 2, y - dy / 2, x + dx / 2, y + dy / 2);
    g.lineStyle(4, mix(PALETTE.stake[0], PALETTE.stake[1], hash(seed, i, 15)), 1);
    g.lineBetween(x - dx / 2, y - dy / 2, x + dx / 2, y + dy / 2);
  }
}

/** Tour de pierre : cylindre vu de trois quarts, joints, créneaux. */
function tower(g: Phaser.GameObjects.Graphics): void {
  const r = TOWER_RADIUS;
  const base = 12;
  const top = base - TOWER_HEIGHT;
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(6, base + 3, r * 2.3, r * 0.9);
  // Le fût : un rectangle et le bas arrondi.
  g.fillStyle(PALETTE.tower, 1);
  g.fillRect(-r, top, r * 2, TOWER_HEIGHT);
  g.fillEllipse(0, base, r * 2, r * 0.7);
  // Ombre du côté droit, lumière à gauche.
  g.fillStyle(0x000000, 0.18);
  g.fillRect(r * 0.35, top, r * 0.65, TOWER_HEIGHT);
  g.fillStyle(0xffffff, 0.1);
  g.fillRect(-r * 0.75, top, r * 0.35, TOWER_HEIGHT);
  // Joints des pierres, en rangées décalées.
  g.lineStyle(1, PALETTE.towerJoint, 0.9);
  for (let y = top + 8, row = 0; y < base; y += 8, row++) {
    g.lineBetween(-r, y, r, y);
    for (let x = -r + (row & 1 ? 6 : 0); x < r; x += 12) g.lineBetween(x, y - 8, x, y);
  }
  // Le sommet : plate-forme et créneaux.
  g.fillStyle(PALETTE.towerJoint, 1);
  g.fillEllipse(0, top, r * 2, r * 0.7);
  g.fillStyle(0x6e6b64, 1);
  g.fillEllipse(0, top + 1, r * 1.6, r * 0.5);
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (0.08 + (i * 0.84) / 6);
    const x = Math.cos(angle) * r * 0.92;
    const y = top + Math.sin(angle) * r * 0.32;
    g.fillStyle(PALETTE.towerJoint, 1);
    g.fillRect(x - 4.5, y - 7, 9, 9);
    g.fillStyle(PALETTE.towerLight, 1);
    g.fillRect(x - 3.5, y - 7, 7, 8);
  }
  g.lineStyle(2, PALETTE.towerJoint, 1);
  g.strokeRect(-r, top, r * 2, TOWER_HEIGHT);
}

/** Les créneaux de devant, dessinés au-dessus des archers (ils sont dans la tour). */
export function towerFront(g: Phaser.GameObjects.Graphics): void {
  const r = TOWER_RADIUS;
  const top = 12 - TOWER_HEIGHT;
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI * (0.2 + (i * 0.6) / 4);
    const x = Math.cos(angle) * r * 0.95;
    const y = top + Math.sin(angle) * r * 0.36 + 2;
    g.fillStyle(PALETTE.towerJoint, 1);
    g.fillRect(x - 5, y - 9, 10, 12);
    g.fillStyle(PALETTE.towerLight, 1);
    g.fillRect(x - 4, y - 9, 8, 11);
  }
}

export function drawFort(g: Phaser.GameObjects.Graphics, fort: FortView): void {
  g.clear();
  if (fort.structure <= 0) rubble(g, fort);
  else if (fort.kind === 'occupiable') tower(g);
  else palisade(g, fort);
}
