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
| `DashboardPage` (Insight > Overview, the login landing) | `/t`, `/m`, `/a` |
| `CompanyProfilePage` (Profil Perusahaan, `GET/PUT /companies/me`) | `/t`, `/m`, `/a` |
| `TruckDetailPage` (`/fleet/truck/[id]`, `?edit=1` for Edit Truck), `DriverDetailPage` (`/fleet/driver/[id]`) | `/t`, `/m`, `/a` |
| `TripAllowanceConfigurationPage` (company `settings.tripAllowance`), `TripAllowanceDriverAllowancePage`, `TripAllowanceReconciliationPage`; `AllowancePanel` on the order page shows whether the toll figure is MAPID's gate tariff (and for which golongan) or the per-km estimate (`tollEstimateSource`) | `/t`, `/m`, `/a` |
| `FinanceCoaPage`, `FinanceJurnalPage`, `FinanceLaporanPage` (`/ledger` for what a person types; automatic postings derived by `lib/revamp/jurnal.js`) | `/t`, `/m`, `/a` |
| `TruckListPage` (Data Armada; group filter and tag from `GET /vehicles?groupId=`) | `/t`, `/m`, `/a` |
| `MasterDataPage kind="vehicleGroup"` (Grup Armada under My Fleet, `/vehicle-group`, gated by `truck.read`; the same groups feed the truck form's group select and FMS's fleet groups) | `/t`, `/a` |
| `PlannerPage` (Allocate; its Toll Fare Estimate card reads `route.toll` per golongan, defaulting to the picked truck's class) | `/t`, `/m` |
| `SettingsPage` | `/s`, `/t`, `/m` |
| `MonitoringPage`, `InvestorDashboardPage` | `/a`, `/i` |
| `OrderKontrakDetailPage`, `OrderKontrakInvoicePage` (`/order/kontrak/[id]`, `…/invoice`) | `/t`, `/m`, `/a` |
| `ControlTowerPage` (`/control-tower`) | `/s`, `/t`, `/m`, `/a` |
| `NotBuiltPage` | every nav destination without a screen yet |

This is what the five byte-identical copies of the order list used to be — and
why the warehouse's list linked to the shipper's detail route. Adding a role
means adding wrappers, not copying pages.

### The multi-stop order screens

`OrderKontrakDetailPage`, `OrderKontrakInvoicePage` and `ControlTowerPage` read
the **journey's own points** — `stops[]` on the shipment read, each row carrying
`seq`, `kind`, `shipmentNo`, `finishedAt` and its own site — rather than the two
ends the shipment's own timestamps describe. A journey with **more than two
points** reports one of everything per point; a two-ended journey, and an order
placed before stops existed, takes the path it always took. The flow these
screens present is `MICROSERVICES/docs/shared/BUSINESS.md` §*When the order
carries several shipments*, and the rows behind it are
`MICROSERVICES/docs/business/MODEL.md` §*order_stops*.

- **E-POD approval acts on the POD of the visit being verified**, not one POD per
  stage (`podForStop`: the newest `podHistory` entry whose `stopId` is this
  stop's). A visit with no submission of its own now reports **null**, not
  another visit's: the fallback to the stage's un-stopped submission handed
  Muat 2 the photos Muat 1 was signed with and let a planner verify a delivery
  the driver had not reported, so it applies only to a journey with **no stop
  rows at all** — a two-ended trip, or an order from before PODs named a stop.
  This was the
  blocker: the page approved one submission per stage and only once every stop
  had been ticked, so on a journey with two unloading points the second POD was
  never sent for review, its stop never closed, and the order could never reach
  *Order Selesai*. `confirmVerification` now `PUT`s
  `/shipments/{id}/pod/{podId}/review` for that visit alone; the server closes
  that stop and advances the shipment when the **last** stop of the stage is
  done, so the console writes no status of its own.
- **The dialog only ever opens on a visit whose POD is waiting.**
  `firstVerifiableStop` returns the first visit of a phase that is not yet
  verified **and** has a submission of its own; -1 when there is none. Moving to
  the next unverified visit whatever its state trapped the planner in front of
  an empty form that could not be closed — verifying Muat 1 opened Muat 2 before
  the driver had filed anything, and the same on the unloading side. The gate
  and `proceedFromGate` follow the same rule.
- **The verification gate is re-armable.** It remembers **which submission** it
  was raised for (`gatedPodId`) rather than that it was raised at all: a
  one-shot flag meant the gate appeared once per page load, so after verifying
  Muat 1 the planner was shown nothing more until they reloaded — with no way to
  know there was anything to reload for. On a journey with its own stops the
  gate is driven by **paperwork that has arrived** (`firstVerifiableStop`, then
  that POD's `status === 'submitted'`) rather than by the order's status, which
  on a multi-stop delivery sits on one visit while another's POD is waiting.
  The page also **re-reads the shipment every 20 seconds** while the order is
  live — not while a dialog is open, and it stops at
  `pengiriman_terkonfirmasi` — so a POD filed at the second warehouse raises the
  gate by itself. Two-ended journeys keep the one-shot, status-driven gate they
  had (`verifikasi_pod_muat` / `verifikasi_pod_bongkar`).
- **"OTP Bongkar Terverifikasi" appears for the first unloading point too.**
  That point is confirmed through the **shipment's** own OTP, with no `stopId`
  attached, so reading the stop alone found nothing and the line was missing
  from the *Linimasa*. It falls back to `shipment.handoverVerifiedAt` for that
  one point; later points carry their own `handoverVerifiedAt`.
- **Plan in the modal is the stop's own shipment.** `planForShipment(stop.shipmentNo)`
  totals the order items carrying that number, so Muat 1 and Bongkar 1 both plan
  against Shipment 1. An order whose items are **not** numbered has no
  per-shipment plan and every stop falls back to `planFromItems`.
- **Plan comes from the Item Details table, not the order's stored tonnage.**
  `planFromItems` sums `weightKg` over `order.items`, and it is what *Detail
  Muatan*'s Plan column and the E-POD dialog's fallback plan both read. The
  table is what the planner typed and what every per-shipment figure is derived
  from, so a total that disagrees with it is the one that is wrong. This applies
  to **single-shipment orders too** — it is not a multi-stop rule. An order with
  no item rows keeps the stored `totalTonnage`.
- **Photos come from that visit's own submission.** The modal and *Foto POD*
  read `pod.photos` filtered by `docType` off the stop's own POD
  (`podPhotoSlotsForStop`, once the journey has stop rows — `verifyPerStop`).
  The old positional slicing of a phase's photos into blocks of two survives
  only for orders whose PODs carry no `stopId`; it was a guess that puts a photo
  in the wrong row as soon as the driver uploads out of order.
- **Setuju waits for the earlier visit, and names it.** `stopAwaitingBefore`
  walks every stop of the journey in `seq` order and returns the first without a
  `finishedAt` before the target, so the ordering runs across **both** phases:
  on Muat 1 → Bongkar 1 → Muat 2 → Bongkar 2, Muat 2 waits for Bongkar 1. The
  button is disabled and the hint reads *Verifikasi Bongkar 1 dulu — stop
  diverifikasi sesuai urutan rute*.
- **Verifying a stop records its own figures.** The stop's entry in
  `detail.podPhotos.{muat|bongkar}.stops[]` — indexed by the stop's position
  **within its phase**, in visit order — gains `actual` alongside `verified` and
  `note`, so a stop re-opened later shows what was counted there rather than the
  last number typed in the phase. The order-level `detail.muatanMuat` /
  `muatanBongkar` are still written, because the invoice, Control Tower and the
  planner read them, but on a multi-stop journey they are `sumOfVerifiedStops` —
  the sum of every verified visit, not the latest one.
- **Detail Muatan reports one Plan / Muat / Bongkar block per shipment**
  (`cargoByShipment`) once either phase has two or more points, each block
  headed *Shipment N* and its own lane (the two sites' names). The Muat and
  Bongkar columns stay empty until the order is at or past
  `pod_muat_terverifikasi` / `pod_bongkar_terverifikasi`, as they did before. A
  single-shipment order keeps the one table (`cargoComparison`), **and so does an
  order whose items are not numbered**: the check was on the stop count alone,
  so such an order rendered a block per shipment with Plan reading 0 in every
  cell; it now falls back when there is no per-shipment plan to show
  (dcd5b7e). `.muatan-shipment*` and `.epod-blocked-hint` were first written
  into a component with no style block and were silently dropped; they live in
  `revamp.css` with the rest of those pages' rules.
- **Linimasa runs the whole cycle once per point** when the journey has more than
  two, in `seq` order, each line naming the point — *Sampai di Titik Bongkar —
  Bongkar #2 (Shipment 2)*. Setting off for a later point is stamped with the
  planner's **approval of the previous point's POD** (`reviewedAt` of its last
  approved submission), because that approval is what raises it; the first point
  keeps the shipment's own `startedToLoadingAt`. Every line is still a recorded
  timestamp — no timestamp, no line. A two-ended journey keeps the
  shipment-level lines unchanged.
- **The status badge names the first unfinished point** in visit order
  (`currentStopLabel`, e.g. `Proses Bongkar — Bongkar #2 (Shipment 2)`), on the
  E-POD header and in *Detail Permintaan*. Blank on a two-ended journey, where
  the status refers to the delivery itself. Naming the stop made the value long
  enough to run past the edge of the E-POD card, so `.epod-info-row` wraps and
  `.epod-info-row .badge` wraps its own text (`white-space:normal`) instead of
  staying on one line.
- **Control Tower lists one verification task per point** for a journey with more
  than two (`Verifikasi POD Bongkar #2 (Shipment 2)`), in visit order, in place
  of the two status-keyed tasks. A task is `done` on the stop's `finishedAt` or
  an approved POD for it, and `pending` only once that point's POD is
  `submitted` **and** every earlier point is done — the same order the E-POD
  modal enforces. *Finalisasi Uang Sangu* is appended either way; two-ended
  journeys keep the two status-based tasks.
- **The invoice is ONE invoice.** It was briefly split into a tab per shipment;
  that is reversed. The agreement covering a multi-shipment order is one
  agreement, so there is one tariff, one tax and one total, and a tab per
  shipment implied otherwise — *Data Shipment* is a single tab again, and
  *Kesepakatan Awal* / *Final* carry no *— Seluruh Order* qualifier because
  there is nothing to distinguish them from. *Jumlah Shipment* is still the real
  count (`invoiceShipmentCount`, the longer of the two point lists), and the
  card lists every loading and unloading address as *Titik k* when there is more
  than one. **The POD photos are the one thing split per shipment**: *Foto POD
  Loading / Unloading Shipment ( N )* for each, read through
  `shipmentPodPhotoSrc` — `stopOfShipment(kind, N)` finds the stop by its
  `shipmentNo`, then the newest `podHistory` entry for that stop id, falling
  back to the phase's photos only on an order with no stops. Finding the stop by
  its number rather than positionally is what fixes an interleaved route: on
  M1 → B2 → M2 → B1 Shipment 2's unloading is the *first* bongkar visited, and
  `stops[shipmentNo - 1]` showed another shipment's paperwork. *Rincian Kargo
  Shipment (N)* is gone with the tabs. Whether a price should ever be split per
  shipment is still an open product question.

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
18 routes render `NotBuiltPage`. They are reachable and correctly shelled, but
have no content — API keys, trackers, share-orders and the fleet/performance
reports on each persona, plus draft order (`/s`), collaboration (`/m`),
document verification and general settings (`/a`). The dashboard, company
profile, truck and driver detail, trip allowance, finance and Control Tower
screens are built now (see the shared-page table above).

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
- **A shipment is a pair of points, and the Internal Order wizard enforces it.**
  `detail.loadingPoints[k]` with `detail.unloadingPoints[k]` is Shipment *k+1*,
  so the two arrays are always the same length: Step 1 shows one block per
  shipment and the pair is added and removed together ("+ Tambah Shipment" /
  "Hapus"), never a point at a time. The **agreement** decides whether more than
  one is allowed (`agreementType === 'multi-shipment'`, `allowsManyShipments`);
  switching to a single-shipment agreement drops the extra shipments *and their
  items*, and removing one renumbers the rest so the numbers stay 1..N.
  Every `WizardItem` carries `shipmentNo`, which is what Step 2's per-shipment
  item table and per-shipment weight subtotal are filtered by
  (`itemsOfShipment`, `shipmentWeightKg` in
  `components/revamp/internalOrder/wizardTypes.ts`). Step-1 and step-2 validation
  names the shipment ("Loading Point pada Shipment 2 wajib dipilih") only when
  there is more than one, so a one-shipment order reads exactly as it did before.
- **An agreement's routes are paired into lanes the same way** (bab45a8).
  `initialRoutes[k]` with `destinationRoutes[k]` is Shipment *k+1* on
  `AgreementRevampFormPage`, under the shipment's own heading, added and removed
  together by "+ Tambah Shipment" / "Hapus" (`.route-shipment-*` in
  `revamp.css`) — never one end at a time. Two independent lists, each with its
  own "+ Rute", said nothing about which destination belonged to which origin:
  an agreement covering Bandung → Cakung and Bandung → Jakarta could be written
  as four entries with no pairing, and an order placed against it had no lane to
  be priced on. The lanes stay at **city or kecamatan** level (`level`,
  `kota`, `kecamatan`) — the agreement names the lane, the order names the
  warehouses on it. A single-shipment agreement shows one pair and no button,
  and switching to one drops the extra lanes, both ends of each.
- **The create call sends the items ONCE, on `detail`.** `detail.items[]` is the
  wizard's own copy, in the shape the wizard holds (`itemName`, P/L/T in
  **metres**), each line carrying its `shipmentNo` — and it is the only source
  the console reads for a shipment's plan. The wizard **does not** send a
  top-level `items[]` any more. This corrects what af988ef added and this file
  previously described: `items` is a **per-company field** ("Itemised cargo"),
  hidden by default, so sending it failed the whole order with *not enabled for
  your company: Itemised cargo* — for every company that has not switched it on,
  which is most of them (30039f5). The server's `order_items.shipment_no` column
  still exists and the create path still writes it when rows are supplied; the
  wizard simply supplies none, so an internal order has no `order_items` rows
  and every per-shipment figure is derived from `detail.items`. Reinstating the
  rows means enabling that field per company first, not changing the payload.
- **There is no `totalTonnage` field on a shipment any more.** Making the input
  read-only had left `WizardShipment.totalTonnage` never written while the
  order's `weightKg` and its estimated value still read it, which on a per-kg
  agreement submits an order weighing nothing and worth nothing. The field is
  gone: every reader — the Step 2 and Step 4 boxes, `weightKg`, `detail.nilai`
  and `detail.totalTonnage` — now calls `totalTonnageKg(sp)`, the computed total
  of every item of every shipment. Note that orders read back still carry a
  `detail.totalTonnage`, which is what `orderPricing.js`, `financeData.ts` and
  the Planner page take; the wizard writes it, nothing types it.
