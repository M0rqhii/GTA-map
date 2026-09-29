// Decorative, blurred zoom-2 satellite map behind the account screens.
const TILES = Array.from({ length: 16 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) }));

export function MapBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-ink-950">
      <div className="absolute left-1/2 top-1/2 grid aspect-square w-[max(130vw,130vh)] -translate-x-1/2 -translate-y-1/2 grid-cols-4 opacity-45 blur-[2px] saturate-[0.7]">
        {TILES.map(({ x, y }) => (
          <img key={`${x}-${y}`} src={`/tiles/2/${x}-${y}.webp`} alt="" className="block h-full w-full" draggable={false} />
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgb(245 181 10 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(245 181 10 / 0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(6_8_11/0.85)_75%)]" />
    </div>
  );
}
