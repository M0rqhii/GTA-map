import L from 'leaflet';
import { CELL_PX, GRID, NATIVE_ZOOM, cellKey } from '../lib/grid';
import type { Cell } from '../state/orgReducer';

export type GridData = {
  cells: Map<number, Cell>;
  colorOf: (userId: string) => string | null;
  highlightUser: string | null;
  neutral: boolean; // public viewer: one color, no owners
  gridLines: boolean; // off in the OBS overlay, where lines a few px apart are only noise
  flashKeys: Set<number>;
};

// Public cells: a saturated amber that no sand, forest, city or water on the satellite map comes close to.
const NEUTRAL = '#ffb81c';
const TILE = 256;

type TileEntry = { el: HTMLCanvasElement; coords: L.Coords };

// Draws the search grid and marked cells on canvas tiles, so Leaflet pans and zooms them with the map.
export class GridLayer extends L.GridLayer {
  private data: GridData = { cells: new Map(), colorOf: () => null, highlightUser: null, neutral: false, gridLines: true, flashKeys: new Set() };

  constructor() {
    super({ tileSize: TILE, updateWhenZooming: false, pane: 'overlayPane', noWrap: true });
  }

  setData(patch: Partial<GridData>): void {
    this.data = { ...this.data, ...patch };
    const tiles = (this as unknown as { _tiles: Record<string, TileEntry> })._tiles ?? {};
    for (const key of Object.keys(tiles)) this.drawTile(tiles[key].el, tiles[key].coords);
  }

  createTile(coords: L.Coords): HTMLElement {
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = TILE * dpr;
    canvas.height = TILE * dpr;
    this.drawTile(canvas, coords);
    return canvas;
  }

  private drawTile(canvas: HTMLCanvasElement, coords: L.Coords): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = canvas.width / TILE;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);

    const scale = 2 ** (coords.z - NATIVE_ZOOM); // tile px per image px
    const span = TILE / scale; // image px covered by this tile
    const x0 = coords.x * span;
    const y0 = coords.y * span;
    const cell = CELL_PX * scale;

    const cx0 = Math.max(0, Math.floor((x0 - GRID.originX) / CELL_PX));
    const cy0 = Math.max(0, Math.floor((y0 - GRID.originY) / CELL_PX));
    const cx1 = Math.min(GRID.cols - 1, Math.floor((x0 + span - GRID.originX) / CELL_PX));
    const cy1 = Math.min(GRID.rows - 1, Math.floor((y0 + span - GRID.originY) / CELL_PX));
    if (cx0 > cx1 || cy0 > cy1) return;

    const toX = (gx: number) => (GRID.originX + gx * CELL_PX - x0) * scale;
    const toY = (gy: number) => (GRID.originY + gy * CELL_PX - y0) * scale;
    const { cells, colorOf, highlightUser, neutral, gridLines, flashKeys } = this.data;

    if (!neutral) {
      // Marked cells
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          const c = cells.get(cellKey(gx, gy));
          if (!c) continue;
          const color = colorOf(c.userId) ?? '#9aa3af';
          const dim = highlightUser !== null && c.userId !== highlightUser;
          const left = toX(gx);
          const top = toY(gy);
          ctx.globalAlpha = dim ? 0.1 : 0.44;
          ctx.fillStyle = color;
          ctx.fillRect(left, top, cell, cell);
          if (cell >= 6 && !dim) {
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = color;
            ctx.lineWidth = cell >= 24 ? 1.5 : 1;
            ctx.strokeRect(left + 0.75, top + 0.75, cell - 1.5, cell - 1.5);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Grid lines: a dark and a light hairline side by side stay visible on sand, forest and water alike.
    if (gridLines && cell >= 5) {
      const strong = cell >= 16;
      const top = Math.max(0, toY(0));
      const bottom = Math.min(TILE, toY(GRID.rows));
      const left = Math.max(0, toX(0));
      const right = Math.min(TILE, toX(GRID.cols));
      const pass = (color: string, offset: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = cx0; gx <= cx1 + 1; gx++) {
          const x = Math.round(toX(gx)) + offset;
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
        }
        for (let gy = cy0; gy <= cy1 + 1; gy++) {
          const y = Math.round(toY(gy)) + offset;
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
        }
        ctx.stroke();
      };
      pass(strong ? 'rgba(6,8,11,0.32)' : 'rgba(6,8,11,0.16)', 0.5);
      if (strong) pass('rgba(255,255,255,0.22)', 1.5);
      else pass('rgba(255,255,255,0.1)', 1.5);
    }

    // Public areas go over the grid lines so their outline stays crisp.
    if (neutral) this.drawAreas(ctx, cx0, cy0, cx1, cy1, cell, toX, toY);

    // Grid frame
    ctx.strokeStyle = 'rgba(245,181,10,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(toX(0), toY(0), GRID.cols * cell, GRID.rows * cell);

    // Flash: history jump in the app, freshly searched cells in the public views
    if (flashKeys.size > 0) {
      ctx.strokeStyle = '#ffd045';
      ctx.fillStyle = '#fff6d8';
      ctx.lineWidth = Math.max(2, Math.min(4, cell / 8));
      for (const key of flashKeys) {
        const gx = key % GRID.cols;
        const gy = Math.floor(key / GRID.cols);
        if (gx < cx0 || gx > cx1 || gy < cy0 || gy > cy1) continue;
        if (neutral) {
          if (!cells.has(key)) continue; // unmarked again before the glow ended
          ctx.globalAlpha = 0.9;
          ctx.fillRect(toX(gx), toY(gy), cell, cell);
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeRect(toX(gx) + 1, toY(gy) + 1, cell - 2, cell - 2);
        }
      }
    }
  }

  // Public cells as areas: one solid fill, outlined only where the searched area ends, so they read as
  // shapes on sand, city and water alike, even when a cell is only a few pixels wide.
  private drawAreas(
    ctx: CanvasRenderingContext2D, cx0: number, cy0: number, cx1: number, cy1: number, cell: number,
    toX: (gx: number) => number, toY: (gy: number) => number,
  ): void {
    const { cells } = this.data;
    const marked = (gx: number, gy: number) =>
      gx >= 0 && gy >= 0 && gx < GRID.cols && gy < GRID.rows && cells.has(cellKey(gx, gy));

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = NEUTRAL;
    const edges = new Path2D();
    for (let gy = cy0; gy <= cy1; gy++) {
      for (let gx = cx0; gx <= cx1; gx++) {
        if (!marked(gx, gy)) continue;
        const l = toX(gx);
        const t = toY(gy);
        ctx.fillRect(l, t, cell, cell);
        if (!marked(gx, gy - 1)) { edges.moveTo(l, t); edges.lineTo(l + cell, t); }
        if (!marked(gx, gy + 1)) { edges.moveTo(l, t + cell); edges.lineTo(l + cell, t + cell); }
        if (!marked(gx - 1, gy)) { edges.moveTo(l, t); edges.lineTo(l, t + cell); }
        if (!marked(gx + 1, gy)) { edges.moveTo(l + cell, t); edges.lineTo(l + cell, t + cell); }
      }
    }
    // A dark halo under the outline keeps the edge visible on bright sand and concrete.
    const width = cell >= 16 ? 2 : cell >= 6 ? 1.5 : 1;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#06080b';
    ctx.lineWidth = width + 2;
    ctx.stroke(edges);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = NEUTRAL;
    ctx.lineWidth = width;
    ctx.stroke(edges);
  }
}
