/**
 * Banco de balance del jefe (no forma parte de las pruebas normales). Uso: npm run balance
 *
 * Un bot sencillo (no esquiva telegrafías: estimación conservadora) se enfrenta al Centinela con
 * equipo inicial, 5 Tónicos vitales y las habilidades de su nivel, para varios niveles y semillas.
 */
import { test } from 'vitest';
import { cellToScreen } from '../../src/core/math/iso.ts';
import { normalize, sub } from '../../src/core/math/vector.ts';
import { totalXpForLevel } from '../../src/core/progression/progression.ts';
import { WorldSimulation, type PlayerCommand } from '../../src/core/simulation/worldSimulation.ts';
import { loadTestContent } from '../unit/helpers.ts';

const content = loadTestContent();
const DT = 1 / 30;
const LIMIT = 240;

function fight(level: number, seed: number) {
  const sim = new WorldSimulation(content, seed);
  sim.addXp(totalXpForLevel(content.progression, level));
  sim.character.inventory.add('tonico-vital', 2); // 3 iniciales + 2 de la primera misión
  const boss = [...sim.creatures.values()].find((c) => c.def.category === 'boss');
  if (!boss) throw new Error('sin jefe');
  sim.player.position = { x: boss.combatant.position.x - 3, y: boss.combatant.position.y };
  sim.player.hp = sim.player.stats.life;
  const potionsBefore = sim.character.inventory.count('tonico-vital');
  let deaths = 0;
  let t = 0;
  for (; t < LIMIT && sim.creatures.has(boss.id); t += DT) {
    const p = sim.player;
    if (!p.alive) {
      deaths++;
      break;
    }
    const toBoss = sub(boss.combatant.position, p.position);
    const dist = Math.hypot(toBoss.x, toBoss.y);
    const ready = (slot: 'power1' | 'power2' | 'power3' | 'final') => {
      const a = sim.abilityFor(slot);
      return p.level >= a.unlockLevel && p.cooldownRemaining(a.id, sim.time) === 0 && p.energy >= a.energyCost;
    };
    let action: PlayerCommand['action'] = 'basic';
    let pressed = false;
    if (p.hp < p.stats.life * 0.6 && ready('power3')) [action, pressed] = ['power3', true];
    else if (ready('final') && dist < 3) [action, pressed] = ['final', true];
    else if (ready('power2') && dist < 2) [action, pressed] = ['power2', true];
    else if (ready('power1') && dist < 3.5) [action, pressed] = ['power1', true];
    const screen = cellToScreen(normalize(toBoss));
    const move = dist > 1.6 ? normalize({ x: screen.x, y: screen.y * 2 }) : { x: 0, y: 0 };
    const quickSlot = p.hp < p.stats.life * 0.4 && sim.character.inventory.count('tonico-vital') > 0 ? 0 : null;
    sim.update(DT, { move, aim: toBoss, action, pressed, quickSlot, interact: false });
  }
  return {
    won: !sim.creatures.has(boss.id),
    seconds: Math.round(t),
    bossHpLeft: Math.round(sim.creatures.has(boss.id) ? boss.combatant.hp : 0),
    potions: potionsBefore - sim.character.inventory.count('tonico-vital'),
    deaths,
  };
}

test('balance del Centinela de las Raíces', () => {
  const rows: string[] = [];
  for (const level of [4, 5, 6, 7, 8]) {
    const runs = [1, 2, 3, 4, 5, 6].map((s) => fight(level, s));
    const wins = runs.filter((r) => r.won);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    rows.push(
      `Nivel ${level}: victorias ${wins.length}/${runs.length} · duración media (victorias) ${avg(wins.map((r) => r.seconds))} s · ` +
        `tónicos usados ${avg(runs.map((r) => r.potions))} · vida restante del jefe (derrotas) ${avg(runs.filter((r) => !r.won).map((r) => r.bossHpLeft))}`,
    );
  }
  console.log(`\nBALANCE\n${rows.join('\n')}`);
}, 120_000);
