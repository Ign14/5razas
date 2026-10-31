import { describe, expect, it } from 'vitest';
import { PlayerCharacter } from '../../src/core/character/playerCharacter.ts';
import { DataValidationError } from '../../src/core/data/validate.ts';
import { Inventory } from '../../src/core/items/inventory.ts';
import { parseItemCatalog } from '../../src/core/items/itemCatalog.ts';
import { rollLoot } from '../../src/core/items/lootTables.ts';
import { DROP_LIFETIME, DropField } from '../../src/core/items/worldDrops.ts';
import { createRng } from '../../src/core/math/random.ts';
import { totalXpForLevel } from '../../src/core/progression/progression.ts';
import { fixedRng, loadTestContent, makeCombatant, openField } from './helpers.ts';

const content = loadTestContent();
const { items } = content;

function newCharacter(capacity = 10) {
  return new PlayerCharacter({
    profession: content.profession,
    abilities: content.abilities,
    items,
    sets: content.sets,
    progression: content.progression,
    inventoryCapacity: capacity,
  });
}

describe('catálogo de objetos', () => {
  it('carga los dos conjuntos completos del MVP', () => {
    for (const set of content.sets.all.values()) {
      const slots = set.pieces.map((id) => items.get(id).equip?.slot);
      expect(new Set(slots).size).toBe(set.pieces.length);
    }
    expect([...content.sets.all.values()].map((s) => s.minLevel)).toEqual([1, 12]);
  });

  it('rechaza equipo apilable, armaduras en ranuras de arma y consumibles sin efecto', () => {
    const bad = {
      items: [
        { id: 'a', name: 'A', description: 'x', category: 'armor', rarity: 'common', maxStack: 5, icon: { shape: 'helm', color: '#000000' },
          equip: { slot: 'weapon', levelRequirement: 1, setId: null, modifiers: [] }, use: null },
        { id: 'b', name: 'B', description: 'x', category: 'consumable', rarity: 'common', maxStack: 5, icon: { shape: 'potion', color: '#000000' },
          equip: null, use: null },
      ],
    };
    try {
      parseItemCatalog(bad, 'bad');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      const msg = (e as DataValidationError).issues.join('\n');
      expect(msg).toContain('no puede ir en "weapon"');
      expect(msg).toContain('no se apila');
      expect(msg).toContain('los consumibles necesitan "use"');
    }
  });
});

describe('Inventario', () => {
  it('apila hasta maxStack y luego usa ranuras nuevas', () => {
    const inv = new Inventory(3, items);
    expect(inv.add('tonico-vital', 25)).toBe(0);
    expect(inv.contents.map((s) => s?.quantity)).toEqual([20, 5, undefined]);
    expect(inv.count('tonico-vital')).toBe(25);
  });

  it('devuelve lo que no cabe y no pierde objetos', () => {
    const inv = new Inventory(2, items);
    inv.add('peto-de-corteza', 1);
    expect(inv.add('yelmo-de-corteza', 3)).toBe(2);
    expect(inv.spaceFor('tonico-vital')).toBe(0);
  });

  it('quitar es atómico: falla sin cambios si faltan unidades', () => {
    const inv = new Inventory(3, items);
    inv.add('espina-dura', 5);
    expect(inv.remove('espina-dura', 6)).toBe(false);
    expect(inv.count('espina-dura')).toBe(5);
    expect(inv.remove('espina-dura', 5)).toBe(true);
    expect(inv.contents.every((s) => s === null)).toBe(true);
  });

  it('intercambia ranuras', () => {
    const inv = new Inventory(3, items);
    inv.add('espina-dura', 1);
    inv.swap(0, 2);
    expect(inv.at(0)).toBeNull();
    expect(inv.at(2)?.itemId).toBe('espina-dura');
  });
});

describe('Equipamiento', () => {
  it('equipar mueve la pieza anterior al inventario y aplica sus atributos', () => {
    const c = newCharacter();
    const base = c.computeStats();
    c.inventory.add('hoja-de-corteza', 1);
    expect(c.equipFromInventory(0)).toEqual({ ok: true });
    expect(c.computeStats().attack).toBe(base.attack + 4);
    expect(c.inventory.at(0)).toBeNull();
    c.inventory.add('hoja-de-corteza', 1);
    c.equipFromInventory(0);
    expect(c.inventory.count('hoja-de-corteza')).toBe(1);
  });

  it('respeta el requisito de nivel', () => {
    const c = newCharacter();
    c.inventory.add('peto-de-raiz', 1);
    expect(c.equipFromInventory(0)).toEqual({ ok: false, reason: 'level' });
    c.addXp(totalXpForLevel(content.progression, 12));
    expect(c.equipFromInventory(0)).toEqual({ ok: true });
  });

  it('activa las bonificaciones de conjunto según las piezas equipadas', () => {
    const c = newCharacter();
    const pieces = content.sets.get('corteza').pieces;
    for (const id of pieces) c.inventory.add(id, 1);
    const at = (n: number) => {
      const fresh = newCharacter();
      for (const id of pieces.slice(0, n)) {
        fresh.inventory.add(id, 1);
        fresh.equipFromInventory(0);
      }
      return fresh;
    };
    expect(at(1).equipment.activeSets()[0]?.activeThresholds).toEqual([]);
    expect(at(2).equipment.activeSets()[0]?.activeThresholds).toEqual([2]);
    const full = at(5);
    expect(full.equipment.activeSets()[0]).toMatchObject({ equipped: 5, total: 5, activeThresholds: [2, 3, 5] });
    const base = newCharacter().computeStats();
    const s = full.computeStats();
    // Vida: (base + 10 + 20 + 10) × 1,06 ; Ataque: (base + 4) × 1,08
    expect(s.life).toBeCloseTo((base.life + 40) * 1.06);
    expect(s.attack).toBeCloseTo((base.attack + 4) * 1.08);
    expect(s.resistance).toBe(base.resistance + 4);
  });

  it('desequipar requiere espacio en el inventario', () => {
    const c = newCharacter(1);
    c.inventory.add('hoja-de-corteza', 1);
    c.equipFromInventory(0);
    c.inventory.add('espina-dura', 1);
    expect(c.unequip('weapon')).toEqual({ ok: false, reason: 'inventory-full' });
    c.inventory.remove('espina-dura', 1);
    expect(c.unequip('weapon')).toEqual({ ok: true });
    expect(c.equipment.get('weapon')).toBeNull();
  });
});

describe('Consumibles', () => {
  it('curan, consumen una unidad y comparten recuperación', () => {
    const c = newCharacter();
    c.inventory.add('tonico-vital', 2);
    c.inventory.add('tonico-energia', 1);
    const p = makeCombatant({ id: 'p', team: 'player' });
    p.hp = 10;
    p.energy = 10;
    expect(c.useItem('tonico-vital', p, 0)).toEqual({ ok: true });
    expect(p.hp).toBe(55);
    expect(c.inventory.count('tonico-vital')).toBe(1);
    expect(c.useItem('tonico-energia', p, 1)).toEqual({ ok: false, reason: 'cooldown' });
    expect(c.useItem('tonico-energia', p, 7)).toEqual({ ok: true });
    expect(p.energy).toBe(50);
  });

  it('no se gastan si no tendrían efecto', () => {
    const c = newCharacter();
    c.inventory.add('tonico-vital', 1);
    const p = makeCombatant({ id: 'p', team: 'player' });
    expect(c.useItem('tonico-vital', p, 0)).toEqual({ ok: false, reason: 'no-effect' });
    expect(c.inventory.count('tonico-vital')).toBe(1);
    expect(c.useItem('espina-dura', p, 0)).toEqual({ ok: false, reason: 'missing' });
  });

  it('ranuras rápidas: solo consumibles, sin duplicados', () => {
    const c = newCharacter();
    expect(c.assignQuickSlot(0, 'tonico-vital').ok).toBe(true);
    expect(c.assignQuickSlot(1, 'tonico-vital').ok).toBe(true);
    expect(c.quickSlots).toEqual([null, 'tonico-vital']);
    expect(c.assignQuickSlot(0, 'espina-dura')).toEqual({ ok: false, reason: 'not-usable' });
  });
});

describe('Botín y objetos en el suelo', () => {
  const table = content.lootTables.get('thorn-sprout-common');

  it('las tiradas son deterministas y respetan las probabilidades', () => {
    expect(rollLoot(table, createRng(5))).toEqual(rollLoot(table, createRng(5)));
    expect(rollLoot(table, fixedRng(0.999))).toEqual([]);
    expect(rollLoot(table, fixedRng(0)).length).toBe(table.entries.length);
    // Frecuencia aproximada de la entrada principal (70 %).
    const rng = createRng(9);
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (rollLoot(table, rng).some((d) => d.itemId === 'espina-dura')) hits++;
    expect(hits / 2000).toBeGreaterThan(0.65);
    expect(hits / 2000).toBeLessThan(0.75);
  });

  it('se recogen al pasar cerca, se conservan si no caben y caducan', () => {
    const field = new DropField();
    const inv = new Inventory(1, items);
    inv.add('peto-de-corteza', 1);
    const d = field.spawn('espina-dura', 2, { x: 10, y: 10 }, 0, openField, createRng(1));
    expect(field.collect({ x: 20, y: 20 }, inv).collected).toEqual([]);
    const full = field.collect(d.position, inv);
    expect(full.blocked).toHaveLength(1);
    expect(field.size).toBe(1);
    inv.remove('peto-de-corteza', 1);
    const ok = field.collect(d.position, inv);
    expect(ok.collected[0]).toMatchObject({ itemId: 'espina-dura', quantity: 2 });
    expect(field.size).toBe(0);
    field.spawn('espina-dura', 1, { x: 10, y: 10 }, 0, openField, createRng(1));
    expect(field.expire(DROP_LIFETIME - 1)).toHaveLength(0);
    expect(field.expire(DROP_LIFETIME)).toHaveLength(1);
  });
});
