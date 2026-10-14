import { createContext, useContext } from 'react';
import type { NoteRef, Tag } from './api';

/**
 * App-wide caches shared by several screens: the user's tags, and the
 * title -> note index used to render and autocomplete [[wikilinks]].
 */
export interface DataContextValue {
  tags: Tag[];
  refreshTags: () => Promise<void>;
  titles: NoteRef[];
  titleIndex: Map<string, string>;
  refreshTitles: () => Promise<void>;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
