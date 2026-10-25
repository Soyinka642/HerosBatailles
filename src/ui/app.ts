// L'application autour du terrain : le menu des batailles, le cadre de l'écran de bataille, le
// journal et les commandes, en HTML. Phaser ne dessine que le terrain (dans #field).

import Phaser from 'phaser';
import { CATALOG, type CatalogEntry } from '../engine/battle/catalog';
import type { GameData } from '../engine/data/types';
import { GAME_TITLE } from '../engine';
import { BattleScene } from './BattleScene';
import { fieldSize } from './battle/layout';
import { PALETTE } from './battle/palette';
import { mirrorOf } from './battle/mirror';
import { type RecordedBattle, recordBattle } from './battle/record';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class App {
  private game?: Phaser.Game;
  private scene?: BattleScene;
  private readonly menu = el('section', 'menu');
  private readonly battle = el('section', 'battle hidden');
  private readonly title = el('h2', 'battle-title');
  private readonly fieldBox = el('div', 'field');

  constructor(
    private readonly root: HTMLElement,
    private readonly data: GameData,
  ) {}

  start(): void {
    const header = el('header', 'top');
    header.append(el('h1', undefined, GAME_TITLE));
    this.root.append(header, this.menu, this.battle);
    this.buildMenu();
    this.buildBattle();
  }

  private buildMenu(): void {
    this.menu.append(el('h2', undefined, 'Choisir une bataille'), el('p', 'muted', 'En attendant l’écran de préparation : les batailles déjà écrites.'));
    const list = el('div', 'catalog');
    for (const entry of CATALOG) {
      const button = el('button', 'catalog-entry');
      button.append(el('strong', undefined, entry.title), el('span', undefined, entry.description));
      button.addEventListener('click', () => this.open(entry));
      list.append(button);
    }
    this.menu.append(list);
  }

  private buildBattle(): void {
    const back = el('button', 'back', '← Batailles');
    back.addEventListener('click', () => this.showMenu());
    const head = el('div', 'battle-head');
    head.append(back, this.title);
    const left = el('div', 'battle-main');
    left.append(this.fieldBox);
    const journal = el('aside', 'journal');
    journal.append(el('h3', undefined, 'Journal de bataille'));
    const body = el('div', 'battle-body');
    body.append(left, journal);
    this.battle.append(head, body);
  }

  private showMenu(): void {
    this.battle.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  private async open(entry: CatalogEntry): Promise<void> {
    this.menu.classList.add('hidden');
    this.battle.classList.remove('hidden');
    this.title.textContent = entry.title;
    const recorded = recordBattle(this.data, entry.setup(this.data));
    const scene = await this.ensureScene();
    scene.reset(this.data, mirrorOf(recorded.initial));
    this.current = recorded;
  }

  private current?: RecordedBattle;

  /** Crée le jeu Phaser au premier affichage d'une bataille, et rend la scène une fois prête. */
  private ensureScene(): Promise<BattleScene> {
    if (this.scene) return Promise.resolve(this.scene);
    const size = fieldSize(this.data.battlefield.width, this.data.battlefield.height);
    return new Promise((resolve) => {
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.fieldBox,
        width: size.width,
        height: size.height,
        backgroundColor: PALETTE.background,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        scene: [BattleScene],
        callbacks: {
          postBoot: (game) => {
            const scene = game.scene.getScene('BattleScene') as BattleScene;
            const ready = () => {
              this.scene = scene;
              resolve(scene);
            };
            if (scene.sys.settings.status >= Phaser.Scenes.RUNNING) ready();
            else scene.events.once(Phaser.Scenes.Events.CREATE, ready);
          },
        },
      });
    });
  }
}
