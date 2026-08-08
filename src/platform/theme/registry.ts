import { themes, type ThemeTokens } from "@tradingcore/ui-tokens";

import type { ThemeId, ThemeRegistration, ThemeRegistry } from "./types";

const coreThemeRegistrations: ThemeRegistration[] = Object.entries(themes).map(([id, tokens]) => ({
  id,
  tokens: tokens as ThemeTokens,
  source: "core",
}));

export function createThemeRegistry(
  initialRegistrations: readonly ThemeRegistration[] = coreThemeRegistrations,
): ThemeRegistry {
  const registrations = new Map<ThemeId, ThemeRegistration>();
  const listeners = new Set<() => void>();
  let snapshot: readonly ThemeRegistration[] = [];

  const notify = () => {
    snapshot = [...registrations.values()];
    listeners.forEach((listener) => listener());
  };

  initialRegistrations.forEach((registration) => {
    registrations.set(registration.id, registration);
  });
  snapshot = [...registrations.values()];

  return {
    get: (id) => registrations.get(id),
    has: (id) => registrations.has(id),
    list: () => snapshot,
    register: (registration) => {
      registrations.set(registration.id, registration);
      notify();
    },
    unregister: (id) => {
      const registration = registrations.get(id);

      if (!registration || registration.source === "core") {
        return;
      }

      registrations.delete(id);
      notify();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const defaultThemeRegistry = createThemeRegistry();
