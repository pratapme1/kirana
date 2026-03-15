import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fullSessionScript = fs.readFileSync(new URL('../scripts/browser_owner_full_session_e2e.js', import.meta.url), 'utf8');
const menuScript = fs.readFileSync(new URL('../scripts/browser_owner_menu_stability_test.js', import.meta.url), 'utf8');
const bulkImportScript = fs.readFileSync(new URL('../scripts/browser_owner_bulk_import_proof.js', import.meta.url), 'utf8');

test('owner full-session runner retries transient n8n and child-script failures', () => {
  assert.match(fullSessionScript, /TRANSIENT_NETWORK_PATTERN/);
  assert.match(fullSessionScript, /function hasTransientNetworkError/);
  assert.match(fullSessionScript, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/);
  assert.match(fullSessionScript, /await sleep\(attempt \* 3000\)/);
  assert.match(fullSessionScript, /runNodeScript\(scriptPath, envOverrides = \{\}, retryOptions = \{\}\)/);
});

test('owner menu stability runner retries transient reset failures', () => {
  assert.match(menuScript, /TRANSIENT_NETWORK_PATTERN/);
  assert.match(menuScript, /function hasTransientNetworkError/);
  assert.match(menuScript, /function runReset\(\)/);
  assert.match(menuScript, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/);
});

test('owner bulk import runner retries transient supabase failures', () => {
  assert.match(bulkImportScript, /TRANSIENT_NETWORK_PATTERN/);
  assert.match(bulkImportScript, /function hasTransientNetworkError/);
  assert.match(bulkImportScript, /async function supabaseRest/);
  assert.match(bulkImportScript, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/);
  assert.match(bulkImportScript, /await sleep\(attempt \* 3000\)/);
});
