import Phaser from 'phaser';
import type { BattleState, FortificationState } from '../engine/battle/state';
import type { Area, Cell, GameData } from '../engine/data/types';
import { cellCenter, HEX_SIZE, HEX_WIDTH, hexCorners, type Point } from './battle/layout';
import { PALETTE } from './battle/palette';

function inArea(area: Area, cell: Cell): boolean {
  return cell.col >= area.fromCol && cell.col <= area.toCol && cell.row >= area.fromRow && cell.row <= area.toRow;
}

/**
 * Le terrain de bataille. La scène ne fait qu'afficher ce que le moteur a calculé : elle reçoit
 * des états et des événements, et ne recalcule aucune règle.
 */
export class BattleScene extends Phaser.Scene {
  private terrain?: Phaser.GameObjects.Graphics;
  private fortLayer?: Phaser.GameObjects.Container;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.background);
    this.terrain = this.add.graphics();
    this.fortLayer = this.add.container();
  }

  /** Dessine le terrain et les fortifications d'une bataille (état initial). */
  showField(data: GameData, state: BattleState): void {
    this.drawTerrain(data);
    this.drawFortifications(state.fortifications);
  }

  private drawTerrain(data: GameData): void {
    const g = this.terrain!;
    g.clear();
    const field = data.battlefield;
    for (let row = 0; row < field.height; row++) {
      for (let col = 0; col < field.width; col++) {
        const cell = { col, row };
        const [fill, line] = inArea(field.campHeart, cell)
          ? [PALETTE.campHeart, PALETTE.campHeartLine]
          : inArea(field.portal, cell)
            ? [PALETTE.portal, PALETTE.portalLine]
            : inArea(field.deploymentZone, cell)
              ? [PALETTE.deployment, PALETTE.hexLine]
              : [PALETTE.hex, PALETTE.hexLine];
        const corners = hexCorners(cellCenter(cell), HEX_SIZE - 1);
        g.fillStyle(fill, 1);
        g.fillPoints(corners, true);
        g.lineStyle(1.5, line, 1);
        g.strokePoints(corners, true);
      }
    }
  }

  private drawFortifications(forts: readonly FortificationState[]): void {
    const layer = this.fortLayer!;
    layer.removeAll(true);
    for (const fort of forts) layer.add(this.fortification(fort));
  }

  /** Une fortification : palissade (mur brun) ou tour (carré de pierre), et sa structure. */
  fortification(fort: FortificationState): Phaser.GameObjects.Container {
    const at: Point = cellCenter(fort.cell);
    const box = this.add.container(at.x, at.y);
    box.setName(fort.site);
    const g = this.add.graphics();
    const standing = fort.structure > 0;
    if (fort.kind === 'barrier') {
      if (standing) {
        g.fillStyle(PALETTE.palisade, 1);
        for (let i = -2; i <= 2; i++) g.fillRect(i * 9 - 4, -22, 8, 40);
        g.fillStyle(PALETTE.palisadeDark, 1);
        g.fillRect(-24, -8, 48, 5);
        g.fillRect(-24, 8, 48, 5);
      } else {
        g.fillStyle(PALETTE.rubble, 1);
        for (const [x, y] of [[-14, 6], [0, 10], [12, 4], [-6, -4], [8, -8]] as const) g.fillCircle(x, y, 5);
      }
    } else {
      g.fillStyle(standing ? PALETTE.tower : PALETTE.rubble, 1);
      g.fillRect(-HEX_WIDTH / 2 + 8, -HEX_SIZE + 12, HEX_WIDTH - 16, 2 * HEX_SIZE - 24);
      g.lineStyle(3, PALETTE.towerDark, 1);
      g.strokeRect(-HEX_WIDTH / 2 + 8, -HEX_SIZE + 12, HEX_WIDTH - 16, 2 * HEX_SIZE - 24);
    }
    const label = this.add
      .text(0, HEX_SIZE - 10, `${fort.structure}/${fort.maxStructure}`, { fontFamily: 'sans-serif', fontSize: '11px', color: PALETTE.text })
      .setOrigin(0.5, 1)
      .setName('structure');
    label.setShadow(1, 1, '#000', 2);
    box.add([g, label]);
    return box;
  }
}
