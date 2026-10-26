// Hasard d'apparence, déterministe : la même case donne toujours les mêmes touffes et cailloux.
// Jamais Math.random : l'image d'une bataille ne change pas d'un affichage à l'autre.

/** Un nombre dans [0, 1) tiré des entiers donnés. */
export function hash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return (h >>> 0) / 0x100000000;
}

/** Un code entier stable pour une chaîne (id de site…). */
export function code(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h, 31) + text.charCodeAt(i);
  return h | 0;
}
