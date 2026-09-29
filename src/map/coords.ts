import L from 'leaflet';
import { CELL_PX, GRID, IMAGE_SIZE, NATIVE_ZOOM, cellRect } from '../lib/grid';

// Leaflet CRS.Simple: at zoom z one map unit = 2^z px, so image px at NATIVE_ZOOM = latlng * 32 (y flipped).
const SCALE = 2 ** NATIVE_ZOOM;

export function imageToLatLng(px: number, py: number): L.LatLng {
  return L.latLng(-py / SCALE, px / SCALE);
}

export function latLngToImage(ll: L.LatLng): { x: number; y: number } {
  return { x: ll.lng * SCALE, y: -ll.lat * SCALE };
}

export const IMAGE_BOUNDS = L.latLngBounds(imageToLatLng(0, IMAGE_SIZE), imageToLatLng(IMAGE_SIZE, 0));

export const GRID_BOUNDS = L.latLngBounds(
  imageToLatLng(GRID.originX, GRID.originY + GRID.rows * CELL_PX),
  imageToLatLng(GRID.originX + GRID.cols * CELL_PX, GRID.originY),
);

export function cellBounds(x: number, y: number): L.LatLngBounds {
  const r = cellRect(x, y);
  return L.latLngBounds(imageToLatLng(r.left, r.top + r.size), imageToLatLng(r.left + r.size, r.top));
}

export function cellsBoundsToLatLng(b: { minX: number; minY: number; maxX: number; maxY: number }): L.LatLngBounds {
  return cellBounds(b.minX, b.minY).extend(cellBounds(b.maxX, b.maxY));
}
