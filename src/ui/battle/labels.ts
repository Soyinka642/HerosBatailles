// Étiquettes des jetons (graphismes provisoires), sans Phaser.

/** Nom court : « Fantassins du portail n°1 » → « Fantassins n°1 ». */
export function shortName(name: string): string {
  return name.replace(' du portail', '');
}

/** Abréviation : deux premières lettres, plus le numéro d'un ennemi (« FA1 »). */
export function abbreviation(name: string): string {
  const number = /n°(\d+)/.exec(name)?.[1] ?? '';
  return name.slice(0, 2).toUpperCase() + number;
}
