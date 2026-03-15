import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fullSessionScript = fs.readFileSync(new URL('../scripts/browser_owner_full_session_e2e.js', import.meta.url), 'utf8');

test('owner full-session browser runner performs a blank onboarding reset and final pilot restore', () => {
  assert.match(fullSessionScript, /resetBlankOnboardingState/);
  assert.match(fullSessionScript, /reset_owner_pilot_catalog\.js/);
  assert.match(fullSessionScript, /target_sku: `in\.\(\$\{skuList\}\)`/);
  assert.doesNotMatch(fullSessionScript, /tablePath\('promotions'\), \{ method: 'DELETE'/);
  assert.match(fullSessionScript, /tablePath\('inventory', \{ store_id: `eq\.\$\{STORE_ID\}` \}\), \{\s*method: 'PATCH'/);
});

test('owner full-session browser runner limits bulk scenarios to xlsx and png', () => {
  assert.match(fullSessionScript, /OWNER_FULL_SESSION_SKIP_BULK/);
  assert.match(fullSessionScript, /report\.skipped_bulk = true/);
  assert.match(fullSessionScript, /xlsx_cancel/);
  assert.match(fullSessionScript, /xlsx_apply/);
  assert.match(fullSessionScript, /png_cancel/);
  assert.match(fullSessionScript, /png_apply/);
  assert.doesNotMatch(fullSessionScript, /pdf_apply/);
  assert.doesNotMatch(fullSessionScript, /csv_apply/);
});

test('owner full-session browser runner covers owner menu and ambiguity safety checks', () => {
  assert.match(fullSessionScript, /menu_no_session/);
  assert.match(fullSessionScript, /cancel_no_session/);
  assert.match(fullSessionScript, /ambiguous_update/);
  assert.match(fullSessionScript, /ambiguous_update_cancelled/);
  assert.match(fullSessionScript, /manual_preview_cancel/);
  assert.match(fullSessionScript, /sendMessage\(page, 'Add items manually'\)/);
  assert.match(fullSessionScript, /async function clickOwnerAction/);
  assert.match(fullSessionScript, /clickOwnerAction\(page, 'Add items manually'\)/);
  assert.match(fullSessionScript, /sendMessage\(page, `50% off \$\{manualRow\.item_name\}`\)/);
});
