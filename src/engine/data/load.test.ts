import { describe, expect, it } from 'vitest';
import { BUNDLED_DATA, DataError, loadGameData, parseGameData, validateGameData } from './load';
import { DATA_FILES, type RawGameData } from './parse';

/** Copie modifiable du contenu livré, pour fabriquer des cas invalides. */
function copy(): RawGameData {
  return structuredClone(BUNDLED_DATA);
}

type Path = readonly (string | number)[];

/** Parent du dernier maillon de `path` dans un JSON brut. */
function parentOf(raw: unknown, path: Path): Record<string | number, unknown> {
  let node = raw;
  for (const key of path.slice(0, -1)) node = (node as Record<string | number, unknown>)[key];
  return node as Record<string | number, unknown>;
}

/** Problèmes signalés après avoir remplacé la valeur au bout de `path`. */
function issuesAfterSet(path: Path, value: unknown): string[] {
  const raw = copy();
  parentOf(raw, path)[path[path.length - 1]!] = value;
  return validateGameData(raw).issues;
}

/** Problèmes signalés après avoir supprimé le champ au bout de `path`. */
function issuesAfterDelete(path: Path): string[] {
  const raw = copy();
  delete parentOf(raw, path)[path[path.length - 1]!];
  return validateGameData(raw).issues;
}

describe('contenu livré', () => {
  it.each(Object.values(DATA_FILES))('%s a une forme valide', (file) => {
    const { issues } = validateGameData(BUNDLED_DATA);
    expect(issues.filter((issue) => issue.startsWith(file))).toEqual([]);
  });

  it('toutes les références entre fichiers existent', () => {
    expect(validateGameData(BUNDLED_DATA).issues).toEqual([]);
  });

  it('se charge et contient le périmètre du prototype', () => {
    const data = loadGameData();
    expect(data.templates.map((t) => t.id)).toEqual(['epeistes', 'archers', 'piquiers']);
    expect(data.masteries.map((m) => m.id)).toEqual(['maitrise-epee', 'maitrise-arc', 'maitrise-pique']);
    expect(data.postures.map((p) => p.id)).toEqual(['tenir', 'avancer', 'assaut']);
    expect(data.keywords.map((k) => k.id)).toEqual(['perce-armure', 'feu', 'charge', 'soutien']);
    expect(data.fortifications.map((f) => f.id)).toEqual(['palissade', 'tour']);
    expect(data.waves.map((w) => w.kind)).toEqual(['wave', 'wave', 'wave', 'wave', 'final']);
  });

  it("le sous-emplacement de l'arc est verrouillé par le forgeron", () => {
    const bow = loadGameData().items.find((item) => item.id === 'arc-court');
    expect(bow?.upgradeSlots).toEqual([{ id: 'fleches', accepts: ['fleches'], unlockedBy: 'forgeron' }]);
  });

  it('le premier tour planifié est disponible dès le début', () => {
    expect(loadGameData().orders.plannedTurnSlots).toEqual([{ id: 'premier-tour' }]);
  });

  it('chaque volée enflammée consomme de la pâte incendiaire', () => {
    const arrows = loadGameData().items.find((item) => item.id === 'fleches-enflammees');
    expect(arrows?.keywords).toEqual([{ id: 'feu', consumes: 'pate-incendiaire' }]);
  });

  it('chaque modèle de départ maîtrise son arme', () => {
    const data = loadGameData();
    for (const template of data.templates) {
      const weapon = data.items.find((item) => item.id === template.equipment['arme']);
      expect(template.masteries).toContain(weapon?.mastery);
    }
  });

  it("aucun ennemi n'emprunte une posture verrouillée", () => {
    const data = loadGameData();
    for (const enemy of data.enemies) expect(data.postures.find((p) => p.id === enemy.posture)?.unlockedBy).toBeUndefined();
  });
});

describe('forme invalide', () => {
  it('rejette un fichier invalide avec un message clair', () => {
    const raw = copy();
    (raw.items as Record<string, unknown>[])[0]!['stats'] = { defense: 'beaucoup' };
    expect(() => parseGameData(raw)).toThrow(DataError);
    expect(() => parseGameData(raw)).toThrow('items.json › [0].stats.defense : nombre attendu, reçu la chaîne « beaucoup »');
  });

  it('signale un champ obligatoire manquant', () => {
    expect(issuesAfterDelete(['templates', 1, 'name'])).toEqual(['templates.json › [1].name : champ obligatoire manquant']);
  });

  it('signale une clé inconnue (faute de frappe)', () => {
    const issues = issuesAfterSet(['postures', 0, 'unlockBy'], 'forgeron');
    expect(issues).toEqual([expect.stringContaining('postures.json › [0].unlockBy : clé inconnue')]);
  });

  it('signale une valeur hors liste', () => {
    const issues = issuesAfterSet(['postures', 1, 'movement'], 'charge');
    expect(issues).toEqual(['postures.json › [1].movement : valeur attendue parmi hold, advance, assault, reçu la chaîne « charge »']);
  });

  it("signale un fichier qui n'est pas une liste", () => {
    expect(issuesAfterSet(['waves'], {})).toEqual(['waves.json : liste attendue, reçu un objet']);
  });

  it('accumule plusieurs problèmes au lieu de s’arrêter au premier', () => {
    const raw = copy();
    parentOf(raw, ['config', 'maxTurns'])['maxTurns'] = 0;
    parentOf(raw, ['config', 'damage', 'formula'])['formula'] = 'racine';
    const { issues } = validateGameData(raw);
    expect(issues).toHaveLength(3); // maxTurns, formula, et ritualTurns > maxTurns
  });

  it('refuse un moral dans les stats de base communes : il vient de la config', () => {
    const issues = issuesAfterSet(['squad', 'stats', 'morale'], 10);
    expect(issues).toEqual([expect.stringContaining('squad.json › stats.morale : clé inconnue')]);
  });

  it('exige le moral des ennemis', () => {
    expect(issuesAfterDelete(['enemies', 0, 'stats', 'morale'])).toEqual(['enemies.json › [0].stats.morale : champ obligatoire manquant']);
  });

  it('exige une maîtrise pour une arme, et seulement pour une arme', () => {
    expect(issuesAfterDelete(['items', 0, 'mastery'])).toEqual(['items.json › [0].mastery : obligatoire pour une arme']);
    expect(issuesAfterSet(['items', 4, 'mastery'], 'maitrise-epee')).toEqual(['items.json › [4].mastery : réservé aux armes']);
  });

  it('exige une capacité pour une fortification à occuper', () => {
    const issues = issuesAfterDelete(['fortifications', 1, 'capacity']);
    expect(issues).toEqual(['fortifications.json › [1].capacity : obligatoire pour une fortification à occuper']);
  });

  it("réserve les occupants aux fortifications à occuper", () => {
    const issues = issuesAfterSet(['fortifications', 0, 'occupants'], 'ranged');
    expect(issues).toEqual(['fortifications.json › [0].occupants : réservé aux fortifications à occuper']);
  });

  it('refuse des points de structure nuls', () => {
    const issues = issuesAfterSet(['fortifications', 0, 'structure'], 0);
    expect(issues).toEqual(['fortifications.json › [0].structure : doit être ≥ 1, reçu 0']);
  });

  it('refuse des paliers de moral inversés', () => {
    const issues = issuesAfterSet(['config', 'morale', 'waveringBelow'], 0.9);
    expect(issues).toEqual(['config.json › morale : waveringBelow doit être ≤ shakenBelow']);
  });

  it('refuse un rituel plus long que la limite de tours', () => {
    const issues = issuesAfterSet(['config', 'finalBattle', 'ritualTurns'], 31);
    expect(issues).toEqual(['config.json › finalBattle : ritualTurns doit être ≤ maxTurns']);
  });

  it('refuse une brûlure sans durée', () => {
    const issues = issuesAfterDelete(['keywords', 1, 'effects', 1, 'action', 'turns']);
    expect(issues).toEqual(['keywords.json › [1].effects[1].action.turns : champ obligatoire manquant']);
  });
});

describe('références invalides', () => {
  it('signale un mot-clé inconnu', () => {
    const issues = issuesAfterSet(['items', 3, 'keywords', 0, 'id'], 'glace');
    expect(issues).toEqual(['items.json › [3].keywords[0].id : mot-clé inconnu « glace »']);
  });

  it('exige la valeur x de Perce-armure, et seulement là', () => {
    expect(issuesAfterDelete(['enemies', 2, 'keywords', 0, 'x'])).toEqual(['enemies.json › [2].keywords[0] : « perce-armure » demande une valeur x']);
    expect(issuesAfterSet(['items', 3, 'keywords', 0, 'x'], 2)).toEqual(["items.json › [3].keywords[0].x : « feu » n'a pas de paramètre x"]);
  });

  it('signale un consommable inconnu', () => {
    const issues = issuesAfterSet(['items', 3, 'keywords', 0, 'consumes'], 'poix');
    expect(issues).toEqual(['items.json › [3].keywords[0].consumes : ressource consommable inconnue « poix »']);
  });

  it('signale une maîtrise inconnue', () => {
    expect(issuesAfterSet(['items', 0, 'mastery'], 'maitrise-hache')).toEqual(['items.json › [0].mastery : maîtrise inconnue « maitrise-hache »']);
    expect(issuesAfterSet(['templates', 0, 'masteries', 0], 'maitrise-hache')).toEqual([
      'templates.json › [0].masteries[0] : maîtrise inconnue « maitrise-hache »',
    ]);
  });

  it('signale un déblocage inconnu', () => {
    expect(issuesAfterSet(['items', 1, 'upgradeSlots', 0, 'unlockedBy'], 'forgeur')).toEqual([
      'items.json › [1].upgradeSlots[0].unlockedBy : déblocage inconnu « forgeur »',
    ]);
    expect(issuesAfterSet(['orders', 'plannedTurnSlots', 0, 'unlockedBy'], 'veteran')).toEqual([
      'orders.json › plannedTurnSlots[0].unlockedBy : déblocage inconnu « veteran »',
    ]);
  });

  it("signale un emplacement qui n'accepte aucune catégorie existante", () => {
    const issues = issuesAfterSet(['squad', 'slots', 1, 'accepts'], ['bouclier']);
    expect(issues).toContain('squad.json › slots[1].accepts[0] : aucun objet de catégorie « bouclier »');
  });

  it('signale un équipement de départ inconnu ou mal placé', () => {
    expect(issuesAfterSet(['templates', 0, 'equipment', 'arme'], 'hache')).toEqual(['templates.json › [0].equipment.arme : objet inconnu « hache »']);
    expect(issuesAfterSet(['templates', 0, 'equipment', 'arme'], 'cuir')).toEqual([
      'templates.json › [0].equipment.arme : « cuir » (catégorie armure) ne va pas dans « arme » (accepte epee, arc, pique)',
    ]);
    expect(issuesAfterSet(['templates', 0, 'equipment', 'monture'], 'cuir')).toEqual([
      'templates.json › [0].equipment.monture : emplacement inconnu « monture » (voir squad.json)',
    ]);
  });

  it("signale la posture inconnue d'un ennemi", () => {
    expect(issuesAfterSet(['enemies', 0, 'posture'], 'fuir')).toEqual(['enemies.json › [0].posture : posture inconnue « fuir »']);
  });

  it('signale un ennemi inconnu dans une vague', () => {
    const issues = issuesAfterSet(['waves', 0, 'arrivals', 0, 'enemy'], 'dragons');
    expect(issues).toEqual(['waves.json › [0].arrivals[0].enemy : ennemi inconnu « dragons »']);
  });

  it('signale une fortification inconnue ou hors du terrain', () => {
    expect(issuesAfterSet(['battlefield', 'fortificationSites', 0, 'fortification'], 'fosse')).toEqual([
      'battlefield.json › fortificationSites[0].fortification : fortification inconnue « fosse »',
    ]);
    expect(issuesAfterSet(['battlefield', 'fortificationSites', 0, 'cell', 'col'], 12)).toEqual([
      'battlefield.json › fortificationSites[0].cell : case (12,2) hors du terrain',
    ]);
  });

  it('signale un id en double', () => {
    expect(issuesAfterSet(['templates', 2, 'id'], 'archers')).toEqual(['templates.json › [2].id : id « archers » en double']);
  });

  it('signale un id de site de fortification en double', () => {
    expect(issuesAfterSet(['battlefield', 'fortificationSites', 2, 'id'], 'palissade-nord')).toEqual([
      'battlefield.json › fortificationSites[2].id : id « palissade-nord » en double',
    ]);
  });

  it('signale des vagues mal numérotées', () => {
    const issues = issuesAfterSet(['waves', 1, 'index'], 3);
    expect(issues).toEqual(["waves.json › [1].index : les vagues doivent être numérotées 1, 2, 3… dans l'ordre : 2 attendu, reçu 3"]);
  });

  it('exige une seule bataille finale, en dernier', () => {
    expect(issuesAfterSet(['waves', 4, 'kind'], 'wave')).toEqual(['waves.json : aucune bataille finale (kind « final »)']);
    expect(issuesAfterSet(['waves', 3, 'kind'], 'final')).toEqual(['waves.json › [3].kind : la bataille finale doit être la dernière, et la seule']);
  });

  it("refuse un montant « X » dans un mot-clé sans paramètre", () => {
    const issues = issuesAfterSet(['keywords', 1, 'effects', 0, 'action', 'amount'], 'X');
    expect(issues).toEqual(["keywords.json › [1].effects[0].action : montant « X » alors que le mot-clé n'a pas de paramètre"]);
  });
});
