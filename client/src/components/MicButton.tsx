import { Mic, Square } from 'lucide-react';
import { Button, Spinner, Tooltip, TooltipContent, TooltipTrigger } from '@databricks/appkit-ui/react';
import type { DictationState } from '@/lib/dictation/useDictation';
import { cn } from '@/lib/utils';

const LABELS: Record<DictationState, string> = {
  idle: 'Dictate',
  listening: 'Stop dictation',
  tidying: 'Tidying up…',
  unsupported: 'Dictation needs Chrome, Edge or Safari',
};

interface MicButtonProps {
  state: DictationState;
  onClick: () => void;
  /** A background tidy-up is running: show a spinner but keep the button usable. */
  pending?: boolean;
  /** Why dictation is unavailable (shown when state is 'unsupported'). */
  unsupportedMessage?: string | null;
  /** Show the label next to the icon (toolbar style). */
  showLabel?: boolean;
  size?: 'sm' | 'icon-sm';
  variant?: 'ghost' | 'outline' | 'secondary';
  className?: string;
}

export function MicButton({
  state,
  onClick,
  pending,
  unsupportedMessage,
  showLabel,
  size = 'icon-sm',
  variant = 'ghost',
  className,
}: MicButtonProps) {
  const listening = state === 'listening';
  const label =
    state === 'unsupported' && unsupportedMessage
      ? unsupportedMessage
      : pending && state === 'idle'
        ? 'Dictate (tidying up the last dictation…)'
        : LABELS[state];
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={state === 'unsupported' || state === 'tidying'}
      aria-label={label}
      aria-pressed={listening}
      className={cn('relative gap-2', listening && 'text-red-600 dark:text-red-400', className)}
    >
      {state === 'tidying' || (pending && state === 'idle') ? (
        <Spinner className="size-4" />
      ) : listening ? (
        <Square className="size-3.5 fill-current" />
      ) : (
        <Mic className="size-4" />
      )}
      {showLabel && <span className="hidden sm:inline">{listening ? 'Stop' : 'Dictate'}</span>}
      {listening && (
        <span className="absolute -right-0.5 -top-0.5 flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the tooltip needs a wrapper. */}
        {state === 'unsupported' ? <span tabIndex={0}>{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{label}</TooltipContent>
    </Tooltip>
  );
}
