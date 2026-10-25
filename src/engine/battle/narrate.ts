// Traduction du journal de bataille en français lisible : chaque effet est expliqué, chaque
// calcul de dégâts est écrit en entier. Le texte ne recalcule rien : il lit les événements.
// Les noms d'escouades sont des pluriels (« Épéistes », « Fantassins du portail n°1 »).

import type { Cell, GameData } from '../data/types';
import type { BattleResult } from './battle';
import type { DamageApplied, DamageBreakdown } from './damage';
import type { BattleEvent, BlockReason, FireDecision, HaltReason, MoveWhy } from './events';
import { defenseBonuses, effectiveRange, occupiedFortification } from './fortifications';
import { formatCell } from './hex';
import { type MoraleTier, moraleTier } from './morale';
import type { BattleSquad, BattleState, Outcome, PendingArrival } from './state';

const TIER_NAMES: Record<MoraleTier, string> = { steady: 'fermes', shaken: 'ébranlés', wavering: 'vacillants' };
const TIER_NAMES_FEMININE: Record<MoraleTier, string> = { steady: 'fermes', shaken: 'ébranlées', wavering: 'vacillantes' };

function tierName(tier: MoraleTier, feminine: boolean): string {
  return (feminine ? TIER_NAMES_FEMININE : TIER_NAMES)[tier];
}

/** Accord au féminin pluriel : « ils » ou « elles », « bloqués » ou « bloquées »… */
function g(feminine: boolean, masculine: string, feminineForm: string): string {
  return feminine ? feminineForm : masculine;
}

interface Names {
  name(id: string): string;
  maxMorale(id: string): number;
  /** Nom d'un site de fortification : « la palissade (4,1) ». */
  site(id: string): string;
  /** Le nom de l'escouade est féminin (« les Brutes »). */
  feminine(id: string): boolean;
}

/** Nombre à la française : virgule décimale, au plus deux décimales. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',').replace('-', '−');
}

function namesOf(data: GameData, state: BattleState): Names {
  const squads: (BattleSquad | PendingArrival)[] = [...state.squads, ...state.pending];
  const find = (id: string) => squads.find((s) => s.id === id);
  return {
    site: (id) => {
      const site = data.battlefield.fortificationSites.find((s) => s.id === id);
      const name = data.fortifications.find((f) => f.id === site?.fortification)?.name ?? id;
      return site ? `la ${name.toLowerCase()} ${formatCell(site.cell)}` : id;
    },
    name: (id) => find(id)?.name ?? id,
    feminine: (id) => {
      const s = find(id);
      if (!s) return false;
      if ('side' in s) return s.feminine === true;
      return data.enemies.find((e) => e.id === s.enemy)?.feminine === true;
    },
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
export function formatDamage(data: GameData, names: Names, d: DamageBreakdown, attacker?: string): string {
  const feminine = attacker !== undefined && names.feminine(attacker);
  let text = String(d.attack);
  for (const bonus of d.bonuses) {
    const source = bonus.from ? ` ${des(names.name(bonus.from))}` : '';
    text += ` + ${bonus.amount} (${keywordName(data, bonus.keyword)}${source})`;
  }
  const fortified = d.defense + d.defenseBonuses.reduce((sum, b) => sum + b.amount, 0);
  const details = [
    ...d.defenseBonuses.map((b) => `+${b.amount} ${names.site(b.site).replace(/^la /, '')}`),
    // Perce-armure n'est montré que s'il y a une défense à percer (pas contre une palissade).
    ...(fortified > 0 ? d.ignoreDefense.map((p) => keywordName(data, p.keyword, p.amount)) : []),
  ];
  text += details.length > 0 ? ` − ${d.effectiveDefense} (défense ${d.defense}, ${details.join(', ')})` : ` − ${d.defense}`;
  if (data.config.damage.formula === 'percentage') text += ` (en pourcentage)`;
  text += ` = ${formatNumber(d.net)}`;
  const multiplied = d.efficiency !== 1 || d.woundedFactor !== 1;
  if (d.efficiency !== 1) text += ` × ${formatNumber(d.efficiency)} (${tierName(d.tier, feminine)})`;
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
  if (after !== before && a.moraleAfter > 0) text += ` ; ${les(names.name(target))} sont ${tierName(after, names.feminine(target))}`;
  return text;
}

function formatBlock(names: Names, squad: string, reason: BlockReason): string {
  const f = (id: string) => names.feminine(id);
  switch (reason.kind) {
    case 'occupied':
      return `la case est tenue par ${les(names.name(reason.by))}`;
    case 'conflict':
      return `${les(names.name(reason.winner))} y entrent avant ${g(f(squad), 'eux', 'elles')} (${
        reason.why === 'faster' ? 'plus rapides' : g(f(reason.winner), 'déployés avant', 'déployées avant')
      })`;
    case 'cycle':
      return reason.with.length === 1
        ? `échange de cases avec ${les(names.name(reason.with[0]!))} : personne ne bouge`
        : `rotation avec ${reason.with.map((id) => les(names.name(id))).join(' et ')} : personne ne bouge`;
    case 'chain':
      return `${les(names.name(reason.ahead))}, qui devaient libérer la case, sont ${g(f(reason.ahead), 'bloqués', 'bloquées')}`;
    case 'fortification':
      return `${names.site(reason.site)} barre le passage`;
  }
}

function formatHalt(names: Names, squad: string, reason: HaltReason): string {
  return reason.kind === 'engaged'
    ? `sont au contact ${des(names.name(reason.by))} : ${g(names.feminine(squad), 'ils', 'elles')} ne bougent plus`
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

function consumableName(data: GameData, id: string): string {
  return data.consumables.find((c) => c.id === id)?.name ?? id;
}

/** « , volée enflammée » ou « , volée normale (plus de pâte incendiaire) ». */
function formatFire(data: GameData, fire: FireDecision | undefined): string {
  if (!fire) return '';
  if (fire.used) return `, volée enflammée (${keywordName(data, fire.keyword)})`;
  const why = {
    noConsumable: () => `plus de ${consumableName(data, fire.consumable ?? '').toLowerCase()}`,
    lowDefense: () => `défense ${fire.why === 'lowDefense' ? fire.defense : 0} sous le seuil de ${data.config.fireArrows.minTargetDefense}`,
    alreadyBurning: () => 'la cible brûle déjà',
  }[fire.why]();
  return `, volée normale (${why})`;
}

function formatIgnite(data: GameData, names: Names, e: Extract<BattleEvent, { type: 'ignite' }>): string {
  const target = les(names.name(e.target));
  let text = `    ${keywordName(data, e.keyword)} : ${target} perdent ${e.moraleBefore - e.moraleAfter} de moral (moral ${e.moraleBefore} → ${e.moraleAfter})`;
  if (e.burn) text += ` et brûleront ${e.burn.turnsLeft} tours (${e.burn.amount} dégâts par tour)`;
  if (e.site) text += ` ; ${names.site(e.site)} brûle aussi`;
  if (e.consumed) text += `. ${consumableName(data, e.consumed.consumable)} restante : ${e.consumed.left}`;
  return `${text}.`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function step(n: number): string {
  return `  pas ${n} : `;
}

/** Une ligne de journal par événement (sans les en-têtes de phase). */
export function narrateEvent(data: GameData, names: Names, e: BattleEvent): string {
  const n = (id: string) => les(names.name(id));
  const N = (id: string) => Les(names.name(id));
  const pronoun = (id: string) => g(names.feminine(id), 'ils', 'elles');
  switch (e.type) {
    case 'turnStart':
      return `\n== Tour ${e.turn} ==`;
    case 'arrival':
      return `${N(e.squad)} sortent du portail en ${formatCell(e.cell)}.`;
    case 'arrivalDelayed':
      return `${N(e.squad)} ne trouvent aucune case libre au portail : ${pronoun(e.squad)} attendent le tour suivant.`;
    case 'move':
      return `${step(e.step)}${n(e.squad)} ${formatCell(e.from)} → ${formatCell(e.to)}${formatWhy(names, e.why)}.`;
    case 'wait':
      return `${step(e.step)}${n(e.squad)} attendent sur place (tour planifié).`;
    case 'blocked':
      return `${step(e.step)}${n(e.squad)} ne peuvent pas entrer en ${formatCell(e.target)} : ${formatBlock(names, e.squad, e.reason)}. ${capitalize(pronoun(e.squad))} s'arrêtent pour ce tour.`;
    case 'halted':
      return `${step(e.step)}${n(e.squad)} ${formatHalt(names, e.squad, e.reason)}.`;
    case 'breach':
      return `  ${N(e.squad)} atteignent le cœur du campement en ${formatCell(e.cell)} : incursion n°${e.total}. ${capitalize(pronoun(e.squad))} quittent la bataille.`;
    case 'shot':
      return `  ${N(e.attacker)} tirent sur ${n(e.target)} à ${e.distance} case${e.distance > 1 ? 's' : ''}${formatFire(data, e.fire)} : ${formatDamage(data, names, e.damage, e.attacker)} ; ${formatApplied(data, names, e.target, e.applied)}.`;
    case 'ignite':
      return formatIgnite(data, names, e);
    case 'burn':
      return `  ${N(e.squad)} brûlent : ${e.amount} dégâts qui ignorent la défense ; ${formatApplied(data, names, e.squad, e.applied)}.${e.turnsLeft > 0 ? ` Encore ${e.turnsLeft} tour.` : ' Le feu s\'éteint.'}`;
    case 'fortificationBurn':
      return `  ${capitalize(names.site(e.site))} brûle : structure ${e.before} → ${e.after}.${e.turnsLeft > 0 ? ` Encore ${e.turnsLeft} tour.` : ' Le feu s\'éteint.'}`;
    case 'strike':
      return `  ${N(e.attacker)} frappent ${n(e.target)} : ${formatDamage(data, names, e.damage, e.attacker)} ; ${formatApplied(data, names, e.target, e.applied)}.`;
    case 'fortificationHit':
      return `  ${N(e.attacker)} frappent ${names.site(e.site)} : ${formatDamage(data, names, e.damage, e.attacker)} ; structure ${e.before} → ${e.after}.`;
    case 'fortificationDestroyed':
      return `  ${capitalize(names.site(e.site))} est détruite : la case est libre.`;
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

type Phase = 'Feu' | 'Mouvement' | 'Tir' | 'Mêlée';

function phaseOf(e: BattleEvent): Phase | undefined {
  if (e.type === 'move' || e.type === 'wait' || e.type === 'blocked' || e.type === 'halted' || e.type === 'breach') return 'Mouvement';
  if (e.type === 'burn' || e.type === 'fortificationBurn') return 'Feu';
  if (e.type === 'shot' || e.type === 'ignite') return 'Tir';
  if (e.type === 'strike' || e.type === 'fortificationHit') return 'Mêlée';
  return undefined;
}

function formatStep(step: Cell | 'wait'): string {
  return step === 'wait' ? 'attendre' : formatCell(step);
}

function describeSquad(data: GameData, names: Names, state: BattleState, s: BattleSquad): string[] {
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
  const fort = occupiedFortification(data, state, s);
  if (fort) {
    const defense = s.stats.defense + defenseBonuses(data, state, s, false).reduce((sum, b) => sum + b.amount, 0);
    lines.push(`  Dans ${names.site(fort.site)} : portée ${effectiveRange(data, state, s)}, défense ${defense}.`);
  }
  for (const [id, amount] of Object.entries(s.carried).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  Porte ${amount} ${consumableName(data, id).toLowerCase()}.`);
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

function describeFortifications(names: Names, state: BattleState): string[] {
  if (state.fortifications.length === 0) return ['Aucune fortification bâtie.'];
  return [
    'Fortifications :',
    ...state.fortifications.map((f) => `- ${capitalize(names.site(f.site))} : structure ${f.structure}/${f.maxStructure}.`),
  ];
}

/** En-tête : la bataille, ses fortifications, nos escouades, les ennemis annoncés. */
function header(data: GameData, names: Names, initial: BattleState): string[] {
  const kind = initial.kind === 'final' ? 'bataille finale' : 'vague';
  const enemies = initial.squads.filter((s) => s.side === 'enemy');
  return [
    `Bataille « ${initial.waveId} » (${kind}).`,
    '',
    ...describeFortifications(names, initial),
    '',
    'Nos escouades, dans l’ordre de déploiement :',
    ...initial.squads.filter((s) => s.side === 'player').flatMap((s) => describeSquad(data, names, initial, s)),
    ...(enemies.length > 0 ? ['', 'Ennemis déjà sur le terrain :', ...enemies.flatMap((s) => describeSquad(data, names, initial, s))] : []),
    '',
    'Ennemis annoncés, dans l’ordre d’arrivée :',
    ...(initial.pending.length > 0 ? initial.pending.map((p) => describeArrival(data, p)) : ['- aucun.']),
  ];
}

/** Le journal complet d'une bataille, en français. */
export function narrateBattle(data: GameData, result: BattleResult): string {
  const names = namesOf(data, result.initial);
  const lines = header(data, names, result.initial);
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
