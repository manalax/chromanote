import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { normalizeTitle } from '../../../shared/wikilinks';
import { api, type NoteRef, type Tag } from '@/lib/api';
import { DataContext } from '@/lib/data';

export function DataProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [titles, setTitles] = useState<NoteRef[]>([]);

  const refreshTags = useCallback(async () => {
    setTags(await api.listTags());
  }, []);
  const refreshTitles = useCallback(async () => {
    setTitles(await api.titles());
  }, []);

  useEffect(() => {
    api.listTags().then(setTags, () => undefined);
    api.titles().then(setTitles, () => undefined);
  }, []);

  const titleIndex = useMemo(() => {
    const index = new Map<string, string>();
    // Titles arrive newest first; keep the first (most recently edited) match.
    for (const t of titles) {
      const key = normalizeTitle(t.title);
      if (!index.has(key)) index.set(key, t.id);
    }
    return index;
  }, [titles]);

  const value = useMemo(
    () => ({ tags, refreshTags, titles, titleIndex, refreshTitles }),
    [tags, refreshTags, titles, titleIndex, refreshTitles]
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
