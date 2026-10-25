import Phaser from 'phaser';
import { TitleScene } from './ui/TitleScene';
import { loadGameData } from './engine/data/load';

// Valide le contenu JSON dès le démarrage : une donnée invalide arrête le jeu avec la liste des problèmes.
loadGameData();

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
