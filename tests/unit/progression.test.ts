import { describe, expect, it } from 'vitest';
import { PlayerCharacter } from '../../src/core/character/playerCharacter.ts';
import {
  creatureXp,
  levelForTotalXp,
  stageFor,
  statsAtLevel,
  totalXpForLevel,
  xpToNext,
} from '../../src/core/progression/progression.ts';
import { loadTestContent } from './helpers.ts';

const content = loadTestContent();
const cfg = content.progression;

function newCharacter() {
  return new PlayerCharacter({
    profession: content.profession,
    abilities: content.abilities,
    items: content.items,
    sets: content.sets,
    progression: cfg,
    inventoryCapacity: 10,
  });
}

describe('curva de experiencia', () => {
  it('sigue la fórmula configurada y es creciente', () => {
    expect(xpToNext(cfg, 1)).toBe(cfg.curve.base);
    for (let l = 1; l < 99; l++) expect(xpToNext(cfg, l + 1)).toBeGreaterThan(xpToNext(cfg, l));
    expect(xpToNext(cfg, 100)).toBe(Infinity);
  });

  it('nivel y XP total son coherentes en ambos sentidos', () => {
    for (const level of [1, 2, 5, 22, 40, 99, 100]) {
      const total = totalXpForLevel(cfg, level);
      expect(levelForTotalXp(cfg, total)).toBe(level);
      if (level > 1) expect(levelForTotalXp(cfg, total - 1)).toBe(level - 1);
    }
    expect(levelForTotalXp(cfg, Number.MAX_SAFE_INTEGER)).toBe(100);
  });

  it('etapas: Novato, Profesión I (22), Senior (40), Ascensión (100)', () => {
    expect(stageFor(cfg, 21).name).toBe('Novato');
    expect(stageFor(cfg, 22).name).toBe('Profesión I');
    expect(stageFor(cfg, 39).name).toBe('Profesión I');
    expect(stageFor(cfg, 40).name).toBe('Profesión Senior');
    expect(stageFor(cfg, 100).name).toBe('Ascensión: Dios');
  });

  it('los atributos crecen por nivel y la XP de criaturas escala con su nivel', () => {
    const s5 = statsAtLevel(content.profession.baseStats, content.profession.statsPerLevel, 5);
    expect(s5.life).toBe(content.profession.baseStats.life + 4 * content.profession.statsPerLevel.life);
    expect(s5.speed).toBe(content.profession.baseStats.speed);
    expect(creatureXp(cfg, 10, 1)).toBe(10);
    expect(creatureXp(cfg, 10, 3)).toBe(Math.round(10 * (1 + 2 * cfg.creatureXpPerLevel)));
  });
});

describe('PlayerCharacter — niveles', () => {
  it('sube varios niveles de una vez e informa las habilidades desbloqueadas', () => {
    const c = newCharacter();
    const ups = c.addXp(totalXpForLevel(cfg, 5));
    expect(ups.map((u) => u.level)).toEqual([2, 3, 4, 5]);
    expect(ups.find((u) => u.level === 2)?.unlockedAbilities).toEqual(['guardian-charge']);
    expect(ups.find((u) => u.level === 5)?.unlockedAbilities).toEqual(['guardian-tempest']);
    expect(c.level).toBe(5);
    expect(c.levelProgress).toEqual({ current: 0, needed: xpToNext(cfg, 5) });
  });

  it('los atributos finales incluyen el nivel', () => {
    const c = newCharacter();
    const before = c.computeStats().life;
    c.addXp(totalXpForLevel(cfg, 3));
    expect(c.computeStats().life).toBe(before + 2 * content.profession.statsPerLevel.life);
  });

  it('cada nivel de desbloqueo de habilidades es alcanzable antes del nivel 22', () => {
    for (const id of Object.values(content.profession.abilities)) {
      expect(content.abilities.get(id).unlockLevel).toBeLessThan(22);
    }
  });
});
