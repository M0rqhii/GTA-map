import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GRID_BOUNDS, IMAGE_BOUNDS } from './coords';

type Props = {
  onReady: (map: L.Map | null) => void;
  className?: string;
  leftInset?: number; // px covered by a side panel on wide screens, kept free when framing the map
  variant?: 'app' | 'overlay'; // overlay (OBS): no controls, tight framing that follows the source size
};

// Satellite map of San Andreas. Other layers are attached by the page through `onReady`.
export function GtaMap({ onReady, className = '', leftInset = 0, variant = 'app' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const insetRef = useRef(leftInset);

  useEffect(() => {
    const overlay = variant === 'overlay';
    const map = L.map(ref.current!, {
      crs: L.CRS.Simple,
      minZoom: overlay ? 0 : 1,
      maxZoom: 7,
      zoomSnap: overlay ? 0.1 : 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 100,
      boxZoom: false,
      attributionControl: false,
      zoomControl: false,
      maxBounds: IMAGE_BOUNDS.pad(0.1),
      maxBoundsViscosity: 0.85,
    });
    if (!overlay) L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(map);
    L.tileLayer('/tiles/{z}/{x}-{y}.webp', {
      minZoom: 0,
      maxNativeZoom: 5,
      maxZoom: 7,
      noWrap: true,
      bounds: IMAGE_BOUNDS,
      keepBuffer: 4,
    }).addTo(map);

    const frame = () => {
      if (overlay) {
        map.fitBounds(GRID_BOUNDS, { padding: [6, 6], animate: false });
        return;
      }
      const inset = window.innerWidth >= 640 ? insetRef.current : 0;
      map.fitBounds(GRID_BOUNDS, { paddingTopLeft: [16 + inset, 16], paddingBottomRight: [16, 16] });
    };
    frame();
    // An OBS source can be resized at any time; keep the whole grid in view.
    if (overlay) map.on('resize', frame);

    onReadyRef.current(map);
    return () => {
      onReadyRef.current(null);
      map.remove();
    };
  }, [variant]);

  return <div ref={ref} className={`h-full w-full ${className}`} />;
}
