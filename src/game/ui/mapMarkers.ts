import type { Vec2 } from '../../core/math/vector.ts';
import { npcQuestIndicator, type NarrativeCatalog } from '../../core/narrative/dialogue.ts';
import type { GameSession } from '../session.ts';

export type MarkerKind = 'npc' | 'npc-quest' | 'objective' | 'boss';

export interface MapMarker {
  readonly kind: MarkerKind;
  /** Posición en celdas. */
  readonly at: Vec2;
}

export const MARKER_COLORS: Readonly<Record<MarkerKind, number>> = {
  npc: 0xe8c872,
  'npc-quest': 0xffd84a,
  objective: 0x6fd3ff,
  boss: 0xb04aff,
};

/**
 * Marcadores del minimapa y del mapa ampliado (GAME_DESIGN §3.4): PNJ importantes, objetivos de
 * las misiones activas y enemigos especiales ya detectados. Solo se muestra lo que el jugador
 * ha explorado, salvo los objetivos de misión (que el PNJ le indicó).
 */
export function computeMarkers(session: GameSession, narrative: NarrativeCatalog): MapMarker[] {
  const { sim, map, exploration } = session;
  const seen = (p: Vec2) => exploration.isExplored(Math.floor(p.x), Math.floor(p.y));
  const markers: MapMarker[] = [];
  for (const n of map.npcs) {
    const def = narrative.npcs.get(n.npcId);
    markers.push({ kind: def && npcQuestIndicator(def, sim.quests) ? 'npc-quest' : 'npc', at: n.position });
  }
  for (const q of sim.quests.active()) {
    if (sim.quests.status(q.id) !== 'active') continue;
    for (const o of q.objectives) {
      if (sim.quests.progress(q.id, o.id) >= o.count || o.target === null) continue;
      if (o.type === 'defeat') for (const z of map.spawnZones) if (z.creatureId === o.target) markers.push({ kind: 'objective', at: z.center });
      if (o.type === 'gather') for (const z of map.gatherZones) if (z.plantId === o.target) markers.push({ kind: 'objective', at: z.center });
    }
  }
  for (const c of sim.creatures.values()) {
    if (c.boss && seen(c.combatant.position)) markers.push({ kind: 'boss', at: c.combatant.position });
  }
  return markers;
}
