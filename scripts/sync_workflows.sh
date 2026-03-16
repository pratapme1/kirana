#!/usr/bin/env bash
# sync_workflows.sh — Git-first n8n workflow sync
#
# Usage:
#   sync_workflows.sh export            Pull all live workflows → workflows/latest/
#   sync_workflows.sh push <file>       Push a single workflow file to n8n
#   sync_workflows.sh push --all        Push all workflows in workflows/latest/
#   sync_workflows.sh diff              Show what differs between repo and live n8n
#
# Credentials: N8N_API_KEY env var, or ~/.codex/config.toml under [mcp_servers.n8n-mcp.env]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOWS_DIR="${ROOT_DIR}/workflows/latest"
DEFAULT_N8N_URL="https://primary-production-87e8.up.railway.app"
CONFIG_FILE="${HOME}/.codex/config.toml"

# ── Credential resolution ──────────────────────────────────────────────────────

read_from_config() {
  local key="$1"
  if [[ -f "$CONFIG_FILE" ]]; then
    awk -v key="$key" -F'"' '
      $0 ~ /^\[mcp_servers\.n8n-mcp\.env\]/ { in_block=1; next }
      in_block && $0 ~ /^\[/ { in_block=0 }
      in_block && $0 ~ ("^[[:space:]]*" key "[[:space:]]*=") { print $2; exit }
    ' "$CONFIG_FILE"
  fi
}

N8N_URL="${N8N_API_URL:-}"
N8N_API_KEY_VALUE="${N8N_API_KEY:-}"

if [[ -z "$N8N_URL" ]]; then
  N8N_URL="$(read_from_config "N8N_API_URL" || true)"
fi
if [[ -z "$N8N_URL" ]]; then
  N8N_URL="$DEFAULT_N8N_URL"
fi

if [[ -z "$N8N_API_KEY_VALUE" ]]; then
  N8N_API_KEY_VALUE="$(read_from_config "N8N_API_KEY" || true)"
fi

if [[ -z "$N8N_API_KEY_VALUE" ]]; then
  echo "Missing N8N API key. Set N8N_API_KEY or add it in ~/.codex/config.toml under [mcp_servers.n8n-mcp.env]." >&2
  exit 1
fi

# ── Helpers ────────────────────────────────────────────────────────────────────

safe_name() {
  printf '%s' "$1" | tr '[:space:]/[]()' '_' | tr -cd '[:alnum:]_.-' | sed 's/__*/_/g; s/^_//; s/_$//'
}

n8n_get() {
  local path="$1"
  curl -sS -H "X-N8N-API-KEY: ${N8N_API_KEY_VALUE}" "${N8N_URL%/}/api/v1${path}"
}

n8n_put() {
  local path="$1"
  local body="$2"
  curl -sS -X PUT \
    -H "X-N8N-API-KEY: ${N8N_API_KEY_VALUE}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${N8N_URL%/}/api/v1${path}"
}

# ── Commands ───────────────────────────────────────────────────────────────────

cmd_export() {
  echo "Exporting workflows from ${N8N_URL} → ${WORKFLOWS_DIR}/"
  mkdir -p "$WORKFLOWS_DIR"

  local list_json
  list_json="$(n8n_get "/workflows?limit=250")"
  local count
  count="$(printf '%s' "$list_json" | jq '.data | length')"

  # Write the raw list for reference
  printf '%s' "$list_json" > "${WORKFLOWS_DIR}/workflows.list.json"

  local exported=0
  while IFS= read -r row; do
    local id name sname file_name
    id="$(printf '%s' "$row" | jq -r '.id')"
    name="$(printf '%s' "$row" | jq -r '.name')"
    sname="$(safe_name "$name")"
    [[ -z "$sname" ]] && sname="workflow"
    file_name="${id}__${sname}.json"

    n8n_get "/workflows/${id}" > "${WORKFLOWS_DIR}/${file_name}"
    echo "  ✓ ${file_name}"
    (( exported++ )) || true
  done < <(printf '%s' "$list_json" | jq -c '.data[]')

  # Remove stale files (workflows deleted from n8n)
  while IFS= read -r file; do
    local fname
    fname="$(basename "$file")"
    [[ "$fname" == "workflows.list.json" ]] && continue
    local fid="${fname%%__*}"
    if ! printf '%s' "$list_json" | jq -e --arg id "$fid" '.data[] | select(.id == $id)' > /dev/null 2>&1; then
      echo "  ✗ Removing stale: ${fname}"
      rm -f "$file"
    fi
  done < <(find "$WORKFLOWS_DIR" -maxdepth 1 -name "*.json")

  echo "Exported ${exported}/${count} workflows."
}

cmd_push_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    # Try resolving relative to workflows/latest/
    file="${WORKFLOWS_DIR}/${file}"
  fi
  if [[ ! -f "$file" ]]; then
    echo "File not found: $1" >&2
    exit 1
  fi

  local fname id
  fname="$(basename "$file")"
  id="${fname%%__*}"

  echo "Pushing ${fname} → n8n workflow ${id}..."

  # Strip server-generated fields — n8n PUT only accepts name/nodes/connections/settings
  # Also strip invalid settings properties (binaryMode) rejected by the API
  local body
  body="$(python3 -c "
import json, sys
INVALID_SETTINGS = {'binaryMode'}
with open('$file') as f:
    wf = json.load(f)
out = {k: wf[k] for k in ('name','nodes','connections','settings') if k in wf}
if 'settings' in out:
    out['settings'] = {k: v for k, v in out['settings'].items() if k not in INVALID_SETTINGS}
sys.stdout.write(json.dumps(out))
")"

  local response http_code
  http_code="$(curl -sS -o /tmp/n8n_push_response.json -w "%{http_code}" \
    -X PUT \
    -H "X-N8N-API-KEY: ${N8N_API_KEY_VALUE}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${N8N_URL%/}/api/v1/workflows/${id}")"

  if [[ "$http_code" == "200" ]]; then
    echo "  ✓ ${fname} pushed successfully."
  else
    echo "  ✗ Push failed (HTTP ${http_code}):" >&2
    cat /tmp/n8n_push_response.json >&2
    exit 1
  fi
}

cmd_push_all() {
  echo "Pushing all workflows from ${WORKFLOWS_DIR}/ → n8n..."
  local ok=0 fail=0
  for file in "${WORKFLOWS_DIR}"/*.json; do
    local fname
    fname="$(basename "$file")"
    [[ "$fname" == "workflows.list.json" ]] && continue
    if cmd_push_file "$file" 2>&1; then
      (( ok++ )) || true
    else
      (( fail++ )) || true
    fi
  done
  echo "Push complete: ${ok} ok, ${fail} failed."
}

cmd_diff() {
  echo "Fetching live workflow list from n8n..."
  local list_json
  list_json="$(n8n_get "/workflows?limit=250")"

  echo ""
  echo "ID                       Name                                  Repo file?"
  echo "─────────────────────────────────────────────────────────────────────────"

  while IFS= read -r row; do
    local id name sname file_name
    id="$(printf '%s' "$row" | jq -r '.id')"
    name="$(printf '%s' "$row" | jq -r '.name')"
    sname="$(safe_name "$name")"
    [[ -z "$sname" ]] && sname="workflow"
    file_name="${id}__${sname}.json"

    if [[ -f "${WORKFLOWS_DIR}/${file_name}" ]]; then
      # Compare node count as a quick sanity check
      local live_count repo_count
      live_count="$(n8n_get "/workflows/${id}" | jq '.nodes | length' 2>/dev/null || echo '?')"
      repo_count="$(jq '.nodes | length' "${WORKFLOWS_DIR}/${file_name}" 2>/dev/null || echo '?')"
      if [[ "$live_count" != "$repo_count" ]]; then
        printf "  DIFF  %-24s %-38s live=%s nodes, repo=%s nodes\n" "$id" "$name" "$live_count" "$repo_count"
      else
        printf "  OK    %-24s %-38s\n" "$id" "$name"
      fi
    else
      printf "  MISSING %-24s %-38s (not in repo)\n" "$id" "$name"
    fi
  done < <(printf '%s' "$list_json" | jq -c '.data[]')

  echo ""
  echo "Repo files not in live n8n:"
  for file in "${WORKFLOWS_DIR}"/*.json; do
    local fname fid
    fname="$(basename "$file")"
    [[ "$fname" == "workflows.list.json" ]] && continue
    fid="${fname%%__*}"
    if ! printf '%s' "$list_json" | jq -e --arg id "$fid" '.data[] | select(.id == $id)' > /dev/null 2>&1; then
      echo "  ORPHAN  ${fname}"
    fi
  done
}

# ── Entry point ────────────────────────────────────────────────────────────────

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
  export)
    cmd_export
    ;;
  push)
    TARGET="${1:-}"
    if [[ "$TARGET" == "--all" ]]; then
      cmd_push_all
    elif [[ -n "$TARGET" ]]; then
      cmd_push_file "$TARGET"
    else
      echo "Usage: sync_workflows.sh push <file|--all>" >&2
      exit 1
    fi
    ;;
  diff)
    cmd_diff
    ;;
  *)
    echo "Usage: sync_workflows.sh <export|push <file|--all>|diff>" >&2
    exit 1
    ;;
esac
