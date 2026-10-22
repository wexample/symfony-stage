# Document editor shell — "Google Slides" layout (pages on the side, document in the centre)

Opened: 2026-10-09
Updated: 2026-10-13
Author: agent:archeology-drawers

# Document editor shell — "Google Slides" layout (pages on the side, document in the centre)

Opened: 2026-10-09
Closed: 2026-10-13

## Outcome — decided with weeger, built differently from the proposal

No dedicated shell component (`stage-editor`): the layout is the design system's zones, and what was missing was the link between regions. Built instead:

- **New package `symfony-workspace`** — what enriches dashboards beyond the zones (zones, resizer, toolbar stay in the design system):
  - `WorkspaceService` + `WorkspaceChannel`: named channels sharing a selection (ids only, framework-free, `listen`/`forget`, `workspace:select` event).
  - `WorkspaceVueMixin`: `workspaceSelection(name)` keeps a reactive copy in the vue.
  - Twig wires: `workspace-select` (publish from server-rendered markup, `aria-current`) and `workspace-follow` (reload a `page_embed` on selection).
  - Data stays with entities/repositories (`js-api-entity` caches instances); the channel carries ids only.
- **Design system**: new `isolated` component — content drawn in a shadow root with `:host { all: initial }`, a world of its own untouched by font, scheme or skin.
- **New package `symfony-workspace-demo`** (`/workspace/`): the layout arrangements moved from the design-system demo (regions, fixed, columns, dashboard) plus a minimal slide editor (rail → embed → vue inspector on one channel, slides isolated).
- mojoe: bundles registered, `WorkspaceService` listed, menu entries.

## Left

- Element registries not regenerated (blocked by other undeclared elements); `isolated` and the removal of `demo-collapsible-column` will land on next regeneration.
- Slide pages translated in en/fr only.
- No tests nor knowledge pages yet for the two new packages.

## Outcome (2026-10-13) — decided with weeger, built differently

No dedicated shell component: the layout is the design system's zones, and what was missing was the link between regions.

- **`symfony-workspace`** (new): `WorkspaceService` / `WorkspaceChannel` — named channels sharing a selection of ids, framework-free; `WorkspaceVueMixin` (`workspaceSelection(name)`); Twig wires `workspace-select` and `workspace-follow` (reloads a `page_embed`). Records stay with entities and their repositories.
- **`symfony-design-system`**: `isolated` component — content in a shadow root (`:host { all: initial }`), untouched by font, scheme or skin.
- **`symfony-workspace-demo`** (new, `/workspace/`): the layout arrangements moved from the design-system demo, plus a minimal slide editor.
- Left: element registries to regenerate once other undeclared elements are fixed; slide pages in en/fr only; no tests nor knowledge pages yet for the two new packages.
