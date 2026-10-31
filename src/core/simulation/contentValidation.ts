import type { SimulationContent } from './worldSimulation.ts';

/** Comprueba referencias cruzadas entre los archivos de contenido. */
export function validateContentReferences(content: SimulationContent): string[] {
  const problems: string[] = [];
  const { abilities, statuses, creatures, profession, character, map, items, sets, lootTables } = content;
  const needItem = (where: string, id: string) => {
    if (!items.all.has(id)) problems.push(`${where}: objeto "${id}" inexistente`);
  };
  if (character.professionId !== profession.id)
    problems.push(`El personaje usa la profesión "${character.professionId}" pero se cargó "${profession.id}"`);
  for (const [slot, id] of Object.entries(profession.abilities)) {
    if (!abilities.all.has(id)) problems.push(`Profesión ${profession.id}.${slot}: habilidad "${id}" inexistente`);
  }
  for (const a of abilities.all.values()) {
    if (a.applyStatus && !statuses.all.has(a.applyStatus.statusId))
      problems.push(`Habilidad ${a.id}: estado "${a.applyStatus.statusId}" inexistente`);
  }
  for (const c of creatures.all.values()) {
    for (const id of c.abilities) if (!abilities.all.has(id)) problems.push(`Criatura ${c.id}: habilidad "${id}" inexistente`);
    if (!lootTables.all.has(c.lootTable)) problems.push(`Criatura ${c.id}: tabla de botín "${c.lootTable}" inexistente`);
  }
  for (const t of lootTables.all.values()) for (const e of t.entries) needItem(`Botín ${t.id}`, e.itemId);
  for (const set of sets.all.values()) {
    for (const id of set.pieces) {
      needItem(`Conjunto ${set.id}`, id);
      const setId = items.all.get(id)?.equip?.setId;
      if (items.all.has(id) && setId !== set.id) problems.push(`Conjunto ${set.id}: la pieza "${id}" declara setId "${String(setId)}"`);
    }
  }
  for (const it of items.all.values()) {
    const setId = it.equip?.setId;
    if (setId && !sets.all.get(setId)?.pieces.includes(it.id)) problems.push(`Objeto ${it.id}: no figura en el conjunto "${setId}"`);
  }
  for (const it of character.startingItems) needItem('Personaje (startingItems)', it.itemId);
  for (const id of character.startingEquipment) {
    needItem('Personaje (startingEquipment)', id);
    if (items.all.has(id) && !items.get(id).equip) problems.push(`Personaje: "${id}" no es equipable`);
  }
  for (const id of character.startingQuickSlots) if (id) needItem('Personaje (startingQuickSlots)', id);
  const tiles = map.catalog.tiles;
  for (const c of creatures.all.values()) {
    for (const t of c.habitat) if (!tiles.has(t)) problems.push(`Criatura ${c.id}: hábitat "${t}" no es un tile conocido`);
  }
  for (const pl of content.plants.all.values()) {
    needItem(`Planta ${pl.id}`, pl.itemId);
    if (items.all.has(pl.itemId) && items.get(pl.itemId).category !== 'ingredient')
      problems.push(`Planta ${pl.id}: el objeto "${pl.itemId}" debe ser un ingrediente`);
    for (const t of pl.conditions.terrain) if (!tiles.has(t)) problems.push(`Planta ${pl.id}: terreno "${t}" no es un tile conocido`);
    for (const other of pl.compatibilities) {
      if (!content.plants.all.has(other)) problems.push(`Planta ${pl.id}: compatibilidad "${other}" inexistente`);
    }
  }
  const { recipes, elements } = content;
  needItem('Alquimia (resultado fallido)', recipes.config.failedResult.itemId);
  for (const r of recipes.recipes.values()) {
    for (const i of r.ingredients) needItem(`Receta ${r.id}`, i.itemId);
    needItem(`Receta ${r.id} (resultado)`, r.result.itemId);
  }
  for (const e of elements.all.values()) {
    if (e.onHit && !statuses.all.has(e.onHit.statusId)) problems.push(`Elemento ${e.id}: estado "${e.onHit.statusId}" inexistente`);
  }
  for (const it of items.all.values()) {
    for (const ef of it.use?.effects ?? []) {
      if (ef.kind === 'applyStatus' && !statuses.all.has(ef.statusId)) problems.push(`Objeto ${it.id}: estado "${ef.statusId}" inexistente`);
      if (ef.kind === 'infusion' && !elements.all.has(ef.elementId)) problems.push(`Objeto ${it.id}: elemento "${ef.elementId}" inexistente`);
    }
  }
  const { quests, narrative } = content;
  for (const q of quests.all.values()) {
    if (!narrative.npcs.has(q.giver)) problems.push(`Misión ${q.id}: PNJ "${q.giver}" inexistente`);
    for (const r of q.rewards.items) needItem(`Misión ${q.id} (recompensa)`, r.itemId);
    for (const o of q.objectives) {
      const t = o.target;
      if (t === null) continue;
      const ok =
        o.type === 'defeat' ? creatures.all.has(t) : o.type === 'gather' ? content.plants.all.has(t) : o.type === 'discover' ? recipes.recipes.has(t) : items.all.has(t);
      if (!ok) problems.push(`Misión ${q.id}, objetivo ${o.id}: "${t}" inexistente`);
    }
  }
  for (const d of narrative.dialogues.values()) {
    for (const o of d.options) {
      if ((o.action.type === 'accept' || o.action.type === 'turn-in') && !quests.all.has(o.action.questId))
        problems.push(`Diálogo ${d.id}: misión "${o.action.questId}" inexistente`);
    }
  }
  for (const n of narrative.npcs.values()) {
    for (const r of n.dialogue) if (r.when && !quests.all.has(r.when.quest)) problems.push(`PNJ ${n.id}: misión "${r.when.quest}" inexistente`);
  }
  for (const n of map.npcs) if (!narrative.npcs.has(n.npcId)) problems.push(`Mapa ${map.id}: PNJ "${n.npcId}" inexistente`);
  for (const c of creatures.all.values()) {
    for (const ph of c.boss?.phases ?? []) {
      for (const id of ph.abilities) if (!abilities.all.has(id)) problems.push(`Jefe ${c.id}, fase ${ph.name}: habilidad "${id}" inexistente`);
    }
  }
  for (const z of map.gatherZones) {
    if (!content.plants.all.has(z.plantId)) problems.push(`Mapa ${map.id}, zona ${z.id}: planta "${z.plantId}" inexistente`);
  }
  for (const z of map.spawnZones) {
    if (!creatures.all.has(z.creatureId)) problems.push(`Mapa ${map.id}, zona ${z.id}: criatura "${z.creatureId}" inexistente`);
  }
  return problems;
}
