import { PALETTE } from '../lib/palette';

type Props = {
  value: string | null;
  onChange: (color: string) => void;
  taken: Map<string, string>; // color -> nick of the member who has it
  mine?: string | null; // my current color (shown as available)
};

// 16 hues x 5 tones. Colors used by other members of the org are struck through and disabled.
export function ColorPicker({ value, onChange, taken, mine = null }: Props) {
  return (
    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16" role="radiogroup" aria-label="Kolor">
      {PALETTE.map((color, i) => {
        const owner = color !== mine ? taken.get(color) : undefined;
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={owner ? `Kolor ${i + 1} – zajęty przez ${owner}` : `Kolor ${i + 1}`}
            title={owner ? `Zajęty: ${owner}` : undefined}
            disabled={Boolean(owner)}
            onClick={() => onChange(color)}
            className={[
              'relative aspect-square w-full border transition-transform duration-100',
              owner ? 'cursor-not-allowed border-ink-700 opacity-25' : 'border-ink-950/50 hover:z-10 hover:scale-110',
              selected ? 'z-10 scale-110 outline-2 outline-offset-2 outline-sun' : '',
            ].join(' ')}
            style={{
              background: owner
                ? `linear-gradient(to top right, transparent calc(50% - 1.5px), #0a0d12 calc(50% - 1.5px), #0a0d12 calc(50% + 1.5px), transparent calc(50% + 1.5px)), ${color}`
                : color,
            }}
          >
            {selected ? <span className="absolute inset-0 grid place-items-center font-mono text-[11px] font-semibold text-ink-950">✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}
