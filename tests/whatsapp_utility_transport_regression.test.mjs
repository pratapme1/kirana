import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const utilityFixScript = fs.readFileSync(new URL('../scripts/fix_whatsapp_utility_button_overflow.js', import.meta.url), 'utf8');
const linkedProofScript = fs.readFileSync(new URL('../scripts/fix_linked_proof_workflows.js', import.meta.url), 'utf8');
const bulkImportProofScript = fs.readFileSync(new URL('../scripts/browser_owner_bulk_import_proof.js', import.meta.url), 'utf8');

test('whatsapp utility converts oversized button payloads into a list menu', () => {
  assert.match(utilityFixScript, /if \(buttons\.length > 3\)/);
  assert.match(utilityFixScript, /type: 'list'/);
  assert.match(utilityFixScript, /button: 'Menu'/);
  assert.match(utilityFixScript, /message_type === 'list'[\s\S]+button: 'Menu'/);
});

test('linked proof workflow rewrite preserves the button-overflow fix', () => {
  assert.match(linkedProofScript, /if \(buttons\.length > 3\)/);
  assert.match(linkedProofScript, /type: 'list'/);
  assert.match(linkedProofScript, /button: 'Menu'/);
  assert.match(linkedProofScript, /message_type === 'list'[\s\S]+button: 'Menu'/);
});

test('bulk import browser proof uses typed import entry before UI fallback', () => {
  assert.match(bulkImportProofScript, /sendMessage\(page, 'Upload stock sheet'\)/);
  assert.match(bulkImportProofScript, /Fall back to direct UI interaction if typed entry fails/);
});
