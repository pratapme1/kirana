# Kirana — Working Document
**Last updated:** 2026-03-15
**Status:** Production live on V1 (Kirana_Agent_Conv). V2 track dropped — all features merged into V1.

---

## Current System (Production)

Single active webhook, single main agent, all tools active.

### Active Workflows

| ID | Name | Nodes | Role |
|---|---|---|---|
| `IdnN367mtxGrQvh0` | Kirana_Agent_Conv | 57 | **Main agent — entry point for all WhatsApp messages** |
| `f659jKqfRLnkrCjg` | [Tool] Add Items | 17 | Customer: add items to cart (V1 — still called by AI agent path) |
| `yKZu2D7Vn3NZUw1L` | [Tool V2] Add Items | 22 | Customer: add items — pg_trgm + alias search (called by bypass path) |
| `62u82sIei3owzaiU` | [Tool] Confirm Order | 17 | Customer: confirm pending order |
| `OY8zswARgKBX7XjP` | [Tool] Cancel Order | 8 | Customer: cancel order |
| `uFTUnWOeBHXiP2AI` | [Tool] View Cart | 6 | Customer: view cart contents |
| `A5dNcV6x2giM7j8U` | [Tool-Kirana] Place Order | 9 | Customer: checkout → UPI bill |
| `UgRHM83Qlh9S6Zor` | [Tool V2] Place Order | 16 | Customer: checkout V2 (called by bypass path) |
| `S0QE8s0YvcDagSnW` | [Tool] Track Order | 9 | Customer: order status |
| `Xu9ngaO9mBg1sEIC` | [Tool] Browse Catalog | 6 | Customer: browse by category / search |
| `RMAW7qsDBClxmRQy` | [Tool] Language Select | 8 | Customer+Owner: change language |
| `w5D4XMey0WjTcJtp` | [Tool] Order Feedback | 15 | Customer: post-delivery rating/issue |
| `HrwRyze3sCTOjuI5` | [Tool] Smart Promo Engine | 11 | Promo calculation (called at checkout) |
| `R9xiuTG16Lb1CwPO` | [AI Tool] Personalized Promotions Advisor | 9 | AI-driven promo recommendations |
| `hN3YkLKXv2XutPzr` | [Notify] Kirana New Order | 11 | Fires on new order → notifies owner |
| `dO77E4A3PI9DvxVw` | [Util V2] Send WhatsApp | 4 | Outbound WhatsApp (button/text/interactive) |
| `dKmZqMMIOutM73xV` | [Util] Kirana Error Handler | 5 | Error workflow for all critical failures |
| `g6rGUma60FIEypEb` | [Owner] Order Manager | 21 | Owner: accept/reject/dispatch/deliver orders |
| `yfCi0KEpBibSXI3M` | [Owner] Inventory Manager | 21 | Owner: add/update/stock items |
| `oiggfS3oMsdKNRRn` | [Owner] Promo Manager | 21 | Owner: create/manage promos |
| `6QnLlMXzIOhgmW6o` | [Owner] Onboarding | 16 | Owner: first-time setup flow |
| `THmSvgrSb12AH0Mt` | [Owner] Inventory Import | 21 | Owner: bulk catalog import |
| `syLqocDmkt0MjFkv` | [Owner] Bulk Import Intake | 10 | Owner: intake leg of bulk import |
| `yDfWqigCvgCGz75e` | [Owner] Bulk Import Worker | 22 | Owner: worker leg of bulk import |
| `6GHQItXV8mOIOmwC` | [Owner] Bulk Import Apply | 6 | Owner: apply leg of bulk import |
| `y58Wx8NbvBONLuZ2` | [Owner] Bulk Import Reports | 6 | Owner: import status reports |

### Main Agent Architecture (IdnN367mtxGrQvh0, 57 nodes)

```
WhatsApp Trigger
  → Edit Fields (extract message, button_id, message_type)
  → If (filter non-message events)
  → Check Idempotency (Postgres: processed_messages)
  → Already Processed? → [TRUE: dead end] [FALSE: continue]
  → Mark Processed
  → Get Conv State (CTE: cart state, feedback_pending, browse_context, language)
  → Inject DB State (merge state hint into message context)
  → Detect Owner (check owner_whatsapp_number)
  → Is Owner?
      TRUE  → Owner Rule Engine → Owner Tool Switch
                → exec_owner_order_mgr / exec_owner_inventory / exec_owner_promo
                  / exec_owner_onboarding / Owner Help / Owner AI Route
      FALSE → Customer Rule Engine → bypass_llm?
                TRUE  → Format Bypass Call → Switch (11 outputs)
                          → exec_add_items / exec_process_order / exec_confirm_order
                            / exec_cancel_order / exec_get_promotions / answer_user
                            / exec_view-cart / exec_track_order / exec_order_feedback
                            / exec_browse_catalog / exec_language_select
                FALSE → AI Agent (Claude + Postgres memory) → Parse Tool Calls
                          → Split In Batches → Split Out → Switch (same 11 outputs)
              → [all paths] → Normalize → Attach Buttons → Build WA Payload
                             → Send WA HTTP → Split In Batches (loop back)
```

### Customer Rule Engine capabilities
- Language detection: script-based NLP auto-detect + explicit change
- Browse context: `awaiting_qty__SKU`, `awaiting_search`, `awaiting_address`
- Button ID routing: all button IDs for confirm/cancel/view/checkout/track/browse/feedback/language
- Text shortcuts: "cart", "track", "checkout", "confirm", "cancel", "offers", "browse", etc.
- Multi-item: "2 milk and 1 bread" → fan-out to multiple add_items calls
- Address detection: heuristic (length + digit + landmark keywords)
- Product add: quantity prefix ("2 milk"), suffix ("milk 2"), or plain name → add_items

### Owner Rule Engine capabilities
- Button ID routing: accept/reject/dispatch/delivered + all owner_* button IDs
- Text routing: `add/update/stock/price` → inventory; `promo/%off/discount` → promo; `setup/onboard` → onboarding
- Falls through to `owner_intent_ai` (Claude model) for unrecognised commands
- Media (document/image) → inventory (bulk import)

---

## Inactive / Junk Workflows (n8n cleanup needed)

These are in n8n but serve no purpose. Should be deleted.

| ID | Name | Why |
|---|---|---|
| `Fo2MSa1kdtbY3OLW` | Kirana_Agent_Conv_V2 | 0 nodes — never completed, V2 strategy abandoned |
| `wEF7X04yXeUyQIR6` | Kirana_Agent_Conv (old) | Old 21-node version, superseded by current 57-node |
| `ySWq1g5W1dHYMigl` | Kirana_Agent_Conv copy_backup_v1 | Manual backup copy, no longer needed |
| `CYJsLtqu50ilSYKk` | [Tool] View Cart (old) | Old duplicate, replaced by `uFTUnWOeBHXiP2AI` |
| `bDVyqI4GJ3cgrDcL` | [Tool] Place Order (old) | Old duplicate, replaced by V2 Place Order |
| `OrQimOPRa64ArwXr` | [Tool] Modify Cart | Inactive — modify logic merged into Add Items |
| `BzjKIsgv1azDH8HG` | [AI Tool] Personalized Promotions Advisor (old) | Duplicate of `R9xiuTG16Lb1CwPO` |
| `bG4n6Snmgv2NLgfE` | [Notify] Kirana New Order (old) | Old 4-node version, replaced by 11-node |
| `1UbjHr1ye6hevtW4` | [Tool-Kirana] Place order copy 2 | Manual copy |
| `0ADoAPymFeb4H9ph` | My workflow | Empty test workflow |
| `xsNXuVt1Fmv8QPQdxe1-q` | Daily Per-User Job Scraping | Not a Kirana workflow — unrelated |

**Test workflows (inactive — keep but don't activate):**
- `jgb4KLTcrS9ctMVm` [Test] Owner Customer Linked Proof Runner
- `ixV6C2mkvW3GhecC` [Test] Owner Module E2E Runner
- `soDRL6b8KjYrP0dt` [Test] Customer Regression Runner
- `BmjBsqniWEHHHAKi` [Test] Owner Ops Scheduled Runner
- `nFJtc58rw1Xik3pB` [Test] Owner Bulk Import Verification

**Setup workflows (inactive — keep for reference, do not delete):**
- `jTeU6hJ06aTNN4KX` [Setup] Kirana V2 DB Prerequisites
- `O3W6dnCgkFar65se` [Setup] Sprint 3 DB Columns

---

## Pending Work

### P1 — n8n Cleanup (delete junk workflows)
Delete the 11 junk workflows listed above from n8n and from `workflows/latest/`.
This reduces noise when reading the codebase.

### P2 — Mock Test Webhook
Build `[Test] Kirana Mock Webhook` — 16 test scenarios covering the full customer journey.
Scenarios: Hindi add, typo search, multi-item, confirm flow, cancel flow, cart view,
track order, duplicate dedup, non-text message, empty checkout, address detection, browse, language switch, owner text command, owner button, feedback.

### P3 — Verify Browse Catalog end-to-end
`Xu9ngaO9mBg1sEIC` exists (6 nodes) but has never been smoke-tested against live DB.
- [ ] "browse" → home categories display
- [ ] tap category → item list with [Add] buttons
- [ ] tap item → quantity picker
- [ ] "search milk" → search results

### P4 — Verify Order Feedback end-to-end
`w5D4XMey0WjTcJtp` exists (15 nodes). Check it fires after order delivery and owner alert works.

### P5 — Owner upi_id (manual DB step)
`UPDATE stores SET upi_id = 'owner@upi' WHERE store_id = 1;`
Currently null → Place Order generates bill without UPI link.

---

## Known Validator False Positives (do not fix)

- Code nodes — "Expression format error / Unmatched brackets" where current == fixed
- `Parse Tool Calls`, `Format Promo Response` — "Cannot return primitive values directly"
- `exec_*` nodes — "Invalid mappingMode: passthrough"
- `AI Agent` — "no systemMessage" (expression-prefixed string not readable by validator)

---

## DB State (as of 2026-03-15)

All prerequisites complete:
- `pg_trgm` + `unaccent` extensions: enabled
- `inventory`: search_vector (GIN + trgm index), category_tag populated
- `stores`: owner_whatsapp_number = 917995653349, upi_id = null (P5 above)
- `processed_messages`: PK table for idempotency
- `customer_preferences`: chat_id, language, updated_at, browse_context
- `stores.onboarding_step`: added

---

## Git-First Change Protocol

```
1. source .env && N8N_API_KEY=$N8N_API_KEY bash scripts/sync_workflows.sh export
2. Edit workflows/latest/{ID}__Name.json
3. git add + git commit
4. source .env && N8N_API_KEY=$N8N_API_KEY bash scripts/sync_workflows.sh push {filename}
5. Verify with scripts/sync_workflows.sh diff
```
