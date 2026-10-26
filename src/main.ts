import { loadGameData } from './engine/data/load';
import { App } from './ui/app';
import './ui/style.css';

// Valide le contenu JSON dès le démarrage : une donnée invalide arrête le jeu avec la liste des problèmes.
const data = loadGameData();

// Point d'entrée : le menu des batailles et l'écran de bataille (Phaser pour le terrain, HTML autour).
new App(document.getElementById('app')!, data).start();
