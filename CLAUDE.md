# Kirana — Claude Instructions & n8n Workflow Protocol

## Project Context
Kirana is a WhatsApp AI ordering system built on n8n. All automation lives in n8n workflows connected to a Railway-hosted instance. See `PRODUCT.md` for full system documentation.

**n8n Instance:** `https://primary-production-87e8.up.railway.app`
**MCP Server:** `n8n-mcp` (full read/write access configured)

---

## Git-First Workflow Rules (MANDATORY)

**Git is the source of truth. n8n is the deployment target.**

1. **Never edit workflows directly in the n8n UI** (except wiring AI LM connections which require UI).
2. **Before any change:** run `scripts/sync_workflows.sh export` to pull the latest live state into `workflows/latest/`.
3. **Make changes** by editing JSON files in `workflows/latest/`.
4. **Commit** the changed files.
5. **Deploy** with `scripts/sync_workflows.sh push <filename>` (or `--all`).
6. **Verify** with `scripts/sync_workflows.sh diff` to confirm repo and live n8n are in sync.

### Workflow file locations
- All canonical workflow JSON: `workflows/latest/{ID}__{SnakeCaseName}.json`
- Helper: `scripts/sync_workflows.sh export|push|diff`

---

## MANDATORY: n8n Workflow Creation Protocol (TDD)

Every workflow must be built and verified in a single iteration using this protocol. Never skip steps.

### Phase 1 — Research Before Writing

Before writing any workflow JSON:

1. **Get latest node docs** for every node you plan to use:
   ```
   mcp__n8n-mcp__get_node(nodeType="nodes-base.postgres", mode="docs")
   mcp__n8n-mcp__get_node(nodeType="nodes-base.whatsApp", detail="full")
   ```

2. **Search for relevant templates** to learn real-world patterns:
   ```
   mcp__n8n-mcp__search_templates(query="whatsapp order", limit=5)
   mcp__n8n-mcp__search_templates(searchMode="by_nodes", nodeTypes=["n8n-nodes-base.postgres"])
   ```

3. **Validate node availability** and get correct typeVersions:
   ```
   mcp__n8n-mcp__search_nodes(query="supabase", source="core")
   ```

4. **Check tool documentation** when uncertain about any n8n-mcp capability:
   ```
   mcp__n8n-mcp__tools_documentation(topic="n8n_create_workflow")
   ```

### Phase 2 — Build & Pre-validate

5. **Validate each node config** before assembling the workflow:
   ```
   mcp__n8n-mcp__validate_node(nodeType="nodes-base.postgres", config={...})
   mcp__n8n-mcp__validate_node(nodeType="nodes-base.whatsApp", config={...})
   ```
   Fix all errors before proceeding. Never ignore warnings about typeVersion or missing required fields.

6. **Validate the full workflow structure** (before sending to n8n):
   ```
   mcp__n8n-mcp__validate_workflow(workflow={nodes:[...], connections:{...}})
   ```
   All errors must be resolved. Warnings must be reviewed.

### Phase 3 — Deploy

7. **Create or update the workflow** on the live instance:
   ```
   mcp__n8n-mcp__n8n_create_workflow(...)
   mcp__n8n-mcp__n8n_update_full_workflow(id="...", ...)
   ```

8. **Validate the deployed workflow** against the live n8n instance:
   ```
   mcp__n8n-mcp__n8n_validate_workflow(id="...", options={profile:"runtime"})
   ```

9. **Auto-fix any issues** found post-deploy (preview first, then apply):
   ```
   mcp__n8n-mcp__n8n_autofix_workflow(id="...", applyFixes=false)   // preview
   mcp__n8n-mcp__n8n_autofix_workflow(id="...", applyFixes=true)    // apply
   ```

### Phase 4 — Test

10. **Test the workflow** with realistic input:
    ```
    mcp__n8n-mcp__n8n_test_workflow(workflowId="...", triggerType="chat", message="I want 2kg rice")
    mcp__n8n-mcp__n8n_test_workflow(workflowId="...", triggerType="webhook", data={...})
    ```

11. **Check execution results**:
    ```
    mcp__n8n-mcp__n8n_executions(workflowId="...", limit=5)
    ```
    Verify: no failed nodes, correct output shape, no expression errors.

12. **Activate** only after all tests pass:
    ```
    mcp__n8n-mcp__n8n_activate_workflow(id="...")
    ```

---

## Rules for Writing n8n Workflows

### Node Versions
- Always use the **latest typeVersion** for each node — get it from `get_node` docs before writing
- Never hardcode typeVersion without checking; n8n rejects outdated versions

### Expressions
- Use `={{ }}` syntax for all expressions (never `{{}}` without `=`)
- Reference upstream data as `$json`, `$node["NodeName"].json`, `$input.item.json`
- Validate expressions with `validate_workflow` before deploying

### Connections
- Every non-terminal node must have at least one outgoing connection
- `If` and `Switch` nodes — connect ALL output branches, even error paths
- Use `SplitInBatches` → loop back connection for batch processing

### Postgres Nodes
- Always specify `operation` explicitly (select / insert / update / delete)
- Use parameterized queries — never string-concatenate SQL with user data
- Always handle empty result sets with an `If` node downstream

### Supabase Nodes
- Use for product catalogue, user history, promotions (read-heavy data)
- Use Postgres for transactional data (orders, cart, stock decrements)

### WhatsApp Nodes
- Always check the recipient phone number format (`+country_code_number`)
- Text message content must be under 4096 characters

### AI / LangChain Nodes
- Always attach Claude model node via `ai_languageModel` connection
- Always attach memory node if the workflow needs conversation context
- Set `sessionId` from `$json.chatInput.chatId` or equivalent for per-user memory

### Error Handling
- Every critical path (DB writes, external APIs) needs a downstream check node
- Format error messages as user-friendly WhatsApp text before returning to agent

---

## Existing Workflow IDs (Reference)

### V1 — Active (do not modify, kept as demo fallback)
| Workflow | ID | Status |
|---|---|---|
| Kirana_Agent_Conv (main) | `IdnN367mtxGrQvh0` | ✅ Active |
| [Tool] Add Items | `f659jKqfRLnkrCjg` | ✅ Active |
| [Tool] Modify Cart | `OrQimOPRa64ArwXr` | ✅ Active |
| [Tool] View Cart | `uFTUnWOeBHXiP2AI` | ✅ Active |
| [Tool-Kirana] Place Order | `A5dNcV6x2giM7j8U` | ✅ Active |
| [Tool] Confirm Order | `62u82sIei3owzaiU` | ✅ Active |
| [Tool] Cancel Order | `OY8zswARgKBX7XjP` | ✅ Active |
| [Tool] Track Order | `S0QE8s0YvcDagSnW` | ✅ Active |
| [Tool] Smart Promo Engine | `HrwRyze3sCTOjuI5` | ✅ Active |
| [AI Tool] Personalized Promotions Advisor | `R9xiuTG16Lb1CwPO` | ✅ Active |
| [Notify] Kirana New Order | `hN3YkLKXv2XutPzr` | ✅ Active (updated to also call Order Manager) |

### V2 — Deployed, not yet activated (see WORK.md for go-live steps)
| Workflow | ID | Status |
|---|---|---|
| Kirana_Agent_Conv_V2 | `Fo2MSa1kdtbY3OLW` | 🔶 Needs AI LM wired in UI |
| [Util V2] Send WhatsApp | `dO77E4A3PI9DvxVw` | 🔶 Ready, not activated |
| [Tool V2] Add Items | `yKZu2D7Vn3NZUw1L` | 🔶 Ready, not activated |
| [Tool V2] Place Order | `UgRHM83Qlh9S6Zor` | 🔶 Ready, not activated |
| [Owner] Order Manager | `g6rGUma60FIEypEb` | 🔶 Ready, not activated |
| [Owner] Inventory Manager | `yfCi0KEpBibSXI3M` | 🔶 Ready, not activated |
| [Owner] Promo Manager | `oiggfS3oMsdKNRRn` | 🔶 Ready, not activated |
| [Owner] Onboarding | `6QnLlMXzIOhgmW6o` | 🔶 Ready, not activated |

---

## Naming Conventions

| Type | Pattern | Example |
|---|---|---|
| Main agent | `ProjectName_Agent_Conv` | `Kirana_Agent_Conv` |
| Tool called by agent | `[Tool] Action Name` | `[Tool] Add Items` |
| Project-specific tool | `[Tool-Project] Action` | `[Tool-Kirana] Place Order` |
| AI-powered tool | `[AI Tool] Name` | `[AI Tool] Personalized Promotions Advisor` |
| Notification flow | `[Notify] Event Name` | `[Notify] Kirana New Order` |
| Webhook listener | `[Webhook] Event Name` | `[Webhook] Payment Confirmation Listener` |

---

## Quick Health Check

Run this to verify the n8n instance is up before doing any work:
```
mcp__n8n-mcp__n8n_health_check()
mcp__n8n-mcp__n8n_list_workflows(active=true)
```

---

## Current Implementation Status (as of 2026-03-07)

**Working document:** `WORK.md` — read this first for full context.

### Sprint 1 — COMPLETE
- BUG-1: Stale cart expiry SQL in `[Tool] Add Items`
- LAT-1: Smart Promo Engine removed from add/remove paths
- BUG-2: Format Error dead end fixed in `[Tool] Confirm Order`
- BUG-3: Cancel Order rebuilt (6 nodes, guard + cart expiry)
- BUG-4: Log No Channel added to `[Notify] Kirana New Order`

### Sprint 2 — COMPLETE
- FEAT-1: Idempotency guard in `Kirana_Agent_Conv`
- FEAT-2: Conv state hint (Get Conv State → Inject DB State → AI Agent)
- FEAT-4: System prompt upgraded to 13512 chars (11 languages + REASONING)

### V2 Build — COMPLETE (workflows deployed, not yet live)
All 8 V2 workflows built and deployed. See WORK.md → "V2 Go-Live Checklist" for exact steps.

**What's still needed before V2 is live:**
1. Run DB prerequisite SQL in Supabase (pg_trgm, search_vector, owner columns, etc.)
2. Set `owner_whatsapp_number` + `upi_id` in `stores` table
3. Wire Claude LM to AI Agent in `Kirana_Agent_Conv_V2` (UI action in n8n)
4. Activate all V2 workflows in n8n
5. Switch Meta webhook URL to `kirana-v2` endpoint

**What's still pending in code (post go-live):**
- Owner Rule Engine text routing — currently only handles button IDs; text commands like "add milk..." or "show promos" fall to AI Stub instead of routing to Inventory/Promo Manager
- `[Test] Kirana Mock Webhook` — 16 test scenarios, not yet built

### Known Validator False Positives (do not fix)
- All Code nodes — "Expression format error, Unmatched brackets" where current == fixed text
- `Parse Tool Calls`, `Format Promo Response` — "Cannot return primitive values directly"
- 6x `exec_*` nodes — "Invalid mappingMode: passthrough"
- `AI Agent` — "no systemMessage" (expression-prefixed string not readable by validator)

### n8n-mcp Quirks Learned
- `updateNode` requires `nodeName` (not `name`) + `updates` object
- Use dot notation for nested params: `"parameters.options.systemMessage"`
- Validator "no systemMessage" is false positive when value starts with `=`
- `addConnection` sourceOutput must be a string (`"1"`), not a number (`1`)
- Adding disconnected nodes requires adding their connections in the same operation batch
