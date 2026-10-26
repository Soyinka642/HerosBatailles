// Une escouade sur le terrain : sa figurine (sprite tourné vers l'est pour nous, retourné vers
// l'ouest et teinté de froid pour l'ennemi), son ombre, sa brûlure ; et sa plaque, à ses pieds,
// avec le nom court, la barre de moral colorée selon le palier, le moral et les blessés.
// La plaque est un objet à part, dessiné au-dessus de toutes les figurines ; elle suit le jeton.

import Phaser from 'phaser';
import type { GameData } from '../../engine/data/types';
import { abbreviation, shortName } from './labels';
import { cellCenter } from './layout';
import { type SquadView, type Tier, tierOf } from './mirror';
import { PALETTE } from './palette';
import { type SpriteLook, spriteOf } from './sprites';

/** Les pieds de la figurine, sous le centre de la case. */
export const FEET = 18;
/** Hauteur affichée d'une figurine (avant l'échelle des brutes). */
const FIGURE_HEIGHT = 96;
const PLATE_WIDTH = 80;
const BAR_WIDTH = 30;
/** Profondeur des plaques : au-dessus de toutes les figurines. */
export const PLATE_DEPTH = 10_000;

const TIER_COLOR: Record<Exclude<Tier, 'fleeing'>, number> = {
  steady: PALETTE.steady,
  shaken: PALETTE.shaken,
  wavering: PALETTE.wavering,
};

const ENEMY_TINT = 0xa9a6ff;
const BRUTE_TINT = 0x7c72e0;
const ENEMY_GLOW = 0x7d6cff;

export function spriteTexture(key: string): string {
  return `unite-${key}`;
}

/** La figurine : le sprite, ou le jeton provisoire quand l'escouade n'a pas de sprite. */
function figureOf(scene: Phaser.Scene, view: SquadView, look: SpriteLook | undefined): Phaser.GameObjects.GameObject[] {
  const player = view.side === 'player';
  if (look && scene.textures.exists(spriteTexture(look.key))) {
    const sprite = scene.add.image(0, FEET, spriteTexture(look.key)).setOrigin(0.5, 1);
    sprite.setScale((FIGURE_HEIGHT * look.scale) / sprite.height);
    if (!player) {
      sprite.setFlipX(true).setTint(look.dark ? BRUTE_TINT : ENEMY_TINT);
      sprite.preFX?.addGlow(ENEMY_GLOW, 2, 0, false, 0.1, 6);
    }
    sprite.setName('sprite');
    return [sprite];
  }
  const body = scene.add.circle(0, FEET - 20, 17, player ? PALETTE.player : PALETTE.enemy).setStrokeStyle(2, player ? PALETTE.playerDark : PALETTE.enemyDark);
  const abbr = scene.add
    .text(0, FEET - 20, abbreviation(view.name), { fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: player ? PALETTE.textDark : '#ffffff' })
    .setOrigin(0.5);
  return [body, abbr];
}

/** La plaque d'une escouade : nom court, blessés, barre de moral et moral. */
class Plate extends Phaser.GameObjects.Container {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly moraleText: Phaser.GameObjects.Text;
  private readonly woundedText: Phaser.GameObjects.Text;
  private readonly flame: Phaser.GameObjects.Container;
  private readonly flameText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, view: SquadView) {
    super(scene, 0, 0);
    const player = view.side === 'player';
    const back = scene.add.graphics();
    back.fillStyle(0x15120d, 0.82);
    back.fillRoundedRect(-PLATE_WIDTH / 2, 0, PLATE_WIDTH, 22, 4);
    back.lineStyle(1, player ? PALETTE.playerDark : PALETTE.enemyDark, 1);
    back.strokeRoundedRect(-PLATE_WIDTH / 2, 0, PLATE_WIDTH, 22, 4);
    const name = scene.add
      .text(-PLATE_WIDTH / 2 + 4, 1, shortName(view.name), { fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color: player ? '#f0d9a8' : '#cfcaff' })
      .setOrigin(0, 0);
    this.woundedText = scene.add.text(PLATE_WIDTH / 2 - 3, 10, '', { fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color: '#ff8a8a' }).setOrigin(1, 0);
    this.bar = scene.add.graphics();
    this.moraleText = scene.add.text(-PLATE_WIDTH / 2 + 6 + BAR_WIDTH, 15.5, '', { fontFamily: 'sans-serif', fontSize: '9px', color: PALETTE.text }).setOrigin(0, 0.5);
    this.flameText = scene.add.text(4, -10, '', { fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color: PALETTE.fireText }).setShadow(1, 1, '#000', 2);
    const flameShape = scene.add.graphics();
    flameShape.fillStyle(PALETTE.fire, 1);
    flameShape.fillTriangle(-4, 0, 4, 0, 0, -10);
    flameShape.fillStyle(0xffd060, 1);
    flameShape.fillTriangle(-2, 0, 2, 0, 0, -5);
    // Le Feu, au bout de la ligne du nom : la flamme et les tours restants.
    this.flame = scene.add.container(PLATE_WIDTH / 2 - 14, 11, [flameShape, this.flameText]);
    this.add([back, name, this.woundedText, this.bar, this.moraleText, this.flame]);
    this.setDepth(PLATE_DEPTH);
  }

  refresh(data: GameData, v: SquadView): void {
    const tier = tierOf(data, v);
    const ratio = v.maxMorale > 0 ? Math.max(0, v.morale) / v.maxMorale : 0;
    const x = -PLATE_WIDTH / 2 + 4;
    this.bar.clear();
    this.bar.fillStyle(PALETTE.barBack, 1);
    this.bar.fillRect(x, 13, BAR_WIDTH, 5);
    if (tier !== 'fleeing') {
      this.bar.fillStyle(TIER_COLOR[tier], 1);
      this.bar.fillRect(x, 13, BAR_WIDTH * ratio, 5);
    }
    this.moraleText.setText(v.fleeing ? 'fuite' : `${v.morale}/${v.maxMorale}`);
    this.woundedText.setText(v.wounded > 0 ? `✚${v.wounded}` : '');
    this.flame.setVisible(v.burning > 0);
    this.flameText.setText(v.burning > 0 ? String(v.burning) : '');
  }
}

export class Token extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly plate: Plate;
  /** Hauteur de la figurine au-dessus du sol (archers sur la tour). */
  private raise = 0;

  /** Ce que montre le jeton : une copie, mise à jour par la scène (jamais l'objet de la copie affichée). */
  readonly view: SquadView;

  constructor(
    scene: Phaser.Scene,
    private readonly data_: GameData,
    view: SquadView,
  ) {
    const at = cellCenter(view.cell);
    super(scene, at.x, at.y);
    this.view = { ...view, cell: { ...view.cell } };
    const shadow = scene.add.ellipse(0, FEET, 40, 12, 0x000000, 0.35);
    this.glow = scene.add.ellipse(0, FEET - 2, 54, 18, PALETTE.fire, 0.45).setVisible(false);
    this.figure = scene.add.container(0, 0, figureOf(scene, view, spriteOf(view)));
    this.add([shadow, this.glow, this.figure]);
    this.plate = new Plate(scene, view);
    scene.add.existing(this.plate);
    this.setName(view.id);
    scene.tweens.add({ targets: this.glow, alpha: { from: 0.2, to: 0.6 }, duration: 600, yoyo: true, repeat: -1 });
    this.refresh();
  }

  /** Surélève la figurine (sur la tour) ; la plaque reste au pied. */
  setRaise(raise: number): void {
    this.raise = raise;
    this.figure.y = -raise;
  }

  /** La poitrine de la figurine, d'où partent et où arrivent les tirs. */
  chest(): { x: number; y: number } {
    return { x: this.x, y: this.y + FEET - FIGURE_HEIGHT * 0.55 - this.raise };
  }

  /** Un bref éclair rouge sur la figurine touchée. */
  flash(duration: number): void {
    for (const child of this.figure.list) {
      if (!(child instanceof Phaser.GameObjects.Image)) continue;
      const tint = child.tintTopLeft;
      child.setTintFill(0xff5050);
      this.scene.time.delayedCall(Math.min(120, duration * 0.2), () => {
        if (!child.active) return;
        child.clearTint();
        if (this.view.side === 'enemy') child.setTint(tint);
      });
    }
  }

  /** Redessine d'après la copie affichée (moral, palier, blessés, Feu, fuite). */
  refresh(): void {
    const v = this.view;
    this.plate.refresh(this.data_, v);
    this.glow.setVisible(v.burning > 0);
    // En fuite, la figurine se tourne vers son camp.
    const facingWest = (v.side === 'enemy') !== v.fleeing;
    for (const child of this.figure.list) if (child instanceof Phaser.GameObjects.Image) child.setFlipX(facingWest);
    this.setAlpha(v.fleeing ? 0.5 : 1);
    this.setVisible(v.onField);
    this.sync();
  }

  /** Chaque image : la plaque suit le jeton, la profondeur suit la position (rangée puis colonne). */
  sync(): void {
    this.setDepth(100 + this.y + this.x / 10_000 + (this.raise > 0 ? 0.5 : 0));
    this.plate.setPosition(this.x, this.y + FEET + 3);
    this.plate.setVisible(this.visible);
    // En fuite, la figurine pâlit mais la plaque reste lisible.
    this.plate.setAlpha(this.view.fleeing ? Math.min(1, this.alpha * 1.6) : this.alpha);
  }

  override destroy(fromScene?: boolean): void {
    this.plate.destroy(fromScene);
    super.destroy(fromScene);
  }
}
