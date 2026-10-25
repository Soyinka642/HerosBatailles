// Le plateau d'une bataille regardée : il applique chaque temps à la copie affichée, l'anime
// sur le terrain, le raconte dans le journal (le texte du moteur, narrateEvent) et montre
// l'issue et les pertes à la fin.

import { lossesOf } from '../../engine/battle/battle';
import type { BattleEvent } from '../../engine/battle/events';
import { type Names, namesOf, narrateEvent } from '../../engine/battle/narrate';
import type { GameData } from '../../engine/data/types';
import type { BattleScene } from '../BattleScene';
import { animateBeat } from './animate';
import { type Mirror, applyEvent, mirrorOf } from './mirror';
import type { Stage } from './player';
import type { RecordedBattle } from './record';
import type { Beat } from './timeline';

const PHASE_LABEL: Partial<Record<Beat['kind'], string>> = {
  arrivals: 'Arrivées',
  burn: 'Feu',
  fire: 'Tir',
  melee: 'Mêlée',
  fallen: 'Tombés',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class BattleView implements Stage {
  private mirror: Mirror;
  private readonly names: Names;

  constructor(
    private readonly data: GameData,
    private readonly recorded: RecordedBattle,
    private readonly scene: BattleScene,
    private readonly journal: HTMLElement,
    private readonly outcome: HTMLElement,
  ) {
    this.names = namesOf(data, recorded.initial);
    this.mirror = mirrorOf(recorded.initial);
    this.reset();
  }

  reset(): void {
    this.mirror = mirrorOf(this.recorded.initial);
    this.scene.reset(this.data, this.mirror);
    this.journal.replaceChildren();
    this.outcome.replaceChildren();
    this.outcome.classList.add('hidden');
  }

  async play(beat: Beat, animated: boolean, speed: number): Promise<void> {
    const turnState = this.recorded.turns[beat.turn - 1]!.state;
    for (const event of beat.events) applyEvent(this.mirror, event, turnState);
    this.write(beat);
    if (animated) {
      // Une escouade qui arrive n'a pas encore de jeton : on le crée avant de le faire apparaître.
      if (beat.kind === 'arrivals') this.scene.render(this.mirror);
      await animateBeat(this.scene, this.data, beat, speed);
    }
    this.scene.render(this.mirror);
    if (beat.kind === 'end') this.showOutcome();
  }

  /** Le journal : le texte du moteur, temps par temps ; le temps en cours est mis en avant. */
  private write(beat: Beat): void {
    this.journal.querySelector('.current')?.classList.remove('current');
    const block = el('div', 'beat current');
    const label = beat.kind === 'step' && beat.step ? `Mouvement, pas ${beat.step}` : PHASE_LABEL[beat.kind];
    if (label) block.append(el('div', 'phase', label));
    for (const event of beat.events) {
      if (event.type === 'turnEnd') continue;
      for (const line of this.lines(event)) {
        if (line.startsWith('== Tour')) block.append(el('h4', 'turn', line.replaceAll('=', '').trim()));
        else block.append(el('p', event.type === 'battleEnd' ? 'line outcome-line' : 'line', line));
      }
    }
    if (block.childElementCount > (label ? 1 : 0)) {
      this.journal.append(block);
      this.journal.scrollTop = this.journal.scrollHeight;
    }
  }

  /** Les lignes du moteur ; « pas 1 : » est retiré, l'intitulé du temps le dit déjà. */
  private lines(event: BattleEvent): string[] {
    return narrateEvent(this.data, this.names, event)
      .split('\n')
      .map((l) => l.trim().replace(/^pas \d+ : (\p{Ll})/u, (_m, c: string) => c.toUpperCase()))
      .filter((l) => l.length > 0);
  }

  /** L'issue et les pertes de nos escouades. */
  private showOutcome(): void {
    const last = this.recorded.turns.at(-1)!;
    const end = last.events.find((e) => e.type === 'battleEnd');
    if (!end) return;
    const box = this.outcome;
    box.replaceChildren();
    box.classList.remove('hidden');
    box.classList.toggle('victory', end.outcome.kind === 'victory');
    box.classList.toggle('defeat', end.outcome.kind === 'defeat');
    const [title, ...rest] = this.lines(end);
    box.append(el('h3', undefined, title ?? ''), ...rest.map((l) => el('p', 'muted', l)));
    const table = el('table', 'losses');
    const head = el('tr');
    for (const h of ['Escouade', 'Effectif', 'Blessés', 'Morts', 'Tombés relevés']) head.append(el('th', undefined, h));
    table.append(head);
    const events = this.recorded.turns.flatMap((t) => t.events);
    for (const loss of lossesOf(last.state, events)) {
      const row = el('tr');
      const name = last.state.squads.find((s) => s.id === loss.squad)?.name ?? loss.squad;
      for (const cell of [name, String(loss.soldiers), String(loss.wounded), String(loss.dead), String(loss.recovered + loss.recoveredAtEnd)]) {
        row.append(el('td', undefined, cell));
      }
      table.append(row);
    }
    box.append(table);
    const forts = last.state.fortifications.map((f) => `${this.names.site(f.site)} ${f.structure}/${f.maxStructure}`).join(' · ');
    if (forts) box.append(el('p', 'muted', `Fortifications : ${forts}.`));
  }
}
