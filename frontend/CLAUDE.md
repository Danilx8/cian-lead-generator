# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — TypeScript check (`tsc -b`) + Vite production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build
- `npx tsc --noEmit` — type-check only (no build)

No test runner is configured.

## Architecture

Web app for cian-lead-generator: managing messaging slots, real-estate filters, templates, and dialogs. Built with React 19 + TypeScript + Vite + Tailwind CSS 3. Adapted from goat-sender-react (the goat-kleinanzeigen-sender frontend); no longer a Telegram Mini App.

### Key layers

- **Pages** (`src/pages/`) — lazy-loaded via `React.lazy` in `App.tsx`. Each page is a self-contained screen. Navbar visibility is controlled per-route in `AppLayout`.
- **API** (`src/api/`) — service-per-entity pattern. `client.ts` is the fetch wrapper with JWT auth (from localStorage), GET caching (5s TTL), and request deduplication. All services import from `client.ts`. API base URL is hardcoded in `config.ts`. WebSocket via `socketService.ts` (socket.io).
- **Store** (`src/store/appStore.ts`) — single Zustand store with `subscribeWithSelector`. Holds user, dialogs, messages (keyed by dialogId), templates, proxies, notifications, safe-area insets, socket status.
- **Hooks** (`src/hooks/`) — `useTelegramMiniApp` (auth + fullscreen + safe-area), `useWebSocket` (socket.io connection), `useChatAutoUpdate`/`useDialogsAutoUpdate` (polling), `useKeyboardOpen` (mobile keyboard detection).
- **Components** (`src/components/`) — `PageHeader` is the unified sticky header (back + title + optional children/rightElement). Reusable UI primitives in `components/ui/` (Toggle, Select, PillSelect, PillTabs). `AdminGodRoute` guards admin routes.

### Routing

Defined in `App.tsx`. Main routes: `/` (home), `/messages`, `/messages/chat/:id`, `/slots`, `/slots/new`, `/slots/:workerId/edit`, `/slots/:id/logs`, `/templates`, `/templates/:id`, `/profile`, `/settings`, `/tickets`, `/tickets/:id`, `/admin/users`, `/admin/users/:userId`, `/add-funds`, `/filters/new`, `/filters/:id`, `/qr-templates`.

### Styling

Tailwind with custom theme in `tailwind.config.js`. Light cyan-and-white theme layered over the original dark design system: token NAMES are kept from the dark original but VALUES are flipped — `bg-black` renders the light page background (#F5FAFD), `text-white` renders dark text (#0B2430), `bg-white/10` renders a subtle dark tint. Do not "fix" these class names; change values only in `tailwind.config.js`/`variables.css`.
- Colors: `accent` (#00AEEF cyan), `black` (#F5FAFD page bg), `white` (#0B2430 text), `lighter-black` (#FFFFFF cards), `second-accent` (#0077B6), `navbar-stroke` (#B9D7E5)
- Custom utilities: `.pt-safe` / `.pb-safe` (safe-area padding, defined in `index.css`), superellipse clip-paths, navbar-safe helpers
- CSS variables in `src/styles/variables.css` (`--safe-area-inset-top`, `--navbar-height`, `--app-height`)
- Framer Motion for animations

### Auth flow

Email/password auth against `/api/auth` (login, register with moderation — 202 pending, refresh with rotation, logout, me). JWT token stored in localStorage; `client.ts` attaches it as `Authorization: Bearer`. Unauthenticated users are routed to `/login` / `/register`. Admin access: `VITE_ADMIN_KEY` env variable (sent as `X-Admin-Key`) or a JWT whose user has `role: "admin"`.

## Design System — Liquid Glass

The app is being redesigned to follow the **Liquid Glass** aesthetic (inspired by Apple's WWDC 2025 design language). All new UI work and component refactors MUST follow these principles.

### Core Principles

1. **Translucent glass surfaces** — Primary containers use `backdrop-blur` (16–24px) over semi-transparent backgrounds (`rgba(255,255,255,0.08)` to `rgba(255,255,255,0.15)` on dark theme). Content behind shows through, creating depth.
2. **Specular highlights & light borders** — Top/left edges get a subtle light border (`rgba(255,255,255,0.15–0.25)`) simulating light catching glass. Use CSS `border` or `box-shadow: inset 0 0.5px 0 0 rgba(255,255,255,0.2)` for the effect.
3. **Layered depth** — UI has clear depth layers. Floating elements cast soft shadows (`0 8px 32px rgba(0,0,0,0.3)`). Background → content layer → floating controls (navbar, modals, toasts).
4. **Continuous corners (superellipse)** — All glass surfaces use large, smooth border-radius. Navbar: `28–32px`. Cards: `20–24px`. Buttons inside glass: `16–20px`. Inner elements have proportionally smaller radii.
5. **Spring-based animations** — All transitions use Framer Motion spring physics (`type: "spring", stiffness: 400, damping: 30`). No linear or ease-in/out for interactive elements. Indicator slides between positions with spring.
6. **Subtle vibrancy** — Glass surfaces subtly tint based on content behind. Dark theme uses very slight warm tint (`rgba(255,255,255,0.05)`).
7. **Floating layout** — Key navigation (navbar) and action elements float with margins from screen edges instead of being flush/attached. This creates breathing room and emphasizes the glass effect.
8. **Haptic-like feedback** — Interactive elements scale down slightly on press (`scale: 0.95`) with spring animation, then bounce back.

## Design System — True Liquid Glass (WWDC25)

The app MUST implement physical Liquid Glass, not traditional Glassmorphism.

Liquid Glass is a dynamic optical material that:

- refracts background pixels;
- diffuses and scatters light;
- creates localized lens distortion;
- generates specular highlights;
- adapts tint according to surrounding content;
- behaves like a fluid transparent material.

Do NOT implement simple `backdrop-blur + opacity` and call it Liquid Glass.

---

## Optical Stack

Every glass surface consists of five independent layers.

### Layer 1 — Refraction

Distort pixels behind the surface.

Preferred implementations:

1. SVG `feDisplacementMap`
2. Canvas-generated displacement map
3. WebGL shader
4. CSS-only fallback if unsupported

Example:

```html
<filter id="liquid-glass-filter">
  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />

  <feTurbulence
    type="fractalNoise"
    baseFrequency="0.012"
    numOctaves="2"
    result="noise"
  />

  <feDisplacementMap
    in="blur"
    in2="noise"
    scale="18"
    xChannelSelector="R"
    yChannelSelector="G"
  />
</filter>
```

Refraction MUST be localized near curved edges and corners.

Center distortion should remain minimal.

---

### Layer 2 — Diffusion

Glass is not perfectly transparent.

It slightly scatters light.

Always use:

```css
backdrop-filter:
  blur(24px)
  saturate(180%)
  brightness(1.08);

-webkit-backdrop-filter:
  blur(24px)
  saturate(180%)
  brightness(1.08);
```

Never use blur alone.

Saturation and brightness are mandatory.

---

### Layer 3 — Specular Highlights

Every glass element must contain:

1. Edge highlights
2. Moving reflections
3. Internal shine

Example:

```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.28),
  inset 0 -1px 0 rgba(255,255,255,0.06),
  0 12px 40px rgba(0,0,0,0.35);
```

Use `::before` for top reflection and `::after` for internal glow.

Highlights should subtly move during hover, scroll, and page transitions.

---

### Layer 4 — Dynamic Tint

Glass color is informed by content behind it.

Never use static:

```css
background: rgba(255,255,255,0.08);
```

Prefer:

```css
background:
  color-mix(
    in srgb,
    var(--backdrop-average-color) 10%,
    rgba(255,255,255,0.08)
  );
```

If backdrop sampling is unavailable, use:

```css
background: rgba(255,255,255,0.08);
```

as a fallback only.

---

### Layer 5 — Depth Compression

Glass behaves like a lens.

Elements behind glass should appear:

- compressed;
- magnified near edges;
- slightly stretched near corners.

This effect MUST come from displacement maps, not scale transforms.

---

## React Architecture

Create reusable primitives:

```text
src/components/liquid-glass/
```

### Components

```text
LiquidGlass.tsx
LiquidGlassNavbar.tsx
LiquidGlassCard.tsx
LiquidGlassButton.tsx
LiquidGlassModal.tsx
LiquidGlassProvider.tsx
```

### Hooks

```text
useLiquidGlass()
useGlassRefraction()
useBackdropSampling()
useGlassMotion()
useReducedTransparency()
```

### Utilities

```text
createDisplacementMap.ts
createNormalMap.ts
computeBackdropTint.ts
```

---

## SVG Filter System

Create a single shared SVG filter root:

```tsx
<svg width="0" height="0" aria-hidden="true">
  <defs>
    <filter id="liquid-glass">
      <!-- shared filter pipeline -->
    </filter>
  </defs>
</svg>
```

All glass components should reuse the same filter.

Never create filters per component instance.

---

## Base Liquid Glass Component

```tsx
<GlassSurface
  blur={24}
  displacement={18}
  tint="adaptive"
  reflections
  refraction
/>
```

Every glass component must be built on top of `GlassSurface`.

---

## Rendering Rules

### NEVER

```css
backdrop-blur-xl
bg-white/10
```

and call it Liquid Glass.

### ALWAYS

Combine:

```text
backdrop-filter
+
SVG displacement
+
specular highlights
+
dynamic tint
+
animated reflections
```

---

## Performance Requirements

Telegram WebView has limited GPU resources.

### Blur

Default:

```css
blur(16px)
```

Elevated:

```css
blur(24px)
```

Never exceed:

```css
blur(32px)
```

---

### Displacement Maps

Maximum texture size:

```text
512x512
```

Reuse textures.

Memoize maps.

Never regenerate maps on every render.

---

### Animations

All optical effects must use:

```tsx
requestAnimationFrame
```

or:

```tsx
Framer Motion springs
```

Never use:

```tsx
setInterval
```

---

### React Optimization

All Liquid Glass components must use:

```tsx
React.memo()
useMemo()
useCallback()
```

Prefer CSS variables over state updates for optical properties.

---

## Accessibility

Implement:

```css
@media (prefers-reduced-transparency: reduce)
```

Fallback:

```css
background: rgba(30,30,30,0.92);
backdrop-filter: none;
-webkit-backdrop-filter: none;
filter: none;
```

The entire Liquid Glass system must degrade gracefully.

---

## Animation Principles

Liquid Glass behaves like a liquid lens.

Animations should feel:

- elastic;
- slightly delayed;
- fluid;
- mass-based.

Default spring:

```tsx
{
  type: "spring",
  stiffness: 350,
  damping: 28,
  mass: 0.8
}
```

Press:

```tsx
scale: 0.96
```

Hover:

```tsx
translateY: -1
```

Reflections:

```tsx
x: [-5, 5]
opacity: [0.7, 1]
```

using spring interpolation.

---

## Rules for Claude Code

1. Never implement fake glassmorphism.
2. Prefer SVG `feDisplacementMap` over pure CSS.
3. Use one shared filter pipeline.
4. Refraction must distort background pixels.
5. Blur, saturation, and brightness always work together.
6. Glass tint depends on surrounding content.
7. Specular highlights are mandatory.
8. Provide reduced-transparency fallback.
9. Optimize for Telegram WebView GPU limitations.
10. Every new component must be built on top of `LiquidGlass` primitives.
11. Prefer GPU-accelerated transforms and CSS variables.
12. Avoid per-frame React re-renders for optical effects.
13. Use `pointer-events: none` on purely decorative reflection layers.
14. All floating elements must use continuous corners (superellipse geometry).
15. Nested glass surfaces should inherit tint and optical depth from parent surfaces.