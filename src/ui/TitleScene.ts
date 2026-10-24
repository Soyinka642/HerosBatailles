import Phaser from 'phaser';
import { GAME_TITLE } from '../engine';

/** Écran titre provisoire : le titre du jeu sur fond sombre. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0e0f14');

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, GAME_TITLE, {
        fontFamily: 'Georgia, serif',
        fontSize: '56px',
        color: '#e8dcc0',
      })
      .setOrigin(0.5);
  }
}
