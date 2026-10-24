import Phaser from 'phaser';
import { TitleScene } from './ui/TitleScene';

// Point d'entrée : démarre Phaser avec les scènes de l'interface.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0e0f14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene],
});
