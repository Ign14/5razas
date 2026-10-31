declare const __APP_VERSION__: string;

interface FiveRazasDebug {
  player(): { x: number; y: number; facing: string; moving: boolean; hp: number; energy: number; alive: boolean };
  exploredCells(): number;
  creatures(): { id: string; x: number; y: number; hp: number }[];
  cooldowns(): Record<string, number>;
  xp(): number;
  level(): number;
  inventory(): { itemId: string; quantity: number }[];
  equipment(): Record<string, string>;
  paused(): boolean;
  drops(): { itemId: string; x: number; y: number }[];
  hour(): number;
  plants(): { id: string; plantId: string; x: number; y: number; ready: boolean }[];
  readonly mapId: string;
}

interface Window {
  __5RAZAS__?: FiveRazasDebug;
}
