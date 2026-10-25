// État initial d'une bataille : stats réelles de nos escouades, fortifications bâties,
// vérification du déploiement, et file des ennemis annoncés.

import type { Area, Cell, GameData, Id, Item, KeywordRef, StatModifiers, Wave } from '../data/types';
import { type FortificationSetup, buildFortifications, fortificationData } from './fortifications';
import { hexDistance, isOnField, sameCell } from './hex';
import type { BattleSquad, BattleState, CombatStats, FortificationState, PendingArrival, UnmasteredWeapon } from './state';
import type { Carried, MoraleModifier, Order } from './types';

/** Une de nos escouades telle que le joueur la déploie. */
export interface PlayerSquadSetup {
  id: string;
  name: string;
  /** Id d'emplacement (de squad.json) → id d'objet. */
  equipment: Record<Id, Id>;
  masteries: Id[];
  cell: Cell;
  order: Order;
  moraleModifiers?: MoraleModifier[];
  /** Améliorations : id d'emplacement → id de sous-emplacement → id d'objet (les flèches enflammées sur l'arc). */
  upgrades?: Upgrades;
  /** Consommables portés (la pâte incendiaire…). */
  carried?: Carried;
}

export type Upgrades = Record<Id, Record<Id, Id>>;

export interface BattleSetup {
  wave: Wave;
  /** L'ordre du tableau est l'ordre de déploiement. */
  squads: PlayerSquadSetup[];
  /** Déblocages obtenus ; ils comptent pour la profondeur des ordres. */
  unlocks?: Id[];
  /** Fortifications bâties et leur structure ; un site absent n'est pas bâti. */
  fortifications?: FortificationSetup[];
}

export class BattleSetupError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Déploiement invalide :\n- ${issues.join('\n- ')}`);
    this.name = 'BattleSetupError';
  }
}

const STAT_KEYS = ['meleeAttack', 'rangedAttack', 'range', 'defense', 'speed'] as const;
const ATTACK_KEYS = ['meleeAttack', 'rangedAttack'] as const;

function itemById(data: GameData, id: Id): Item {
  const item = data.items.find((i) => i.id === id);
  if (!item) throw new BattleSetupError([`objet inconnu « ${id} »`]);
  return item;
}

/** Ordre des emplacements : celui de squad.json, pour ne pas dépendre de l'ordre des clés. */
function equippedItems(data: GameData, equipment: Record<Id, Id>): Item[] {
  return data.squad.slots.flatMap((slot) => {
    const itemId = equipment[slot.id];
    return itemId === undefined ? [] : [itemById(data, itemId)];
  });
}

/** Malus d'une arme non maîtrisée : sur les attaques que l'arme améliore, sans descendre sous 0. */
function applyUnmasteredPenalty(stats: CombatStats, weapon: StatModifiers, penalty: number): void {
  for (const key of ATTACK_KEYS) {
    if ((weapon[key] ?? 0) > 0) stats[key] = Math.max(0, stats[key] - penalty);
  }
}

export interface SquadProfile {
  stats: CombatStats;
  keywords: KeywordRef[];
  unmastered: UnmasteredWeapon[];
}

/** Améliorations posées, dans l'ordre des emplacements de squad.json puis des sous-emplacements de l'objet. */
function upgradeItems(data: GameData, equipment: Record<Id, Id>, upgrades: Upgrades): Item[] {
  return data.squad.slots.flatMap((slot) => {
    const itemId = equipment[slot.id];
    const chosen = upgrades[slot.id];
    if (itemId === undefined || chosen === undefined) return [];
    return itemById(data, itemId).upgradeSlots.flatMap((sub) => {
      const upgradeId = chosen[sub.id];
      return upgradeId === undefined ? [] : [itemById(data, upgradeId)];
    });
  });
}

/**
 * Stats réelles d'une de nos escouades : base commune + équipement + améliorations ; une arme
 * non maîtrisée perd ses capacités et donne un malus (les capacités d'une amélioration ne
 * dépendent pas de la maîtrise) ; moral maximum = base + modificateurs.
 */
export function computeSquadStats(
  data: GameData,
  equipment: Record<Id, Id>,
  masteries: readonly Id[],
  moraleModifiers: readonly MoraleModifier[] = [],
  upgrades: Upgrades = {},
): SquadProfile {
  const base = data.squad.stats;
  const stats: CombatStats = {
    ...base,
    maxMorale: data.config.morale.base + moraleModifiers.reduce((sum, m) => sum + m.amount, 0),
  };
  const items = equippedItems(data, equipment);
  for (const item of items) {
    for (const key of STAT_KEYS) stats[key] += item.stats[key] ?? 0;
  }
  const keywords: KeywordRef[] = [];
  const unmastered: UnmasteredWeapon[] = [];
  const penalty = data.config.mastery.unmasteredAttackPenalty;
  for (const item of items) {
    const mastered = item.mastery === undefined || masteries.includes(item.mastery);
    if (mastered) {
      keywords.push(...item.keywords);
    } else {
      applyUnmasteredPenalty(stats, item.stats, penalty);
      unmastered.push({ item: item.id, penalty, lostKeywords: item.keywords.map((k) => k.id) });
    }
  }
  for (const upgrade of upgradeItems(data, equipment, upgrades)) {
    for (const key of STAT_KEYS) stats[key] += upgrade.stats[key] ?? 0;
    keywords.push(...upgrade.keywords);
  }
  stats.speed = Math.max(0, stats.speed);
  return { stats, keywords, unmastered };
}

function inArea(area: Area, cell: Cell): boolean {
  return cell.col >= area.fromCol && cell.col <= area.toCol && cell.row >= area.fromRow && cell.row <= area.toRow;
}

function unlockedPlannedTurns(data: GameData, unlocks: readonly Id[]): number {
  return data.orders.plannedTurnSlots.filter((slot) => slot.unlockedBy === undefined || unlocks.includes(slot.unlockedBy)).length;
}

/** Une escouade qui ne bougera pas du premier tour : un plan sans pas de déplacement, ou Tenir sans plan. */
function staysStillOnTurnOne(data: GameData, squad: PlayerSquadSetup): boolean {
  const plan = squad.order.plannedTurns[0];
  if (plan) return plan.steps.every((step) => step === 'wait');
  return data.postures.find((p) => p.id === squad.order.posture)?.movement === 'hold';
}

/** Une amélioration va dans un sous-emplacement de l'objet porté, débloqué, qui accepte sa catégorie. */
function checkUpgrades(data: GameData, setup: BattleSetup, squad: PlayerSquadSetup, issues: string[]): void {
  for (const [slotId, chosen] of Object.entries(squad.upgrades ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const itemId = squad.equipment[slotId];
    const item = itemId === undefined ? undefined : data.items.find((i) => i.id === itemId);
    for (const [subId, upgradeId] of Object.entries(chosen).sort(([a], [b]) => a.localeCompare(b))) {
      const where = `${squad.id} : amélioration ${slotId}.${subId}`;
      const sub = item?.upgradeSlots.find((s) => s.id === subId);
      const upgrade = data.items.find((i) => i.id === upgradeId);
      if (!sub) issues.push(`${where} : aucun sous-emplacement « ${subId} » sur l'objet porté`);
      else if (sub.unlockedBy !== undefined && !(setup.unlocks ?? []).includes(sub.unlockedBy)) issues.push(`${where} : verrouillé (${sub.unlockedBy})`);
      if (!upgrade) issues.push(`${where} : objet inconnu « ${upgradeId} »`);
      else if (sub && !sub.accepts.includes(upgrade.category)) issues.push(`${where} : « ${upgradeId} » ne va pas dans ce sous-emplacement`);
    }
  }
}

function checkEquipment(data: GameData, setup: BattleSetup, squad: PlayerSquadSetup, issues: string[]): void {
  for (const slot of data.squad.slots) {
    const itemId = squad.equipment[slot.id];
    if (itemId === undefined) continue;
    const item = data.items.find((i) => i.id === itemId);
    if (!item) issues.push(`${squad.id} : objet inconnu « ${itemId} »`);
    else if (!slot.accepts.includes(item.category)) issues.push(`${squad.id} : « ${itemId} » ne va pas dans l'emplacement ${slot.id}`);
  }
  for (const slotId of Object.keys(squad.equipment).sort()) {
    if (!data.squad.slots.some((s) => s.id === slotId)) issues.push(`${squad.id} : emplacement inconnu « ${slotId} »`);
  }
  checkUpgrades(data, setup, squad, issues);
  for (const [consumable, amount] of Object.entries(squad.carried ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!data.consumables.some((c) => c.id === consumable)) issues.push(`${squad.id} : consommable inconnu « ${consumable} »`);
    if (!Number.isInteger(amount) || amount < 0) issues.push(`${squad.id} : quantité invalide de « ${consumable} » (${amount})`);
  }
  for (const mastery of squad.masteries) {
    if (!data.masteries.some((m) => m.id === mastery)) issues.push(`${squad.id} : maîtrise inconnue « ${mastery} »`);
  }
}

/** Une palissade debout est infranchissable ; la tour n'accueille que nos tireurs. */
function checkFortifiedCell(data: GameData, forts: readonly FortificationState[], squad: PlayerSquadSetup, cell: Cell, where: string, issues: string[]): void {
  const fort = forts.find((f) => f.structure > 0 && sameCell(f.cell, cell));
  if (!fort) return;
  const fortification = fortificationData(data, fort.fortification);
  const at = `(${cell.col},${cell.row})`;
  if (fortification.blocksMovement) issues.push(`${where} : ${at} est une ${fort.name.toLowerCase()}, infranchissable`);
  const stats = profileOf(data, squad).stats;
  const shooter = stats.rangedAttack > 0 && stats.range > 0;
  if (fortification.occupants === 'ranged' && !shooter) issues.push(`${where} : ${at} est une ${fort.name.toLowerCase()}, réservée aux tireurs`);
}

function checkPlannedTurns(
  data: GameData,
  setup: BattleSetup,
  forts: readonly FortificationState[],
  squad: PlayerSquadSetup,
  issues: string[],
): void {
  const allowed = unlockedPlannedTurns(data, setup.unlocks ?? []);
  if (squad.order.plannedTurns.length > allowed) {
    issues.push(`${squad.id} : ${squad.order.plannedTurns.length} tours planifiés pour ${allowed} autorisé(s)`);
  }
  const speed = profileOf(data, squad).stats.speed;
  const firstTurn = squad.order.plannedTurns[0];
  if (!firstTurn) return;
  if (firstTurn.steps.length > speed) issues.push(`${squad.id} : ${firstTurn.steps.length} pas pour une vitesse de ${speed}`);
  const stillAllies = setup.squads.filter((other) => other !== squad && staysStillOnTurnOne(data, other));
  let previous = squad.cell;
  firstTurn.steps.forEach((step, index) => {
    if (step === 'wait') return;
    const where = `${squad.id} : pas ${index + 1}`;
    if (hexDistance(previous, step) !== 1) issues.push(`${where} : (${step.col},${step.row}) n'est pas voisine de la case précédente`);
    if (!isOnField(data.battlefield, step)) issues.push(`${where} : (${step.col},${step.row}) est hors du terrain`);
    const ally = stillAllies.find((other) => sameCell(other.cell, step));
    if (ally) issues.push(`${where} : (${step.col},${step.row}) est la case de ${ally.id}, qui ne bouge pas`);
    checkFortifiedCell(data, forts, squad, step, where, issues);
    previous = step;
  });
}

function checkPlayerSquads(data: GameData, setup: BattleSetup, forts: readonly FortificationState[], issues: string[]): void {
  const max = data.config.field.maxPlayerSquads;
  if (setup.squads.length > max) issues.push(`${setup.squads.length} escouades pour ${max} au plus`);
  setup.squads.forEach((squad, index) => {
    if (setup.squads.findIndex((s) => s.id === squad.id) !== index) issues.push(`id en double « ${squad.id} »`);
    if (!inArea(data.battlefield.deploymentZone, squad.cell)) {
      issues.push(`${squad.id} : (${squad.cell.col},${squad.cell.row}) est hors de la zone de déploiement`);
    }
    const first = setup.squads.findIndex((s) => sameCell(s.cell, squad.cell));
    if (first !== index) issues.push(`${squad.id} : même case que ${setup.squads[first]?.id}`);
    const posture = data.postures.find((p) => p.id === squad.order.posture);
    if (!posture) issues.push(`${squad.id} : posture inconnue « ${squad.order.posture} »`);
    else if (posture.enemyOnly) issues.push(`${squad.id} : la posture « ${posture.id} » est réservée aux ennemis`);
    checkEquipment(data, setup, squad, issues);
    checkFortifiedCell(data, forts, squad, squad.cell, squad.id, issues);
    checkPlannedTurns(data, setup, forts, squad, issues);
  });
}

function movementOf(data: GameData, postureId: Id): BattleSquad['movement'] {
  const posture = data.postures.find((p) => p.id === postureId);
  if (!posture) throw new BattleSetupError([`posture inconnue « ${postureId} »`]);
  return posture.movement;
}

function playerSquad(data: GameData, squad: PlayerSquadSetup, rank: number): BattleSquad {
  const profile = profileOf(data, squad);
  return {
    id: squad.id,
    name: squad.name,
    side: 'player',
    rank,
    cell: { ...squad.cell },
    ...profile,
    morale: profile.stats.maxMorale,
    wounded: 0,
    posture: squad.order.posture,
    movement: movementOf(data, squad.order.posture),
    plannedTurns: structuredClone(squad.order.plannedTurns),
    status: 'active',
    carried: { ...squad.carried },
  };
}

function profileOf(data: GameData, squad: PlayerSquadSetup): SquadProfile {
  return computeSquadStats(data, squad.equipment, squad.masteries, squad.moraleModifiers, squad.upgrades);
}

/**
 * Ennemis annoncés, dans l'ordre d'arrivée prévu : par tour, puis dans l'ordre de la liste.
 * Chaque unité d'une arrivée est une escouade distincte, numérotée par type : « n°1 », « n°2 »…
 */
export function pendingArrivals(data: GameData, wave: Wave, firstRank: number): PendingArrival[] {
  const ordered = wave.arrivals
    .map((arrival, index) => ({ arrival, index }))
    .sort((a, b) => a.arrival.turn - b.arrival.turn || a.index - b.index);
  const counters: Record<Id, number> = {};
  const pending: PendingArrival[] = [];
  for (const { arrival } of ordered) {
    const enemy = data.enemies.find((e) => e.id === arrival.enemy);
    if (!enemy) throw new BattleSetupError([`ennemi inconnu « ${arrival.enemy} »`]);
    for (let i = 0; i < arrival.count; i++) {
      const number = (counters[enemy.id] ?? 0) + 1;
      counters[enemy.id] = number;
      pending.push({
        id: `${enemy.id}#${number}`,
        name: `${enemy.name} n°${number}`,
        enemy: enemy.id,
        rank: firstRank + pending.length,
        turn: arrival.turn,
        ...(arrival.row === undefined ? {} : { row: arrival.row }),
      });
    }
  }
  return pending;
}

/** Escouade ennemie qui sort du portail : stats directes, posture fixe de son type. */
export function enemySquad(data: GameData, arrival: PendingArrival, cell: Cell): BattleSquad {
  const enemy = data.enemies.find((e) => e.id === arrival.enemy);
  if (!enemy) throw new BattleSetupError([`ennemi inconnu « ${arrival.enemy} »`]);
  const { morale, ...stats } = enemy.stats;
  return {
    id: arrival.id,
    name: arrival.name,
    ...(enemy.feminine ? { feminine: true } : {}),
    side: 'enemy',
    rank: arrival.rank,
    cell: { ...cell },
    stats: { ...stats, maxMorale: morale },
    keywords: structuredClone(enemy.keywords),
    unmastered: [],
    morale,
    wounded: 0,
    posture: enemy.posture,
    movement: movementOf(data, enemy.posture),
    plannedTurns: [],
    status: 'active',
    carried: {},
  };
}

/** Construit l'état initial, ou lève une BattleSetupError qui liste tous les problèmes. */
export function createBattle(data: GameData, setup: BattleSetup): BattleState {
  const issues: string[] = [];
  const fortifications = buildFortifications(data, setup.fortifications ?? [], issues);
  checkPlayerSquads(data, setup, fortifications, issues);
  if (issues.length > 0) throw new BattleSetupError(issues);
  return {
    waveId: setup.wave.id,
    kind: setup.wave.kind,
    turn: 0,
    squads: setup.squads.map((squad, index) => playerSquad(data, squad, index)),
    pending: pendingArrivals(data, setup.wave, setup.squads.length),
    fortifications,
    breaches: 0,
  };
}

/** Une de nos escouades d'après un modèle de départ (épéistes, archers, piquiers). */
export function fromTemplate(
  data: GameData,
  templateId: Id,
  options: { id?: string; name?: string; cell: Cell; order: Order },
): PlayerSquadSetup {
  const template = data.templates.find((t) => t.id === templateId);
  if (!template) throw new BattleSetupError([`modèle inconnu « ${templateId} »`]);
  return {
    id: options.id ?? template.id,
    name: options.name ?? template.name,
    equipment: { ...template.equipment },
    masteries: [...template.masteries],
    cell: options.cell,
    order: options.order,
  };
}
