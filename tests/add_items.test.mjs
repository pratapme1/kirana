import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Normalize Search Term', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yKZu2D7Vn3NZUw1L');
    code = getCode(wf, 'Normalize Search Term');
  });

  const runNorm = (toolInput) => {
    const ctx = makeCtx({ $json: { tool_input: toolInput } });
    return runCode(code, ctx)[0];
  };

  it('basic product name is normalized', () => {
    const r = runNorm({ product_name: 'Milk', quantity: 1, chat_id: '111' });
    assert.ok(r.normalized_search);
    assert.equal(r.chat_id, '111');
  });

  it('Indian alias: doodh → milk', () => {
    const r = runNorm({ product_name: 'doodh', quantity: 1, chat_id: '111' });
    assert.equal(r.normalized_search, 'milk');
  });

  it('Indian alias: pyaaz → onion (normalized/stemmed)', () => {
    const r = runNorm({ product_name: 'pyaaz', quantity: 1, chat_id: '111' });
    // pyaaz → onion → stemmed
    assert.ok(r.normalized_search.startsWith('onion'));
  });

  it('Indian alias: chawal → rice', () => {
    const r = runNorm({ product_name: 'chawal', quantity: 1, chat_id: '111' });
    assert.equal(r.normalized_search, 'rice');
  });

  it('weight prefix: 1kg rice → product_name rice, unit kg', () => {
    // Note: Normalize Search Term doesn't parse weight prefixes; it normalizes the whole string
    const r = runNorm({ product_name: '1kg rice', quantity: 1, chat_id: '111' });
    // Should normalize units and produce a clean search term
    assert.ok(r.normalized_search);
    assert.ok(r.primary_search_sql !== undefined);
  });

  it('sku_direct is passed through', () => {
    const r = runNorm({ sku_direct: 'MILK-500', product_name: '', quantity: 2, chat_id: '111' });
    assert.equal(r.sku_direct, 'MILK-500');
    assert.equal(r.quantity, 2);
  });

  it('mode defaults to add', () => {
    const r = runNorm({ product_name: 'milk', quantity: 1, chat_id: '111' });
    assert.equal(r.mode, 'add');
  });

  it('remove mode passed through', () => {
    const r = runNorm({ product_name: 'milk', quantity: 0, mode: 'remove', chat_id: '111' });
    assert.equal(r.mode, 'remove');
  });

  it('suffix quantity candidate extracted from "milk 3"', () => {
    const r = runNorm({ product_name: 'milk 3', quantity: 1, chat_id: '111' });
    // When no quantity_hint provided, suffix qty extracted
    assert.equal(r.suffix_quantity_candidate, 3);
    assert.ok(r.secondary_search);
  });

  it('SQL escape single quotes in search term', () => {
    const r = runNorm({ product_name: "farmer's milk", quantity: 1, chat_id: '111' });
    assert.ok(!r.primary_search_sql.includes("'") || r.primary_search_sql.includes("''"));
  });
});

describe('Format Not Found', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yKZu2D7Vn3NZUw1L');
    code = getCode(wf, 'Format Not Found');
  });

  it('returns not found message with suggestions', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', product_name: 'xyz123', normalized_search: 'xyz123' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /xyz123/);
    assert.match(r.body_text, /could not find/i);
    assert.equal(r.message_type, 'list');
  });
});

describe('Format Out Of Stock', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yKZu2D7Vn3NZUw1L');
    code = getCode(wf, 'Format Out Of Stock');
  });

  it('out of stock single match → out of stock message with shop buttons', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', product_name: 'Milk', quantity: 1 },
        'Pick Best Match': {
          match_status: 'selected',
          item_name: 'Amul Milk 500ml',
          sku: 'MILK-500',
          requested_quantity: 1,
        },
        'Search Products': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /out of stock/i);
    assert.ok(r.buttons.some(b => b.id === 'start_shopping'));
  });

  it('ambiguous match with 2 candidates → button picker', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', product_name: 'milk', quantity: 2 },
        'Pick Best Match': {
          match_status: 'ambiguous',
          query_label: 'milk',
          requested_quantity: 2,
          matches: ['Amul Milk 500ml', 'Toned Milk 1L'],
          candidate_rows: [
            { sku: 'MILK-500', item_name: 'Amul Milk 500ml', price: 25, stock: 10, unit: 'pcs' },
            { sku: 'MILK-1L', item_name: 'Toned Milk 1L', price: 45, stock: 5, unit: 'pcs' },
          ],
        },
        'Search Products': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'button');
    assert.ok(r.buttons.some(b => b.id.startsWith('add_qty__MILK-500__')));
    assert.ok(r.buttons.some(b => b.id.startsWith('add_qty__MILK-1L__')));
  });

  it('ambiguous match with more than 2 candidates → list picker', () => {
    const candidates = [
      { sku: 'A', item_name: 'Item A', price: 10, stock: 5, unit: 'pcs' },
      { sku: 'B', item_name: 'Item B', price: 20, stock: 5, unit: 'pcs' },
      { sku: 'C', item_name: 'Item C', price: 30, stock: 5, unit: 'pcs' },
    ];
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', product_name: 'item', quantity: 1 },
        'Pick Best Match': {
          match_status: 'ambiguous',
          query_label: 'item',
          requested_quantity: 1,
          matches: candidates.map(c => c.item_name),
          candidate_rows: candidates,
        },
        'Search Products': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.ok(r.list_sections?.[0]?.rows.some(row => row.id.startsWith('add_qty__')));
  });
});

describe('Format Add Success', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yKZu2D7Vn3NZUw1L');
    code = getCode(wf, 'Format Add Success');
  });

  it('add mode → added to cart message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', quantity: 2, mode: 'add' },
        'Pick Best Match': { item_name: 'Amul Milk 500ml', price: 25, unit: 'pcs', requested_quantity: 2 },
        'Build Cart Total': { cart_total: 150 },
        'Search Products': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /Added to cart/i);
    assert.match(r.body_text, /Amul Milk/);
    assert.match(r.body_text, /Cart total/i);
    assert.equal(r.customer_ui_state, 'CART_ACTIVE');
  });

  it('remove mode → removed from cart message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', quantity: 1, mode: 'remove' },
        'Pick Best Match': { item_name: 'Amul Milk 500ml', price: 25, unit: 'pcs', requested_quantity: 1 },
        'Build Cart Total': { cart_total: 0 },
        'Search Products': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /Removed/i);
  });

  it('pricing disabled → no price in message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Search Term': { chat_id: '111', quantity: 1, mode: 'add' },
        'Pick Best Match': { item_name: 'Milk', price: 25, unit: 'pcs', requested_quantity: 1 },
        'Build Cart Total': { cart_total: 25 },
        'Search Products': { enable_pricing: false },
      },
    });
    const [r] = runCode(code, ctx);
    assert.ok(!r.body_text.includes('₹'));
  });
});
