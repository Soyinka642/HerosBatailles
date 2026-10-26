import Phaser from 'phaser';
import type { GameData } from '../engine/data/types';
import { TOWER_RAISE, drawFort, towerFront } from './battle/forts';
import { cellCenter } from './battle/layout';
import type { FortView, Mirror } from './battle/mirror';
import { PALETTE } from './battle/palette';
import { drawRift, riftOf } from './battle/portal';
import { allSpriteKeys } from './battle/sprites';
import { drawTerrain } from './battle/terrain';
import { FEET, PLATE_DEPTH, Token, spriteTexture } from './battle/token';

/** Profondeur d'un objet posé au sol à l'ordonnée y : les plus au sud passent devant. */
function groundDepth(y: number): number {
  return 100 + y;
}

/**
 * Le terrain de bataille. La scène ne fait qu'afficher : elle dessine la copie affichée (tenue
 * à jour à partir des événements du moteur) et joue les animations ; elle ne recalcule aucune règle.
 */
export class BattleScene extends Phaser.Scene {
  private data_?: GameData;
  private terrain?: Phaser.GameObjects.Graphics;
  private rift?: Phaser.GameObjects.Graphics;
  private riftShape?: ReturnType<typeof riftOf>;
  private forts: Phaser.GameObjects.Graphics[] = [];
  private towers: FortView[] = [];
  private fallen: Phaser.GameObjects.Text[] = [];
  /** Chiffres flottants, traits de tir : au-dessus de tout. */
  fxLayer?: Phaser.GameObjects.Container;
  private readonly tokens = new Map<string, Token>();

  constructor() {
    super('BattleScene');
  }

  preload(): void {
    for (const key of allSpriteKeys()) this.load.image(spriteTexture(key), `unites/${key}.webp`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.background);
    this.terrain = this.add.graphics().setDepth(0);
    this.rift = this.add.graphics().setDepth(1);
    this.fxLayer = this.add.container().setDepth(PLATE_DEPTH * 2);
  }

  override update(time: number): void {
    if (this.rift && this.riftShape) drawRift(this.rift, this.riftShape, time);
    for (const token of this.tokens.values()) {
      token.setRaise(this.towers.some((t) => this.isOn(token, t)) ? TOWER_RAISE : 0);
      token.sync();
    }
  }

  /** Nouvelle bataille : le terrain, puis tout ce que montre la copie. */
  reset(data: GameData, mirror: Mirror): void {
    this.data_ = data;
    this.tweens.killAll();
    this.fxLayer!.removeAll(true);
    for (const token of this.tokens.values()) token.destroy();
    this.tokens.clear();
    drawTerrain(this.terrain!, data.battlefield);
    this.riftShape = riftOf(data.battlefield);
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
        this.add.existing(token);
      }
      Object.assign(token.view, view, { cell: { ...view.cell } });
      const at = cellCenter(view.cell);
      token.setPosition(at.x, at.y);
      token.refresh();
    }
    this.update(this.time.now);
  }

  token(id: string): Token | undefined {
    return this.tokens.get(id);
  }

  /** Le jeton se tient sur cette tour debout (à quelques pixels près, pendant un déplacement). */
  private isOn(token: Token, tower: FortView): boolean {
    const at = cellCenter(tower.cell);
    return Math.abs(token.x - at.x) < 4 && Math.abs(token.y - at.y) < 4;
  }

  private drawFortifications(forts: readonly FortView[]): void {
    for (const g of this.forts) g.destroy();
    this.forts = [];
    this.towers = forts.filter((f) => f.kind === 'occupiable' && f.structure > 0);
    for (const fort of forts) {
      const at = cellCenter(fort.cell);
      const g = this.add.graphics({ x: at.x, y: at.y }).setDepth(groundDepth(at.y) - 0.5);
      drawFort(g, fort);
      this.forts.push(g);
      if (this.towers.includes(fort)) {
        // Les créneaux de devant passent devant les archers postés sur la tour.
        const front = this.add.graphics({ x: at.x, y: at.y }).setDepth(groundDepth(at.y) + 0.7);
        towerFront(front);
        this.forts.push(front);
      }
      if (fort.burning > 0) this.forts.push(this.fortFlame(at.x, at.y));
    }
  }

  /** Une fortification en feu : des flammes qui dansent sur elle. */
  private fortFlame(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y }).setDepth(groundDepth(y) + 0.8);
    for (const [dx, dy, size] of [[-12, -14, 1], [6, -24, 1.3], [14, -6, 0.9]] as const) {
      g.fillStyle(PALETTE.fire, 0.9);
      g.fillTriangle(dx - 6 * size, dy, dx + 6 * size, dy, dx, dy - 18 * size);
      g.fillStyle(0xffd060, 1);
      g.fillTriangle(dx - 3 * size, dy, dx + 3 * size, dy, dx, dy - 9 * size);
    }
    this.tweens.add({ targets: g, scaleY: { from: 0.9, to: 1.1 }, alpha: { from: 0.8, to: 1 }, duration: 260, yoyo: true, repeat: -1 });
    return g;
  }

  /** Les tombés : une petite plaque grise, avec l'horloge si l'ennemi tient la case. */
  private drawFallen(mirror: Mirror): void {
    for (const text of this.fallen) text.destroy();
    this.fallen = mirror.fallen.map((group) => {
      const at = cellCenter(group.cell);
      const held = group.heldTurns > 0 ? ` · ${group.heldTurns}/${this.data_!.config.fallen.turnsHeldBeforeDeath}` : '';
      return this.add
        .text(at.x, at.y + FEET - 2, `${group.count} à terre${held}`, {
          fontFamily: 'sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#111111',
          backgroundColor: '#b8b8b8',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(PLATE_DEPTH + 1);
    });
  }
}
