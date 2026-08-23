'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import PendingSubmit from '@/components/PendingSubmit';

export type ReorderItem = { id: string; label: string; note?: string | null };

/**
 * A drag-to-reorder list that also works without dragging.
 *
 * The dashboard's ordering used to be a "Display order" number box on every
 * product, which means arranging a shelf is arithmetic: to put something third
 * you have to know what the other numbers are. This writes the numbers itself.
 *
 * The up/down buttons are not a fallback nobody uses — they are the only way to
 * do this on a touchscreen, with a keyboard, or with a screen reader, and Tammy
 * works from a tablet. Dragging is the shortcut, not the mechanism: the order
 * lives in component state and is posted as one ordered list of ids.
 */
export default function AdminReorder({
  items,
  action,
  hiddenFields = {},
  label = 'Save this order',
  emptyMessage = 'Nothing to arrange yet.'
}: {
  items: ReorderItem[];
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
  label?: string;
  emptyMessage?: string;
}) {
  const [order, setOrder] = useState(items);
  const [dragging, setDragging] = useState<string | null>(null);

  if (!items.length) return <p className="muted">{emptyMessage}</p>;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    setOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <form action={action} className="admin-reorder">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input type="hidden" name={name} value={value} key={name} />
      ))}
      <input type="hidden" name="order" value={order.map((item) => item.id).join(',')} />
      <ol className="admin-reorder-list">
        {order.map((item, index) => (
          <li
            className={`admin-reorder-row${dragging === item.id ? ' dragging' : ''}`}
            key={item.id}
            draggable
            onDragStart={(event) => {
              /* Firefox refuses to start a drag unless the event carries data,
                 so the row looks draggable and simply never moves without
                 this. The value is not read back — the order lives in state. */
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.id);
              setDragging(item.id);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (!dragging || dragging === item.id) return;
              const from = order.findIndex((entry) => entry.id === dragging);
              if (from === -1 || from === index) return;
              move(from, index);
            }}
          >
            <GripVertical size={16} aria-hidden="true" />
            <span className="admin-reorder-label">
              <b>{item.label}</b>
              {item.note && <small>{item.note}</small>}
            </span>
            <span className="admin-reorder-buttons">
              <button
                type="button"
                className="text-button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
              >
                <ChevronUp size={16} aria-hidden="true" />
                <span className="sr-only">Move {item.label} up</span>
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => move(index, index + 1)}
                disabled={index === order.length - 1}
              >
                <ChevronDown size={16} aria-hidden="true" />
                <span className="sr-only">Move {item.label} down</span>
              </button>
            </span>
          </li>
        ))}
      </ol>
      <PendingSubmit className="btn small" pendingLabel="Saving…">
        {label}
      </PendingSubmit>
    </form>
  );
}
