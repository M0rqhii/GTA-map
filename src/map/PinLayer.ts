import L from 'leaflet';
import { pinEmoji } from '../lib/pins';
import type { Pin } from '../state/orgReducer';
import { imageToLatLng } from './coords';

type Entry = { marker: L.Marker; signature: string };

export type PinFilter = { visible: boolean; icons: Set<string>; highlightUser: string | null };

// Pin markers. User text never touches innerHTML: markers are built with DOM APIs and textContent.
export class PinLayer {
  private group = L.layerGroup();
  private entries = new Map<string, Entry>();

  constructor(map: L.Map, private readonly onSelect: (id: string) => void) {
    this.group.addTo(map);
  }

  sync(pins: Iterable<Pin>, colorOf: (userId: string) => string | null, filter: PinFilter): void {
    const keep = new Set<string>();
    if (filter.visible) {
      for (const pin of pins) {
        if (!filter.icons.has(pin.icon)) continue;
        keep.add(pin.id);
        const color = colorOf(pin.user_id) ?? '#9aa3af';
        const dim = filter.highlightUser !== null && pin.user_id !== filter.highlightUser;
        const signature = `${pin.icon}|${color}|${dim}|${pin.px}|${pin.py}|${pin.body}`;
        const existing = this.entries.get(pin.id);
        if (existing?.signature === signature) continue;
        if (existing) this.group.removeLayer(existing.marker);
        const marker = L.marker(imageToLatLng(pin.px, pin.py), {
          icon: L.divIcon({
            html: pinElement(pinEmoji(pin.icon), color),
            className: `pin-marker${dim ? ' is-dim' : ''}`,
            iconSize: [30, 30],
            iconAnchor: [15, 36],
          }),
          title: pin.body.slice(0, 80),
          keyboard: true,
          riseOnHover: true,
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.onSelect(pin.id);
        });
        marker.addTo(this.group);
        this.entries.set(pin.id, { marker, signature });
      }
    }
    for (const [id, entry] of this.entries) {
      if (keep.has(id)) continue;
      this.group.removeLayer(entry.marker);
      this.entries.delete(id);
    }
  }

  destroy(): void {
    this.group.remove();
    this.entries.clear();
  }
}

function pinElement(emoji: string, color: string): HTMLElement {
  const body = document.createElement('div');
  body.className = 'pin-body';
  body.style.background = color;
  const icon = document.createElement('span');
  icon.textContent = emoji;
  body.appendChild(icon);
  return body;
}
