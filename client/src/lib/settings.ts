import { createContext, useContext } from 'react';
import type { Settings } from './api';

export interface SettingsContextValue {
  settings: Settings;
  isDark: boolean;
  update: (patch: Partial<Omit<Settings, 'user'>>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
