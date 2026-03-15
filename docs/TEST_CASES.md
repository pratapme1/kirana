# Kirana V2 — End-to-End Test Cases

**Test Form URL:** `https://primary-production-87e8.up.railway.app/form/[get from workflow uX99AM29qUwEO0MN]`

**How to read results:** After submitting the form, open n8n → Executions → latest run of `[Test] Kirana V2 Test Form` → click `Format Test Result` node to see the output.

**Pass criteria per test:** `status: ✅ TOOL EXECUTED`, correct `tool` name, valid `response_text`.

---

## Setup Before Testing

Run these once in Supabase SQL editor before the test session:

```sql
-- Add a test product if inventory is empty
INSERT INTO public.inventory (item_name, price, stock, unit, category, is_active)
VALUES
  ('Onion', 40, 50, 'kg', 'vegetables', true),
  ('Milk', 60, 20, 'litre', 'dairy', true),
  ('Rice', 80, 100, 'kg', 'grains', true),
  ('Tomato', 30, 40, 'kg', 'vegetables', true),
  ('Maggi', 14, 200, 'pack', 'instant', true)
ON CONFLICT (item_name) DO UPDATE SET stock = EXCLUDED.stock, is_active = true;

-- Note your test chat_id (use your WhatsApp number: 91XXXXXXXXXX)
-- Use this same chat_id across all tests for cart continuity
```

---

## Section 1 — Customer: Rule Engine (No LLM)

These should all show `bypass_llm: true` and route directly to tools.

### TC-01: View Cart (text)
| Field | Value |
|---|---|
| Role | Customer |
| Chat ID | 919876543210 |
| Message | `cart` |
| Button ID | *(empty)* |

**Expected:** `tool: view_cart` → cart contents or "cart is empty"

---

### TC-02: View Cart (alias)
| Field | Value |
|---|---|
| Message | `my cart` |

**Expected:** Same as TC-01

---

### TC-03: View Cart (button tap)
| Field | Value |
|---|---|
| Button ID | `view_cart` |
| Message | *(empty)* |

**Expected:** `tool: view_cart`

---

### TC-04: Add Item — number first format
| Field | Value |
|---|---|
| Message | `2 aloo` |

**Expected:** `tool: add_items`, input has `product_name: aloo, quantity: 2` → searches "potato" via alias → item added to cart

---

### TC-05: Add Item — number last format
| Field | Value |
|---|---|
| Message | `doodh 1` |

**Expected:** `tool: add_items`, `product_name: doodh, quantity: 1` → alias matches "milk" → added

---

### TC-06: Add Item — Hindi alias
| Field | Value |
|---|---|
| Message | `pyaaz 2` |

**Expected:** `tool: add_items` → normalized to "onion" → Onion found and added

---

### TC-07: Add Item — typo tolerance
| Field | Value |
|---|---|
| Message | `tamato 1` |

**Expected:** `tool: add_items` → trigram search matches "Tomato" → added (tests trgm index)

---

### TC-08: Add Item — decimal quantity
| Field | Value |
|---|---|
| Message | `0.5 milk` |

**Expected:** `tool: add_items`, `quantity: 0.5`

---

### TC-09: Confirm Order (text)
| Field | Value |
|---|---|
| Message | `confirm` |

**Expected:** `tool: confirm_order` → if cart exists: order placed; if empty: error/empty cart message

---

### TC-10: Confirm Order (Hindi)
| Field | Value |
|---|---|
| Message | `haan` |

**Expected:** `tool: confirm_order`

---

### TC-11: Confirm Order (button)
| Field | Value |
|---|---|
| Button ID | `confirm_order` |
| Message | *(empty)* |

**Expected:** `tool: confirm_order`

---

### TC-12: Cancel Order (text)
| Field | Value |
|---|---|
| Message | `cancel` |

**Expected:** `tool: cancel_order` → cancels pending order if exists

---

### TC-13: Cancel Order (button)
| Field | Value |
|---|---|
| Button ID | `cancel_order` |

**Expected:** `tool: cancel_order`

---

### TC-14: Add via button (SKU direct)
| Field | Value |
|---|---|
| Button ID | `add_qty__SKU001__2` |

**Expected:** `tool: add_items`, `sku_direct: SKU001, quantity: 2` — bypasses search, direct SKU lookup

*(Replace SKU001 with actual SKU from your inventory)*

---

## Section 2 — Customer: Full Cart Flow (sequence)

Run these in order with the **same Chat ID** to test end-to-end cart lifecycle.

### TC-15: Build cart — add milk
| Message | `2 doodh` |
**Expected:** Milk added, cart total shown

### TC-16: Build cart — add rice
| Message | `chawal 1` |
**Expected:** Rice added, updated cart total

### TC-17: View cart with items
| Message | `cart` |
**Expected:** Shows both items + total

### TC-18: Place order
| Message | `place order` |
**Expected:** `status: ⚠️ LLM PATH` (goes to AI agent — check [Util V2] Place Order logic separately)

### TC-19: Confirm order
| Button ID | `confirm_order` |
**Expected:** `tool: confirm_order` → order confirmed, order ID returned

### TC-20: Track order
| Message | `track my order` |
**Expected:** `status: ⚠️ LLM PATH` (AI agent handles)

---

## Section 3 — Customer: LLM Path

These messages should NOT match the rule engine and fall through to LLM path.

### TC-21: Complex natural language order
| Field | Value |
|---|---|
| Message | `I want 2kg rice and 1 litre milk please` |

**Expected:** `status: ⚠️ LLM PATH` — confirms AI agent would handle this

---

### TC-22: Question about store
| Message | `what time do you open?` |
**Expected:** `status: ⚠️ LLM PATH`

---

### TC-23: Promotions query
| Message | `any offers today?` |
**Expected:** `status: ⚠️ LLM PATH` (or tool: get_promotions if rule matches)

---

## Section 4 — Owner: Inventory Management

Use **owner's WhatsApp number** as Chat ID (the number registered in `stores.owner_whatsapp_number`).

### TC-24: View inventory
| Field | Value |
|---|---|
| Role | Owner |
| Chat ID | *owner's number* |
| Message | `show inventory` |

**Expected:** `tool: owner_inventory` → list of products with stock levels

---

### TC-25: Low stock check
| Message | `what's running low` |
**Expected:** `tool: owner_inventory` → items where stock ≤ 5

---

### TC-26: Add new product
| Message | `add bread at price 30 stock 50 unit pack` |
**Expected:** `tool: owner_inventory` → AI parses intent → product added/updated in DB

---

### TC-27: Update stock
| Message | `milk stock 40` |
**Expected:** `tool: owner_inventory` → milk stock updated to 40

---

### TC-28: Update price
| Message | `rice price 85` |
**Expected:** `tool: owner_inventory` → rice price updated to 85

---

### TC-29: Mark item unavailable
| Message | `mark bread as unavailable` |
**Expected:** `tool: owner_inventory` → is_active set to false for bread

---

## Section 5 — Owner: Order Management

These simulate the owner receiving an order notification and acting on it.

### TC-30: Accept order
| Field | Value |
|---|---|
| Role | Owner |
| Button ID | `accept__ORD-TEST-001__919876543210` |

**Expected:** `tool: owner_order_mgr`, `action: accept` → order status → processing; customer notification sent

*(Replace ORD-TEST-001 with a real order ID from pending_orders table)*

---

### TC-31: Reject order
| Button ID | `reject__ORD-TEST-001__919876543210` |
**Expected:** `tool: owner_order_mgr`, `action: reject` → order cancelled, customer notified

---

### TC-32: Dispatch order
| Button ID | `dispatch__ORD-TEST-001__919876543210` |
**Expected:** `tool: owner_order_mgr`, `action: dispatch` → status → dispatched, customer notified

---

### TC-33: Mark delivered
| Button ID | `delivered__ORD-TEST-001__919876543210` |
**Expected:** `tool: owner_order_mgr`, `action: delivered` → status → delivered, customer notified

---

## Section 6 — Owner: Promotions

### TC-34: View active promos
| Field | Value |
|---|---|
| Role | Owner |
| Message | `show active promos` |

**Expected:** `tool: owner_promo` → list of active promotions

---

### TC-35: Create promo
| Message | `10% off rice this weekend` |
**Expected:** `tool: owner_promo` → AI parses → promo created in promotions table

---

### TC-36: Create BOGO promo
| Message | `buy one get one on maggi` |
**Expected:** `tool: owner_promo` → BOGO promo created

---

### TC-37: Deactivate promo
| Message | `remove all rice promos` |
**Expected:** `tool: owner_promo` → matching promos deactivated

---

## Section 7 — Owner: Onboarding

### TC-38: Trigger onboarding
| Field | Value |
|---|---|
| Role | Owner |
| Message | `setup my store` |

**Expected:** `tool: owner_onboarding` → asks for store name (step 0)

---

## Section 8 — Edge Cases

### TC-39: Empty message with no button
| Field | Value |
|---|---|
| Role | Customer |
| Message | *(empty)* |
| Button ID | *(empty)* |

**Expected:** `status: ⚠️ LLM PATH` (falls through rule engine with empty msg)

---

### TC-40: Out-of-stock item
*First set a product stock to 0 in DB, then try to add it.*
| Message | `2 [out-of-stock item]` |
**Expected:** `tool: add_items` → "out of stock" message, NOT added to cart

---

### TC-41: Quantity exceeds stock
*Product has stock = 3, try to add 10.*
| Message | `10 milk` |
**Expected:** `tool: add_items` → "only X in stock" message

---

### TC-42: Unknown product
| Message | `2 xyz123abc` |
**Expected:** `tool: add_items` → "product not found" message

---

### TC-43: Idempotency — same message_id
*Submit the same form twice with identical Chat ID and message.*
**Expected:** Second execution should be blocked by idempotency check *(only applies via V2 main webhook, not test form)*

---

## Test Results Tracker

| TC | Description | Status | Notes |
|---|---|---|---|
| TC-01 | View cart (text "cart") | ✅ | Tested via webhook — rule engine bypass, correct cart shown |
| TC-02 | View cart alias (mera cart) | ✅ | Hindi "mera cart" → view_cart tool |
| TC-03 | View cart button | ✅ | button_id=view_cart → view_cart tool → "no orders yet" |
| TC-04 | Add item number-first | ✅ | "2 aloo" → alias → potato → UPSERT cart ₹44 |
| TC-05 | Add item number-last | ✅ | "doodh 1" → milk → added |
| TC-06 | Add item Hindi alias | ✅ | "pyaaz 2" → onion → added |
| TC-07 | Add item typo | ✅ | "tamato 1" → alias → tomato → added |
| TC-08 | Add item decimal qty | ✅ | "0.5 milk" → 0.5L @ ₹54 → added |
| TC-09 | Confirm (text) | ✅ | "confirm" → confirm_order → "no pending order" |
| TC-10 | Confirm (Hindi "haan") | ✅ | "haan" → confirm_order → "no pending order" |
| TC-11 | Confirm (button) | ✅ | button_id=confirm_order → correct response |
| TC-12 | Cancel (text) | ✅ | "cancel" → cancel_order → "no pending order to cancel" |
| TC-13 | Cancel (button) | ⬜ | Not yet run |
| TC-14 | View cart (Hindi text) | ✅ | "mera cart" → view_cart → cart with 4 items ₹156 |
| TC-15–19 | Full cart + place order flow | ⬜ | Needs DB prerequisites (pg_trgm, search_vector) + V2 Place Order test |
| TC-20 | Track order (button) | ✅ | button_id=track_order → "no orders yet" |
| TC-21 | Complex NL order | ⬜ | Needs AI LM wired in UI |
| TC-22 | Store question | ⬜ | Needs AI LM wired in UI |
| TC-23 | Promotions query | ⬜ | Needs AI LM wired in UI |
| TC-24 | Owner: view inventory | ⬜ | Owner paths not yet tested |
| TC-25 | Owner: low stock | ⬜ | |
| TC-26 | Owner: add product | ⬜ | |
| TC-27 | Owner: update stock | ⬜ | |
| TC-28 | Owner: update price | ⬜ | |
| TC-29 | Owner: mark unavailable | ⬜ | |
| TC-30 | Owner: accept order | ⬜ | |
| TC-31 | Owner: reject order | ⬜ | |
| TC-32 | Owner: dispatch | ⬜ | |
| TC-33 | Owner: delivered | ⬜ | |
| TC-34 | Owner: view promos | ⬜ | |
| TC-35 | Owner: create promo % | ⬜ | |
| TC-36 | Owner: BOGO promo | ⬜ | |
| TC-37 | Owner: remove promo | ⬜ | |
| TC-38 | Owner: onboarding | ⬜ | |
| TC-39 | Idempotency — duplicate msg_id | ⚠️ | UPSERT prevents double-charge; processed_messages guard inactive (DB prereq not run) |
| TC-40 | Out of stock | ⬜ | Needs SQL: UPDATE inventory SET stock=0 WHERE sku=X; then test |
| TC-41 | Qty exceeds stock | ✅ | "200 aloo" → "Only 120 kg available. You requested 200." |
| TC-42 | Unknown product | ✅ | "2 xyz123abc" → "Sorry, I couldn't find xyz123abc in our store" |
| TC-43 | Empty message/button | ⬜ | |

**Bugs fixed during testing (2026-03-07):**
- `Enough Stock?` node: `$json.quantity` was undefined (Pick Best Match has no qty field) → fixed to `$('Normalize Search Term').first().json.quantity`
- `Enough Stock?` conditions.conditions[0] leftValue: partial update created stray key, full parameter replace needed
- `Upsert Cart Item`: UUID cart_id not quoted in SQL → fixed to `'{{ $json.cart_id }}'`
- `Upsert Cart Item`: `updated_at` column doesn't exist on cart_items → removed from INSERT/ON CONFLICT
- `Customer Tool Switch`: `numberOutputs: 4` (reverts to 4 after workflow reloads) → must always be fixed to 8

---

## Migration Checklist (after all TCs pass)

- [ ] Run DB prerequisites SQL (pg_trgm, search_vector, GIN indexes)
- [ ] Wire Claude LM to AI Agent node in Kirana_Agent_Conv_V2 (n8n UI)
- [ ] Change Meta webhook URL to `kirana-v2` endpoint
- [ ] Smoke test TC-04, TC-09, TC-12 via actual WhatsApp
- [ ] Monitor V2 executions for 24h before deactivating V1
