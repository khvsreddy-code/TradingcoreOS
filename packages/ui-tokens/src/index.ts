import type { TokenThemes } from "./contract";
import { darkTheme } from "./themes/dark";
import { highContrastTheme } from "./themes/high-contrast";
import { lightTheme } from "./themes/light";

export * from "./contract";
export * from "./scales";
export { darkTheme, highContrastTheme, lightTheme };

export const themes = {
  dark: darkTheme,
  light: lightTheme,
  "high-contrast": highContrastTheme,
} as const satisfies TokenThemes;

export const defaultTheme = "dark";
