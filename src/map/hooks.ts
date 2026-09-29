import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { CellXY } from '../lib/grid';
import { GridLayer, type GridData } from './GridLayer';
import { cellBounds } from './coords';

// Adds the grid canvas layer to the map and keeps its data in sync.
export function useGridLayer(map: L.Map | null, data: Partial<GridData>, version: unknown): void {
  const layer = useRef<GridLayer | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!map) return;
    const l = new GridLayer();
    l.setData(dataRef.current);
    l.addTo(map);
    layer.current = l;
    return () => {
      l.remove();
      layer.current = null;
    };
  }, [map]);

  useEffect(() => {
    layer.current?.setData(dataRef.current);
  }, [version]);
}

// Outline of the cell under the pointer.
export function useHoverOutline(map: L.Map | null, cell: CellXY | null): void {
  const rect = useRef<L.Rectangle | null>(null);
  useEffect(() => {
    if (!map) return;
    rect.current = L.rectangle(cellBounds(0, 0), {
      color: '#f5b50a', weight: 2, fill: false, interactive: false, opacity: 0,
    }).addTo(map);
    return () => {
      rect.current?.remove();
      rect.current = null;
    };
  }, [map]);
  useEffect(() => {
    if (!rect.current) return;
    if (cell) {
      rect.current.setBounds(cellBounds(cell.x, cell.y));
      rect.current.setStyle({ opacity: 1 });
    } else {
      rect.current.setStyle({ opacity: 0 });
    }
  }, [cell, map]);
}

// Coarse pointer (touch) detection for mobile-only controls.
export function useIsTouch(): boolean {
  const [touch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  return touch;
}
