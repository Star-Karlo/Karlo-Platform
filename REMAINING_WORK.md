# Karlo Platform — State of the Frontend

SvelteKit 2 + Svelte 5 (runes) + TypeScript + Tailwind. `npm run check` reports
0 errors and 0 warnings; `npm run build` passes with `adapter-node`.

---

## 1. The design system

`UI_TEMPLATE/` is the source of truth for every visual value:

| File | What it holds |
|---|---|
| `karlouispec.md` | Layout, component anatomy, page-by-page inventory |
| `karlotokens.css` | The measured CSS custom properties |
| `karlo.tailwind.js` | The same values as a Tailwind preset |

`tailwind.config.ts` mirrors that preset, and `src/lib/styles/tokens.css` is a
copy of the token file imported by `src/app.css`. **Change a value in
`UI_TEMPLATE/` first, then mirror it** — do not invent a shade in a component.

The rule of thumb the spec states: navy is structure, cyan is action, green is
state, red is danger, gray is data.

### Shell

`src/routes/+layout.svelte` composes three pieces from
`src/lib/components/layout/`:

- **Topbar** — 64px, navy, sticky at `z-topbar`; wordmark, app-download link,
  language, notification bell with unread count, avatar dropdown.
- **Sidebar** — 215px expanding/collapsing to 75px over 0.5s, white, sticky
  under the topbar; 121px profile block, group separators, 35px items whose
  active state is the 0.5px `#64E480` ring plus a bold label. The collapse
  preference is persisted (`src/lib/stores/ui.ts`).
- **ActionBar** — 72px strip of quick-action tiles, driven by
  `quickActions` in `src/lib/constants/nav.ts`.

The action bar is sticky rather than `position: fixed`. It behaves the same and
avoids hard-coding the sidebar width into a left offset that would then have to
track the collapse state.

---

## 2. Component library — `src/lib/components/ui/`

Twenty components, all exported from `src/lib/components/ui/index.ts`:

```svelte
import { Button, DataTable, FilterPanel, PageHeader, type Column } from '$lib/components/ui';
```

| Component | Notes |
|---|---|
| `Button` | The only button system: `primary` / `outline` / `ghost` / `danger` at 36px + `cta` / `ctaFilled` at 50px radius |
| `Input`, `Select` | The 36px, 25px-radius pill; every form control in the app is one of these |
| `FilterPanel` | The signature `fieldset` + `legend` filter, with More / Clear / Search |
| `DataTable` | Navy header, zebra body, horizontal scroll, `Rows per page` pager |
| `Tabs`, `PillTab`, `SegmentedControl` | The three tab idioms the spec distinguishes |
| `Card`, `StatCard`, `PageHeader` | Surfaces and the single page-title treatment |
| `Modal`, `Toggle`, `StatusBadge`, `Avatar`, `Spinner`, `EmptyState`, `RowActions` | |
| `MapView`, `FileUpload` | Mapbox wrapper and the drag-and-drop uploader |

Two rules worth keeping:

- **`DataTable` renders text, never HTML.** A column supplies a `format` for
  plain text; anything with markup — a badge, an avatar, action icons — goes
  through the `cell` snippet. The previous version used `{@html}` on values
  straight from the API.
- **Page titles only come from `PageHeader`**, which fixes the spec's
  `20px/700` + icon treatment. The `24px/400` variant is gone.

---

## 3. Pages — `src/lib/pages/`

Each screen exists once and is parameterised by the role's URL prefix. The route
files under `src/routes/` are three-line wrappers:

```svelte
<script lang="ts">
	import OrderListPage from '$lib/pages/OrderListPage.svelte';
</script>

<OrderListPage basePath="/w/order" title="Orders" />
```

| Shared page | Used by |
|---|---|
| `OrderListPage`, `OrderDetailPage` | `/s`, `/t`, `/m`, `/a`, `/w` |
| `AgreementListPage` | `/s`, `/t`, `/m`, `/a` |
| `InvoiceListPage` | `/s`, `/t`, `/m`, `/a` |
| `InsightPage` | `/s`, `/t`, `/m` |
| `TruckListPage` | `/t`, `/m`, `/a` |
| `PlannerPage` | `/t`, `/m` |
| `SettingsPage` | `/s`, `/t`, `/m` |
| `MonitoringPage`, `InvestorDashboardPage` | `/a`, `/i` |
| `NotBuiltPage` | every nav destination without a screen yet |

This is what the five byte-identical copies of the order list used to be — and
why the warehouse's list linked to the shipper's detail route. Adding a role
means adding wrappers, not copying pages.

---

## 4. What is still missing

### Write flows
The stores expose the full API surface (`orderActions.create`, `setStatus`,
`assignDriver`, `invoiceActions.updateStatus`, …) but only the order detail page
calls a mutation. Still to build:

- Order creation and draft-order forms
- Assign driver / truck from the planner
- Agreement creation, XLS upload, approve / verify
- Invoice issue → submit → verify → pay actions
- Truck and warehouse CRUD

### Screens
46 routes render `NotBuiltPage`. They are reachable and correctly shelled, but
have no content — the admin master-data set, the user lists, every report, draft
order, my-shipper, client management, fleet insight, and the `…/create` forms.

### Integrations
None of these exist yet: Socket.IO notifications, Firebase push, PDF export, and
the chart library (`chart.js` is a dependency but nothing imports it).
`socket.io-client`, `sweetalert2`, `svelte-select` and `date-picker-svelte` are
likewise unused — drop them or use them.

**Truck positions.** The planner map renders but has nothing to plot. A truck
record carries no coordinates, and `/api/v1/trackers` is a device registry —
identity and the device-to-vehicle link only. Positions will come from a
telemetry service that is not built. When wiring history, resolve a device to
its vehicle **as at the timestamp** (`ENDPOINTS.trackers.vehicleByImei(imei, at)`):
devices move between trucks, and resolving an old trail against the current
vehicle silently credits one truck's kilometres to another.

**Routing** goes through `POST /api/v1/routing/route` (MAPID, proxied
server-side). Never call MAPID from the browser — the key is server-side
deliberately. Coordinates are `[longitude, latitude]`.

### Access control in the UI
Nothing is gated on permissions yet. When it is, two rules from the identity
service matter: an **empty `permissions` array does not mean "no access"** — a
company root account carries no keys and is unrestricted within
`access.tms.features`, and `isPlatformStaff` bypasses entitlement entirely. And
hiding a control is presentation only; the services enforce independently.

Render order-action buttons from `GET /orders/:id/transitions` rather than from
the status, as `OrderDetailPage` does — it accounts for role and for which side
of the order the caller's company is on.

### Security
- **No route guard.** Authentication is client-side only; there is no
  `hooks.server.ts`, so any signed-in user can open any role's URL. The services
  enforce their own permissions, but the UI does not.
- The sign-in page still accepts a bare `?token=` query parameter for links from
  other Karlo products. Tokens in URLs reach history, referrers and logs.
- Store errors are swallowed — a failed request looks the same as an empty
  result. The stores need an error field the pages can render.

---

## 5. The basemap

MapLibre GL over the FMS-hosted PMTiles archive — no API key, which is why the
Mapbox token that used to sit in `env.ts` is gone along with `mapbox-gl`.

There is no style JSON to fetch: `MapView.svelte` assembles the style from the
PMTiles source plus `protomaps-themes-base`, which is how FMS does it. Verified
against the live archive — 68 layers, zero style-spec validation errors, and all
nine source layers the theme needs are present (zoom 0–14, bbox 94–141.5E,
11.5S–8N).

Everything configurable sits in `MAP` in `src/lib/constants/env.ts`:

- **The PMTiles filename is date-versioned** (`basemap-20260812.pmtiles`) and
  changes when FMS rebuilds tiles. Swap in a `basemap-latest` alias here if one
  is published.
- **Glyphs and sprites come from protomaps' own asset host, not FMS.** Labels do
  not render without glyphs. If that third-party dependency is unacceptable,
  those are the two URLs FMS would need to mirror.
- The `© OpenStreetMap contributors` attribution is required by the tile licence.

## 6. Deployment

`svelte.config.js` uses `adapter-node` and the Dockerfile runs `node build`.
`PUBLIC_API_URL` points the app at a deployed environment; unset, it uses the
relative `/api/v1` path that the Vite proxy in `vite.config.ts` forwards to the
services on localhost.

**The proxy prefixes mirror the AWS ALB path rules.** A prefix that exists only
in `vite.config.ts` works locally and 404s in production, so new prefixes are
added by the backend to both — ask rather than editing that file.

### Session handling
Access tokens last 15 minutes. `src/lib/utils/api.ts` refreshes on a 401, retries
the original request once, and signs out if the refresh fails. Concurrent 401s
share one in-flight refresh, which is not an optimisation: the refresh token
rotates on use, and reuse of a spent one is treated as theft and revokes the
session chain — parallel refreshes would sign the user out for having two tabs
open.

### Data shapes worth knowing
- Money and quantities arrive as **strings** (`price: "4500000"`) because they
  are decimals — a float cannot hold them exactly. Convert with `Number()` for
  display; **do not do arithmetic on money in the browser**, ask the backend for
  a computed total.
- `status` / `label` are **Indonesian**; `statusAlias` / `alias` are **English**.
  The UI renders the alias. The naming invites getting this backwards.
- Company names on agreements and invoices (`shipperCompanyName`,
  `transporterCompanyName`) are resolved server-side once per page. Do not join
  `/users` per row. An empty name means master data was unreachable.
