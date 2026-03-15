# Supabase MCP Setup

Last updated: 2026-03-06

## Configured MCP Server

Global Codex config (`~/.codex/config.toml`) now includes:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?read_only=true&features=database,docs,development,debugging"
```

## What This Does

- Uses the hosted Supabase MCP server
- Keeps the default setup read-only
- Limits tools to `database`, `docs`, `development`, and `debugging`

## Important Runtime Note

After MCP config changes, restart Codex so the new `mcp__supabase__...` tool namespace is loaded for this session.

## Optional Hardening

If you want to scope the server to a single Supabase project, replace the URL with:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=<your-project-ref>&read_only=true&features=database,docs,development,debugging"
```

Project scoping is safer because it prevents account-wide access.
