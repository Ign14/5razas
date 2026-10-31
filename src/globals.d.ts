declare const __APP_VERSION__: string;

interface FiveRazasDebug {
  player(): { x: number; y: number; facing: string; moving: boolean };
  exploredCells(): number;
  readonly mapId: string;
}

interface Window {
  __5RAZAS__?: FiveRazasDebug;
}
