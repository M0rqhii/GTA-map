import { PIN_ICONS } from '../lib/pins';
import { relativeTime } from '../lib/format';
import type { Member, Pin } from '../state/orgReducer';
import { Button, Swatch } from './ui';
import { IconX } from './icons';

type Props = {
  pin: Pin;
  author: Member | undefined;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function PinDetails({ pin, author, canEdit, canDelete, onEdit, onDelete, onClose }: Props) {
  const kind = PIN_ICONS.find((i) => i.id === pin.icon);
  return (
    <div className="hud absolute inset-x-3 bottom-20 z-[1100] animate-rise p-4 sm:inset-x-auto sm:bottom-auto sm:right-16 sm:top-4 sm:w-80">
      <div className="flex items-start justify-between gap-3">
        <p className="label-caps flex items-center gap-2">
          <span className="text-lg leading-none">{kind?.emoji ?? '📍'}</span>
          {kind?.label ?? 'Pinezka'}
        </p>
        <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-100" aria-label="Zamknij"><IconX /></button>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-100 [overflow-wrap:anywhere]">{pin.body}</p>
      <p className="mt-3 flex items-center gap-2 font-mono text-[12px] text-ink-400">
        <Swatch color={author?.color} size={11} />
        {author?.username ?? 'były członek'} · {relativeTime(pin.updated_at)}
      </p>
      {canEdit || canDelete ? (
        <div className="mt-4 flex gap-2">
          {canEdit ? <Button variant="subtle" size="sm" onClick={onEdit}>Edytuj</Button> : null}
          {canDelete ? <Button variant="danger" size="sm" onClick={onDelete}>Usuń</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
