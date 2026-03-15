# Kirana — AI-Powered WhatsApp Ordering System
**Product Document** · Generated from live n8n workflows · March 2026

---

## Overview

Kirana is a conversational commerce system that lets customers place grocery/kirana store orders entirely through **WhatsApp**. A Claude-powered AI agent handles the full order lifecycle — browsing, cart management, checkout, and post-order notifications — without any human intervention. The store owner receives real-time alerts via **Telegram** when an order is confirmed.

---

## Architecture Summary

```
Customer (WhatsApp)
        │
        ▼
  Kirana_Agent_Conv          ← Main orchestrator (Claude AI Agent)
        │
        ├── [Tool] Add Items
        ├── [Tool] Modify Cart
        ├── [Tool] View Cart
        ├── [Tool-Kirana] Place Order
        ├── [Tool] Confirm Order          ← Triggers owner notifications
        ├── [Tool] Cancel Order
        ├── [Tool] Track Order
        ├── [Tool] Smart Promo Engine     ← Called on every cart update
        └── [AI Tool] Personalized Promotions Advisor
```

**Databases:** PostgreSQL (orders, cart, stock, pending orders) + Supabase (products, promotions, user history)
**AI Model:** Anthropic Claude (via n8n LangChain nodes)
**Memory:** PostgreSQL-backed chat memory (persists conversation per user)

---

## Workflows

### 1. Kirana_Agent_Conv — Main Orchestrator
**Trigger:** WhatsApp message received
**Flow:**
1. WhatsApp Trigger fires on incoming message
2. An `If` filter checks message validity (ignores noise/status updates)
3. Message + session context passed to **Claude AI Agent** with Postgres chat memory
4. Claude decides which tool(s) to call based on user intent
5. Tool calls are parsed, split, and routed via a `Switch` node to the correct sub-workflow
6. Sub-workflow results are normalised and sent back to the customer via WhatsApp
7. For confirm-order intent: sends a "loading" message first, then executes confirmation

**Key design:** The agent runs in a loop — after sending a response, it continues batching any remaining tool calls before finishing the turn.

---

### 2. [Tool] Add Items
**Purpose:** Add or remove a product from the customer's cart
**Flow:**
1. Fetch all active products from Supabase
2. Fuzzy-match the customer's request to the best product
3. If product not found → return error
4. Check stock availability
5. If removing → delete cart item directly
6. If adding → verify enough stock, then upsert cart + cart item in Postgres
7. Fetch updated cart and calculate totals
8. Call **Smart Promo Engine** to check for applicable promotions
9. Return cart summary with any promo hint to the agent

---

### 3. [Tool] Modify Cart
**Purpose:** Older/parallel cart modification tool (uses Supabase directly)
**Flow:** Same logic as Add Items but reads/writes to Supabase instead of Postgres. Handles both existing cart (update/create item) and new cart creation paths.

---

### 4. [Tool] View Cart
**Purpose:** Show the customer their current cart
**Flow:**
1. Query Postgres for current cart items
2. If empty → return empty cart message
3. If items exist → format and return cart summary

---

### 5. [Tool-Kirana] Place Order
**Purpose:** Convert the active cart into a pending order awaiting confirmation
**Flow:**
1. Fetch active cart from Postgres
2. If cart is empty → return error
3. Calculate final order total (subtotal, taxes, fees)
4. Build a pending order record
5. Save pending order to Postgres
6. Return a bill/invoice summary to the agent (which shows it to the customer for confirmation)

> **Note:** This creates a *pending* order. It is not finalised until the customer confirms.

---

### 6. [Tool] Confirm Order
**Purpose:** Finalise the pending order, update inventory, and notify all parties
**Flow:**
1. Fetch pending order from Postgres
2. Validate the order is still valid
3. Insert order summary into orders table
4. Split and insert individual order line items
5. **Decrement stock** for each item ordered
6. Mark pending order as confirmed
7. Execute cleanup SQL query
8. Format confirmation message
9. **Send WhatsApp confirmation** to the customer
10. Fetch store owner's WhatsApp number from Postgres
11. **Send WhatsApp notification** to the store owner

---

### 7. [Tool] Cancel Order
**Purpose:** Cancel a pending order before it is confirmed
**Flow:**
1. Delete the pending order from Postgres
2. Return cancellation confirmation message

> Stock is **not** decremented for cancelled orders (only confirmed orders affect stock).

---

### 8. [Tool] Track Order
**Purpose:** Let the customer check the status of an existing order
**Flow:**
1. Check if an order ID was provided
2. If yes → fetch order by ID from Supabase
3. If no → fetch the customer's most recent order by chat session
4. Merge results and check if an order was found
5. If found → fetch order line items and format tracking message
6. If not found → return "no orders found" message

---

### 9. [Tool] Smart Promo Engine
**Purpose:** Automatically surface the best applicable promotion after every cart change
**Flow:**
1. Fetch all active promotions from Postgres
2. Fetch current cart items
3. Fetch current inventory levels
4. Fetch the user's order history
5. Fetch promotions already shown to this user (to avoid repetition)
6. **Score and select** the best matching promo using custom scoring logic
7. Format a promo hint message
8. Record the promo impression in Postgres (so it isn't shown again)
9. Return the promo hint alongside the cart update response

---

### 10. [AI Tool] Personalized Promotions Advisor
**Purpose:** Claude-powered deep personalisation for promotions
**Flow:**
1. Extract user context (chat ID, cart, history)
2. Fetch active promotions from Supabase
3. Fetch user's order history
4. Fetch user's previously ordered items
5. Build a structured prompt combining all context
6. Send to **Claude** via LangChain LLM chain
7. Format and return personalised promotion recommendation

> This is a richer, AI-driven alternative to the rule-based Smart Promo Engine. Both can be called depending on context.

---

### 11. [Notify] Kirana New Order
**Purpose:** Send a new order alert to the store owner via Telegram
**Flow:**
1. Format the order message
2. Fetch store owner details from Supabase (in parallel)
3. Merge message + owner data
4. **Send Telegram message** to the store owner

> Note: Order confirmation also sends a WhatsApp to the owner directly from the Confirm Order workflow. This Telegram notification is a separate/additional alert channel.

---

## Order Lifecycle

```
Customer says "I want 2kg rice"
        │
        ▼
   [Tool] Add Items          → Cart updated, promo hint surfaced
        │
        ▼
Customer says "place order"
        │
        ▼
   [Tool-Kirana] Place Order → Pending order created, bill shown
        │
        ▼
Customer says "confirm"
        │
        ▼
   [Tool] Confirm Order      → Stock decremented, order saved
                                Customer gets WhatsApp receipt
                                Owner gets WhatsApp + Telegram alert
```

---

## Key Design Decisions

| Decision | Detail |
|---|---|
| **Two-step checkout** | Place Order creates a pending order; Confirm Order finalises it. This gives customers a chance to review before committing. |
| **Persistent chat memory** | Postgres-backed memory means the agent remembers context across messages within a conversation session. |
| **Dual database** | Supabase used for product catalogue and user history; Postgres used for transactional data (orders, cart, stock). |
| **Promo deduplication** | Smart Promo Engine records every promo impression so the same promotion is never shown twice to the same user. |
| **Dual notification** | Owner is notified on both WhatsApp (from Confirm Order) and Telegram (from Notify workflow). |
| **Fuzzy product matching** | Add Items does not require exact product names — it finds the best match from the catalogue, tolerating typos and informal names. |

---

## Active Workflows

| Workflow | Status | Nodes |
|---|---|---|
| Kirana_Agent_Conv | ✅ Active | 20 |
| [Tool] Add Items | ✅ Active | 17 |
| [Tool] Modify Cart | ✅ Active | 21 |
| [Tool] View Cart | ✅ Active | 5 |
| [Tool-Kirana] Place Order | ✅ Active | 8 |
| [Tool] Confirm Order | ✅ Active | 17 |
| [Tool] Cancel Order | ✅ Active | 3 |
| [Tool] Track Order | ✅ Active | 9 |
| [Tool] Smart Promo Engine | ✅ Active | 10 |
| [AI Tool] Personalized Promotions Advisor | ✅ Active | 9 |
| [Notify] Kirana New Order | ✅ Active | 5 |
