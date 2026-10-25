// Le jeton d'une escouade (graphismes provisoires) : un rond aux couleurs du camp avec une
// abréviation, le nom au-dessus, la barre de moral colorée selon le palier, les blessés, la
// brûlure et la fuite.

import Phaser from 'phaser';
import type { GameData } from '../../engine/data/types';
import { abbreviation, shortName } from './labels';
import { cellCenter } from './layout';
import { type SquadView, type Tier, tierOf } from './mirror';
import { PALETTE } from './palette';

const RADIUS = 15;
const BAR_WIDTH = 28;
const BAR_X = -26;
const BAR_Y = 13;


const TIER_COLOR: Record<Exclude<Tier, 'fleeing'>, number> = {
  steady: PALETTE.steady,
  shaken: PALETTE.shaken,
  wavering: PALETTE.wavering,
};

export class Token extends Phaser.GameObjects.Container {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly moraleText: Phaser.GameObjects.Text;
  private readonly woundedText: Phaser.GameObjects.Text;
  private readonly flame: Phaser.GameObjects.Container;
  private readonly flameText: Phaser.GameObjects.Text;
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly fleeArrow: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private readonly data_: GameData,
    readonly view: SquadView,
  ) {
    const at = cellCenter(view.cell);
    super(scene, at.x, at.y);
    const player = view.side === 'player';
    this.glow = scene.add.circle(0, -4, RADIUS + 5).setStrokeStyle(3, PALETTE.fire, 0.8).setVisible(false);
    const body = scene.add.circle(0, -4, RADIUS, player ? PALETTE.player : PALETTE.enemy).setStrokeStyle(2, player ? PALETTE.playerDark : PALETTE.enemyDark);
    const abbr = scene.add
      .text(0, -4, abbreviation(view.name), { fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: player ? PALETTE.textDark : '#ffffff' })
      .setOrigin(0.5);
    const name = scene.add
      .text(0, -RADIUS - 6, shortName(view.name), { fontFamily: 'sans-serif', fontSize: '9px', color: PALETTE.text })
      .setOrigin(0.5, 1)
      .setShadow(1, 1, '#000', 2);
    this.bar = scene.add.graphics();
    this.moraleText = scene.add.text(BAR_X + BAR_WIDTH + 3, BAR_Y + 2.5, '', { fontFamily: 'sans-serif', fontSize: '9px', color: PALETTE.text }).setOrigin(0, 0.5).setShadow(1, 1, '#000', 2);
    this.woundedText = scene.add.text(RADIUS - 2, -RADIUS - 2, '', { fontFamily: 'sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ff8080' }).setShadow(1, 1, '#000', 2);
    this.flameText = scene.add.text(2, -6, '', { fontFamily: 'sans-serif', fontSize: '9px', fontStyle: 'bold', color: PALETTE.fireText }).setShadow(1, 1, '#000', 2);
    const flameShape = scene.add.graphics();
    flameShape.fillStyle(PALETTE.fire, 1);
    flameShape.fillTriangle(-4, 0, 4, 0, 0, -11);
    flameShape.fillStyle(0xffd060, 1);
    flameShape.fillTriangle(-2, 0, 2, 0, 0, -6);
    this.flame = scene.add.container(-RADIUS - 2, -RADIUS + 4, [flameShape, this.flameText]);
    this.fleeArrow = scene.add
      .text(player ? -RADIUS - 4 : RADIUS + 4, -4, player ? '◀' : '▶', { fontFamily: 'sans-serif', fontSize: '14px', color: PALETTE.text })
      .setOrigin(0.5)
      .setVisible(false);
    this.add([this.glow, body, abbr, name, this.bar, this.moraleText, this.woundedText, this.flame, this.fleeArrow]);
    this.setName(view.id);
    scene.tweens.add({ targets: this.glow, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1 });
    this.refresh();
  }

  /** Redessine les jauges d'après la copie affichée (moral, palier, blessés, Feu, fuite). */
  refresh(): void {
    const v = this.view;
    const tier = tierOf(this.data_, v);
    const ratio = v.maxMorale > 0 ? Math.max(0, v.morale) / v.maxMorale : 0;
    this.bar.clear();
    this.bar.fillStyle(PALETTE.barBack, 1);
    this.bar.fillRect(BAR_X, BAR_Y, BAR_WIDTH, 5);
    if (tier !== 'fleeing') {
      this.bar.fillStyle(TIER_COLOR[tier], 1);
      this.bar.fillRect(BAR_X, BAR_Y, BAR_WIDTH * ratio, 5);
    }
    this.moraleText.setText(`${v.morale}/${v.maxMorale}`);
    this.woundedText.setText(v.wounded > 0 ? `✚${v.wounded}` : '');
    this.flame.setVisible(v.burning > 0);
    this.glow.setVisible(v.burning > 0);
    this.flameText.setText(v.burning > 0 ? String(v.burning) : '');
    this.fleeArrow.setVisible(v.fleeing);
    this.setAlpha(v.fleeing ? 0.5 : 1);
    this.setVisible(v.onField);
  }
}
