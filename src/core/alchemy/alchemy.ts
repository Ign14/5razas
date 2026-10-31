import { ID_PATTERN, Issues } from '../data/validate.ts';
import type { AlchemyElement, PlantCatalog } from '../ecosystem/plants.ts';

/** Unidades de un ingrediente dentro de una combinación. */
export interface IngredientStack {
  readonly itemId: string;
  readonly quantity: number;
}

/** Receta de alquimia o preparación (GAME_DESIGN §10.2 y §10.4). Siempre es un registro de datos. */
export interface RecipeDefinition {
  readonly id: string;
  readonly name: string;
  readonly ingredients: readonly IngredientStack[];
  readonly result: IngredientStack;
  /** Experiencia al descubrirla por primera vez. */
  readonly discoveryXp: number;
}

export interface AlchemyConfig {
  /** Máximo de unidades que admite el mortero en una combinación. */
  readonly maxUnits: number;
  /** Resultado menor de una combinación inválida (§10.5: consume materiales sin bloquear el progreso). */
  readonly failedResult: IngredientStack;
}

export interface RecipeBook {
  readonly config: AlchemyConfig;
  readonly recipes: ReadonlyMap<string, RecipeDefinition>;
  /** Busca la receta que corresponde exactamente a una combinación (sin importar el orden). */
  find(ingredients: readonly IngredientStack[]): RecipeDefinition | null;
}

/**
 * Clave canónica de una combinación: ingredientes agrupados y ordenados.
 * El motor no tiene condicionales por combinación: solo busca esta clave en un índice.
 */
export function combinationKey(ingredients: readonly IngredientStack[]): string {
  const totals = new Map<string, number>();
  for (const i of ingredients) totals.set(i.itemId, (totals.get(i.itemId) ?? 0) + i.quantity);
  return [...totals]
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, q]) => `${id}*${q}`)
    .join('+');
}

export function totalUnits(ingredients: readonly IngredientStack[]): number {
  return ingredients.reduce((n, i) => n + i.quantity, 0);
}

function parseStack(issues: Issues, raw: unknown, path: string): IngredientStack | undefined {
  const r = issues.record(raw, path);
  if (!r) return undefined;
  const itemId = issues.string(r['itemId'], `${path}.itemId`, { pattern: ID_PATTERN });
  const quantity = issues.number(r['quantity'], `${path}.quantity`, { integer: true, min: 1, max: 99 });
  return itemId && quantity !== undefined ? { itemId, quantity } : undefined;
}

export function parseRecipeBook(raw: unknown, source: string): RecipeBook {
  const issues = new Issues();
  const root = issues.record(raw, '$') ?? {};
  const cfgRaw = issues.record(root['config'], '$.config') ?? {};
  const maxUnits = issues.number(cfgRaw['maxUnits'], '$.config.maxUnits', { integer: true, min: 2, max: 8 }) ?? 4;
  const failedResult = parseStack(issues, cfgRaw['failedResult'], '$.config.failedResult');

  const recipes = new Map<string, RecipeDefinition>();
  const byKey = new Map<string, RecipeDefinition>();
  issues.array(root['recipes'], '$.recipes')?.forEach((entry, i) => {
    const p = `$.recipes[${i}]`;
    const r = issues.record(entry, p);
    if (!r) return;
    const before = issues.count;
    const ingredients = (issues.array(r['ingredients'], `${p}.ingredients`) ?? []).flatMap((x, j) => {
      const s = parseStack(issues, x, `${p}.ingredients[${j}]`);
      return s ? [s] : [];
    });
    const units = totalUnits(ingredients);
    if (units < 2) issues.add(`${p}.ingredients`, 'una combinación necesita al menos dos unidades');
    if (units > maxUnits) issues.add(`${p}.ingredients`, `supera el máximo de ${maxUnits} unidades`);
    const def = {
      id: issues.string(r['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(r['name'], `${p}.name`),
      ingredients,
      result: parseStack(issues, r['result'], `${p}.result`),
      discoveryXp: issues.number(r['discoveryXp'], `${p}.discoveryXp`, { integer: true, min: 0, max: 10_000 }),
    };
    if (def.id && recipes.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    const key = combinationKey(ingredients);
    const clash = byKey.get(key);
    if (clash) issues.add(`${p}.ingredients`, `la misma combinación ya produce "${clash.id}"`);
    if (issues.count === before) {
      const recipe = def as RecipeDefinition;
      recipes.set(recipe.id, recipe);
      byKey.set(key, recipe);
    }
  });
  issues.throwIfAny(source);
  return {
    config: { maxUnits, failedResult: failedResult as IngredientStack },
    recipes,
    find: (ingredients) => byKey.get(combinationKey(ingredients)) ?? null,
  };
}

/**
 * Propiedades alquímicas combinadas de los ingredientes (suma de potencias por elemento),
 * ordenadas de mayor a menor. Sirve como pista al experimentar.
 */
export function combinedProperties(
  ingredients: readonly IngredientStack[],
  plants: PlantCatalog,
): { element: AlchemyElement; potency: number }[] {
  const byItem = new Map([...plants.all.values()].map((p) => [p.itemId, p]));
  const totals = new Map<AlchemyElement, number>();
  for (const ing of ingredients) {
    for (const prop of byItem.get(ing.itemId)?.properties ?? []) {
      totals.set(prop.element, (totals.get(prop.element) ?? 0) + prop.potency * ing.quantity);
    }
  }
  return [...totals].map(([element, potency]) => ({ element, potency })).sort((a, b) => b.potency - a.potency);
}

/** Libro de descubrimientos del jugador (§10.5). Serializable para el guardado. */
export class DiscoveryBook {
  private readonly discovered = new Set<string>();

  has(recipeId: string): boolean {
    return this.discovered.has(recipeId);
  }

  /** Registra la receta; devuelve true si es un descubrimiento nuevo. */
  record(recipeId: string): boolean {
    if (this.discovered.has(recipeId)) return false;
    this.discovered.add(recipeId);
    return true;
  }

  get size(): number {
    return this.discovered.size;
  }

  toJSON(): string[] {
    return [...this.discovered];
  }
}
