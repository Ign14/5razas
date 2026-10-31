declare const __APP_VERSION__: string;

interface FiveRazasDebug {
  player(): { x: number; y: number; facing: string; moving: boolean; hp: number; energy: number; alive: boolean };
  exploredCells(): number;
  creatures(): { id: string; x: number; y: number; hp: number }[];
  cooldowns(): Record<string, number>;
  xp(): number;
  readonly mapId: string;
}

interface Window {
  __5RAZAS__?: FiveRazasDebug;
}
