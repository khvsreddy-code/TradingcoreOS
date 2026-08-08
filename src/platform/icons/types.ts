import type { RuntimeTheme } from "@/platform/theme";

export type IconRole =
  | "navigation"
  | "trading"
  | "market"
  | "analytics"
  | "ai"
  | "workspace"
  | "settings"
  | "status"
  | "alerts"
  | "broker"
  | "coreSpirit"
  | "file"
  | "action";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
export type IconStroke = "thin" | "regular" | "strong";
export type IconTone =
  | "primary"
  | "secondary"
  | "disabled"
  | "inverse"
  | "actionPrimary"
  | "actionSecondary"
  | "actionAccent"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "tradeLong"
  | "tradeShort";

export type IconAccessibility = { kind: "decorative" } | { kind: "semantic"; label: string };

export type IconReference = {
  provider: string;
  name: string;
};

export type IconSpec = {
  icon: IconReference;
  role: IconRole;
  size?: IconSize;
  stroke?: IconStroke;
  tone?: IconTone;
  accessibility: IconAccessibility;
};

export type IconProvider<TIcon = unknown> = {
  id: string;
  resolve: (name: string) => TIcon | undefined;
};

export type IconRegistry = {
  get: (providerId: string) => IconProvider | undefined;
  list: () => readonly IconProvider[];
  register: (provider: IconProvider) => void;
  unregister: (providerId: string) => void;
};

export type IconFontSizeToken = keyof RuntimeTheme["scale"]["typography"]["fontSize"];
export type IconSpacingToken = keyof RuntimeTheme["scale"]["spacing"];
export type IconStrokeToken = keyof RuntimeTheme["scale"]["borderWidth"];

export type IconSizeDefinition = {
  fontSize: IconFontSizeToken;
  slot: IconSpacingToken;
};

export type ResolvedIcon = {
  icon: IconReference;
  role: IconRole;
  size: string;
  slot: string;
  strokeWidth: string;
  color: string;
  accessibility: {
    ariaHidden: boolean;
    ariaLabel?: string;
    role?: "img";
  };
};
