import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretInventorySessionReply,
  interpretPromoSessionReply,
  isOwnerConfirmCommand,
  isOwnerResetCommand,
  matchSessionChoice,
  parseExpiryReply,
  parsePriorityReply,
  pickActiveOwnerSession,
  routeOwnerWithSession,
} from '../scripts/owner_session_logic.mjs';

test('pickActiveOwnerSession skips terminal rows', () => {
  const active = pickActiveOwnerSession([
    { session_id: 'a', status: 'cancelled' },
    { session_id: 'b', status: 'awaiting_expiry' },
  ]);
  assert.equal(active.session_id, 'b');
});

test('routeOwnerWithSession keeps active promo and inventory sessions off the generic AI router', () => {
  assert.equal(routeOwnerWithSession({ baseToolName: 'owner_intent_ai', session: { operation_type: 'promo_draft' } }), 'owner_promo');
  assert.equal(routeOwnerWithSession({ baseToolName: 'owner_intent_ai', session: { operation_type: 'inventory_preview' } }), 'owner_inventory');
  assert.equal(routeOwnerWithSession({ baseToolName: 'owner_intent_ai', session: { operation_type: 'inventory_draft' } }), 'owner_inventory');
  assert.equal(routeOwnerWithSession({ baseToolName: 'owner_intent_ai', session: { operation_type: 'bulk_import_awaiting_upload' } }), 'owner_inventory');
  assert.equal(routeOwnerWithSession({ baseToolName: 'owner_help', session: { operation_type: 'promo_draft' } }), 'owner_help');
});

test('parseExpiryReply handles quick owner phrases', () => {
  assert.match(parseExpiryReply('today'), /^2026-03-11T23:59:59/);
  assert.match(parseExpiryReply('7 days'), /^2026-03-18T23:59:59/);
  assert.match(parseExpiryReply('30 days'), /^2026-04-10T23:59:59/);
  assert.equal(parseExpiryReply('sometime soon'), '');
});

test('parsePriorityReply accepts high medium low', () => {
  assert.deepEqual(parsePriorityReply('High'), { label: 'High', value: 30 });
  assert.deepEqual(parsePriorityReply('medium'), { label: 'Medium', value: 20 });
  assert.deepEqual(parsePriorityReply('low priority'), { label: 'Low', value: 10 });
  assert.equal(parsePriorityReply('urgentish'), null);
});

test('matchSessionChoice accepts numeric and exact text replies', () => {
  const options = [
    { target_sku: 'SKU1', target_label: 'Eggs 6' },
    { target_sku: 'SKU2', target_label: 'Eggs 10' },
  ];
  assert.equal(matchSessionChoice('2', options).target_sku, 'SKU2');
  assert.equal(matchSessionChoice('Eggs 10', options).target_sku, 'SKU2');
  assert.equal(matchSessionChoice('eggs', options), null);
});

test('interpretPromoSessionReply handles target, expiry, priority, confirm, and reset', () => {
  const target = interpretPromoSessionReply(
    {
      session_id: 'promo_1',
      status: 'awaiting_target',
      preview_rows_json: [{ target_sku: 'SKU2', target_label: 'Eggs 10' }],
    },
    'Eggs 10',
  );
  assert.equal(target.action, 'choose_target');
  assert.equal(target.choice.target_sku, 'SKU2');

  const expiry = interpretPromoSessionReply({ session_id: 'promo_1', status: 'awaiting_expiry' }, 'today');
  assert.equal(expiry.action, 'set_expiry');

  const priority = interpretPromoSessionReply({ session_id: 'promo_1', status: 'awaiting_priority' }, 'high');
  assert.equal(priority.action, 'set_priority');
  assert.equal(priority.priority.label, 'High');

  const confirm = interpretPromoSessionReply({ session_id: 'promo_1', status: 'pending_preview' }, 'yes');
  assert.equal(confirm.action, 'confirm_session');

  const reset = interpretPromoSessionReply({ session_id: 'promo_1', status: 'pending_preview' }, 'menu');
  assert.equal(reset.action, 'cancel_session');
  assert.equal(reset.reset_to_menu, true);
});

test('interpretInventorySessionReply handles preview and bulk review confirmations', () => {
  const preview = interpretInventorySessionReply({ session_id: 'inv_1', status: 'pending_preview', operation_type: 'inventory_preview' }, 'confirm');
  assert.equal(preview.action, 'confirm_session');

  const bulk = interpretInventorySessionReply({ session_id: 'bulk_job123', status: 'awaiting_review', operation_type: 'bulk_import_review' }, 'apply');
  assert.equal(bulk.action, 'bulk_apply');
  assert.equal(bulk.job_id, 'job123');

  const reset = interpretInventorySessionReply({ session_id: 'bulk_job123', status: 'awaiting_review', operation_type: 'bulk_import_review' }, 'start over');
  assert.equal(reset.action, 'bulk_cancel');
  assert.equal(reset.reset_to_menu, true);
});

test('command helpers stay intentionally narrow', () => {
  assert.equal(isOwnerConfirmCommand('yes'), true);
  assert.equal(isOwnerConfirmCommand('publish'), true);
  assert.equal(isOwnerConfirmCommand('do it maybe'), false);
  assert.equal(isOwnerResetCommand('menu'), true);
  assert.equal(isOwnerResetCommand('cancel'), true);
  assert.equal(isOwnerResetCommand('list'), false);
});
