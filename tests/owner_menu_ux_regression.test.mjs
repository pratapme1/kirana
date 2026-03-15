import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const updateScript = fs.readFileSync(new URL('../scripts/update_owner_catalog_workflows.js', import.meta.url), 'utf8');
const routingScript = fs.readFileSync(new URL('../scripts/deploy_ai_first_routing.js', import.meta.url), 'utf8');
const bulkProofScript = fs.readFileSync(new URL('../scripts/browser_owner_bulk_import_proof.js', import.meta.url), 'utf8');

test('owner menu responses publish explicit list sections for list-style delivery', () => {
  assert.match(updateScript, /list_sections:\s*ownerMenuSections/);
  assert.match(updateScript, /message_type:\s*'list'/);
  assert.match(updateScript, /ownerCatalogSetupSections/);
  assert.match(updateScript, /title: 'Owner actions'/);
  assert.match(updateScript, /title: 'Catalog setup'/);
  assert.match(routingScript, /list_sections:\s*ownerMenuSections/);
  assert.match(routingScript, /list_sections:\s*ownerCatalogSetupSections/);
});

test('bulk import browser proof waits for changed chat state before accepting a step', () => {
  assert.match(bulkProofScript, /baselineStep = null/);
  assert.match(bulkProofScript, /snapshot\.tail_signature !== baselineStep\.tail_signature/);
  assert.match(bulkProofScript, /owner_menu_reset/);
});

test('bulk import browser proof supports file input fallback when filechooser is flaky', () => {
  assert.match(bulkProofScript, /input\[type="file"\]/);
  assert.match(bulkProofScript, /Document file input not found/);
});
