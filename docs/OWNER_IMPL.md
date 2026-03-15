# Kirana - Owner Work Implementation

> Last updated: 2026-03-12
> Customer live path: V1 (`Kirana_Agent_Conv`)
> Owner path: separate subsystem attached to V1 events and owner identity

---

## Summary

This document is the owner-side source of truth.

The customer journey stays on V1 for now. Owner functionality is treated as a separate layer that must either:

1. be triggered by V1 handoff points such as order confirmation and notifications, or
2. be triggered directly by the owner's WhatsApp identity without changing the customer ingress.

Anything that only works in the idle V2 ingress is **not** considered complete for owner-side delivery.

### Latest proof

- Comprehensive linked owner->customer proof passed on 2026-03-11 via workflow execution `49225`
- Proof script: `/home/vi/Documents/Kirana/scripts/run_owner_customer_linked_e2e_proof.js`
- Test case spec: `/home/vi/Documents/Kirana/docs/OWNER_CUSTOMER_LINKED_E2E_TEST_CASES.md`
- Report JSON: `/home/vi/Documents/Kirana/reports/owner-customer-linked-e2e-20260311T043321Z.json`
- Report Markdown: `/home/vi/Documents/Kirana/reports/owner-customer-linked-e2e-20260311T043321Z.md`
- Structural validation is now also clean for `[Owner] Order Manager` and `[Util V2] Send WhatsApp` after the linked-proof workflow repair on 2026-03-11
- Coverage in that proof run:
  - owner XLSX import -> DB rows created
  - owner stock/price update -> DB values changed
  - customer insufficient-stock rejection
  - customer add/view/place/confirm with updated price
  - owner accept/dispatch/delivered -> customer track status transitions
  - delivered feedback buttons present
  - empty-cart and cancel-order regression checks

### 2026-03-12 implementation delta

- Owner flows were moved from regex-first parsing toward a hybrid AI-assisted path:
  - owner routing remains AI-first
  - manual inventory extraction is now AI-assisted before deterministic validation/write
  - promo extraction is now AI-assisted before deterministic target resolution/preview/write
- Group promo support was added for owner discount creation:
  - grouped promo previews can resolve multiple SKUs under one logical promo
  - live DB migration added `promotions.promo_group_code`
- Owner document ingress on WhatsApp was repaired:
  - inbound document/image messages now survive the main workflow entry gate
  - a temporary `owner_media_ingress_audit` table was added for media/debug tracing
- Owner menu/navigation was standardized around list-style menus for navigation surfaces, with buttons kept for short confirm/cancel decisions.
- Real-device / browser owner verification on 2026-03-12 covered:
  - fresh onboarding from an empty DB
  - manual add
  - direct stock/price updates
  - promo creation
  - XLSX import
  - PNG/image import
- Owner-side app data was fully reset later on 2026-03-12 to support a fresh store retest from zero rows.

### Open owner product issues after the 2026-03-12 pass

- Some owner follow-up prompts still do not consistently expose a visible navigation menu:
  - create-discount follow message
  - manual item creation follow message
- OCR/image import is technically working but too permissive for real catalog hygiene:
  - invoice/image extraction can import non-kirana items too easily
- Manual item creation still loses useful variant specificity in some cases:
  - generic names like `Milk Amul` are valid but not ideal for later targeting
- Owner session rows now behave correctly for active-state routing, but historical session accumulation still needs cleaner long-term audit/archival policy.
- Media review metadata is still weak on some imports:
  - generic file labels such as `bulk-import`
  - WhatsApp-normalized image MIME types instead of original upload names/types

---

## Status Legend

- `DONE` = implemented and part of the intended V1-based owner path
- `BUILT, NEEDS VERIFICATION` = workflow exists, but end-to-end behavior is not yet proven on the live owner path
- `PENDING IMPLEMENTATION` = engineering work still required
- `PENDING OPS SETUP` = manual/demo setup work still required
- `DEFERRED` = roadmap item, not required for current owner rollout

## Priority Legend

- `P0` = blocks end-to-end owner usage on top of V1
- `P1` = should ship before broader pilot
- `P2` = useful after pilot
- `P3` = longer-term roadmap

---

## Architecture Truth

### Live customer system

- V1 is the live ingress: `Kirana_Agent_Conv` (`IdnN367mtxGrQvh0`)
- Meta webhook still points to V1
- V1 already delegates some customer behavior to V2 tool flows such as:
  - `[Tool V2] Add Items` (`yKZu2D7Vn3NZUw1L`)
  - `[Tool V2] Place Order` (`UgRHM83Qlh9S6Zor`)

### Owner system principle

- Owner features must stay separate from the customer conversation path
- Owner features should be linked to V1 only where necessary:
  - V1 order confirmation -> owner notification
  - V1 inventory reads and stock decrement -> owner inventory management
  - V1 promotion reads and pricing -> owner promo management
  - V1 store configuration -> owner onboarding and notifications

### Source-of-truth rule

- Prefer live workflow reality first
- Then prefer `progress.md`
- Then `WORK.md`
- Treat roadmap material as future intent, not current completion

---

## Completed Or Built Work

| Feature | Owner Area | V1 Dependency / Link | Current State | Status | Priority | Next Step |
|---|---|---|---|---|---|---|
| Owner detection via `stores.owner_whatsapp_number` | Routing | Used to separate owner identity from customer messages | Implemented in live V1 routing on 2026-03-10 with owner lookup before customer rule evaluation | DONE | P0 | Run owner-number smoke test from the real owner phone and confirm non-owner traffic still stays on customer path |
| Owner notification workflow `[Notify] Kirana New Order` (`hN3YkLKXv2XutPzr`) | Notifications | Triggered after V1 confirm order | Active workflow exists and recent executions were successful | DONE | P0 | Verify message quality and exact channel behavior on owner phone |
| `[Owner] Inventory Manager` (`yfCi0KEpBibSXI3M`) | Inventory | Drives tables that V1 add-to-cart, checkout, and stock decrement depend on | Workflow rebuilt for store-scoped catalog ops. It now supports catalog menu buttons, manual multi-line intake, cleanup, duplicate/similar-item review, session-backed preview/confirm for risky writes, direct single-item stock/price/toggle updates when unambiguous, list / low stock / search, and bulk-import handoff into the dedicated async bulk pipeline. Mock verification passed on 2026-03-11 via owner runner execution `48876`, and linked owner->customer proof passed on 2026-03-11 via execution `49225` covering import -> stock/price update -> customer add/view/place/confirm flow. | DONE | P0 | Run one real owner-device pass for manual add, direct stock edit, and image/sheet upload to tune UX and OCR quality |
| `[Owner] Promo Manager` (`oiggfS3oMsdKNRRn`) | Promotions | Controls promos consumed by V1 promo lookup and V1 checkout pricing | Workflow rebuilt for safer promo ops. It resolves item targets against inventory, generates promo codes with collision handling, creates session-backed discount previews, supports confirm/cancel buttons, and lists / deactivates promos against the live `promotions` schema (`promo_scope`, `target_sku`, `discount_type`, `discount_value`, `min_cart_value`). Mock end-to-end verification passed on 2026-03-11 via owner runner execution `48876`. | DONE | P0 | Run one real owner-device promo flow and confirm discount visibility in customer checkout |
| `[Owner] Onboarding` (`6QnLlMXzIOhgmW6o`) | Store setup | Populates store fields used by V1 notifications and UPI billing | Workflow rebuilt with the corrected sequence: store name -> UPI -> delivery area -> operating hours -> catalog bootstrap choice. The bootstrap and already-done menu now use `Add items manually`, `Upload stock sheet`, and `Create discount` buttons instead of the older one-item wording. Mock end-to-end verification passed on 2026-03-11 via owner runner execution `48876`, including store-row creation and field persistence. | DONE | P1 | Run one real onboarding sequence and confirm the same behavior on the owner phone |
| Bulk inventory onboarding pipeline: `[Owner] Bulk Import Intake` (`syLqocDmkt0MjFkv`), `[Owner] Bulk Import Worker` (`yDfWqigCvgCGz75e`), `[Owner] Bulk Import Apply` (`6GHQItXV8mOIOmwC`), `[Owner] Bulk Import Reports` (`y58Wx8NbvBONLuZ2`) | Bulk inventory setup | Invoked from owner onboarding/menu and writes into the same `inventory` table V1 uses | Separate async pipeline is live for large onboarding imports. It stages sheet/image inputs into `public.owner_import_jobs` and `public.owner_import_job_rows`, generates review/apply sessions, applies valid rows idempotently, and exposes downloadable CSV summary/applied reports through the bulk report webhook. Verified on 2026-03-11 via owner runner execution `48876`, and linked proof execution `49225` proved XLSX import -> DB rows -> customer-visible price/stock behavior end to end. | DONE | P1 | Run one real owner-device spreadsheet import and tune row-level cleanup rules for noisy real catalogs |
| `[Util V2] Send WhatsApp` (`dO77E4A3PI9DvxVw`) | Messaging utility | Used by owner notifications and customer status updates from owner flows | Utility workflow now supports a safe `test_mode` bypass so the real owner/customer workflows can be exercised without sending live WhatsApp during proof runs. Linked proof execution `49225` passed through the real notify path with mocked sends in test mode, and the workflow now validates cleanly. | DONE | P1 | Keep live-message behavior under watch on real devices; `test_mode` should remain test-only |
| Owner columns and DB prerequisites | Data foundation | Supports owner number, UPI, onboarding state, processed messages | Marked complete in current progress tracking | DONE | P0 | Spot-check schema before depending on it for owner features |
| Post-delivery feedback capture and owner complaint alert | Feedback | Triggered after V1 delivered status and should notify owner on customer issues | Verified live on 2026-03-10: V1 routes `rate_good__`, `rate_bad__`, issue-category buttons, and complaint text into `[Tool] Order Feedback` (`w5D4XMey0WjTcJtp`); complaints are stored in `public.order_feedback` and owner alerting uses `[Util V2] Send WhatsApp` | DONE | P1 | Monitor feedback runs and tighten UX copy if needed |

---

## P0 Implementation Queue

These are the owner-side items that should be implemented or verified first.

| Feature | Owner Area | V1 Dependency / Link | Current State | Status | Priority | Next Step |
|---|---|---|---|---|---|---|
| Separate owner entrypoint on top of V1 architecture | Routing | Must keep customer ingress on V1 while letting owner actions remain separate | Implemented in live V1 on 2026-03-10 by branching owner messages before `Customer Rule Engine` and routing them into separate owner workflows | DONE | P0 | Run live smoke tests for owner onboarding, inventory, promo, and order button actions from the owner number |
| V1 -> owner notification handoff verification | Notifications | `[Tool] Confirm Order` -> `[Notify] Kirana New Order` | Verified live on 2026-03-10: confirm order triggers `[Notify] Kirana New Order`, which hands structured order data into `[Owner] Order Manager` and delivers the actionable owner alert on WhatsApp | DONE | P0 | Monitor real orders and refine formatting only if needed |
| Owner Order Manager live integration | Order lifecycle | Should start only after V1 order creation / notification | Verified live on 2026-03-10: `[Owner] Order Manager` handles notify, accept, reject, dispatch, and delivered actions end-to-end from the V1-linked path. Linked proof execution `49225` also proved accept -> dispatch -> delivered status changes propagate into customer tracking and delivered feedback buttons, and the workflow now validates cleanly. | DONE | P0 | Keep status transitions stable and monitor for regressions |
| Owner Rule Engine text routing | Commands | Must allow owner actions without moving customer traffic off V1 | Rebuilt in live V1 on 2026-03-11 as a hybrid stateful owner router: owner buttons and system events stay deterministic, active owner sessions remain the authoritative state source, and a small Claude-based router now uses supplemental Postgres chat memory only for open-text owner routing when no deterministic session continuation is available. Promo, inventory preview/bulk-review, onboarding, and order buttons now stay isolated inside the owner branch without touching customer routing. | DONE | P0 | Run real-device owner text flows for promo, inventory preview confirm/cancel, menu/reset, and vague follow-up replies |
| Owner inventory command flow | Inventory | Affects V1 cart, checkout, and confirm-order stock behavior | V1 now normalizes owner text/button/media fields and routes active inventory sessions directly back into `[Owner] Inventory Manager`. Inventory preview confirm/cancel and bulk review apply/cancel can now continue by plain text (`yes`, `confirm`, `apply`, `cancel`, `menu`) without falling back to generic help. The remaining gap is deep AI extraction inside `[Owner] Inventory Manager`; inventory writes are still parsed deterministically after top-level routing. | BUILT, NEEDS VERIFICATION | P0 | Run real-device inventory continuation tests and then decide whether to replace the inner inventory parser with AI extraction |
| Owner promo command flow | Promotions | Affects V1 promo reads and V1 bill calculation | V1 now routes owner promo text through the hybrid owner router, and active promo sessions continue deterministically inside `[Owner] Promo Manager`. Target choice, expiry, priority, preview confirm, and reset/menu replies can now continue by text without restarting the flow. Supplemental Postgres chat memory is available to the owner router for vague follow-ups, but active session state still overrides memory whenever they conflict. Promo extraction remains AI-assisted, while target resolution, preview, and writes stay deterministic. | BUILT, NEEDS VERIFICATION | P0 | Run real-device promo flows covering ambiguous target choice, expiry reply, priority reply, confirm, vague follow-up text, and reset/menu |
| Real owner phone and UPI configuration | Store setup | Needed for V1 billing and notification correctness | Not finalized | PENDING OPS SETUP | P0 | Set `owner_whatsapp_number` and `upi_id` to real values and test both |
| Demo inventory load | Inventory | Needed so owner-side stock operations affect realistic V1 ordering | Not completed | PENDING OPS SETUP | P0 | Load 30-40 demo SKUs with price, stock, unit, and category |
| Demo promo preload | Promotions | Needed so owner-side promo management affects real V1 behavior | Not completed | PENDING OPS SETUP | P0 | Insert at least one threshold promo and one simple owner-manageable promo |

---

## P1 Verification And Hardening

| Feature | Owner Area | V1 Dependency / Link | Current State | Status | Priority | Next Step |
|---|---|---|---|---|---|---|
| Owner notification formatting | Notifications | Comes from V1 order confirmation path | Not yet signed off for live owner use | PENDING IMPLEMENTATION | P1 | Review order ID, items, address, total, and readability on WhatsApp |
| Inventory file import preview and apply | Inventory | Should update the same inventory rows V1 ordering uses | Implemented through the dedicated bulk workflow family: `[Owner] Bulk Import Intake`, `[Owner] Bulk Import Worker`, `[Owner] Bulk Import Apply`, and `[Owner] Bulk Import Reports`. Supported owner uploads now go through file/image parsing with Claude, cleanup against current inventory, review/apply session creation, `public.owner_import_jobs` / `public.owner_import_job_rows` persistence, idempotent apply, and downloadable CSV summary/applied reports. Mock end-to-end verification passed on 2026-03-11 via owner runner execution `48876`, and linked proof execution `49225` proved an XLSX upload all the way through to customer-visible inventory behavior. | DONE | P1 | Run a real owner-device upload for an XLS/XLSX and an image/PDF, then refine prompt quality and blocker handling for noisy OCR |
| Post-delivery feedback UX | Feedback | Lives in V1 customer path but escalates issues to owner | Verified live on 2026-03-10: `👍 Great!` and `👎 Issues` bypass AI, issue category capture works, and complaint submission escalates to the owner | DONE | P1 | Review button copy and complaint wording only if product changes |
| Owner onboarding reflected in V1 outputs | Store setup | Store name, UPI, and delivery area should appear in V1 flows | Mock verification passed on 2026-03-11: onboarding persisted store row, `store_id`, UPI, delivery area, and operating hours, and subsequent owner catalog flows used the stored context correctly | DONE | P1 | Verify the same values appear in real-device owner notifications and billing copy |
| `[Webhook] Owner Callback` (`NhLM82oFlVc5Gluy`) | Order lifecycle | Optional order-state interaction path after V1 order placement | Inactive and not in use | PENDING IMPLEMENTATION | P1 | Decide whether to revive it or replace it with a WhatsApp-native owner flow |
| Owner lifecycle actions: accept / reject / dispatch / delivered | Order lifecycle | Should update customer-visible order state after V1 order creation | Verified live on 2026-03-10: each owner action updates order state and sends the expected customer-facing status update, covering end-to-end order confirmation and status tracking. Linked proof execution `49225` additionally verified the exact track-order status progression: `Order received` -> `Packing your order` -> `On the way!` -> `Delivered`. | DONE | P1 | Monitor live runs and tighten copy only if needed |
| Owner-side smoke tests | QA | Validates all V1-linked owner behavior | Not completed | PENDING OPS SETUP | P1 | Run real-device tests for notify, inventory edit, promo edit, and order status actions |

---

## P2 Post-Pilot Improvements

| Feature | Owner Area | V1 Dependency / Link | Current State | Status | Priority | Next Step |
|---|---|---|---|---|---|---|
| Owner morning briefing | Reporting | Uses V1 order data and store totals | Roadmap only | DEFERRED | P2 | Build scheduled summary after owner pilot stabilizes |
| Consolidated picking list | Fulfillment | Uses confirmed V1 orders and inventory | Roadmap only | DEFERRED | P2 | Build daily picking-list workflow and packed-state action |
| Weekly restock suggestions | Inventory intelligence | Uses order history and current stock | Roadmap only | DEFERRED | P2 | Build scheduled demand-vs-stock recommender |
| Distributor message generation | Procurement | Follows restock suggestion output | Roadmap only | DEFERRED | P2 | Add message builder after restock suggestions exist |

---

## P3 Longer-Term Roadmap

| Feature | Owner Area | V1 Dependency / Link | Current State | Status | Priority | Next Step |
|---|---|---|---|---|---|---|
| Full owner intelligence layer | Owner assistant | Optional layer on top of store and order data | Roadmap only | DEFERRED | P3 | Revisit after pilot and decide product scope |
| Vyapar inventory sync | POS integration | Should keep V1 inventory aligned with source of truth | Roadmap only | DEFERRED | P3 | Build only if manual owner inventory updates become a bottleneck |
| Reverse push of confirmed orders to POS | POS integration | Should follow V1 confirm order | Roadmap only | DEFERRED | P3 | Design after POS integration is justified |

---

## Immediate Execution Order

1. Finalize `owner_whatsapp_number`, `upi_id`, inventory, and promo seed data
2. Smoke test owner inventory preview/apply, promo preview/apply, and import preview/apply flows on real devices
3. Verify onboarding persistence into V1 bill generation, notifications, and the post-setup catalog menu
4. Tune OCR blocker rules and prompt quality using real owner uploads
5. Decide whether owner callback flow is still needed

---

## Acceptance Criteria For Owner Side

Owner-side implementation is considered ready when all of the following are true:

- Customer ordering remains on V1
- Owner actions are separate from customer chat logic
- Owner receives correct order notifications from V1-confirmed orders
- Owner can update inventory in a way that immediately affects V1 ordering
- Owner can manage promos in a way that immediately affects V1 pricing and promo behavior
- Owner can stage and apply large onboarding imports without blocking V1 customer behavior
- Store setup values used by V1 are owned by a clear onboarding or config path
- Post-delivery feedback buttons bypass AI and complaint submissions notify the owner deterministically
- No owner-critical flow depends on switching Meta webhook traffic to V2
