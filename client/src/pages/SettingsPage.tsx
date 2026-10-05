import { useState } from 'react';
import { Check, Monitor, Moon, Pencil, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@databricks/appkit-ui/react';
import { api, type Tag } from '@/lib/api';
import {
  BACKGROUND_SWATCHES,
  DEFAULT_SURFACE,
  TEXT_SWATCHES,
  accentOf,
  backgroundSurface,
  noteColors,
  textColor,
} from '@/lib/colors';
import { useData } from '@/lib/data';
import { FONTS } from '@/lib/fonts';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { ColorPicker } from '@/components/ColorPicker';
import { DICTATION_LANGUAGES, dictationSupported } from '@/lib/dictation/languages';
import { useDictationLang } from '@/lib/dictation/useDictation';

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { settings, isDark, update } = useSettings();
  const bg = backgroundSurface(settings.bg_color, isDark);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      {settings.user && <p className="text-sm text-muted-foreground">Signed in as {settings.user}</p>}
      <div className="mt-2 divide-y">
        <Section title="Theme" description="Light, dark, or follow your system.">
          <ToggleGroup
            type="single"
            variant="outline"
            value={settings.theme}
            onValueChange={(v) => v && void update({ theme: v as typeof settings.theme })}
          >
            <ToggleGroupItem value="light" className="gap-2 px-4">
              <Sun className="size-4" /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="gap-2 px-4">
              <Moon className="size-4" /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="gap-2 px-4">
              <Monitor className="size-4" /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </Section>

        <Section title="App background" description="The canvas behind your notes. Adapts to light and dark mode.">
          <div className="flex flex-wrap items-center gap-2">
            {[null, ...BACKGROUND_SWATCHES.map((s) => s.key)].map((key) => {
              const surface = backgroundSurface(key, isDark);
              const label = BACKGROUND_SWATCHES.find((s) => s.key === key)?.label ?? 'Default';
              const selected = settings.bg_color === key;
              return (
                <button
                  key={key ?? 'default'}
                  onClick={() => void update({ bg_color: key })}
                  className={cn(
                    'flex h-14 w-20 flex-col items-start justify-end rounded-lg border p-1.5 text-xs transition-transform hover:scale-105',
                    selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                  )}
                  style={{ background: surface?.bg ?? 'var(--background)', color: surface?.fg }}
                  aria-pressed={selected}
                >
                  {label}
                </button>
              );
            })}
            <ColorPicker
              value={
                settings.bg_color && !BACKGROUND_SWATCHES.some((s) => s.key === settings.bg_color)
                  ? settings.bg_color
                  : null
              }
              onChange={(c) => void update({ bg_color: c })}
              swatches={[]}
              allowNone={false}
              label="Custom background"
              trigger={
                <button
                  className={cn(
                    'flex h-14 w-20 flex-col items-start justify-end rounded-lg border border-dashed p-1.5 text-xs',
                    bg &&
                      !BACKGROUND_SWATCHES.some((s) => s.key === settings.bg_color) &&
                      'ring-2 ring-ring ring-offset-2 ring-offset-background'
                  )}
                >
                  Custom…
                </button>
              }
            />
          </div>
        </Section>

        <Section title="Default note font" description="Used for notes that don't set their own font.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FONTS.map((f) => (
              <button
                key={f.key}
                onClick={() => void update({ default_font: f.key })}
                className={cn(
                  'rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:bg-accent',
                  settings.default_font === f.key && 'ring-2 ring-ring'
                )}
              >
                <div className="text-lg" style={{ fontFamily: f.family }}>
                  Aa
                </div>
                <div className="text-xs text-muted-foreground">{f.label}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Default note colour" description="Used for notes that don't set their own colour.">
          <ColorPicker
            value={settings.default_note_color}
            onChange={(c) => void update({ default_note_color: c })}
            label="Default note colour"
            trigger={
              <Button variant="outline" className="gap-2">
                <span
                  className="size-4 rounded-full border"
                  style={{ background: accentOf(settings.default_note_color) ?? 'var(--card)' }}
                />
                {settings.default_note_color ? 'Change colour' : 'Choose a colour'}
              </Button>
            }
          />
        </Section>

        <Section
          title="Default text colour"
          description="Used for notes that don't set their own text colour. Adjusted automatically to stay readable."
        >
          <ColorPicker
            value={settings.default_text_color}
            onChange={(c) => void update({ default_text_color: c })}
            swatches={TEXT_SWATCHES}
            variant="text"
            surface={noteColors(settings.default_note_color, null, isDark).bg ?? undefined}
            label="Default text colour"
            trigger={
              <Button variant="outline" className="gap-2">
                <span
                  className="font-semibold"
                  style={{
                    color:
                      textColor(
                        settings.default_text_color,
                        isDark ? DEFAULT_SURFACE.dark : DEFAULT_SURFACE.light,
                        isDark
                      ) ?? undefined,
                  }}
                >
                  A
                </span>
                {settings.default_text_color ? 'Change colour' : 'Choose a colour'}
              </Button>
            }
          />
        </Section>

        <Section title="Dictation language" description="The language you speak when dictating notes and questions.">
          <DictationLanguage />
        </Section>

        <Section title="Tags" description="Rename, recolour or delete tags. Deleting a tag doesn't delete notes.">
          <TagManager />
        </Section>
      </div>
    </div>
  );
}

function TagManager() {
  const { tags, refreshTags } = useData();
  const [name, setName] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createTag(name.trim(), 'slate');
      setName('');
      await refreshTags();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void create(e)} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" maxLength={40} />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {tags.map((t) => (
            <TagRow key={t.id} tag={t} onChanged={() => void refreshTags()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TagRow({ tag, onChanged }: { tag: Tag; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  const save = async (patch: Partial<Pick<Tag, 'name' | 'color'>>) => {
    try {
      await api.updateTag(tag.id, patch);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async () => {
    try {
      await api.deleteTag(tag.id);
      toast.success(`Deleted tag “${tag.name}”`);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <ColorPicker
        value={tag.color}
        allowNone={false}
        onChange={(c) => c && void save({ color: c })}
        label="Tag colour"
        trigger={
          <button
            className="size-5 shrink-0 rounded-full border"
            style={{ background: accentOf(tag.color) ?? '#888' }}
            aria-label="Tag colour"
          />
        }
      />
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save({ name: name.trim() });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus maxLength={40} />
          <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save">
            <Check className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 truncate text-sm">{tag.name}</span>
          <span className="text-xs text-muted-foreground">{tag.note_count ?? 0} notes</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Rename tag">
            <Pencil className="size-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => void remove()} aria-label="Delete tag">
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

const BROWSER_DEFAULT = 'browser';

function DictationLanguage() {
  const { settings, update } = useSettings();
  const effective = useDictationLang();
  const value = settings.dictation_lang ?? BROWSER_DEFAULT;
  const browserLabel = DICTATION_LANGUAGES.find((l) => l.tag === effective)?.label ?? effective;
  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={(v) => void update({ dictation_lang: v === BROWSER_DEFAULT ? null : v })}>
        <SelectTrigger className="w-64" aria-label="Dictation language">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BROWSER_DEFAULT}>Browser default ({browserLabel})</SelectItem>
          {DICTATION_LANGUAGES.map((l) => (
            <SelectItem key={l.tag} value={l.tag}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!effective.toLowerCase().startsWith('en') && (
        <p className="text-sm text-muted-foreground">
          Spoken commands like “period” and “new line” only work in English; punctuation is still added when you stop.
        </p>
      )}
      {!dictationSupported() && (
        <p className="text-sm text-muted-foreground">
          Dictation needs Chrome, Edge or Safari. This browser doesn&apos;t support speech recognition.
        </p>
      )}
    </div>
  );
}
