// Petit lecteur de JSON non typé : chaque fonction lit un champ, vérifie son type
// et note un problème lisible (avec son chemin) au lieu de s'arrêter au premier.
// Quand une valeur est invalide, la fonction renvoie une valeur de repli : le
// chargement échouera de toute façon, puisque la liste des problèmes n'est pas vide.

export type Obj = Record<string, unknown>;

/** Problèmes accumulés pendant la lecture, ex. « items.json › [0].stats.defense : nombre attendu… ». */
export interface Ctx {
  issues: string[];
}

export function report(ctx: Ctx, path: string, message: string): void {
  ctx.issues.push(`${path} : ${message}`);
}

/** Chemin d'un champ : « items.json › stats » à la racine d'un fichier, puis « stats.defense ». */
export function child(path: string, key: string | number): string {
  const part = typeof key === 'number' ? `[${key}]` : key;
  if (!path.includes('›')) return `${path} › ${part}`;
  return typeof key === 'number' ? `${path}${part}` : `${path}.${part}`;
}

function describe(value: unknown): string {
  if (value === undefined) return 'rien (champ manquant)';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'une liste';
  if (typeof value === 'string') return `la chaîne « ${value} »`;
  if (typeof value === 'object') return 'un objet';
  return `${typeof value} ${String(value)}`;
}

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lit un objet et signale toute clé hors de `keys` (une faute de frappe, le plus souvent). */
export function readObject(ctx: Ctx, value: unknown, path: string, keys: readonly string[]): Obj | undefined {
  if (!isObject(value)) {
    report(ctx, path, `objet attendu, reçu ${describe(value)}`);
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) report(ctx, child(path, key), `clé inconnue (clés possibles : ${keys.join(', ')})`);
  }
  return value;
}

/** Lit une liste ; les éléments invalides (undefined) sont écartés. */
export function readList<T>(ctx: Ctx, value: unknown, path: string, item: (v: unknown, p: string) => T | undefined): T[] {
  if (!Array.isArray(value)) {
    report(ctx, path, `liste attendue, reçu ${describe(value)}`);
    return [];
  }
  return value.map((v, i) => item(v, child(path, i))).filter((v): v is T => v !== undefined);
}

export function readArray<T>(ctx: Ctx, obj: Obj, key: string, path: string, item: (v: unknown, p: string) => T | undefined): T[] {
  if (!(key in obj)) {
    report(ctx, child(path, key), 'champ obligatoire manquant');
    return [];
  }
  return readList(ctx, obj[key], child(path, key), item);
}

function checkString(ctx: Ctx, value: unknown, path: string): string {
  if (typeof value !== 'string') {
    report(ctx, path, `chaîne attendue, reçu ${describe(value)}`);
    return '';
  }
  if (value.trim() === '') report(ctx, path, 'chaîne vide');
  return value;
}

export function readString(ctx: Ctx, obj: Obj, key: string, path: string): string {
  if (!(key in obj)) {
    report(ctx, child(path, key), 'champ obligatoire manquant');
    return '';
  }
  return checkString(ctx, obj[key], child(path, key));
}

export function readOptionalString(ctx: Ctx, obj: Obj, key: string, path: string): string | undefined {
  return key in obj ? checkString(ctx, obj[key], child(path, key)) : undefined;
}

export interface NumberRule {
  integer?: boolean;
  min?: number;
  max?: number;
}

/** Vérifie une valeur numérique déjà extraite (utile pour les valeurs d'un dictionnaire). */
export function checkNumber(ctx: Ctx, value: unknown, path: string, rule: NumberRule = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    report(ctx, path, `nombre attendu, reçu ${describe(value)}`);
    return 0;
  }
  if (rule.integer && !Number.isInteger(value)) report(ctx, path, `entier attendu, reçu ${value}`);
  if (rule.min !== undefined && value < rule.min) report(ctx, path, `doit être ≥ ${rule.min}, reçu ${value}`);
  if (rule.max !== undefined && value > rule.max) report(ctx, path, `doit être ≤ ${rule.max}, reçu ${value}`);
  return value;
}

export function readNumber(ctx: Ctx, obj: Obj, key: string, path: string, rule: NumberRule = {}): number {
  if (!(key in obj)) {
    report(ctx, child(path, key), 'champ obligatoire manquant');
    return 0;
  }
  return checkNumber(ctx, obj[key], child(path, key), rule);
}

export function readOptionalNumber(ctx: Ctx, obj: Obj, key: string, path: string, rule: NumberRule = {}): number | undefined {
  return key in obj ? checkNumber(ctx, obj[key], child(path, key), rule) : undefined;
}

function checkBoolean(ctx: Ctx, value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    report(ctx, path, `booléen attendu, reçu ${describe(value)}`);
    return false;
  }
  return value;
}

export function readBoolean(ctx: Ctx, obj: Obj, key: string, path: string): boolean {
  if (!(key in obj)) {
    report(ctx, child(path, key), 'champ obligatoire manquant');
    return false;
  }
  return checkBoolean(ctx, obj[key], child(path, key));
}

export function readOptionalBoolean(ctx: Ctx, obj: Obj, key: string, path: string): boolean | undefined {
  return key in obj ? checkBoolean(ctx, obj[key], child(path, key)) : undefined;
}

export function readEnum<T extends string>(ctx: Ctx, obj: Obj, key: string, path: string, values: readonly T[]): T {
  const fallback = values[0] as T;
  if (!(key in obj)) {
    report(ctx, child(path, key), 'champ obligatoire manquant');
    return fallback;
  }
  const value = obj[key];
  if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T;
  report(ctx, child(path, key), `valeur attendue parmi ${values.join(', ')}, reçu ${describe(value)}`);
  return fallback;
}
