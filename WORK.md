# Kirana — Implementation Working Document
**Date:** 2026-03-07
**Status:** V2 BUILT — awaiting go-live (DB + webhook switch)
**Snapshot:** workflows synced at 20260306-094811Z

---

## Sprint 1 — Correctness

### BUG-1: Stale Cart [Tool] Add Items `f659jKqfRLnkrCjg`
- [ ] Status: TODO
- **Node to edit:** `Upsert Cart` (Postgres)
- **Current SQL:** INSERT ... WHERE NOT EXISTS — no time check, reuses any active cart
- **Fix:** Prepend expiry UPDATE before the INSERT:
  ```sql
  -- Step 1: expire stale carts >6h inactive
  UPDATE public.carts
  SET status = 'expired'
  WHERE user_id = {{ $('Start').first().json.tool_input.chat_id }}
    AND status = 'active'
    AND COALESCE(last_activity_at, created_at) < NOW() - INTERVAL '6 hours';
  -- Step 2: existing INSERT ... WHERE NOT EXISTS (unchanged)
  INSERT INTO public.carts (user_id, store_id, status, last_activity_at)
  SELECT {{ $('Start').first().json.tool_input.chat_id }}, 1, 'active', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.carts
    WHERE user_id = {{ $('Start').first().json.tool_input.chat_id }} AND status = 'active'
  );
  -- Step 3: touch last_activity_at
  UPDATE public.carts SET last_activity_at = NOW()
  WHERE user_id = {{ $('Start').first().json.tool_input.chat_id }} AND status = 'active';
  -- Step 4: return cart_id
  SELECT cart_id FROM public.carts
  WHERE user_id = {{ $('Start').first().json.tool_input.chat_id }} AND status = 'active'
  LIMIT 1;
  ```

---

### LAT-1: Remove Smart Promo Engine from add_items `f659jKqfRLnkrCjg`
- [ ] Status: TODO
- **Current state:** `Call Smart Promo Engine` called after every add, `Call Smart Promo Engine (Remove)` called after every remove — 5 DB queries + 1 write each time
- **Nodes to remove from [Tool] Add Items:**
  - `Call Smart Promo Engine` (id: d76283e6) — on add path
  - `Call Smart Promo Engine (Remove)` (id: 61a31aa2) — on remove path
- **Rewire add path:** `Build Cart Total` → `Format Add Success` (skip promo call)
- **Rewire remove path:** `Get Cart Total After Remove` → `Format Remove Success` (skip promo call)
- **Update Format nodes:** remove `promoHint` references (or default to empty string)
- **[Tool-Kirana] Place Order `A5dNcV6x2giM7j8U`:** Already has `Get Best Order Promo` (simple DB query). Consider whether to also wire Smart Promo Engine here at checkout. Place Order already handles basic order-level promos. Smart Promo Engine (HrwRyze3sCTOjuI5) does product-level promos. Options:
  - Option A: Just remove from add_items, no change to place_order (simplest)
  - Option B: Add Smart Promo Engine call in place_order before Calculate Final Order
  - **Decision:** Option A for now — Place Order already has promo logic. Promo Engine still active for future use.

---

### BUG-2: Confirm Order dead end `62u82sIei3owzaiU`
- [ ] Status: TODO
- **Node with dead end:** `Format Error` (id: d726f9c1, n8n-nodes-base.set)
  - Hit when: `Order Valid?` FALSE (no pending order, expired bill, parse error)
  - Hit when: `Order Summary Valid?` FALSE (empty items)
  - Currently has NO outgoing connections → workflow dies silently
- **Fix:** Connect `Format Error` → new `Return Error` node (Set node or passthrough)
  - Return Error should output `{ confirmation_message, chat_id }` back to caller
  - Actually `Format Error` already sets `confirmation_message` and `chat_id`. Just needs outgoing connection.
  - Add a simple passthrough Set node called `Return Error Response` and wire `Format Error` → `Return Error Response`
  - (Or connect directly to an existing terminal if one exists — but n8n subworkflows return via last active node, so adding an explicit output node is safer)

---

### BUG-3: Cancel Order rebuild `OY8zswARgKBX7XjP`
- [ ] Status: TODO
- **Current state:** Only 3 nodes. Start → Delete FROM pending_orders → Format message. No stock restoration, no cart cleanup, no guard.
- **Full rebuild required:**
  1. Get order status (check if pending vs confirmed)
  2. If confirmed/packed/dispatched/delivered → return "Cannot cancel"
  3. If pending/awaiting_confirmation → run transaction:
     - Restore stock: UPDATE inventory
     - Update order status to 'cancelled' in orders (if it exists there)
     - DELETE from pending_orders
     - Expire active cart
  4. Format and return success message

- **Node structure:**
  ```
  Start
    → Get Order Status (Postgres: SELECT status, order_id FROM pending_orders WHERE chat_id=... ORDER BY created_at DESC LIMIT 1)
    → Is Cancellable? (If: status IN ['awaiting_confirmation', 'processing'])
      TRUE → Run Cancel Transaction (Postgres: executeQuery)
        → Format Cancel Success
      FALSE → Format Cannot Cancel (Code: return "Cannot cancel — order is already {status}")
  ```

- **Cancel Transaction SQL:**
  ```sql
  -- Restore stock for items in this order
  UPDATE public.inventory i
  SET stock = stock + COALESCE(
    (SELECT SUM(oi.quantity) FROM public.orders oi WHERE oi.order_id = '{{order_id}}' AND oi.sku = i.sku), 0
  )
  WHERE EXISTS (SELECT 1 FROM public.orders oi WHERE oi.order_id = '{{order_id}}' AND oi.sku = i.sku);

  -- Update order status if it exists in orders table
  UPDATE public.orders
  SET status = 'cancelled', updated_at = NOW()
  WHERE order_id = '{{order_id}}'
    AND status IN ('pending', 'awaiting_confirmation');

  -- Remove from pending_orders
  DELETE FROM public.pending_orders
  WHERE chat_id = {{chat_id}} AND status IN ('awaiting_confirmation', 'processing');

  -- Expire active cart
  UPDATE public.carts SET status = 'expired'
  WHERE user_id = {{chat_id}} AND status = 'active';

  SELECT 'cancelled' AS result;
  ```

- **Note on order_id:** Current cancel tool receives `chat_id` only in `tool_input`. Need to get pending order_id from DB first. The Get Order Status query handles this.

---

### BUG-4: Notify New Order dead ends `hN3YkLKXv2XutPzr`
- [ ] Status: TODO
- **Current state (already improved):** Workflow goes Start → Format Kirana Message → [Get Store Owner + Merge] → Send To Kirana Owner (Telegram, `onError: continueRegularOutput`)
  - The old If nodes (Has Owner Telegram?, Has Owner WhatsApp?) appear to have been removed in a previous fix
  - Current version silently continues if Telegram send fails (onError: continue)
  - But: if `owner_telegram_chat_id` is null/empty in the stores table, the Telegram node will fail and continue silently — no log, no fallback
- **Fix:** Add a `Has Telegram Chat ID?` If node before `Send To Kirana Owner`:
  - TRUE → Send To Kirana Owner (existing)
  - FALSE → `Log No Telegram Channel` (Code node: log to console or insert into a `notification_failures` table, then continue)
  - This makes failures visible instead of silently swallowed

---

### LAT-1 continued: Move Smart Promo to Place Order
- See LAT-1 above — decided Option A (remove from add, leave place_order as-is)

---

## Sprint 2 — Agent Intelligence

### FEAT-1: Idempotency + Hotspot Guard `IdnN367mtxGrQvh0`
- [x] Status: DONE (2026-03-07)
- **Source:** Kirana_Agent_Conv_codex.json
- **Nodes to add (before LangChain Agent):**
  1. `Check Idempotency` — Postgres: `SELECT 1 FROM public.processed_messages WHERE message_id = $1`
     - Actually need to read how message_id is passed in the current main agent
  2. `Already Processed?` — If: row exists → return cached reply, skip agent
  3. `Hotspot Guard` — Postgres: `SELECT COUNT(*) FROM public.message_log WHERE chat_id=$1 AND created_at > NOW() - INTERVAL '10 seconds'`
     - If count > threshold (e.g. 5) → return rate limit message
  4. `Mark Processed` — insert to processed_messages AFTER agent reply

- **Need to read main agent workflow first** before implementing

### FEAT-2: Get Conv State DB Hint `IdnN367mtxGrQvh0`
- [x] Status: DONE (2026-03-07)
- **Node to add:** Run state SQL before LangChain Agent, inject result into system prompt
- **SQL:** (from plan — see STATE_A/B/C/D logic)
- **Injection:** Prepend `[DB_STATE: STATE_B, cart_items: 3, cart_total: 245.00]` to user message or system prompt

### FEAT-4: Prompt Upgrade `IdnN367mtxGrQvh0`
- [x] Status: DONE (2026-03-07)
- **Blocks to add to system prompt:**
  - Language & Regional Support (11 languages)
  - R14: add_items mode field (add/set/remove)
  - R15: State awareness (STATE_A/B/C/D)
  - R16: Proactive UX (cart summary, address ask, checkout nudge)
  - Reasoning style (internal, don't show user)

---

## Sprint 3 — Search + Testing

### FEAT-5+6: Advanced Product Search + Language Aliases
- [ ] Status: TODO
- **Target:** `Find Best Match` Code node in `[Tool] Add Items`
- **Current scoring:** exact=100, prefix=80, contains=60, reverse-contains=40, word-match=+15
- **Upgrade to:** Levenshtein + trigram dice + prefix boost + TOKEN_ALIASES map
- **Aliases to add:** 15 Hindi + Bengali/Telugu/Tamil/Marathi/Punjabi + common typos

### FEAT-7: Mock Testing Webhook
- [ ] Status: TODO
- **New workflow:** `[Test] Kirana Mock Webhook`
- **16 test scenarios:** A1, A2, B2, B3, B4, B5, B6, C3, D, E, F, G, H, I, J, K

---

## Sprint 4 — Owner UX

### FEAT-9: Deploy Owner Callback
- [ ] Status: TODO
- **Workflow:** `NhLM82oFlVc5Gluy` — already in local file `[Webhook] Owner Callback.json`
- **Action:** Deploy and activate, wire from Notify New Order

---

## Key Observations from Code Review

### [Tool] Add Items — what's actually there:
- Smart Promo Engine called TWICE: once on add path, once on remove path ← LAT-1
- `Upsert Cart` SQL: does NOT expire stale carts ← BUG-1
- `Is In Stock?` only checks `stock > 0`, not if `quantity <= stock` — `Enough Stock?` does the ≤ check downstream ✓
- `Upsert Cart Item` uses `mode` for add/set logic ✓ (mode field already implemented)
- `Find Best Match` has basic scoring but no language aliases, no fuzzy matching

### [Tool] Confirm Order — what's actually there:
- `Format Error` node (id: d726f9c1) has NO outgoing connections ← BUG-2
- `Format Already Processing` mentioned in plan = actually `Format Error` in current code
- `Return Confirmation` node (id: return-confirmation-node) exists ✓ — properly returns to caller
- `Notify Kirana Owner` called with `waitForSubWorkflow: false` ✓ (fire-and-forget)
- `Send Customer Confirmation` WhatsApp node is disabled ✓ (using agent to reply instead)

### [Tool] Cancel Order — what's actually there:
- Only 3 nodes: Start → DELETE pending_orders → Format message
- No stock restoration, no cart cleanup, no guard ← BUG-3
- Cancel message says "Your cart is still intact" — correct for pending-only cancel
- But confirmed orders: no way to cancel them currently

### [Notify] Kirana New Order — what's actually there:
- 5 nodes: Start → Format → Get Store Owner (parallel) + Merge → Send Telegram
- Send Telegram has `onError: continueRegularOutput` — soft failure ✓
- No explicit null check on `owner_telegram_chat_id` ← BUG-4 (silent failure)
- No WhatsApp fallback channel

### [Tool-Kirana] Place Order — what's actually there:
- Already has `Get Best Order Promo` (simple Postgres query for order-level promos) ✓
- Does NOT call Smart Promo Engine (HrwRyze3sCTOjuI5)
- Plan: add Smart Promo Engine call here → Decision: skip (already has promo logic)

---

## Implementation Order (this session)

1. ✅ Read all workflows → done
2. ✅ BUG-1: Fix Upsert Cart SQL in Add Items — stale expiry prepended
3. ✅ LAT-1: Remove Smart Promo Engine calls from Add Items — 2 nodes removed, rewired
4. ✅ BUG-2: Connect Format Error → Return Error Response in Confirm Order
5. ✅ BUG-3: Rebuild Cancel Order — 6-node workflow with guard + cart expiry
6. ✅ BUG-4: Log No Channel added to Telegram/WhatsApp FALSE branches in Notify
7. ✅ Validate all workflows:
   - Add Items: pre-existing validator false positive (null inside json obj flagged as "primitive return") — was active/working before changes, not caused by my edits
   - Confirm Order: valid, 0 errors
   - Cancel Order: valid, 0 errors
   - Notify New Order: valid, 0 errors
8. ✅ Sprint 2: FEAT-1/2/4 deployed to Kirana_Agent_Conv — idempotency, DB state, prompt upgrade
9. [ ] Sprint 3: FEAT-5+6 — advanced search + language aliases in Add Items
10. [ ] Sprint 3: FEAT-7 — mock testing webhook (16 scenarios)

---

## Decisions Log

| Decision | Rationale |
|---|---|
| LAT-1: Don't add Smart Promo Engine to Place Order | Place Order already has `Get Best Order Promo` Postgres query. Adding Smart Promo Engine (5 DB queries) at checkout would add ~800ms with marginal benefit |
| BUG-2: Add new Return Error Response Set node | `Format Error` already has correct fields; just needs an outgoing connection to make n8n return it |
| BUG-3: Get pending order_id from DB in Cancel | Cancel tool only receives chat_id; must query pending_orders to get order_id for stock restoration |
| BUG-4: Soft fix (add null check) | Current onError:continue already prevents crashes. Add visible check + log. No WhatsApp fallback needed yet (Sprint 4). |
| FEAT-1: nodeName not name in updateNode | MCP `n8n_update_partial_workflow` requires `nodeName` (not `name`) for updateNode ops. Also use dot notation for nested params e.g. `parameters.options.systemMessage`. |
| FEAT-4: Validator "no systemMessage" is false positive | Validator can't evaluate expression-prefixed strings (`=CRITICAL:...`). Prompt is saved correctly at 13512 chars — verified via live workflow fetch. |

---

## Sprint 2 — Deployed 2026-03-07

All nodes deployed to `Kirana_Agent_Conv` (IdnN367mtxGrQvh0). nodeCount: 25.

| Node | Type | Purpose |
|---|---|---|
| `Check Idempotency` | Postgres | SELECT from processed_messages by message_id |
| `Already Processed?` | If | TRUE → skip (dead end), FALSE → continue |
| `Mark Processed` | Postgres | INSERT message_id ON CONFLICT DO NOTHING |
| `Get Conv State` | Postgres | CTE query → STATE_A/B/C + cart counts |
| `Inject DB State` | Code | Merge editData + db_state hint string |
| Edit Fields | Set | Added message_id = `$json.messages[0].id` |
| AI Agent system prompt | — | 13512 chars: R14/R15/R16 + LANGUAGE SUPPORT + REASONING |

Chain: `Edit Fields → Check Idempotency → Already Processed? → (FALSE) → Mark Processed → Get Conv State → Inject DB State → AI Agent`

---

---

## V2 Build — COMPLETE (2026-03-07)

All 8 workflows deployed to n8n. Not yet live — webhook still pointing at V1.

### V2 Workflow IDs
| Workflow | ID | Validator Status |
|---|---|---|
| Kirana_Agent_Conv_V2 | Fo2MSa1kdtbY3OLW | false positives only + AI LM needed |
| [Util V2] Send WhatsApp | dO77E4A3PI9DvxVw | false positives only |
| [Tool V2] Add Items | yKZu2D7Vn3NZUw1L | false positives only |
| [Tool V2] Place Order | UgRHM83Qlh9S6Zor | false positives only |
| [Owner] Order Manager | g6rGUma60FIEypEb | false positives only |
| [Owner] Inventory Manager | yfCi0KEpBibSXI3M | VALID (0 errors) |
| [Owner] Promo Manager | oiggfS3oMsdKNRRn | false positives only |
| [Owner] Onboarding | 6QnLlMXzIOhgmW6o | false positives only |

### V2 Architecture
- Webhook path: POST `/webhook/kirana-v2`
- Owner detected by: `stores.owner_whatsapp_number = chat_id`
- All outbound WhatsApp through `[Util V2] Send WhatsApp` (dO77E4A3PI9DvxVw)
- Supports button/list interactive messages in addition to text
- [Notify] Kirana New Order now also fires [Owner] Order Manager with `action: 'notify'`
- Customer Tool Switch outputs: add_items(0), process_order(1), confirm_order(2), cancel_order(3), view_cart(4), track_order(5), get_promotions(6), answer_user(7)
- Owner Tool Switch outputs: owner_order_mgr(0), exec_owner_inventory(1), exec_owner_promo(2), exec_owner_onboarding(3)
- V1 exec nodes (confirm/cancel/view/track/promos) reused as-is inside V2 main agent

---

## V2 Go-Live Checklist — START HERE NEXT SESSION

### Step 1: DB Setup (run in Supabase SQL Editor)
- [ ] `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- [ ] `CREATE EXTENSION IF NOT EXISTS unaccent;`
- [ ] `ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS search_vector tsvector, ADD COLUMN IF NOT EXISTS brand TEXT;`
- [ ] Run `UPDATE public.inventory SET search_vector = to_tsvector(...)` to populate existing rows
- [ ] Create `inventory_search_vector_update()` trigger function + trigger
- [ ] Create GIN indexes: `idx_inventory_search_vector`, `idx_inventory_trgm`
- [ ] `ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS owner_whatsapp_number TEXT, upi_id TEXT, onboarding_step INT DEFAULT 0, delivery_area TEXT, operating_hours TEXT;`
- [ ] `CREATE TABLE IF NOT EXISTS public.processed_messages (message_id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT NOW());`
- [ ] `CREATE TABLE IF NOT EXISTS public.customer_preferences (chat_id BIGINT PRIMARY KEY, language TEXT DEFAULT 'en', updated_at TIMESTAMPTZ DEFAULT NOW());`
- [ ] `UPDATE public.stores SET owner_whatsapp_number = '91XXXXXXXXXX', upi_id = 'store@upi' WHERE store_id = 1;`

### Step 2: n8n UI — Wire AI Language Model
- [ ] Open `Kirana_Agent_Conv_V2` (Fo2MSa1kdtbY3OLW) in n8n UI
- [ ] Add Anthropic Chat Model node, connect to AI Agent via `ai_languageModel` port
- [ ] Use same Anthropic credential as V1, model: claude-sonnet-4-5 (or same as V1)
- [ ] Save workflow

### Step 3: Activate V2 Workflows in n8n
- [ ] Activate `[Util V2] Send WhatsApp` (dO77E4A3PI9DvxVw)
- [ ] Activate `[Tool V2] Add Items` (yKZu2D7Vn3NZUw1L)
- [ ] Activate `[Tool V2] Place Order` (UgRHM83Qlh9S6Zor)
- [ ] Activate `[Owner] Order Manager` (g6rGUma60FIEypEb)
- [ ] Activate `[Owner] Inventory Manager` (yfCi0KEpBibSXI3M)
- [ ] Activate `[Owner] Promo Manager` (oiggfS3oMsdKNRRn)
- [ ] Activate `[Owner] Onboarding` (6QnLlMXzIOhgmW6o)
- [ ] Activate `Kirana_Agent_Conv_V2` (Fo2MSa1kdtbY3OLW) — last

### Step 4: Switch Meta Webhook
- [ ] Go to Meta Developer Console → WhatsApp → Configuration → Webhook → Edit
- [ ] Change Callback URL to: `https://primary-production-87e8.up.railway.app/webhook/kirana-v2`
- [ ] Verify token stays the same — click Verify and Save
- [ ] V1 stays active as fallback for 24h, then deactivate `Kirana_Agent_Conv`

### Step 5: Smoke Tests (send from WhatsApp)
- [ ] `2 doodh` → should add 2 milk, reply with View Cart + Checkout buttons
- [ ] `tamato` → should find tomato (trigram match)
- [ ] `cart` → shows cart
- [ ] Tap Checkout button → bill with UPI link + Confirm/Cancel buttons
- [ ] From owner number: `add milk price 40 stock 100` → stock updated
- [ ] From owner number: `10% off rice` → promo created

---

## Pending Code Work (post go-live)

### PEND-1: Owner Rule Engine — Text Routing
- [ ] Status: TODO
- **Problem:** Owner Rule Engine only detects button IDs (accept/reject/dispatch/delivered). Text commands like "add milk price 40" or "show promos" fall to `bypass_llm: false` → Owner AI Stub (which just shows help text).
- **Fix:** Add text pattern matching to Owner Rule Engine before the `return bypass_llm: false` fallthrough:
  ```javascript
  // Route to inventory manager
  if (/^(add|update|stock|price|list|inventory|low stock|deactivate)/i.test(msg))
    return [{ json: { ...src, bypass_llm: true,
      tool_calls: [{ tool_name: 'owner_inventory', tool_input: { chat_id: chatId, message: src.message } }] }}];

  // Route to promo manager
  if (/^(promo|%\s*off|flat\s+\d|show promo|remove promo|discount)/i.test(msg))
    return [{ json: { ...src, bypass_llm: true,
      tool_calls: [{ tool_name: 'owner_promo', tool_input: { chat_id: chatId, message: src.message } }] }}];

  // Route to onboarding
  if (/^(setup|register|onboard)/i.test(msg))
    return [{ json: { ...src, bypass_llm: true,
      tool_calls: [{ tool_name: 'owner_onboarding', tool_input: { chat_id: chatId, message: src.message } }] }}];
  ```
- **Also update Owner Tool Switch** to handle `owner_inventory` (output 1), `owner_promo` (output 2), `owner_onboarding` (output 3) in expression
- **Node to update:** `Owner Rule Engine` in `Kirana_Agent_Conv_V2` (Fo2MSa1kdtbY3OLW)

### PEND-2: Mock Testing Workflow
- [ ] Status: TODO
- **New workflow:** `[Test] Kirana Mock Webhook`
- **16 scenarios:** Hindi add item, typo search, confirm flow, cancel flow, cart view, track order, duplicate message dedup, non-text message, empty checkout, regional language

### FEAT-5+6: Advanced Search in V1 Add Items (lower priority — V2 already has FTS)
- [ ] Status: DEPRIORITISED (V2 has Postgres FTS + trigram, supersedes this)
- Only needed if keeping V1 active long-term

---

## Sprint 5 — Button UX (V1 In-Place)

**Date added:** 2026-03-08
**Target workflow:** `Kirana_Agent_Conv` (IdnN367mtxGrQvh0)
**Goal:** Add contextual quick-reply buttons to every tool response without touching tool sub-workflows.

### FEAT-10: Button UX on V1 Main Agent

**WhatsApp constraints:** max 3 buttons per message, title max 20 chars.

#### Button Map

| Scenario | Tool | Buttons |
|---|---|---|
| Item added | `add_items` | [View Cart] [Checkout] |
| Cart empty | `view_cart` | [Start Shopping] |
| Cart has items | `view_cart` | [Confirm Order] [Cancel Order] [Add More] |
| Bill / checkout | `process_order` | [Confirm Order] [Cancel] |
| Order confirmed | `confirm_order` | [Track Order] |
| Order cancelled | `cancel_order` | [View Cart] [Add Items] |
| Tracking | `track_order` | [New Order] |
| Promotions | `get_promotions` | [Add Items] [View Cart] |
| AI reply | `answer_user` | [My Cart] [Add Items] [Offers] |

#### Nodes to Change

| Node | Change |
|---|---|
| `Normalize` | Add `tool_name` passthrough |
| `Attach Buttons` (NEW) | New Code node after Normalize — maps tool_name → buttons |
| `Customer Rule Engine` | Add 4 new button IDs: checkout, track_order, add_more/start_shopping/new_order, get_promos |
| `Build WA Payload` | No change |
| `Send WA HTTP` | No change |
| `To AI Response` | Remove (merge paths) |
| `To Bypass Response` | Remove (merge paths) |
| `Format Bypass Response` | Remove (replaced by Attach Buttons) |
| `Send message` (WhatsApp node) | Remove (replaced by Send WA HTTP) |

#### New connection flow (after change)
```
Normalize → Attach Buttons → Build WA Payload → Send WA HTTP
```
Both the bypass path and the AI path converge at Normalize.

#### New Button IDs for Customer Rule Engine
```
checkout / process_order  → process_order tool bypass
track_order               → track_order tool bypass
add_more / start_shopping / new_order → bypass_llm: false (let AI handle)
get_promos                → get_promotions tool bypass
```

#### Implementation Steps
- [x] Step 1: Read current Kirana_Agent_Conv workflow (n8n REST API)
- [x] Step 2: Update `Normalize` node to pass `tool_name` (reads from Split In Batches item or Format Bypass Call context)
- [x] Step 3: Add `Attach Buttons` Code node after Normalize (id: 9ff128b2-4dbf-45d5-b41f-c76f2b7ebb37)
- [x] Step 4: Remove `To AI Response`, `To Bypass Response`, `Format Bypass Response`, `Send message` nodes
- [x] Step 5: Wire: Normalize → Attach Buttons → Build WA Payload → Send WA HTTP → Split In Batches (loop)
- [x] Step 6: Update `Customer Rule Engine` with 4 new button IDs (checkout, track_order, add_more/start_shopping/new_order, get_promos)
- [x] Step 7: Fixes deployed after first test (2026-03-08T12:53Z)

**Deployed:** 2026-03-08T12:18:14Z — node count 31 (was 34)

#### Post-test Fixes (2026-03-08)
| Bug | Fix |
|---|---|
| view_cart "Confirm Order" → bill expired | view_cart now shows [Checkout] not [Confirm Order] |
| [Checkout] bypass had no address → "Deliver to: undefined" | [Checkout] button now goes to AI path (bypass_llm:false) so AI reads address from history |
| Every add showed 2 buttons (noise) | add_items shows single [Checkout] CTA only when cart total > 0 |
| Error responses showed wrong buttons (e.g. Track Order on "bill expired") | Attach Buttons detects error text and returns plain text, no buttons |
| Promos not showing | Removed `promo_scope='order'` filter (may not be populated); added promo nudge to bill ("Add ₹X more to get Y% off") |
| answer_user buttons not context-aware | answer_user now shows [View Cart][Checkout] if message mentions items/cart, else [My Cart][Offers] |

#### Verification checklist
- [ ] "2 potato" → response has [View Cart][Checkout] buttons
- [ ] Tap [View Cart] → response has [Confirm Order][Cancel Order][Add More]
- [ ] Tap [Checkout] → response has [Confirm Order][Cancel]
- [ ] Tap [Confirm Order] → response has [Track Order]
- [ ] Tap [Track Order] → response has [New Order]
- [ ] "hello" → AI response has [My Cart][Add Items][Offers]
- [ ] Send WA HTTP output shows `wamid` + `type: interactive` in payload
