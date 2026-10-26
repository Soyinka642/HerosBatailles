import Phaser from 'phaser';
import type { Area, Cell, GameData } from '../engine/data/types';
import { cellCenter, HEX_SIZE, HEX_WIDTH, hexCorners } from './battle/layout';
import type { FortView, Mirror } from './battle/mirror';
import { PALETTE } from './battle/palette';
import { Token } from './battle/token';

function inArea(area: Area, cell: Cell): boolean {
  return cell.col >= area.fromCol && cell.col <= area.toCol && cell.row >= area.fromRow && cell.row <= area.toRow;
}

/**
 * Le terrain de bataille. La scène ne fait qu'afficher : elle dessine la copie affichée (tenue
 * à jour à partir des événements du moteur) et joue les animations ; elle ne recalcule aucune règle.
 */
export class BattleScene extends Phaser.Scene {
  private data_?: GameData;
  private terrain?: Phaser.GameObjects.Graphics;
  private fortLayer?: Phaser.GameObjects.Container;
  private fallenLayer?: Phaser.GameObjects.Container;
  private tokenLayer?: Phaser.GameObjects.Container;
  /** Chiffres flottants, traits de tir. */
  fxLayer?: Phaser.GameObjects.Container;
  private readonly tokens = new Map<string, Token>();

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.background);
    this.terrain = this.add.graphics();
    this.fortLayer = this.add.container();
    this.tokenLayer = this.add.container();
    this.fallenLayer = this.add.container();
    this.fxLayer = this.add.container();
  }

  /** Nouvelle bataille : le terrain, puis tout ce que montre la copie. */
  reset(data: GameData, mirror: Mirror): void {
    this.data_ = data;
    this.tweens.killAll();
    this.fxLayer!.removeAll(true);
    this.tokenLayer!.removeAll(true);
    this.tokens.clear();
    this.drawTerrain(data);
    this.render(mirror);
  }

  /** Remet chaque élément à l'image de la copie affichée. */
  render(mirror: Mirror): void {
    this.drawFortifications(mirror.forts);
    this.drawFallen(mirror);
    for (const view of mirror.squads) {
      let token = this.tokens.get(view.id);
      if (!token) {
        token = new Token(this, this.data_!, view);
        this.tokens.set(view.id, token);
        this.tokenLayer!.add(token);
      }
      Object.assign(token.view, view, { cell: { ...view.cell } });
      const at = cellCenter(view.cell);
      token.setPosition(at.x, at.y);
      token.refresh();
    }
  }

  token(id: string): Token | undefined {
    return this.tokens.get(id);
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

  private drawFortifications(forts: readonly FortView[]): void {
    const layer = this.fortLayer!;
    layer.removeAll(true);
    for (const fort of forts) layer.add(this.fortification(fort));
  }

  /** Une fortification : palissade (mur brun) ou tour (carré de pierre), sa structure, son feu. */
  private fortification(fort: FortView): Phaser.GameObjects.Container {
    const at = cellCenter(fort.cell);
    const box = this.add.container(at.x, at.y);
    box.setName(fort.site);
    const g = this.add.graphics();
    const standing = fort.structure > 0;
    if (fort.kind === 'barrier') {
      if (standing) {
        g.fillStyle(PALETTE.palisade, 1);
        for (let i = -2; i <= 2; i++) g.fillRect(i * 9 - 4, -22, 8, 34);
        g.fillStyle(PALETTE.palisadeDark, 1);
        g.fillRect(-24, -10, 48, 5);
        g.fillRect(-24, 4, 48, 5);
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
    if (standing && fort.burning > 0) {
      // La flamme de la fortification, dans le coin bas à droite (le jeton occupe le centre).
      g.fillStyle(PALETTE.fire, 1);
      g.fillTriangle(14, 26, 26, 26, 20, 8);
      g.fillStyle(0xffd060, 1);
      g.fillTriangle(17, 26, 23, 26, 20, 16);
    }
    const label = this.add
      .text(0, HEX_SIZE - 3, standing ? `${fort.structure}/${fort.maxStructure}` : 'détruite', {
        fontFamily: 'sans-serif',
        fontSize: '9px',
        color: '#e0b080',
      })
      .setOrigin(0.5, 1)
      .setShadow(1, 1, '#000', 2);
    box.add([g, label]);
    return box;
  }

  /** Les tombés : une étiquette grise en bas de la case, avec l'horloge si l'ennemi tient la case. */
  private drawFallen(mirror: Mirror): void {
    const layer = this.fallenLayer!;
    layer.removeAll(true);
    for (const group of mirror.fallen) {
      const at = cellCenter(group.cell);
      const held = group.heldTurns > 0 ? ` · ${group.heldTurns}/${this.data_!.config.fallen.turnsHeldBeforeDeath}` : '';
      const text = this.add
        .text(at.x, at.y + 27, `${group.count} à terre${held}`, {
          fontFamily: 'sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#111111',
          backgroundColor: '#b8b8b8',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5);
      layer.add(text);
    }
  }
}
