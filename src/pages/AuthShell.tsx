import type { ReactNode } from 'react';
import { MapBackdrop } from '../components/MapBackdrop';
import { Signature, Wordmark } from '../components/ui';

// Frame for the account screens: blurred map behind a single HUD card.
export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-y-auto">
      <MapBackdrop />
      <main className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 animate-rise">
          <Wordmark size="lg" />
        </div>
        <section className="hud animate-rise p-6 sm:p-8" style={{ animationDelay: '80ms' }}>
          <p className="label-caps text-sun">{eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold uppercase tracking-[0.06em]">{title}</h1>
          <div className="mt-6">{children}</div>
        </section>
        <Signature className="mt-6 self-center" />
      </main>
    </div>
  );
}
