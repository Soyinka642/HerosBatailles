// L'application autour du terrain : le menu des batailles, l'écran de bataille, le journal, les
// commandes et l'issue, en HTML. Phaser ne dessine que le terrain (dans .field).

import Phaser from 'phaser';
import { CATALOG, type CatalogEntry } from '../engine/battle/catalog';
import type { GameData } from '../engine/data/types';
import { GAME_TITLE } from '../engine';
import { BattleScene } from './BattleScene';
import { fieldSize } from './battle/layout';
import { PALETTE } from './battle/palette';
import { Player } from './battle/player';
import { recordBattle } from './battle/record';
import { spriteOf } from './battle/sprites';
import { buildTimeline } from './battle/timeline';
import { BattleView } from './battle/view';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, title: string, action: () => void): HTMLButtonElement {
  const b = el('button', 'control', label);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', action);
  return b;
}

export class App {
  private scene?: BattleScene;
  private player?: Player;
  private readonly menu = el('section', 'menu');
  private readonly battle = el('section', 'battle hidden');
  private readonly title = el('h2', 'battle-title');
  private readonly fieldBox = el('div', 'field');
  private readonly journal = el('div', 'journal-body');
  private readonly outcome = el('div', 'outcome hidden');
  private readonly turnLabel = el('span', 'turn-label', 'Tour 0');
  private readonly speedLabel = el('span', 'speed-label', '×1');
  private readonly playButton = button('▶ Lecture', 'Lecture / pause', () => this.togglePlay());

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
      const b = el('button', 'catalog-entry');
      const text = el('div', 'catalog-text');
      text.append(el('strong', undefined, entry.title), el('span', undefined, entry.description));
      const figure = this.cardFigure(entry);
      if (figure) b.append(figure);
      b.append(text);
      b.addEventListener('click', () => void this.open(entry));
      list.append(b);
    }
    this.menu.append(list);
  }

  /** La figurine d'une carte : l'ennemi le plus nombreux de la bataille (à égalité, le premier arrivé). */
  private cardFigure(entry: CatalogEntry): HTMLImageElement | undefined {
    const counts = new Map<string, number>();
    for (const arrival of entry.setup(this.data).wave.arrivals) counts.set(arrival.enemy, (counts.get(arrival.enemy) ?? 0) + arrival.count);
    const main = [...counts].reduce<[string, number] | undefined>((best, c) => (best && best[1] >= c[1] ? best : c), undefined)?.[0];
    const look = main ? spriteOf({ enemy: main }) : undefined;
    if (!look) return undefined;
    const img = el('img', look.dark ? 'catalog-figure dark' : 'catalog-figure');
    img.src = `unites/${look.key}.webp`;
    img.alt = '';
    return img;
  }

  private buildBattle(): void {
    const back = button('← Batailles', 'Revenir au choix des batailles', () => this.showMenu());
    back.className = 'back';
    const head = el('div', 'battle-head');
    head.append(back, this.title);

    const controls = el('div', 'controls');
    controls.append(
      button('⟲ Recommencer', 'Recommencer la bataille', () => void this.player?.restart()),
      this.playButton,
      button('⏭ Tour suivant', 'Aller à la fin du tour', () => void this.player?.nextTurn()),
      button('« Ralentir', 'Ralentir', () => this.player?.slower()),
      this.speedLabel,
      button('Accélérer »', 'Accélérer', () => this.player?.faster()),
      this.turnLabel,
    );
    const legend = el(
      'p',
      'legend muted',
      'Nos escouades regardent vers l’est ; l’ennemi, teinté de froid, vers l’ouest. Plaque : nom, barre de moral (vert ferme, jaune ébranlée, orange vacillante), moral, ✚ blessés, flamme : Feu (tours restants). Figurine pâle tournée vers son camp : en fuite. Étiquette grise : soldats à terre (et tours tenus par l’ennemi).',
    );
    const fieldScroll = el('div', 'field-scroll');
    fieldScroll.append(this.fieldBox);
    const main = el('div', 'battle-main');
    main.append(fieldScroll, controls, legend, this.outcome);
    const journal = el('aside', 'journal');
    journal.append(el('h3', undefined, 'Journal de bataille'), this.journal);
    const body = el('div', 'battle-body');
    body.append(main, journal);
    this.battle.append(head, body);
  }

  private showMenu(): void {
    this.player?.pause();
    this.battle.classList.add('hidden');
    this.menu.classList.remove('hidden');
  }

  private async open(entry: CatalogEntry): Promise<void> {
    this.player?.pause();
    this.menu.classList.add('hidden');
    this.battle.classList.remove('hidden');
    this.title.textContent = entry.title;
    const recorded = recordBattle(this.data, entry.setup(this.data));
    const scene = await this.ensureScene();
    const view = new BattleView(this.data, recorded, scene, this.journal, this.outcome);
    this.player = new Player(buildTimeline(recorded), view);
    this.player.onChange = () => this.refreshControls();
    this.refreshControls();
  }

  private togglePlay(): void {
    if (!this.player) return;
    if (this.player.isPlaying) this.player.pause();
    else this.player.play();
  }

  private refreshControls(): void {
    const p = this.player;
    if (!p) return;
    this.playButton.textContent = p.isPlaying ? '⏸ Pause' : '▶ Lecture';
    this.playButton.disabled = p.isDone;
    this.speedLabel.textContent = `×${String(p.speed).replace('.', ',')}`;
    this.turnLabel.textContent = `Tour ${p.turn}`;
  }

  /** Crée le jeu Phaser au premier affichage d'une bataille, et rend la scène une fois prête. */
  private ensureScene(): Promise<BattleScene> {
    if (this.scene) return Promise.resolve(this.scene);
    const size = fieldSize(this.data.battlefield.width, this.data.battlefield.height);
    return new Promise((resolve) => {
      new Phaser.Game({
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
