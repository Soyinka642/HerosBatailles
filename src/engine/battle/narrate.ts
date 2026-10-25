// Traduction du journal de bataille en français lisible : chaque effet est expliqué, chaque
// calcul de dégâts est écrit en entier. Le texte ne recalcule rien : il lit les événements.
// Les noms d'escouades sont des pluriels (« Épéistes », « Fantassins du portail n°1 »).

import type { Cell, GameData } from '../data/types';
import type { BattleResult } from './battle';
import type { DamageApplied, DamageBreakdown } from './damage';
import type { BattleEvent, BlockReason, HaltReason, MoveWhy } from './events';
import { formatCell } from './hex';
import { type MoraleTier, moraleTier } from './morale';
import type { BattleSquad, BattleState, Outcome, PendingArrival } from './state';

const TIER_NAMES: Record<MoraleTier, string> = { steady: 'fermes', shaken: 'ébranlés', wavering: 'vacillants' };

interface Names {
  name(id: string): string;
  maxMorale(id: string): number;
}

/** Nombre à la française : virgule décimale, au plus deux décimales. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',').replace('-', '−');
}

function namesOf(data: GameData, state: BattleState): Names {
  const squads: (BattleSquad | PendingArrival)[] = [...state.squads, ...state.pending];
  const find = (id: string) => squads.find((s) => s.id === id);
  return {
    name: (id) => find(id)?.name ?? id,
    maxMorale: (id) => {
      const s = find(id);
      if (!s) return 0;
      if ('stats' in s) return s.stats.maxMorale;
      return data.enemies.find((e) => e.id === s.enemy)?.stats.morale ?? 0;
    },
  };
}

// Les noms d'escouades sont des pluriels : « les Épéistes », « des Fantassins du portail n°1 ».
export const les = (name: string): string => `les ${name}`;
export const Les = (name: string): string => `Les ${name}`;
export const des = (name: string): string => `des ${name}`;

function wounded(count: number): string {
  return `${count} blessé${count > 1 ? 's' : ''}`;
}

function keywordName(data: GameData, id: string, x?: number): string {
  const name = data.keywords.find((k) => k.id === id)?.name ?? id;
  return name.replace('{X}', x === undefined ? '' : String(x)).trim();
}

/** « 6 + 2 (Soutien des Piquiers) − 2 = 6 × 0,9 (ébranlés) = 5,4 → 5 dégâts ». */
export function formatDamage(data: GameData, names: Names, d: DamageBreakdown): string {
  let text = String(d.attack);
  for (const bonus of d.bonuses) {
    const source = bonus.from ? ` ${des(names.name(bonus.from))}` : '';
    text += ` + ${bonus.amount} (${keywordName(data, bonus.keyword)}${source})`;
  }
  if (d.ignoreDefense.length > 0) {
    const pierce = d.ignoreDefense.map((p) => `${keywordName(data, p.keyword, p.amount)}`).join(', ');
    text += ` − ${d.effectiveDefense} (défense ${d.defense}, ${pierce})`;
  } else {
    text += ` − ${d.defense}`;
  }
  if (data.config.damage.formula === 'percentage') text += ` (en pourcentage)`;
  text += ` = ${formatNumber(d.net)}`;
  const multiplied = d.efficiency !== 1 || d.woundedFactor !== 1;
  if (d.efficiency !== 1) text += ` × ${formatNumber(d.efficiency)} (${TIER_NAMES[d.tier]})`;
  if (d.woundedFactor !== 1) text += ` × ${formatNumber(d.woundedFactor)} (${wounded(d.wounded)} sur ${d.soldiers})`;
  if (multiplied) text += ` = ${formatNumber(d.raw)}`;
  if (d.floored) text += ` → minimum ${d.final}`;
  else if (d.final !== d.raw) text += ` → ${d.final}`;
  return `${text} dégât${d.final > 1 ? 's' : ''}`;
}

function formatApplied(data: GameData, names: Names, target: string, a: DamageApplied): string {
  let text = `moral ${a.moraleBefore} → ${a.moraleAfter}`;
  if (a.woundedAfter !== a.woundedBefore) text += `, blessés ${a.woundedBefore} → ${a.woundedAfter}`;
  const max = names.maxMorale(target);
  const before = moraleTier(a.moraleBefore, max, data.config);
  const after = moraleTier(a.moraleAfter, max, data.config);
  if (after !== before && a.moraleAfter > 0) text += ` ; ${les(names.name(target))} sont ${TIER_NAMES[after]}`;
  return text;
}

function formatBlock(names: Names, reason: BlockReason): string {
  switch (reason.kind) {
    case 'occupied':
      return `la case est tenue par ${les(names.name(reason.by))}`;
    case 'conflict':
      return `${les(names.name(reason.winner))} y entrent avant eux (${reason.why === 'faster' ? 'plus rapides' : 'déployés avant'})`;
    case 'cycle':
      return reason.with.length === 1
        ? `échange de cases avec ${les(names.name(reason.with[0]!))} : personne ne bouge`
        : `rotation avec ${reason.with.map((id) => les(names.name(id))).join(' et ')} : personne ne bouge`;
    case 'chain':
      return `${les(names.name(reason.ahead))}, qui devaient libérer la case, sont bloqués`;
  }
}

function formatHalt(names: Names, reason: HaltReason): string {
  return reason.kind === 'engaged'
    ? `sont au contact ${des(names.name(reason.by))} : ils ne bougent plus`
    : `s'arrêtent : ${les(names.name(reason.target))} sont à portée`;
}

function formatWhy(names: Names, why: MoveWhy): string {
  if (why.kind === 'planned') return ' (tour planifié)';
  if (why.kind === 'deviate') return `, en déviant vers ${les(names.name(why.toward))}`;
  return '';
}

function formatOutcome(outcome: Outcome, turn: number, breaches: number): string {
  const text = {
    noEnemiesLeft: `Victoire au tour ${turn} : plus aucun ennemi sur le terrain ni à venir.`,
    ritualHeld: `Victoire au tour ${turn} : le rituel de fermeture est tenu.`,
    allSquadsRouted: `Défaite au tour ${turn} : toutes nos escouades sont en déroute.`,
    maxTurns: `Issue indécise : ${turn} tours joués, la limite est atteinte.`,
  }[outcome.reason];
  return `${text}\nIncursions au cœur du campement : ${breaches}.`;
}

function step(n: number): string {
  return `  pas ${n} : `;
}

/** Une ligne de journal par événement (sans les en-têtes de phase). */
export function narrateEvent(data: GameData, names: Names, e: BattleEvent): string {
  const n = (id: string) => les(names.name(id));
  const N = (id: string) => Les(names.name(id));
  switch (e.type) {
    case 'turnStart':
      return `\n== Tour ${e.turn} ==`;
    case 'arrival':
      return `${N(e.squad)} sortent du portail en ${formatCell(e.cell)}.`;
    case 'arrivalDelayed':
      return `${N(e.squad)} ne trouvent aucune case libre au portail : ils attendent le tour suivant.`;
    case 'move':
      return `${step(e.step)}${n(e.squad)} ${formatCell(e.from)} → ${formatCell(e.to)}${formatWhy(names, e.why)}.`;
    case 'wait':
      return `${step(e.step)}${n(e.squad)} attendent sur place (tour planifié).`;
    case 'blocked':
      return `${step(e.step)}${n(e.squad)} ne peuvent pas entrer en ${formatCell(e.target)} : ${formatBlock(names, e.reason)}. Ils s'arrêtent pour ce tour.`;
    case 'halted':
      return `${step(e.step)}${n(e.squad)} ${formatHalt(names, e.reason)}.`;
    case 'breach':
      return `  ${N(e.squad)} atteignent le cœur du campement en ${formatCell(e.cell)} : incursion n°${e.total}. Ils quittent la bataille.`;
    case 'shot':
      return `  ${N(e.attacker)} tirent sur ${n(e.target)} à ${e.distance} case${e.distance > 1 ? 's' : ''} : ${formatDamage(data, names, e.damage)} ; ${formatApplied(data, names, e.target, e.applied)}.`;
    case 'strike':
      return `  ${N(e.attacker)} frappent ${n(e.target)} : ${formatDamage(data, names, e.damage)} ; ${formatApplied(data, names, e.target, e.applied)}.`;
    case 'rout':
      return `  ${N(e.squad)} sont en déroute et quittent le terrain.`;
    case 'turnEnd':
      return [
        'Fin du tour :',
        ...e.squads.map((s) => `  ${names.name(s.id)} en ${formatCell(s.cell)}, moral ${s.morale}/${s.maxMorale}${s.wounded > 0 ? `, ${wounded(s.wounded)}` : ''}`),
      ].join('\n');
    case 'battleEnd':
      return `\n${formatOutcome(e.outcome, e.turn, e.breaches)}`;
  }
}

type Phase = 'Mouvement' | 'Tir' | 'Mêlée';

function phaseOf(e: BattleEvent): Phase | undefined {
  if (e.type === 'move' || e.type === 'wait' || e.type === 'blocked' || e.type === 'halted' || e.type === 'breach') return 'Mouvement';
  if (e.type === 'shot') return 'Tir';
  if (e.type === 'strike') return 'Mêlée';
  return undefined;
}

function formatStep(step: Cell | 'wait'): string {
  return step === 'wait' ? 'attendre' : formatCell(step);
}

function describeSquad(data: GameData, s: BattleSquad): string[] {
  const posture = data.postures.find((p) => p.id === s.posture)?.name ?? s.posture;
  const st = s.stats;
  const lines = [
    `- ${s.name} en ${formatCell(s.cell)}, ${posture} : mêlée ${st.meleeAttack}, tir ${st.rangedAttack}` +
      `${st.range > 0 ? ` (portée ${st.range})` : ''}, défense ${st.defense}, vitesse ${st.speed}, moral ${st.maxMorale}, ${st.soldiers} soldats` +
      `${s.keywords.length > 0 ? ` ; ${s.keywords.map((k) => keywordName(data, k.id, k.x)).join(', ')}` : ''}.`,
  ];
  for (const u of s.unmastered) {
    const item = data.items.find((i) => i.id === u.item)?.name ?? u.item;
    const lost = u.lostKeywords.length > 0 ? `, sans ${u.lostKeywords.map((k) => keywordName(data, k)).join(', ')}` : '';
    lines.push(`  ${item} non maîtrisée : −${u.penalty} en attaque${lost}.`);
  }
  s.plannedTurns.forEach((turn, index) => {
    const steps = turn.steps.length > 0 ? turn.steps.map(formatStep).join(', ') : 'rester sur place';
    lines.push(`  Tour ${index + 1} planifié : ${steps}.`);
  });
  return lines;
}

function describeArrival(data: GameData, p: PendingArrival): string {
  const e = data.enemies.find((x) => x.id === p.enemy);
  const stats = e
    ? ` : mêlée ${e.stats.meleeAttack}, tir ${e.stats.rangedAttack}${e.stats.range > 0 ? ` (portée ${e.stats.range})` : ''}, défense ${e.stats.defense}, vitesse ${e.stats.speed}, moral ${e.stats.morale}` +
      `${e.keywords.length > 0 ? ` ; ${e.keywords.map((k) => keywordName(data, k.id, k.x)).join(', ')}` : ''}`
    : '';
  return `- ${p.name}, tour ${p.turn}${p.row === undefined ? '' : `, rangée ${p.row}`}${stats}.`;
}

/** En-tête : la bataille, nos escouades, les ennemis annoncés. */
function header(data: GameData, initial: BattleState): string[] {
  const kind = initial.kind === 'final' ? 'bataille finale' : 'vague';
  const enemies = initial.squads.filter((s) => s.side === 'enemy');
  return [
    `Bataille « ${initial.waveId} » (${kind}).`,
    'Fortifications ignorées (lot 1.2c).',
    '',
    'Nos escouades, dans l’ordre de déploiement :',
    ...initial.squads.filter((s) => s.side === 'player').flatMap((s) => describeSquad(data, s)),
    ...(enemies.length > 0 ? ['', 'Ennemis déjà sur le terrain :', ...enemies.flatMap((s) => describeSquad(data, s))] : []),
    '',
    'Ennemis annoncés, dans l’ordre d’arrivée :',
    ...(initial.pending.length > 0 ? initial.pending.map((p) => describeArrival(data, p)) : ['- aucun.']),
  ];
}

/** Le journal complet d'une bataille, en français. */
export function narrateBattle(data: GameData, result: BattleResult): string {
  const names = namesOf(data, result.initial);
  const lines = header(data, result.initial);
  let phase: Phase | undefined;
  for (const event of result.events) {
    if (event.type === 'turnStart') phase = undefined;
    const next = phaseOf(event);
    if (next && next !== phase) {
      phase = next;
      lines.push(`${next} :`);
    }
    lines.push(narrateEvent(data, names, event));
  }
  return `${lines.join('\n')}\n`;
}
