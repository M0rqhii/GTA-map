import type { CellXY } from '../lib/grid';
import type { Cell } from '../state/orgReducer';

export type BrushMode = 'paint' | 'erase';

// Starting on an empty cell paints, starting on one of mine erases, starting on someone else's does nothing.
export function brushModeFor(cell: Cell | undefined, me: string): BrushMode | null {
  if (!cell) return 'paint';
  return cell.userId === me ? 'erase' : null;
}

export function brushWants(mode: BrushMode, cell: Cell | undefined, me: string): boolean {
  return mode === 'paint' ? !cell : cell?.userId === me;
}

// Bresenham line between two cells (inclusive), so fast drags do not skip cells.
export function cellsOnLine(a: CellXY, b: CellXY): CellXY[] {
  const out: CellXY[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// Collects keys and hands them to `flush` at most once per `delayMs`.
export class Batcher {
  private keys = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly flush: (keys: number[]) => void, private readonly delayMs = 150) {}

  push(keys: number[]): void {
    for (const k of keys) this.keys.add(k);
    if (this.timer === null && this.keys.size > 0) {
      this.timer = setTimeout(() => this.flushNow(), this.delayMs);
    }
  }

  flushNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.keys.size === 0) return;
    const keys = [...this.keys];
    this.keys.clear();
    this.flush(keys);
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.keys.clear();
  }
}
