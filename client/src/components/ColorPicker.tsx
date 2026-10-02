import { useState, type ReactNode } from 'react';
import { Check, Palette } from 'lucide-react';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@databricks/appkit-ui/react';
import { NOTE_SWATCHES, isHex } from '@/lib/colors';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

interface Swatch {
  key: string;
  label: string;
  light: string;
  dark: string;
}

interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  swatches?: Swatch[];
  noneLabel?: string;
  allowNone?: boolean;
  trigger?: ReactNode;
  label?: string;
  icon?: ReactNode;
  /** `text` previews each swatch as a coloured "A" on `surface` instead of a fill. */
  variant?: 'fill' | 'text';
  surface?: string;
}

/** Palette swatches plus a custom hex colour. */
export function ColorPicker({
  value,
  onChange,
  swatches = NOTE_SWATCHES,
  noneLabel = 'Default',
  allowNone = true,
  trigger,
  label = 'Colour',
  icon = <Palette className="size-4" />,
  variant = 'fill',
  surface,
}: ColorPickerProps) {
  const { isDark } = useSettings();
  // Only the six hex digits are typed; the "#" is a fixed prefix.
  const [digits, setDigits] = useState(value && isHex(value) ? value.slice(1) : '');
  const hex = `#${digits}`;
  const customActive = !!value && isHex(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-2" aria-label={label}>
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="grid grid-cols-6 gap-2">
          {allowNone && (
            <SwatchButton
              title={noneLabel}
              color={variant === 'text' ? 'currentColor' : 'var(--background)'}
              variant={variant}
              surface={surface}
              selected={!value}
              onClick={() => onChange(null)}
              className="border-dashed"
            />
          )}
          {swatches.map((s) => (
            <SwatchButton
              key={s.key}
              title={s.label}
              color={isDark ? s.dark : s.light}
              variant={variant}
              surface={surface}
              selected={value === s.key}
              onClick={() => onChange(s.key)}
            />
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (isHex(hex)) onChange(hex.toLowerCase());
          }}
        >
          <label
            className={cn(
              'relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border',
              customActive && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
            )}
            style={{ background: isHex(hex) ? hex : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
            title="Pick a custom colour"
          >
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={isHex(hex) ? hex : '#ffffff'}
              onChange={(e) => {
                setDigits(e.target.value.slice(1));
                onChange(e.target.value);
              }}
            />
          </label>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              #
            </span>
            <Input
              value={digits}
              placeholder="ffcc00"
              spellCheck={false}
              autoComplete="off"
              // Keep hex digits only, capped at six. Not using maxLength: it would
              // truncate a pasted "#ffcc00" before the "#" is stripped.
              onChange={(e) => setDigits(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
              onBlur={() => isHex(hex) && hex.toLowerCase() !== value && onChange(hex.toLowerCase())}
              className="h-8 pl-6 font-mono text-xs"
              aria-label="Custom hex colour (6 digits)"
            />
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SwatchButton({
  title,
  color,
  selected,
  onClick,
  className,
  variant = 'fill',
  surface,
}: {
  title: string;
  color: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
  variant?: 'fill' | 'text';
  surface?: string;
}) {
  if (variant === 'text') {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          'flex size-8 items-center justify-center rounded-md border text-base font-semibold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
          !surface && 'bg-card',
          className
        )}
        style={{ color, background: surface }}
      >
        A
      </button>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
        className
      )}
      style={{ background: color }}
    >
      {selected && <Check className="size-3.5 opacity-70" />}
    </button>
  );
}
