import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updateSource = readFileSync(new URL('../scripts/update_owner_catalog_workflows.js', import.meta.url), 'utf8');
const statefulSource = readFileSync(new URL('../scripts/deploy_owner_stateful_sessions.js', import.meta.url), 'utf8');
const bulkSource = readFileSync(new URL('../scripts/deploy_owner_bulk_import_pipeline.js', import.meta.url), 'utf8');
const promoSource = readFileSync(new URL('../scripts/deploy_canonical_catalog_workflows.js', import.meta.url), 'utf8');

test('owner detect query preserves media fields', () => {
  for (const field of ['source_type', 'media_id', 'media_mime_type', 'media_filename', 'media_caption']) {
    assert.match(updateSource, new RegExp(`json\\.${field}`));
    assert.match(statefulSource, new RegExp(`json\\.${field}`));
  }
});

test('main workflow deploy scripts admit media uploads and audit them', () => {
  assert.match(updateSource, /function entryIfConditions/);
  assert.match(updateSource, /doc-check/);
  assert.match(updateSource, /img-check/);
  assert.match(updateSource, /Audit Media Ingress/);
  assert.match(updateSource, /owner_media_ingress_audit/);
});

test('owner home button does not route through promo branch', () => {
  const match = updateSource.match(/if \(\s*buttonId === 'owner_catalog_home'[\s\S]+?tool_name: 'owner_help'/);
  assert.ok(match, 'owner_catalog_home should route to owner_help');
});

test('inventory flow starts explicit update and import sessions', () => {
  assert.match(updateSource, /action: 'start_update_session'/);
  assert.match(updateSource, /action: 'start_import_session'/);
  assert.match(updateSource, /action: 'bulk_intake'/);
  assert.match(updateSource, /action: 'bulk_apply'/);
  assert.match(updateSource, /action: 'bulk_cancel'/);
  assert.match(bulkSource, /action: 'start_update_session'/);
  assert.match(bulkSource, /action: 'start_import_session'/);
  assert.match(bulkSource, /'start_update_session', 'start_import_session'/);
});

test('owner import buttons now route through the staged bulk intake workflow', () => {
  assert.match(updateSource, /Run Bulk Import Intake/);
  assert.match(updateSource, /workflow\.connections\['Attach Import Binary'\] = \{ main: \[\[\{ node: 'Run Bulk Import Intake'/);
});

test('promo flow starts a prompt session instead of only returning text guidance', () => {
  assert.match(promoSource, /action: 'start_prompt_session'/);
  assert.match(promoSource, /SELECT 'prompt_ready' AS result/);
});

test('session cancellation now clears active owner sessions by chat', () => {
  assert.match(updateSource, /activeSessionWhere/);
  assert.match(updateSource, /UPDATE public\.owner_operation_sessions SET status = 'cancelled'/);
  assert.match(promoSource, /activeSessionWhere/);
  assert.match(promoSource, /UPDATE public\.owner_operation_sessions SET status = 'cancelled'/);
});

test('onboarding copy advertises Google Sheets support for large catalogs', () => {
  assert.match(updateSource, /Google Sheets links/);
});

test('inventory and promo terminal responses expose an explicit menu path', () => {
  assert.match(updateSource, /Catalog updated[\s\S]+owner_catalog_home/);
  assert.match(updateSource, /Cancelled\. No catalog changes were applied[\s\S]+owner_catalog_home/);
  assert.match(updateSource, /Discount saved\.[\s\S]+owner_catalog_home/);
  assert.match(updateSource, /Cancelled\. No promotion changes were applied[\s\S]+owner_catalog_home/);
});
