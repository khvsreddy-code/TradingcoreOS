import type { MotionPreset, MotionPresetDefinition } from "./types";

const instant = {
  category: "interaction",
  transition: { type: "tween", duration: "instant", delay: "instant", easing: "standard" },
  effects: {},
} as const satisfies MotionPresetDefinition;

const fast = {
  category: "interaction",
  transition: { type: "tween", duration: "fast", delay: "instant", easing: "standard" },
  effects: { opacity: { from: "medium", to: "solid" } },
} as const satisfies MotionPresetDefinition;

const normal = {
  category: "navigation",
  transition: { type: "tween", duration: "standard", delay: "instant", easing: "enter" },
  effects: {
    opacity: { from: "transparent", to: "solid" },
    translate: { direction: "up", distance: 2 },
  },
} as const satisfies MotionPresetDefinition;

const slow = {
  category: "background",
  transition: { type: "tween", duration: "deliberate", delay: "instant", easing: "standard" },
  effects: { opacity: { from: "muted", to: "solid" } },
} as const satisfies MotionPresetDefinition;

const spring = {
  category: "interaction",
  transition: { type: "spring", duration: "standard", delay: "instant", spring: "responsive" },
  effects: { scale: { from: "subtle", to: "rest" } },
} as const satisfies MotionPresetDefinition;

const overlay = {
  category: "overlay",
  transition: { type: "tween", duration: "fast", delay: "instant", easing: "standard" },
  effects: { opacity: { from: "transparent", to: "medium" }, blur: { from: "none", to: "subtle" } },
} as const satisfies MotionPresetDefinition;

const modal = {
  ...normal,
  category: "overlay",
  effects: {
    opacity: { from: "transparent", to: "solid" },
    scale: { from: "subtle", to: "rest" },
  },
} as const satisfies MotionPresetDefinition;

export const motionPresets: Record<MotionPreset, MotionPresetDefinition> = {
  instant,
  fast,
  normal,
  slow,
  ultraSlow: slow,
  spring,
  elastic: {
    ...spring,
    transition: { type: "spring", duration: "deliberate", delay: "instant", spring: "gentle" },
  },
  modal,
  toast: {
    ...fast,
    category: "feedback",
    effects: { translate: { direction: "down", distance: 2 } },
  },
  drawer: {
    ...normal,
    category: "overlay",
    effects: {
      translate: { direction: "right", distance: 4 },
      opacity: { from: "muted", to: "solid" },
    },
  },
  overlay,
  hover: { ...fast, effects: { scale: { from: "rest", to: "emphasized" } } },
  press: { ...instant, effects: { scale: { from: "emphasized", to: "subtle" } } },
  focus: { ...fast, effects: { opacity: { from: "soft", to: "solid" } } },
  loading: { ...slow, category: "feedback", effects: { opacity: { from: "soft", to: "strong" } } },
  chartUpdate: {
    ...fast,
    category: "trading",
    effects: { opacity: { from: "strong", to: "solid" } },
  },
  orderFill: { ...spring, category: "trading", effects: { scale: { from: "subtle", to: "rest" } } },
  notification: {
    ...fast,
    category: "system",
    effects: { opacity: { from: "transparent", to: "solid" } },
  },
  workspaceDock: {
    ...normal,
    category: "workspace",
    effects: { translate: { direction: "left", distance: 2 } },
  },
  commandPalette: { ...modal, category: "overlay" },
  priceFlash: {
    ...fast,
    category: "trading",
    effects: { opacity: { from: "strong", to: "solid" } },
  },
  pnlUpdate: {
    ...fast,
    category: "trading",
    effects: { opacity: { from: "medium", to: "solid" } },
  },
  positionOpen: { ...spring, category: "trading" },
  positionClose: {
    ...fast,
    category: "trading",
    effects: { opacity: { from: "solid", to: "medium" } },
  },
  scannerUpdate: {
    ...fast,
    category: "trading",
    effects: { opacity: { from: "muted", to: "solid" } },
  },
  marketStatus: { ...normal, category: "system" },
  connectionState: {
    ...normal,
    category: "system",
    effects: { opacity: { from: "medium", to: "solid" } },
  },
  aiStreaming: {
    ...fast,
    category: "feedback",
    effects: { opacity: { from: "muted", to: "solid" } },
  },
  coreSpiritConsole: {
    ...fast,
    category: "system",
    effects: { translate: { direction: "up", distance: 1 } },
  },
};
