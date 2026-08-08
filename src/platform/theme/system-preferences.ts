import type { SystemThemePreferences } from "./types";

const colorSchemeQuery = "(prefers-color-scheme: light)";
const forcedColorsQuery = "(forced-colors: active)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

const serverPreferences: SystemThemePreferences = {
  colorScheme: "dark",
  forcedColors: false,
  reducedMotion: false,
  fontScale: 1,
};

export function getSystemThemePreferences(): SystemThemePreferences {
  if (typeof window === "undefined") {
    return serverPreferences;
  }

  return {
    colorScheme: window.matchMedia(colorSchemeQuery).matches ? "light" : "dark",
    forcedColors: window.matchMedia(forcedColorsQuery).matches,
    reducedMotion: window.matchMedia(reducedMotionQuery).matches,
    fontScale: 1,
  };
}

export function subscribeToSystemThemePreferences(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const queries = [colorSchemeQuery, forcedColorsQuery, reducedMotionQuery].map((query) =>
    window.matchMedia(query),
  );
  queries.forEach((query) => query.addEventListener("change", listener));

  return () => {
    queries.forEach((query) => query.removeEventListener("change", listener));
  };
}
