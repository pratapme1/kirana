# Customer Journey And Order Tracking Plan

## Summary

Revisit the customer flow from first message to delivered order, and complete the owner-driven order lifecycle so customer tracking is always accurate and visible. Owner UX is only in scope where it is required to complete the customer journey.

Default target:

- single-store pilot only
- WhatsApp-first flow
- customer experience first
- owner order actions included only as required to complete customer tracking

## Key Changes

### 1. Customer journey hardening

Re-walk and fix the live customer flow end to end:

- first message / empty cart
- add items
- cart view
- checkout intent
- address capture
- pending order summary
- confirm order
- cancel before confirm
- track order after confirm

Behavior requirements:

- customer can always recover from an empty or expired state
- checkout never proceeds without items and a valid address
- confirm only works when a pending order exists
- cancel clears the correct pending/cart state
- replies remain short and actionable

### 2. Customer tracking contract

Make tracking deterministic from DB state, not inferred chat state.

Canonical mapping:

- confirmed but not yet acted on by owner -> `Order received`
- owner accepted / processing -> `Packing your order`
- owner dispatched -> `On the way`
- owner delivered -> `Delivered`
- rejected / cancelled -> terminal rejection or cancellation message

Customer tracking requirements:

- `track order` must always resolve the latest relevant order
- tracking text must match `public.pending_orders.status`
- delivered state must include feedback CTA
- no skipped states or contradictory messaging

### 3. Owner order lifecycle completion

Use owner actions as the source of truth for customer tracking:

- `accept`
- `reject`
- `dispatch`
- `delivered`

Owner requirements:

- only valid next actions are shown
- action handlers update DB status exactly once
- delivered/rejected orders stop showing further action buttons
- owner responses confirm the state transition clearly

### 4. Customer-facing promo/cart/order consistency

Ensure customer-side price and promo behavior stays aligned with live DB state:

- add-to-cart uses current inventory price
- checkout uses the same line pricing as the cart
- active promotions shown to customers reflect live promo rows only
- inventory decrement after confirm is exact and immediately visible to later customer actions

### 5. Minimal owner UX dependency

Only fix owner UI where it blocks customer completion:

- owner pending-order action message must expose the right buttons
- owner action confirmation must be visible and unambiguous
- no separate owner inventory/promo UX work in this pass unless it blocks linked order proof

## Important Interfaces / Data Contracts

- `public.pending_orders.status` is the single source for order tracking stage
- customer `track order` must read that status directly
- owner action button ids remain deterministic:
  - `accept__{order_id}`
  - `reject__{order_id}`
  - `dispatch__{order_id}`
  - `delivered__{order_id}`
- customer confirm/cancel behavior continues to use:
  - active cart
  - pending order
  - order summary
  - orders
- no new order tables
- no multi-store support in this pass

## Test Plan

### 1. Customer journey

- empty-cart place order
- empty-cart confirm
- add item
- view cart
- checkout without address
- checkout with address
- confirm order
- cancel before confirm
- promotions query during shopping

### 2. Linked tracking

- track immediately after confirm -> `Order received`
- owner accept -> customer sees `Packing your order`
- owner dispatch -> customer sees `On the way`
- owner delivered -> customer sees `Delivered` + feedback CTA
- owner reject -> customer sees rejected/cancelled terminal state

### 3. Data integrity

- cart line pricing matches checkout pricing
- confirmed order decrements inventory exactly once
- cancel path leaves no active pending order
- delivered/rejected orders do not remain in actionable owner states

### 4. Acceptance proof

- one linked browser proof from customer add-to-cart through delivery tracking
- DB snapshots for:
  - `carts`
  - `cart_items`
  - `pending_orders`
  - `order_summary`
  - `orders`
  - `inventory`
  - `promotions`
- n8n execution IDs captured for:
  - customer add
  - checkout
  - confirm
  - owner accept
  - owner dispatch
  - owner delivered
  - customer track checks

## Assumptions And Defaults

- customer flow is the primary priority now
- owner work is only in scope where it completes customer order tracking
- single-store pilot remains the only supported mode
- existing AI routing stays in place; this plan is about state correctness and journey completion, not model redesign
- owner inventory/import issues are out of scope unless they block creation of a valid customer-test catalog
