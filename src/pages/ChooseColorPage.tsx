import { MapBackdrop } from '../components/MapBackdrop';
import { ColorSelector } from '../components/ColorSelector';
import { Signature, Wordmark } from '../components/ui';

export function ChooseColorPage() {
  return (
    <div className="relative min-h-full overflow-y-auto">
      <MapBackdrop />
      <main className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-10">
        <div className="mb-8 animate-rise"><Wordmark size="lg" /></div>
        <section className="hud animate-rise p-6 sm:p-8" style={{ animationDelay: '80ms' }}>
          <p className="label-caps text-sun">Ostatni krok</p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-[0.06em]">Twój kolor</h1>
          <p className="mt-2 text-ink-300">Tym kolorem będziesz zaznaczać przeszukane kwadraty. Przekreślone kolory mają już inni członkowie.</p>
          <div className="mt-6">
            <ColorSelector submitLabel="Wybieram" />
          </div>
        </section>
        <Signature className="mt-6 self-center" />
      </main>
    </div>
  );
}
