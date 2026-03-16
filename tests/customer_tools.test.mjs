import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

// ── View Cart ──────────────────────────────────────────────────────────────

describe('Format Cart', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('uFTUnWOeBHXiP2AI');
    code = getCode(wf, 'Format Cart');
  });

  const makeCartCtx = (items, chatId = '111') => makeCtx({
    $json: { chat_id: chatId },
    inputItems: items,
    nodeOutputs: {
      'Start': { tool_input: { chat_id: chatId } },
      'Get Pricing Flag': { enable_pricing: true },
    },
  });

  it('empty items array → empty cart message with shop buttons', () => {
    const ctx = makeCartCtx([]);
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_HOME');
    assert.equal(r.message_type, 'button');
    assert.match(r.body_text, /empty/i);
    assert.ok(r.buttons.some(b => b.id === 'start_shopping'));
  });

  it('2 items → cart summary with list sections', () => {
    const ctx = makeCartCtx([
      { sku: 'MILK-500', item_name: 'Amul Milk 500ml', quantity: 2, unit: 'pcs', line_total: 50 },
      { sku: 'BREAD-400', item_name: 'Bread Loaf', quantity: 1, unit: 'pcs', line_total: 35 },
    ]);
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'CART_ACTIVE');
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /Your cart/);
    assert.match(r.body_text, /Amul Milk/);
    assert.match(r.body_text, /Bread Loaf/);
    assert.match(r.body_text, /2 items/);
    assert.match(r.body_text, /₹85/);
  });

  it('1 item → singular "1 item"', () => {
    const ctx = makeCartCtx([
      { sku: 'MILK-500', item_name: 'Milk', quantity: 1, unit: 'pcs', line_total: 25 },
    ]);
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /1 item[^s]/);
  });

  it('items filtered to only rows with sku field', () => {
    const ctx = makeCartCtx([
      { sku: 'MILK-500', item_name: 'Milk', quantity: 1, unit: 'pcs', line_total: 25 },
      { item_name: 'No SKU item', quantity: 1, unit: 'pcs', line_total: 10 }, // no sku, should be filtered
    ]);
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /1 item[^s]/); // only 1 valid item
  });
});

describe('Format Empty Cart', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('uFTUnWOeBHXiP2AI');
    code = getCode(wf, 'Format Empty Cart');
  });

  it('returns empty cart confirmation message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { tool_input: { chat_id: '111' } },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.confirmation_message, /empty/i);
  });
});

// ── Confirm Order ──────────────────────────────────────────────────────────

describe('Parse Pending Order', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('62u82sIei3owzaiU');
    code = getCode(wf, 'Parse Pending Order');
  });

  it('no rows → error no pending order', () => {
    const ctx = makeCtx({
      $json: {},
      inputItems: [],
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111' } } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.error, true);
    assert.equal(r.pending_order_id, null);
    assert.match(r.confirmation_message, /no pending order/i);
  });

  it('expired order → error expired message', () => {
    const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const ctx = makeCtx({
      $json: {},
      inputItems: [{
        order_id: 'ORD123',
        created_at: pastDate,
        expires_at: pastDate,
        order_details_json: JSON.stringify({ items_in_final_order: [] }),
      }],
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111' } } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.error, true);
    assert.match(r.confirmation_message, /expired/i);
  });

  it('valid order → returns parsed order details', () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const ctx = makeCtx({
      $json: {},
      inputItems: [{
        order_id: 'ORD123',
        created_at: new Date().toISOString(),
        expires_at: futureDate,
        order_details_json: JSON.stringify({
          order_id: 'ORD123',
          items_in_final_order: [{ name: 'Milk', quantity: 2, unit: 'pcs' }],
        }),
      }],
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111' } } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.error, false);
    assert.equal(r.pending_order_id, 'ORD123');
    assert.ok(r.order_details);
  });

  it('picks most recent order when multiple rows returned', () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const olderDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const ctx = makeCtx({
      $json: {},
      inputItems: [
        {
          order_id: 'ORD-OLD',
          created_at: olderDate,
          expires_at: futureDate,
          order_details_json: JSON.stringify({ order_id: 'ORD-OLD', items_in_final_order: [] }),
        },
        {
          order_id: 'ORD-NEW',
          created_at: new Date().toISOString(),
          expires_at: futureDate,
          order_details_json: JSON.stringify({ order_id: 'ORD-NEW', items_in_final_order: [] }),
        },
      ],
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111' } } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.pending_order_id, 'ORD-NEW');
  });
});

describe('Format Confirmation', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('62u82sIei3owzaiU');
    code = getCode(wf, 'Format Confirmation');
  });

  it('no items in order → shows unavailable items fallback', () => {
    // Format Confirmation doesn't short-circuit on error; it just uses summary data
    // If no items, it produces '• Items unavailable' line and still builds confirm message
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Prepare Order Summary': {
          error: false,
          order_id: 'ORD001',
          chat_id: '111',
          shipping_address: 'Test Addr',
          final_order_total: 0,
          store_id: 1,
          items: [],  // empty items
        },
        'Start': { tool_input: { chat_id: '111' } },
        'Get Pricing Flag': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.confirmation_message, /Items unavailable/);
    assert.equal(r.customer_ui_state, 'ORDER_CONFIRMED');
  });

  it('valid order → confirmation message with buttons', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Prepare Order Summary': {
          error: false,
          order_id: 'ORD999',
          chat_id: '911234567890',
          shipping_address: '12 MG Road',
          final_order_total: 150.00,
          store_id: 1,
          items: [
            { original_name: 'Milk', quantity: 2, unit: 'pcs' },
          ],
        },
        'Start': { tool_input: { chat_id: '911234567890' } },
        'Get Pricing Flag': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.confirmation_message, /Order confirmed/);
    assert.match(r.confirmation_message, /ORD999/);
    assert.match(r.confirmation_message, /12 MG Road/);
    assert.equal(r.customer_ui_state, 'ORDER_CONFIRMED');
    assert.ok(r.buttons.some(b => b.id === 'track_order'));
    assert.ok(r.buttons.some(b => b.id === 'new_order'));
  });
});

// ── Cancel Order ──────────────────────────────────────────────────────────

describe('Normalize Cancel Input', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('OY8zswARgKBX7XjP');
    code = getCode(wf, 'Normalize Cancel Input');
  });

  it('extracts chat_id from tool_input', () => {
    const ctx = makeCtx({ $json: { tool_input: { chat_id: '911234567890' } } });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '911234567890');
  });

  it('falls back to top-level chat_id', () => {
    const ctx = makeCtx({ $json: { chat_id: '999', tool_input: {} } });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '999');
  });
});

describe('Format Cancel Success', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('OY8zswARgKBX7XjP');
    code = getCode(wf, 'Format Cancel Success');
  });

  it('returns cancel success message with shop buttons', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: { 'Normalize Cancel Input': { chat_id: '111' } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.equal(r.customer_ui_state, 'BROWSE_HOME');
    assert.match(r.confirmation_message, /cancelled/i);
    assert.ok(r.buttons.some(b => b.id === 'start_shopping'));
  });
});

describe('Format No Order', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('OY8zswARgKBX7XjP');
    code = getCode(wf, 'Format No Order');
  });

  it('returns nothing to cancel message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: { 'Normalize Cancel Input': { chat_id: '222' } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '222');
    assert.match(r.confirmation_message, /nothing to cancel/i);
    assert.ok(r.buttons.some(b => b.id === 'start_shopping'));
    assert.ok(r.buttons.some(b => b.id === 'view_cart'));
  });
});

// ── Track Order ──────────────────────────────────────────────────────────

describe('Format No Orders Found', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('S0QE8s0YvcDagSnW');
    code = getCode(wf, 'Format No Orders Found');
  });

  it('no order_id → general "no orders yet" message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111' } } },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.confirmation_message, /no orders yet/i);
    assert.ok(r.buttons.some(b => b.id === 'browse'));
  });

  it('with order_id → message includes order ID', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: { 'Start': { tool_input: { chat_id: '111', order_id: 'ORD999' } } },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.confirmation_message, /ORD999/);
    // Actual message: "No order found with ID #ORD999. Please check and try again."
    assert.match(r.confirmation_message, /No order found/i);
  });
});

describe('Format Tracking Message', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('S0QE8s0YvcDagSnW');
    code = getCode(wf, 'Format Tracking Message');
  });

  const makeTrackCtx = (status = 'confirmed', orderId = 'ORD123') => makeCtx({
    $json: {},
    nodeOutputs: {
      'Start': { tool_input: { chat_id: '111' } },
      'Order Found?': {
        order_id: orderId,
        order_created_at: '2024-01-15T10:00:00Z',
        shipping_address: '12 MG Road',
        final_order_total: '150.00',
      },
      'Get Order Items': [
        { name: 'Milk', quantity: 2 },
        { name: 'Bread', quantity: 1 },
      ],
      'Get Live Status': { status },
    },
  });

  it('confirmed status → shows order confirmed label', () => {
    const ctx = makeTrackCtx('confirmed');
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'TRACKING');
    assert.match(r.confirmation_message, /Order received/i);
    assert.match(r.confirmation_message, /ORD123/);
    assert.match(r.confirmation_message, /Milk/);
    assert.ok(r.buttons.some(b => b.id === 'browse'));
    assert.ok(r.buttons.some(b => b.id === 'view_cart'));
  });

  it('dispatched status → "On the way"', () => {
    const ctx = makeTrackCtx('dispatched');
    const [r] = runCode(code, ctx);
    assert.match(r.confirmation_message, /On the way/i);
  });

  it('delivered status → shows rating buttons list', () => {
    const ctx = makeTrackCtx('delivered');
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.ok(r.list_sections);
    const rows = r.list_sections[0].rows;
    assert.ok(rows.some(row => row.id.startsWith('rate_good__')));
    assert.ok(rows.some(row => row.id.startsWith('rate_bad__')));
  });
});
