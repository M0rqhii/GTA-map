import { describe, it, expect, vi } from 'vitest';
import { brushModeFor, brushWants, cellsOnLine, Batcher } from '../src/map/brush';

describe('brush', () => {
  it('picks mode from the starting cell', () => {
    expect(brushModeFor(undefined, 'me')).toBe('paint');
    expect(brushModeFor({ userId: 'me', at: 0 }, 'me')).toBe('erase');
    expect(brushModeFor({ userId: 'x', at: 0 }, 'me')).toBeNull();
  });

  it('paint only fills empty cells, erase only removes mine', () => {
    expect(brushWants('paint', undefined, 'me')).toBe(true);
    expect(brushWants('paint', { userId: 'x', at: 0 }, 'me')).toBe(false);
    expect(brushWants('paint', { userId: 'me', at: 0 }, 'me')).toBe(false);
    expect(brushWants('erase', { userId: 'me', at: 0 }, 'me')).toBe(true);
    expect(brushWants('erase', { userId: 'x', at: 0 }, 'me')).toBe(false);
    expect(brushWants('erase', undefined, 'me')).toBe(false);
  });

  it('walks a line of cells', () => {
    expect(cellsOnLine({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(cellsOnLine({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(cellsOnLine({ x: 3, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }]);
    expect(cellsOnLine({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });

  it('batches keys and flushes after the delay', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const b = new Batcher(flush, 150);
    b.push([1, 2]);
    b.push([2, 3]);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(flush).toHaveBeenCalledWith([1, 2, 3]);
    b.push([4]);
    b.flushNow();
    expect(flush).toHaveBeenLastCalledWith([4]);
    b.flushNow();
    expect(flush).toHaveBeenCalledTimes(2);
    b.dispose();
    vi.useRealTimers();
  });
});
