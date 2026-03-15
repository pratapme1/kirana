# Owner-Customer Linked E2E Test Cases

These cases are designed to fail the run if the owner-side implementation stops propagating correctly into the customer flow.

## Scope

- Owner bulk inventory import
- Owner direct inventory updates after import
- Customer stock-limit behavior
- Customer cart, checkout, confirm, and tracking
- Owner accept, dispatch, and delivered lifecycle actions
- Customer regression checks for empty cart and cancel path

## Test Cases

### TC-LINK-001 Bulk XLSX import creates inventory rows
- Setup: Upload the tagged XLSX fixture through the owner inventory flow in `test_mode`.
- Expect:
  - Preview contains an `Apply Valid Rows` button.
  - Apply response contains `bulk import applied`.
  - `public.inventory` contains:
    - `zzsheetmilk172604vqsp` with price `52`, stock `9`
    - `zzsheetatta172604vqsp` with price `310`, stock `3`
- Fail the run if any row is missing or values do not match.

### TC-LINK-002 Owner stock reduction is persisted
- Setup: Owner sends `zzsheetmilk172604vqsp stock 1`.
- Expect:
  - Response contains `updated` or `stock`.
  - `public.inventory.stock` for `zzsheetmilk172604vqsp` becomes `1`.
- Fail the run if DB stock is not exactly `1`.

### TC-LINK-003 Customer cannot add beyond available stock
- Setup: Customer adds quantity `2` of `zzsheetmilk172604vqsp` while stock is `1`.
- Expect:
  - Response contains `Only 1` or `requested 2`.
  - No active cart line exists for that customer.
- Fail the run if the add succeeds or a cart row is created.

### TC-LINK-004 Owner price and stock updates propagate
- Setup:
  - Owner sends `zzsheetmilk172604vqsp price 55`
  - Owner sends `zzsheetmilk172604vqsp stock 5`
- Expect:
  - DB row for `zzsheetmilk172604vqsp` has price `55`, stock `5`.
- Fail the run if either value does not match exactly.

### TC-LINK-005 Customer add uses the updated price
- Setup: Customer adds quantity `2` of `zzsheetmilk172604vqsp`.
- Expect:
  - Add response contains the item name and `₹110`.
  - Active cart row has:
    - quantity `2`
    - `price_at_addition = 55`
    - `line_total = 110`
  - View cart response contains the item and total `110`.
- Fail the run if cart pricing still reflects the old value.

### TC-LINK-006 Empty-cart place and confirm still behave correctly
- Setup:
  - A fresh customer with no cart runs place order.
  - The same customer runs confirm order.
- Expect:
  - Place response contains `cart is empty`.
  - Confirm response contains `no pending order` or equivalent.
- Fail the run if either path succeeds incorrectly.

### TC-LINK-007 Checkout creates a pending order with updated line pricing
- Setup: Customer places the order after the successful add.
- Expect:
  - Place response has a `Confirm Order` button.
  - `public.pending_orders` row exists for the returned `order_id`.
  - Pending order details contain:
    - item `zzsheetmilk172604vqsp`
    - quantity `2`
    - unit price `55`
    - line total `110`
- Fail the run if pending order pricing differs from cart pricing.

### TC-LINK-008 Confirm order commits DB state and decrements stock
- Setup: Customer confirms the pending order.
- Expect:
  - Confirm response contains `order confirmed`.
  - `public.order_summary` contains the order.
  - `public.orders` contains at least one order row for that order.
  - `public.inventory.stock` for `zzsheetmilk172604vqsp` becomes `3`.
  - Active customer cart is cleared.
- Fail the run if order rows are missing or inventory is not decremented.

### TC-LINK-009 Track order after confirm shows received state
- Setup: Customer tracks the confirmed order before owner action.
- Expect:
  - Tracking response contains `Order received`.
- Fail the run if tracking skips to the wrong status.

### TC-LINK-010 Owner accept updates tracking to packing
- Setup: Owner accepts the same order.
- Expect:
  - `public.pending_orders.status = processing`
  - Customer tracking response contains `Packing your order`
- Fail the run if DB status and tracking text diverge.

### TC-LINK-011 Owner dispatch updates tracking to on-the-way
- Setup: Owner dispatches the same order.
- Expect:
  - `public.pending_orders.status = dispatched`
  - Customer tracking response contains `On the way`
- Fail the run if DB status and tracking text diverge.

### TC-LINK-012 Owner delivered updates tracking to delivered
- Setup: Owner marks the same order delivered.
- Expect:
  - `public.pending_orders.status = delivered`
  - Customer tracking response contains `Delivered`
  - Delivered customer payload contains feedback buttons.
- Fail the run if final status or feedback CTA is missing.

### TC-LINK-013 Cancel path still works after owner-side changes
- Setup:
  - A second customer adds `zzsheetatta172604vqsp`
  - Places the order
  - Cancels before confirmation
- Expect:
  - Cancel response contains `cancel`
  - No pending order remains in `awaiting_confirmation` or `processing`
  - No active cart remains for the cancel-test customer
- Fail the run if pending/carts remain active.

## Proof Requirements

For every case, the proof artifact must include:

- workflow execution ID
- top-level response payloads for the relevant steps
- DB snapshots captured before cleanup
- explicit boolean checks
- a non-zero exit code if any check is false

## Cleanup Requirements

The proof run must delete:

- imported test rows from `public.inventory`
- related rows from `public.owner_import_jobs`
- related rows from `public.owner_import_job_rows`
- test customer rows from:
  - `public.pending_orders`
  - `public.order_summary`
  - `public.orders`
  - `public.carts`
  - `public.cart_items`
  - `public.order_feedback`
