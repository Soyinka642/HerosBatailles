// Les animations d'un temps : déplacements pas par pas, traits de tir, coups de mêlée, chiffres
// flottants, apparitions et sorties. Tout vient des valeurs des événements du moteur.

import Phaser from 'phaser';
import type { BattleEvent } from '../../engine/battle/events';
import type { Cell, GameData } from '../../engine/data/types';
import type { BattleScene } from '../BattleScene';
import { cellCenter, type Point } from './layout';
import { PALETTE } from './palette';
import { BEAT_DURATION, type Beat } from './timeline';

function siteCell(data: GameData, site: string): Cell | undefined {
  return data.battlefield.fortificationSites.find((s) => s.id === site)?.cell;
}

function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => scene.time.delayedCall(ms, () => resolve()));
}

/** Un chiffre (ou un mot) qui monte au-dessus d'un point et s'efface. */
function float(scene: BattleScene, at: Point, text: string, color: string, duration: number, dy = 0): void {
  const label = scene.add
    .text(at.x, at.y - 22 + dy, text, { fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color })
    .setOrigin(0.5)
    .setShadow(1, 1, '#000', 3)
    .setDepth(10);
  scene.fxLayer!.add(label);
  scene.tweens.add({ targets: label, y: label.y - 26, alpha: { from: 1, to: 0 }, delay: duration * 0.35, duration: duration * 0.9, onComplete: () => label.destroy() });
}

/** Le trait d'un tir, orange pour une volée enflammée. */
function tracer(scene: BattleScene, from: Point, to: Point, fire: boolean, duration: number): void {
  const g = scene.add.graphics().setDepth(9);
  g.lineStyle(fire ? 3 : 2, fire ? PALETTE.fire : 0xf2e8c8, 0.9);
  g.lineBetween(from.x, from.y, to.x, to.y);
  scene.fxLayer!.add(g);
  scene.tweens.add({ targets: g, alpha: 0, delay: duration * 0.3, duration: duration * 0.5, onComplete: () => g.destroy() });
}

/** La poitrine de la figurine : point de départ et d'arrivée des tirs, base des chiffres. */
function tokenAt(scene: BattleScene, id: string): Point | undefined {
  return scene.token(id)?.chest();
}

function animateEvent(scene: BattleScene, data: GameData, e: BattleEvent, d: number): Promise<void> | undefined {
  switch (e.type) {
    case 'move': {
      const token = scene.token(e.squad);
      if (!token) return undefined;
      const to = cellCenter(e.to);
      return tween(scene, { targets: token, x: to.x, y: to.y, duration: d * 0.8, ease: 'Sine.easeInOut' });
    }
    case 'blocked': {
      const token = scene.token(e.squad);
      if (!token) return undefined;
      const to = cellCenter(e.target);
      const x = token.x + (to.x - token.x) * 0.2;
      const y = token.y + (to.y - token.y) * 0.2;
      return tween(scene, { targets: token, x, y, duration: d * 0.3, yoyo: true });
    }
    case 'arrival': {
      const token = scene.token(e.squad);
      if (!token) return undefined;
      token.setAlpha(0);
      return tween(scene, { targets: token, alpha: 1, duration: d * 0.8 });
    }
    case 'breach':
    case 'fled':
    case 'dispersed': {
      const at = cellCenter(e.cell);
      float(scene, at, e.type === 'breach' ? 'Incursion !' : e.type === 'fled' ? 'sortie' : 'débandade', e.type === 'breach' ? PALETTE.damage : PALETTE.muted, d);
      const token = scene.token(e.squad);
      return token ? tween(scene, { targets: token, alpha: 0, delay: d * 0.4, duration: d * 0.5 }) : undefined;
    }
    case 'shot': {
      const from = tokenAt(scene, e.attacker);
      const to = tokenAt(scene, e.target);
      if (!from || !to) return undefined;
      tracer(scene, from, to, e.fire?.used === true, d);
      float(scene, to, `−${e.damage.final}`, PALETTE.damage, d);
      scene.token(e.target)?.flash(d);
      return undefined;
    }
    case 'ignite': {
      const to = tokenAt(scene, e.target);
      if (to) float(scene, to, `Feu −${e.moraleBefore - e.moraleAfter}`, PALETTE.fireText, d, -16);
      return undefined;
    }
    case 'strike': {
      const attacker = scene.token(e.attacker);
      const target = scene.token(e.target);
      if (!attacker || !target) return undefined;
      float(scene, target.chest(), `−${e.damage.final}`, PALETTE.damage, d);
      target.flash(d);
      // L'attaquant se fend vers sa cible (de pied à pied), puis revient.
      const x = attacker.x + (target.x - attacker.x) * 0.3;
      const y = attacker.y + (target.y - attacker.y) * 0.3;
      return tween(scene, { targets: attacker, x, y, duration: d * 0.25, yoyo: true, ease: 'Quad.easeOut' });
    }
    case 'fortificationHit': {
      const attacker = scene.token(e.attacker);
      const cell = siteCell(data, e.site);
      if (!attacker || !cell) return undefined;
      const to = cellCenter(cell);
      float(scene, to, `−${e.damage.final}`, PALETTE.structureDamage, d);
      const x = attacker.x + (to.x - attacker.x) * 0.3;
      const y = attacker.y + (to.y - attacker.y) * 0.3;
      return tween(scene, { targets: attacker, x, y, duration: d * 0.25, yoyo: true, ease: 'Quad.easeOut' });
    }
    case 'burn': {
      const at = tokenAt(scene, e.squad);
      if (at) float(scene, at, `−${e.amount}`, PALETTE.fireText, d);
      return undefined;
    }
    case 'fortificationBurn': {
      const cell = siteCell(data, e.site);
      if (cell) float(scene, cellCenter(cell), `−${e.amount}`, PALETTE.fireText, d);
      return undefined;
    }
    case 'fortificationDestroyed': {
      const cell = siteCell(data, e.site);
      if (cell) float(scene, cellCenter(cell), 'brisée !', PALETTE.structureDamage, d, -18);
      return undefined;
    }
    case 'rout': {
      const at = tokenAt(scene, e.squad);
      if (at) float(scene, at, 'déroute', '#ffffff', d, -18);
      return undefined;
    }
    case 'fallenRecovered':
      float(scene, cellCenter(e.cell), `relevés +${e.count}`, '#d0d0d0', d);
      return undefined;
    case 'fallenDied':
      float(scene, cellCenter(e.cell), `${e.count} morts`, '#b0b0b0', d);
      return undefined;
    default:
      return undefined;
  }
}

/** Anime un temps ; la promesse se résout quand le temps est écoulé. */
export async function animateBeat(scene: BattleScene, data: GameData, beat: Beat, speed: number): Promise<void> {
  const d = BEAT_DURATION[beat.kind] / speed;
  const running = beat.events.map((e) => animateEvent(scene, data, e, d)).filter((p) => p !== undefined);
  await Promise.all([...running, wait(scene, d)]);
}
