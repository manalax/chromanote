import { useState } from 'react';
import { Check, Plus, Tags } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@databricks/appkit-ui/react';
import { api, type Tag } from '@/lib/api';
import { NOTE_SWATCHES, accentOf } from '@/lib/colors';
import { useData } from '@/lib/data';

interface TagPickerProps {
  selected: Tag[];
  onChange: (tagIds: string[]) => void;
}

export function TagPicker({ selected, onChange }: TagPickerProps) {
  const { tags, refreshTags } = useData();
  const [search, setSearch] = useState('');
  const selectedIds = new Set(selected.map((t) => t.id));
  const exact = tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const create = async () => {
    const name = search.trim();
    if (!name) return;
    try {
      const color = NOTE_SWATCHES[tags.length % NOTE_SWATCHES.length].key;
      const tag = await api.createTag(name, color);
      await refreshTags();
      onChange([...selectedIds, tag.id]);
      setSearch('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Tags">
          <Tags className="size-4" />
          <span className="hidden sm:inline">Tags</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find or create a tag…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{search.trim() ? 'No matching tags' : 'No tags yet'}</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem key={tag.id} value={tag.name} onSelect={() => toggle(tag.id)} className="gap-2">
                  <span className="size-2 rounded-full" style={{ background: accentOf(tag.color) ?? '#888' }} />
                  <span className="flex-1 truncate">{tag.name}</span>
                  {selectedIds.has(tag.id) && <Check className="size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={`create:${search}`} onSelect={() => void create()} className="gap-2">
                  <Plus className="size-4" />
                  Create “{search.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
