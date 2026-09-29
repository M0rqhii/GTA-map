import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { cellAtPixel, type CellXY } from '../lib/grid';
import { latLngToImage } from './coords';

export type PointerHandlers = {
  onHover?: (cell: CellXY | null) => void;
  onClick?: (cell: CellXY | null, image: { x: number; y: number }) => void;
  // Brush strokes: return false from onBrushStart to cancel the stroke.
  onBrushStart?: (cell: CellXY) => boolean;
  onBrushMove?: (cell: CellXY) => void;
  onBrushEnd?: () => void;
};

// Mouse/touch handling on the map. A brush stroke starts with Shift+drag, or any drag while `brushMode` is on.
export function useMapPointer(map: L.Map | null, brushMode: boolean, handlers: PointerHandlers): void {
  const h = useRef(handlers);
  h.current = handlers;
  const brushModeRef = useRef(brushMode);
  brushModeRef.current = brushMode;

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    let stroking = false;
    let lastStrokeEnd = 0;

    const cellFromLatLng = (ll: L.LatLng) => {
      const p = latLngToImage(ll);
      return cellAtPixel(p.x, p.y);
    };
    const cellFromClient = (clientX: number, clientY: number) =>
      cellFromLatLng(map.mouseEventToLatLng({ clientX, clientY } as MouseEvent));

    const startStroke = (cell: CellXY | null) => {
      if (!cell || !h.current.onBrushStart?.(cell)) return false;
      stroking = true;
      map.dragging.disable();
      return true;
    };
    const endStroke = () => {
      if (!stroking) return;
      stroking = false;
      lastStrokeEnd = Date.now();
      if (!brushModeRef.current) map.dragging.enable();
      h.current.onBrushEnd?.();
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const cell = cellFromLatLng(e.latlng);
      h.current.onHover?.(cell);
      if (stroking && cell) h.current.onBrushMove?.(cell);
    };
    const onMouseOut = () => h.current.onHover?.(null);
    const onMouseDown = (e: L.LeafletMouseEvent) => {
      const ev = e.originalEvent;
      if (ev.button !== 0 || !(ev.shiftKey || brushModeRef.current)) return;
      if (startStroke(cellFromLatLng(e.latlng))) ev.preventDefault();
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      if (Date.now() - lastStrokeEnd < 250 || e.originalEvent.shiftKey || brushModeRef.current) return;
      h.current.onClick?.(cellFromLatLng(e.latlng), latLngToImage(e.latlng));
    };

    // Touch brush (single finger while brush mode is on; two fingers keep pinch-zoom).
    const onTouchStart = (ev: TouchEvent) => {
      if (!brushModeRef.current || ev.touches.length !== 1) {
        endStroke();
        return;
      }
      const t = ev.touches[0];
      if (startStroke(cellFromClient(t.clientX, t.clientY))) ev.preventDefault();
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (!stroking) return;
      if (ev.touches.length !== 1) {
        endStroke();
        return;
      }
      ev.preventDefault();
      const t = ev.touches[0];
      const cell = cellFromClient(t.clientX, t.clientY);
      if (cell) h.current.onBrushMove?.(cell);
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);
    map.on('mousedown', onMouseDown);
    map.on('click', onClick);
    document.addEventListener('mouseup', endStroke);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', endStroke);
    container.addEventListener('touchcancel', endStroke);
    return () => {
      endStroke();
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseOut);
      map.off('mousedown', onMouseDown);
      map.off('click', onClick);
      document.removeEventListener('mouseup', endStroke);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', endStroke);
      container.removeEventListener('touchcancel', endStroke);
    };
  }, [map]);

  // In brush mode one-finger/mouse drags paint instead of panning.
  useEffect(() => {
    if (!map) return;
    if (brushMode) map.dragging.disable();
    else map.dragging.enable();
    map.getContainer().classList.toggle('map-brush', brushMode);
  }, [map, brushMode]);
}
