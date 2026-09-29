import { describe, it, expect } from 'vitest';
import { GRID, CELL_PX, cellKey, keyToCell, isValidCell, cellAtPixel, cellRect, columnLabel, cellLabel, rangeLabel } from '../src/lib/grid';

describe('grid', () => {
  it('labels columns like a spreadsheet', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(27)).toBe('AB');
    expect(columnLabel(52)).toBe('BA');
  });

  it('labels cells with 1-based rows', () => {
    expect(cellLabel(10, 41)).toBe('K-42');
    expect(cellLabel(0, 0)).toBe('A-1');
  });

  it('round-trips keys', () => {
    for (const [x, y] of [[0, 0], [GRID.cols - 1, 0], [3, 7], [GRID.cols - 1, GRID.rows - 1]]) {
      expect(keyToCell(cellKey(x, y))).toEqual({ x, y });
    }
  });

  it('validates range', () => {
    expect(isValidCell(0, 0)).toBe(true);
    expect(isValidCell(-1, 0)).toBe(false);
    expect(isValidCell(GRID.cols, 0)).toBe(false);
    expect(isValidCell(0, GRID.rows)).toBe(false);
    expect(isValidCell(1.5, 0)).toBe(false);
  });

  it('maps pixels to cells and back', () => {
    const r = cellRect(2, 3);
    expect(r).toEqual({ left: GRID.originX + 2 * CELL_PX, top: GRID.originY + 3 * CELL_PX, size: CELL_PX });
    expect(cellAtPixel(r.left, r.top)).toEqual({ x: 2, y: 3 });
    expect(cellAtPixel(r.left + CELL_PX - 0.01, r.top + CELL_PX - 0.01)).toEqual({ x: 2, y: 3 });
    expect(cellAtPixel(GRID.originX - 1, GRID.originY)).toBeNull();
  });

  it('describes ranges', () => {
    expect(rangeLabel([{ x: 10, y: 39 }])).toBe('K-40');
    expect(rangeLabel([{ x: 10, y: 39 }, { x: 12, y: 44 }, { x: 11, y: 40 }])).toBe('K-40 … M-45');
  });

  it('covers the land area', () => {
    expect(GRID).toEqual({ originX: 1408, originY: 384, cols: 81, rows: 119 });
  });
});
