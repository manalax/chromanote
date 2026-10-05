import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Popover, PopoverAnchor, PopoverContent, Spinner } from '@databricks/appkit-ui/react';
import { api } from '@/lib/api';
import { joinDictation } from '@/lib/dictation/commands';
import { useDictation } from '@/lib/dictation/useDictation';
import { useData } from '@/lib/data';
import { MicButton } from './MicButton';

/**
 * Quick voice note: dictate, then the transcript becomes a new note (spoken
 * commands applied, no tidy-up) with an AI-suggested title.
 */
export function VoiceNoteButton() {
  const navigate = useNavigate();
  const { refreshTitles } = useData();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState('');
  const [interim, setInterim] = useState('');
  const transcript = useRef('');
  const cancelled = useRef(false);

  const dictation = useDictation({
    onInterim: setInterim,
    onFinal: (text) => {
      transcript.current += joinDictation(transcript.current, text);
      setSaid(transcript.current);
    },
    onStop: async () => {
      const text = transcript.current.trim();
      if (cancelled.current) return close();
      if (!text) {
        toast('Nothing was heard, so no note was created');
        return close();
      }
      try {
        const note = await api.createVoiceNote(text, dictation.lang);
        void refreshTitles();
        close();
        toast.success(`Created “${note.title}”`);
        void navigate(`/notes/${note.id}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
  });

  function close() {
    setOpen(false);
    setSaid('');
    setInterim('');
    transcript.current = '';
  }

  const begin = () => {
    cancelled.current = false;
    transcript.current = '';
    setSaid('');
    setInterim('');
    setOpen(true);
    dictation.toggle();
  };

  const listening = dictation.state === 'listening';
  const saving = dictation.state === 'tidying';

  if (dictation.state === 'unsupported') {
    return <MicButton state="unsupported" onClick={() => undefined} variant="outline" className="rounded-full" />;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Clicking outside while listening cancels; while saving, stay open.
        if (!next && listening) {
          cancelled.current = true;
          dictation.stop();
        } else if (!next && !saving) close();
      }}
    >
      <PopoverAnchor asChild>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => (open ? undefined : begin())}
          aria-label="Voice note"
          aria-pressed={open}
        >
          <Mic className="size-4" /> <span className="hidden sm:inline">Voice note</span>
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {listening ? (
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          ) : (
            <Spinner className="size-3.5" />
          )}
          {listening ? 'Listening…' : 'Creating note…'}
        </div>
        <div
          className="max-h-48 min-h-16 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm"
          aria-live="polite"
        >
          {said || interim ? (
            <>
              {said}
              {interim && <span className="italic opacity-50">{joinDictation(said, interim)}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Start speaking. Say “new line” or “bullet” for layout.</span>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!listening}
            onClick={() => {
              cancelled.current = true;
              dictation.stop();
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!listening} onClick={() => dictation.stop()}>
            Stop &amp; save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
