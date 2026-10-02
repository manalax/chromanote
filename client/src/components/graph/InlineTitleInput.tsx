import { useState } from 'react';
import { Input } from '@databricks/appkit-ui/react';

interface InlineTitleInputProps {
  /** Position relative to the graph container. */
  x: number;
  y: number;
  label: string;
  initial?: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}

/** A small title box floating over the graph (new note, new linked note, rename). */
export function InlineTitleInput({ x, y, label, initial = '', onSubmit, onCancel }: InlineTitleInputProps) {
  const [value, setValue] = useState(initial);

  return (
    <form
      className="absolute z-30 w-64 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-2 shadow-lg"
      style={{ left: x, top: y }}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <div className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">{label}</div>
      <Input
        autoFocus
        value={value}
        maxLength={300}
        placeholder="Note title"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onBlur={onCancel}
        className="h-8"
        aria-label={label}
      />
      <div className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">Enter to save · Esc to cancel</div>
    </form>
  );
}
