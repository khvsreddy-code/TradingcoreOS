import type { LucideIcon } from "lucide-react";

import type { IconProvider } from "./types";

export type LucideIconMap = Readonly<Record<string, LucideIcon>>;

export function createLucideIconProvider(icons: LucideIconMap): IconProvider<LucideIcon> {
  return {
    id: "lucide",
    resolve: (name) => icons[name],
  };
}
