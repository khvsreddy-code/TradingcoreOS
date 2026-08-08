"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { browserThemePersistence } from "./persistence";
import { defaultThemeRegistry } from "./registry";
import { createRuntimeTheme, resolveTheme } from "./resolve-theme";
import { getSystemThemePreferences, subscribeToSystemThemePreferences } from "./system-preferences";
import type {
  RuntimeTheme,
  SystemThemePreferences,
  ThemeId,
  ThemePersistence,
  ThemePreference,
  ThemeRegistry,
  ThemeSource,
} from "./types";

type ThemeContextValue = {
  theme: RuntimeTheme;
  themeId: ThemeId;
  source: ThemeSource;
  preference: ThemePreference;
  availableThemes: readonly ThemeId[];
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    fontScale: number;
  };
  setTheme: (preference: ThemePreference) => boolean;
  resetTheme: () => void;
};

export type ThemeProviderProps = {
  children: ReactNode;
  registry?: ThemeRegistry;
  persistence?: ThemePersistence;
  workspaceThemeId?: ThemeId;
  pluginThemeId?: ThemeId;
  developerThemeId?: ThemeId;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  registry = defaultThemeRegistry,
  persistence = browserThemePersistence,
  workspaceThemeId,
  pluginThemeId,
  developerThemeId,
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(
    () => persistence.read() ?? "system",
  );
  const [systemPreferences, setSystemPreferences] =
    useState<SystemThemePreferences>(getSystemThemePreferences);
  useEffect(() => {
    return subscribeToSystemThemePreferences(() => {
      setSystemPreferences(getSystemThemePreferences());
    });
  }, []);

  const registrations = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );

  const availableThemes = useMemo(
    () => registrations.map((registration) => registration.id),
    [registrations],
  );

  const resolvedTheme = useMemo(
    () =>
      resolveTheme({
        registry,
        registeredThemeIds: availableThemes,
        userPreference: preference,
        systemPreferences,
        workspaceThemeId,
        pluginThemeId,
        developerThemeId,
      }),
    [
      developerThemeId,
      pluginThemeId,
      availableThemes,
      preference,
      registry,
      systemPreferences,
      workspaceThemeId,
    ],
  );
  const theme = useMemo(() => createRuntimeTheme(resolvedTheme), [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme.id;
    document.documentElement.dataset.themeSource = resolvedTheme.source;
    document.documentElement.dataset.reducedMotion = String(systemPreferences.reducedMotion);
  }, [resolvedTheme.id, resolvedTheme.source, systemPreferences.reducedMotion]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeId: resolvedTheme.id,
      source: resolvedTheme.source,
      preference,
      availableThemes,
      accessibility: {
        reducedMotion: systemPreferences.reducedMotion,
        highContrast: systemPreferences.forcedColors || resolvedTheme.id === "high-contrast",
        fontScale: systemPreferences.fontScale,
      },
      setTheme: (nextPreference) => {
        if (nextPreference !== "system" && !registry.has(nextPreference)) {
          return false;
        }

        persistence.write(nextPreference);
        setPreference(nextPreference);
        return true;
      },
      resetTheme: () => {
        persistence.clear();
        setPreference("system");
      },
    }),
    [availableThemes, persistence, preference, registry, resolvedTheme, systemPreferences, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
