import type { RuntimeTheme } from "@/platform/theme";

import { iconSizes, iconStrokeAliases } from "./specification";
import type { IconAccessibility, IconSpec, IconTone, ResolvedIcon } from "./types";

function resolveColor(theme: RuntimeTheme, tone: IconTone): string {
  switch (tone) {
    case "primary":
      return theme.icon.primary;
    case "secondary":
      return theme.icon.secondary;
    case "disabled":
      return theme.icon.disabled;
    case "inverse":
      return theme.icon.inverse;
    case "actionPrimary":
      return theme.action.primary.solid;
    case "actionSecondary":
      return theme.action.secondary.solid;
    case "actionAccent":
      return theme.action.accent.solid;
    case "success":
      return theme.status.success.foreground;
    case "warning":
      return theme.status.warning.foreground;
    case "error":
      return theme.status.error.foreground;
    case "info":
      return theme.status.info.foreground;
    case "tradeLong":
      return theme.trade.long.foreground;
    case "tradeShort":
      return theme.trade.short.foreground;
  }
}

function resolveAccessibility(accessibility: IconAccessibility): ResolvedIcon["accessibility"] {
  if (accessibility.kind === "decorative") {
    return { ariaHidden: true };
  }

  return { ariaHidden: false, ariaLabel: accessibility.label, role: "img" };
}

export function resolveIcon(theme: RuntimeTheme, spec: IconSpec): ResolvedIcon {
  const size = iconSizes[spec.size ?? "md"];
  const stroke = iconStrokeAliases[spec.stroke ?? "regular"];

  return {
    icon: spec.icon,
    role: spec.role,
    size: theme.scale.typography.fontSize[size.fontSize],
    slot: theme.scale.spacing[size.slot],
    strokeWidth: theme.scale.borderWidth[stroke],
    color: resolveColor(theme, spec.tone ?? "primary"),
    accessibility: resolveAccessibility(spec.accessibility),
  };
}
