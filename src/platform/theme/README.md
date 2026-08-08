# TradingCore Theme Engine

## Scope

The Theme Engine is the framework-native boundary between Phase 1B design tokens and future UI. It contains no visual component, CSS value, token redefinition, theme-toggle interface, or business workflow. The provider is mounted once in the root App Router layout and renders only its children.

## Architecture

```text
Phase 1B token contract and theme data
  → ThemeRegistry (known core, institution, and plugin theme registrations)
    → deterministic resolver
      → RuntimeTheme semantic API
        → ThemeProvider context and useTheme subscriber hook
```

`createRuntimeTheme` maps Phase 1B token fields to stable semantic names. Future UI consumes values such as `theme.surface.primary`, `theme.text.primary`, `theme.border.default`, `theme.trade.long`, and `theme.trade.short`; it does not import a color literal or the raw token theme object.

## Lifecycle

1. The provider renders with a deterministic server-safe dark/system fallback.
2. On the client, it reads the abstracted persistence adapter and system media preferences.
3. It resolves the active registered theme, maps it to a `RuntimeTheme`, and updates context subscribers.
4. It writes `data-theme`, `data-theme-source`, and `data-reduced-motion` to the document root for future renderer integration. No visual rules are applied in Phase 1C.
5. System preference and registry changes notify the provider and trigger a new semantic runtime snapshot.

## Resolution order

The selected theme is deterministic. Highest priority wins:

1. **Forced-colors accessibility mode** selects the registered `high-contrast` theme.
2. **Developer override** is intended for local development, visual testing, and controlled host integration.
3. **Plugin override** applies only if its theme ID is registered through the approved registry.
4. **Workspace override** supports a future saved-layout theme preference.
5. **Stored user preference** is the persisted `system` choice or a registered theme ID.
6. **System color scheme** selects `dark` or `light`.
7. **Default fallback** selects the Phase 1B `dark` theme.

Unknown, unregistered IDs never resolve to arbitrary values; the resolver falls through safely. Core themes cannot be removed from the registry.

## Public API

```ts
import {
  ThemeProvider,
  createThemeRegistry,
  useTheme,
  type ThemeRegistration,
} from "@/platform/theme";

const { theme, setTheme, resetTheme, accessibility } = useTheme();

theme.surface.primary;
theme.text.primary;
theme.border.default;
theme.trade.long;
theme.trade.short;

setTheme("light");
resetTheme();
```

`setTheme` returns `false` for an unregistered ID and does not persist it. `ThemeProvider` accepts optional registry, persistence, workspace, plugin, and developer override inputs for host-level integration; it does not provide a UI to set any of them.

## Persistence and accessibility

`ThemePersistence` isolates read/write/clear behavior. The default browser adapter uses `localStorage` only after client hydration; a future encrypted, server-synced, native-host, or enterprise-policy adapter can replace it without changing components.

The engine subscribes to `prefers-color-scheme`, `forced-colors`, and `prefers-reduced-motion`. `accessibility` exposes reduced-motion, high-contrast, and a baseline font-scale value. Font-scale profiles and their renderer are intentionally deferred, while the API reserves the signal so they do not require a breaking contract later.

## Extension points

- **Institutional themes:** register a `ThemeRegistration` using only the frozen Phase 1B `ThemeTokens` contract.
- **Plugin themes:** register through a host-approved registry; plugins cannot mutate core theme values or unregister core themes.
- **Enterprise policy:** supply a persistence adapter and/or controlled overrides at the provider boundary.
- **Future Theme Engine work:** CSS variable emission, preference synchronization, accessibility profiles, and approved theme selection UI can be added without altering token names or consumer access patterns.
