// Grid laid over the 8192x8192 satellite image. All coordinates are image pixels at NATIVE_ZOOM.
// The same bounds are enforced by check constraints in supabase/migrations/0001_schema.sql.

export const IMAGE_SIZE = 8192;
export const NATIVE_ZOOM = 5;
export const CELL_PX = 64; // ~96 m in game

export const GRID = { originX: 1408, originY: 384, cols: 81, rows: 119 } as const;

export type CellXY = { x: number; y: number };

export function cellKey(x: number, y: number): number {
  return y * GRID.cols + x;
}

export function keyToCell(key: number): CellXY {
  return { x: key % GRID.cols, y: Math.floor(key / GRID.cols) };
}

export function isValidCell(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;
}

export function cellAtPixel(px: number, py: number): CellXY | null {
  const x = Math.floor((px - GRID.originX) / CELL_PX);
  const y = Math.floor((py - GRID.originY) / CELL_PX);
  return isValidCell(x, y) ? { x, y } : null;
}

export function cellRect(x: number, y: number): { left: number; top: number; size: number } {
  return { left: GRID.originX + x * CELL_PX, top: GRID.originY + y * CELL_PX, size: CELL_PX };
}

export function columnLabel(col: number): string {
  let n = col + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function cellLabel(x: number, y: number): string {
  return `${columnLabel(x)}-${y + 1}`;
}

export function cellsBounds(cells: CellXY[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (cells.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsLabel(b: { minX: number; minY: number; maxX: number; maxY: number }): string {
  const from = cellLabel(b.minX, b.minY);
  const to = cellLabel(b.maxX, b.maxY);
  return from === to ? from : `${from} … ${to}`;
}

export function rangeLabel(cells: CellXY[]): string {
  const b = cellsBounds(cells);
  return b ? boundsLabel(b) : '';
}
