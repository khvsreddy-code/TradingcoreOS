import type { baseTokens, ThemeTokens } from "@tradingcore/ui-tokens";

export type ThemeId = string;
export type ThemePreference = "system" | ThemeId;
export type ThemeSource =
  "accessibility" | "developer" | "plugin" | "workspace" | "user" | "system" | "fallback";

export type ThemeRegistrationSource = "core" | "institution" | "plugin";

export type ThemeRegistration = {
  id: ThemeId;
  tokens: ThemeTokens;
  source: ThemeRegistrationSource;
};

export type RuntimeTheme = {
  id: ThemeId;
  surface: {
    primary: string;
    secondary: string;
    overlay: string;
    modal: string;
    sidebar: string;
    workspace: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
  };
  icon: {
    primary: string;
    secondary: string;
    disabled: string;
    inverse: string;
  };
  border: {
    default: string;
    strong: string;
    focus: string;
    stroke: string;
  };
  status: {
    success: ThemeTokens["color"]["semantic"]["success"];
    warning: ThemeTokens["color"]["semantic"]["warning"];
    error: ThemeTokens["color"]["semantic"]["error"];
    info: ThemeTokens["color"]["semantic"]["info"];
  };
  trade: ThemeTokens["color"]["semantic"]["trade"];
  action: Pick<ThemeTokens["color"], "primary" | "secondary" | "accent">;
  glass: ThemeTokens["glass"];
  shadow: ThemeTokens["shadow"];
  scale: typeof baseTokens;
};

export type SystemThemePreferences = {
  colorScheme: "dark" | "light";
  forcedColors: boolean;
  reducedMotion: boolean;
  fontScale: number;
};

export type ResolvedTheme = {
  id: ThemeId;
  source: ThemeSource;
  tokens: ThemeTokens;
};

export type ThemePersistence = {
  read: () => ThemePreference | null;
  write: (preference: ThemePreference) => void;
  clear: () => void;
};

export type ThemeRegistry = {
  get: (id: ThemeId) => ThemeRegistration | undefined;
  has: (id: ThemeId) => boolean;
  list: () => readonly ThemeRegistration[];
  register: (registration: ThemeRegistration) => void;
  unregister: (id: ThemeId) => void;
  getSnapshot: () => readonly ThemeRegistration[];
  subscribe: (listener: () => void) => () => void;
};
