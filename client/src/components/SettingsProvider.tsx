import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { api, type Settings } from '@/lib/api';
import { backgroundSurface } from '@/lib/colors';
import { SettingsContext } from '@/lib/settings';

const DEFAULT_SETTINGS: Settings = {
  user: '',
  theme: 'system',
  bg_color: null,
  default_font: 'inter',
  default_note_color: null,
  default_text_color: null,
  dictation_lang: null,
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setTheme(s.theme);
      })
      .catch(() => toast.error('Could not load your settings'));
  }, [setTheme]);

  // Apply the custom app background through a CSS variable.
  useEffect(() => {
    const surface = backgroundSurface(settings.bg_color, isDark);
    const root = document.documentElement;
    if (surface) root.style.setProperty('--app-bg', surface.bg);
    else root.style.removeProperty('--app-bg');
  }, [settings.bg_color, isDark]);

  const update = useCallback(
    async (patch: Partial<Omit<Settings, 'user'>>) => {
      const previous = settings;
      setSettings((s) => ({ ...s, ...patch }));
      if (patch.theme) setTheme(patch.theme);
      try {
        setSettings(await api.saveSettings(patch));
      } catch {
        setSettings(previous);
        if (patch.theme) setTheme(previous.theme);
        toast.error('Could not save settings');
      }
    },
    [settings, setTheme]
  );

  const value = useMemo(() => ({ settings, isDark, update }), [settings, isDark, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
