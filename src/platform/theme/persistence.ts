import type { ThemePersistence, ThemePreference } from "./types";

const storageKey = "tradingcore.theme-preference";

export function createBrowserThemePersistence(key = storageKey): ThemePersistence {
  return {
    read: () => {
      if (typeof window === "undefined") {
        return null;
      }

      const storedValue = window.localStorage.getItem(key);
      return storedValue === null ? null : (storedValue as ThemePreference);
    },
    write: (preference) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, preference);
      }
    },
    clear: () => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    },
  };
}

export const browserThemePersistence = createBrowserThemePersistence();
