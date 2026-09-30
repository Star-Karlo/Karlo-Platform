# Test hooks to remove before real drivers use this

Find them with:

    grep -rn "TEST-HOOK" src/

---

## Mode Uji — the end-to-end testing switch

**Where:** `src/lib/components/revamp/TestModeStrip.svelte` (the strip and its
checkbox), `src/lib/utils/api.ts` (`testMode`, `setTestMode`,
`STATUS_BYPASS_HEADER`).

**What it does:** while it is on, every request from this browser carries
`X-Status-Bypass: 1`, which makes the business service waive the geofence
checks, the role rules on state changes, and the receiving PIC's code. The
strip also drives an order through its remaining steps, reporting the
warehouse's own position so the geofence passes.

**It also relaxes the E-POD dialog**: `api.testMode()` lets a planner approve a
POD with no photo at all. Search `api.testMode()` for those call sites in
`src/lib/pages/OrderKontrakDetailPage.svelte`.

**Why it matters:** anyone who can open an order page can drive it to
completion without a truck moving.

**To remove:** delete `TestModeStrip.svelte` and its usages, the three members
of `api`, and every `api.testMode()` branch. The server-side half is
`business-service/TEST_HOOKS.md` item 1; remove both together, or the header
keeps being accepted from anything else that sends it.
