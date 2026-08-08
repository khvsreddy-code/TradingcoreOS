import type { RuntimeTheme } from "@/platform/theme";

export type MotionCategory =
  | "interaction"
  | "navigation"
  | "workspace"
  | "trading"
  | "system"
  | "overlay"
  | "feedback"
  | "background";

export type MotionPreset =
  | "instant"
  | "fast"
  | "normal"
  | "slow"
  | "ultraSlow"
  | "spring"
  | "elastic"
  | "modal"
  | "toast"
  | "drawer"
  | "overlay"
  | "hover"
  | "press"
  | "focus"
  | "loading"
  | "chartUpdate"
  | "orderFill"
  | "notification"
  | "workspaceDock"
  | "commandPalette"
  | "priceFlash"
  | "pnlUpdate"
  | "positionOpen"
  | "positionClose"
  | "scannerUpdate"
  | "marketStatus"
  | "connectionState"
  | "aiStreaming"
  | "coreSpiritConsole";

export type MotionPreference = "system" | "full" | "reduced" | "disabled";
export type ResolvedMotionPreference = Exclude<MotionPreference, "system">;
export type MotionTransitionType = "tween" | "spring";
export type MotionDirection = "up" | "down" | "left" | "right" | "none";

export type MotionDurationToken = keyof RuntimeTheme["scale"]["motion"]["duration"];
export type MotionEasingToken = keyof RuntimeTheme["scale"]["motion"]["easing"];
export type MotionSpringToken = keyof RuntimeTheme["scale"]["motion"]["spring"];
export type MotionOpacityToken = keyof RuntimeTheme["scale"]["opacity"];
export type MotionBlurToken = keyof RuntimeTheme["scale"]["blur"];
export type MotionSpacingToken = keyof RuntimeTheme["scale"]["spacing"];
export type MotionScaleToken = "rest" | "subtle" | "emphasized";
export type MotionRotateToken = "none";

export type MotionEffects = {
  opacity?: { from: MotionOpacityToken; to: MotionOpacityToken };
  scale?: { from: MotionScaleToken; to: MotionScaleToken };
  translate?: { direction: MotionDirection; distance: MotionSpacingToken };
  rotate?: { from: MotionRotateToken; to: MotionRotateToken };
  blur?: { from: MotionBlurToken; to: MotionBlurToken };
};

export type MotionPresetDefinition = {
  category: MotionCategory;
  transition: {
    type: MotionTransitionType;
    duration: MotionDurationToken;
    delay: MotionDurationToken;
    easing?: MotionEasingToken;
    spring?: MotionSpringToken;
  };
  effects: MotionEffects;
};

export type MotionAccessibility = {
  systemReducedMotion: boolean;
  preference?: MotionPreference;
};

export type ResolvedMotionPlan = {
  preset: MotionPreset;
  category: MotionCategory;
  preference: ResolvedMotionPreference;
  transition: {
    type: MotionTransitionType;
    duration: string;
    delay: string;
    easing?: string;
    spring?: { stiffness: number; damping: number; mass: number };
  };
  effects: {
    opacity?: { from: string; to: string };
    scale?: { from: number; to: number };
    translate?: { x: string; y: string };
    rotate?: { from: number; to: number };
    blur?: { from: string; to: string };
  };
};
