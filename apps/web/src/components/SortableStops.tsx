'use client';

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { inputClass } from '@/components/ui';

export interface StopRow {
  id: string;
  name: string;
  region?: string | null;
  notes: string;
  date: string; // YYYY-MM-DD or ''
  minutes: string;
  completed?: boolean;
}

function Row({ stop, index, total, onChange, onRemove, onMove, readOnly }: {
  stop: StopRow; index: number; total: number; readOnly?: boolean;
  onChange: (id: string, patch: Partial<Pick<StopRow, 'notes' | 'date' | 'minutes'>>) => void; onRemove: (id: string) => void; onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`mb-2.5 rounded-xl border border-line bg-surface p-3 ${isDragging ? 'z-10 shadow-lg' : ''}`}>
      <div className="flex items-center gap-2">
        {!readOnly && <button type="button" {...attributes} {...listeners} aria-label={`Drag to reorder ${stop.name}`} className="flex size-9 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-primary-soft">⠿</button>}
        <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${stop.completed ? 'bg-ok text-white' : 'bg-primary-soft text-primary'}`}>{stop.completed ? '✓' : index + 1}</span>
        <div className="min-w-0 flex-1"><b className="block truncate">{stop.name}</b>{stop.region && <span className="text-sm text-muted">{stop.region}</span>}</div>
        {!readOnly && (
          <div className="flex">
            <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move ${stop.name} up`} className="size-9 rounded-lg hover:bg-primary-soft disabled:opacity-30">▲</button>
            <button type="button" disabled={index === total - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move ${stop.name} down`} className="size-9 rounded-lg hover:bg-primary-soft disabled:opacity-30">▼</button>
            <button type="button" onClick={() => onRemove(stop.id)} aria-label={`Remove ${stop.name}`} className="size-9 rounded-lg text-bad hover:bg-bad/10">✕</button>
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <input type="date" aria-label={`Planned arrival for ${stop.name}`} value={stop.date} onChange={(e) => onChange(stop.id, { date: e.target.value })} className={inputClass} />
          <input type="number" min={0} max={14400} aria-label={`Target minutes at ${stop.name}`} placeholder="Target minutes (optional)" value={stop.minutes} onChange={(e) => onChange(stop.id, { minutes: e.target.value })} className={inputClass} />
          <input type="text" maxLength={600} aria-label={`Notes for ${stop.name}`} placeholder="Notes (optional)" value={stop.notes} onChange={(e) => onChange(stop.id, { notes: e.target.value })} className={`${inputClass} sm:col-span-2`} />
        </div>
      )}
    </li>
  );
}

export function SortableStops({ stops, onReorder, onChange, onRemove, readOnly }: {
  stops: StopRow[]; readOnly?: boolean;
  onReorder: (ids: string[]) => void; onChange: (id: string, patch: Partial<Pick<StopRow, 'notes' | 'date' | 'minutes'>>) => void; onRemove: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = stops.map((s) => s.id);
  const move = (from: number, to: number) => onReorder(arrayMove(ids, from, to));
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol aria-label="Itinerary stops">{stops.map((s, i) => <Row key={s.id} stop={s} index={i} total={stops.length} onChange={onChange} onRemove={onRemove} onMove={move} readOnly={readOnly} />)}</ol>
      </SortableContext>
    </DndContext>
  );
}
