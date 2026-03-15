# n8n MCP Setup and Workflow Sync

Last updated: 2026-03-06

## Configured MCP Server

Global Codex config (`~/.codex/config.toml`) now includes:

- Server name: `n8n-mcp`
- Command: `npx -y n8n-mcp@latest`
- Env:
  - `MCP_MODE=stdio`
  - `LOG_LEVEL=error`
  - `DISABLE_CONSOLE_OUTPUT=true`
  - `N8N_API_URL=https://primary-production-87e8.up.railway.app`
  - `N8N_API_KEY=<configured>`

This enables workflow read/write/update operations for the hosted n8n instance.

## Important Runtime Note

After MCP config changes, restart Codex so the new MCP tool namespace is loaded for this session.

## Latest Workflow Snapshot (Pulled from Hosted n8n)

Snapshot root:

- `workflows/latest/LATEST` points to the newest snapshot folder
- Current snapshot folder: `workflows/latest/20260306-055712Z`
- Summary: `workflows/latest/20260306-055712Z/SUMMARY.md`
- Manifest: `workflows/latest/20260306-055712Z/manifest.tsv`

## Re-sync Latest Workflows

Run:

```bash
./scripts/sync_n8n_workflows.sh
```

Optional custom output directory:

```bash
./scripts/sync_n8n_workflows.sh ./workflows/latest
```

The script reads `N8N_API_URL` and `N8N_API_KEY` from environment first, then falls back to `~/.codex/config.toml`.

## MCP Operations to Use After Restart

- Health check: `mcp__n8n-mcp__n8n_health_check()`
- List workflows: `mcp__n8n-mcp__n8n_list_workflows(active=true)`
- Get workflow: `mcp__n8n-mcp__n8n_get_workflow(id="<workflow-id>")`
- Update workflow: `mcp__n8n-mcp__n8n_update_full_workflow(id="<workflow-id>", ...)`
- Validate deployed workflow: `mcp__n8n-mcp__n8n_validate_workflow(id="<workflow-id>", options={profile:"runtime"})`

## Safety

Before editing active workflows:

1. Export latest snapshot.
2. Update one workflow at a time.
3. Validate and test before re-activating.
