import { baseTokens, defaultTheme } from "@tradingcore/ui-tokens";

import type {
  ResolvedTheme,
  RuntimeTheme,
  SystemThemePreferences,
  ThemeId,
  ThemePreference,
  ThemeRegistry,
  ThemeSource,
} from "./types";

type ThemeResolutionInput = {
  registry: ThemeRegistry;
  registeredThemeIds: readonly ThemeId[];
  userPreference: ThemePreference;
  systemPreferences: SystemThemePreferences;
  workspaceThemeId?: ThemeId;
  pluginThemeId?: ThemeId;
  developerThemeId?: ThemeId;
};

const resolveRegisteredTheme = (
  registry: ThemeRegistry,
  registeredThemeIds: readonly ThemeId[],
  candidate: ThemeId,
  source: ThemeSource,
): ResolvedTheme | undefined => {
  if (!registeredThemeIds.includes(candidate)) {
    return undefined;
  }

  const registration = registry.get(candidate);

  return registration ? { id: registration.id, source, tokens: registration.tokens } : undefined;
};

export function resolveTheme(input: ThemeResolutionInput): ResolvedTheme {
  const { registry, registeredThemeIds, systemPreferences } = input;

  if (systemPreferences.forcedColors) {
    const accessibleTheme = resolveRegisteredTheme(
      registry,
      registeredThemeIds,
      "high-contrast",
      "accessibility",
    );
    if (accessibleTheme) {
      return accessibleTheme;
    }
  }

  const candidates: Array<[ThemeId | undefined, ThemeSource]> = [
    [input.developerThemeId, "developer"],
    [input.pluginThemeId, "plugin"],
    [input.workspaceThemeId, "workspace"],
    [input.userPreference === "system" ? undefined : input.userPreference, "user"],
    [systemPreferences.colorScheme, "system"],
    [defaultTheme, "fallback"],
  ];

  for (const [candidate, source] of candidates) {
    if (candidate) {
      const resolved = resolveRegisteredTheme(registry, registeredThemeIds, candidate, source);
      if (resolved) {
        return resolved;
      }
    }
  }

  throw new Error("Theme registry must contain the default TradingCore theme.");
}

export function createRuntimeTheme(resolvedTheme: ResolvedTheme): RuntimeTheme {
  const { id, tokens } = resolvedTheme;

  return {
    id,
    surface: {
      primary: tokens.background.base,
      secondary: tokens.background.elevated,
      overlay: tokens.background.overlay,
      modal: tokens.background.modal,
      sidebar: tokens.background.sidebar,
      workspace: tokens.background.workspace,
    },
    text: tokens.color.semantic.text,
    icon: tokens.color.semantic.icon,
    border: {
      default: tokens.border.subtle,
      strong: tokens.border.strong,
      focus: tokens.border.focus,
      stroke: tokens.border.stroke,
    },
    status: {
      success: tokens.color.semantic.success,
      warning: tokens.color.semantic.warning,
      error: tokens.color.semantic.error,
      info: tokens.color.semantic.info,
    },
    trade: tokens.color.semantic.trade,
    action: {
      primary: tokens.color.primary,
      secondary: tokens.color.secondary,
      accent: tokens.color.accent,
    },
    glass: tokens.glass,
    shadow: tokens.shadow,
    scale: baseTokens,
  };
}
