import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/deploy_canonical_catalog_workflows.js', import.meta.url), 'utf8');

function extractFunction(fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  assert.notEqual(start, -1, `missing function ${fnName}`);
  let index = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) break;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`unterminated function ${fnName}`);
}

const context = { Buffer };
vm.runInNewContext(
  [
    extractFunction('wrapNodeRuntimeCode'),
    extractFunction('addItemsPickCode'),
    extractFunction('addItemsNotFoundCode'),
    extractFunction('addItemsStockOrClarifyCode'),
    extractFunction('addItemsInsufficientCode'),
    extractFunction('addItemsSuccessCode'),
    extractFunction('viewCartFormatCode'),
    extractFunction('browseFormatCode'),
    extractFunction('placeOrderReturnBillCode'),
    extractFunction('trackOrderMessageCode'),
  ].join('\n'),
  context,
);

function runPick({ input, rows }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Search Term') return { json: input };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  const scopedInput = {
    all() {
      return rows.map((json) => ({ json }));
    },
  };
  return vm.runInNewContext(`(function(){ ${context.addItemsPickCode()} })()`, { $: dollar, $input: scopedInput, Buffer })[0].json;
}

function runClarify({ input, match }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Search Term') return { json: input };
      if (name === 'Pick Best Match') return { json: match };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.addItemsStockOrClarifyCode()} })()`, { $: dollar })[0].json;
}

function runNotFound(input) {
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Search Term') return { json: input };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.addItemsNotFoundCode()} })()`, { $: dollar })[0].json;
}

function runInsufficient({ input, product }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Search Term') return { json: input };
      if (name === 'Pick Best Match') return { json: product };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.addItemsInsufficientCode()} })()`, { $: dollar })[0].json;
}

function runSuccess({ input, product, cart_total }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Search Term') return { json: input };
      if (name === 'Pick Best Match') return { json: product };
      if (name === 'Build Cart Total') return { json: { cart_total } };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.addItemsSuccessCode()} })()`, { $: dollar })[0].json;
}

function runViewCart(rows) {
  const dollar = (name) => ({
    first() {
      if (name === 'Start') return { json: { tool_input: { chat_id: '917995653349' } } };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  const scopedInput = {
    all() {
      return rows.map((json) => ({ json }));
    },
  };
  return vm.runInNewContext(`(function(){ ${context.viewCartFormatCode()} })()`, { $: dollar, $input: scopedInput })[0].json;
}

function runBrowse({ contextRow, items }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Start') return { json: { tool_input: {} } };
      if (name === 'Resolve Browse Context') return { json: contextRow };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  const scopedInput = {
    all() {
      return items.map((json) => ({ json }));
    },
  };
  return vm.runInNewContext(`(function(){ ${context.browseFormatCode()} })()`, { $: dollar, $input: scopedInput, Buffer })[0].json;
}

function runReturnBill({ draft, store }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Prep Pending Order') return { json: draft };
      if (name === 'Get Store Info') return { json: store };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.placeOrderReturnBillCode()} })()`, { $, Buffer });

  function $(name) {
    return dollar(name);
  }
}

function runTrackOrder({ order, items, liveStatus, toolInput }) {
  const dollar = (name) => ({
    first() {
      if (name === 'Order Found?') return { json: order };
      if (name === 'Start') return { json: { tool_input } };
      if (name === 'Get Live Status') return { json: { status: liveStatus } };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
    all() {
      if (name === 'Get Order Items') return items.map((json) => ({ json }));
      throw new Error(`unexpected all() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.trackOrderMessageCode()} })()`, {
    $: dollar,
    $json: {},
    $input: { first() { return { json: toolInput }; } },
  })[0].json;
}

test('customer add-items resolver surfaces variant ambiguity instead of forcing exact-name retry', () => {
  const result = runPick({
    input: {
      normalized_search: 'amul milk',
      product_name: 'amul milk',
      quantity: 1,
      quantity_hint: null,
      secondary_search: '',
      suffix_quantity_candidate: null,
      sku_direct: '',
    },
    rows: [
      { sku: 'AMUL-MILK-500ML', item_name: 'Amul Milk 500ml', price: 32, stock: 9, unit: 'pack', sim_primary: 0.76, sim_secondary: 0 },
      { sku: 'AMUL-MILK-1L', item_name: 'Amul Milk 1l', price: 58, stock: 7, unit: 'pack', sim_primary: 0.79, sim_secondary: 0 },
    ],
  });

  assert.equal(result.match_status, 'ambiguous');
  assert.equal(result.candidate_rows.length, 2);
  assert.deepEqual(Array.from(result.candidate_rows, (row) => row.sku).sort(), ['AMUL-MILK-1L', 'AMUL-MILK-500ML']);
});

test('customer ambiguous match uses direct choice buttons for small candidate sets', () => {
  const payload = runClarify({
    input: { chat_id: '917995653349', quantity: 2, product_name: 'amul milk', normalized_search: 'amul milk', mode: 'add' },
    match: {
      match_status: 'ambiguous',
      requested_quantity: 2,
      query_label: 'amul milk',
      candidate_rows: [
        { sku: 'AMUL-MILK-500ML', item_name: 'Amul Milk 500ml', price: 32, stock: 9, unit: 'pack' },
        { sku: 'AMUL-MILK-1L', item_name: 'Amul Milk 1l', price: 58, stock: 7, unit: 'pack' },
      ],
    },
  });

  assert.equal(payload.message_type, 'button');
  assert.equal(payload.buttons.length, 2);
  assert.equal(payload.buttons[0].id, 'add_qty__AMUL-MILK-500ML__2');
  assert.match(payload.body_text, /choose the closest item/i);
});

test('customer not-found state still returns guided next actions', () => {
  const payload = runNotFound({
    chat_id: '917995653349',
    product_name: 'dragon fruit',
    normalized_search: 'dragon fruit',
  });

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['start_shopping', 'get_promos', 'view_cart']);
  assert.match(payload.body_text, /could not find/i);
});

test('customer ambiguous match uses list selection for larger candidate sets', () => {
  const payload = runClarify({
    input: { chat_id: '917995653349', quantity: 1, product_name: 'milk', normalized_search: 'milk', mode: 'add' },
    match: {
      match_status: 'ambiguous',
      requested_quantity: 1,
      query_label: 'milk',
      candidate_rows: [
        { sku: 'A', item_name: 'Amul Milk 500ml', price: 32, stock: 9, unit: 'pack' },
        { sku: 'B', item_name: 'Amul Milk 1l', price: 58, stock: 7, unit: 'pack' },
        { sku: 'C', item_name: 'Toned Milk 500ml', price: 30, stock: 5, unit: 'pack' },
        { sku: 'D', item_name: 'Cow Milk 1l', price: 62, stock: 4, unit: 'pack' },
      ],
    },
  });

  assert.equal(payload.message_type, 'list');
  assert.equal(payload.list_sections[0].rows.length, 4);
  assert.equal(payload.list_sections[0].rows[0].id, 'add_qty__A__1');
});

test('customer add success returns guided next-step buttons', () => {
  const payload = runSuccess({
    input: { chat_id: '917995653349', quantity: 2 },
    product: { item_name: 'Onions 1kg', price: 42, requested_quantity: 2 },
    cart_total: 84,
  });

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['checkout', 'view_cart', 'add_more']);
  assert.match(payload.body_text, /cart total: ₹84/i);
});

test('customer insufficient stock keeps the user inside a guided recovery flow', () => {
  const payload = runInsufficient({
    input: { chat_id: '917995653349' },
    product: { item_name: 'Onions 1kg', stock: 1, unit: 'kg', requested_quantity: 3 },
  });

  assert.equal(payload.message_type, 'button');
  assert.deepEqual(Array.from(payload.buttons, (button) => button.id), ['view_cart', 'start_shopping']);
  assert.match(payload.body_text, /only 1 kg/i);
});

test('view cart returns a guided cart surface instead of plain receipt text', () => {
  const payload = runViewCart([
    { sku: 'ONION-1KG', item_name: 'Onions 1kg', quantity: 2, unit: 'kg', line_total: 84 },
    { sku: 'MILK-500', item_name: 'Amul Milk 500ml', quantity: 1, unit: 'pack', line_total: 32 },
  ]);

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['checkout', 'add_more', 'cancel_order']);
  assert.match(payload.body_text, /cart summary/i);
  assert.match(payload.body_text, /items: 3/i);
  assert.match(payload.body_text, /total: ₹116/i);
});

test('browse home returns category-first shopping menu with cart-aware shortcuts', () => {
  const payload = runBrowse({
    contextRow: {
      chat_id: '917995653349',
      store_name: 'Local Store',
      cart_item_count: 2,
      cart_total: 90,
    },
    items: [
      { sku: 'MILK-500', item_name: 'Amul Milk 500ml', price: 32, stock: 9, category: 'Dairy' },
      { sku: 'BREAD-400', item_name: 'Bread White 400g', price: 40, stock: 5, category: 'Bakery' },
      { sku: 'ONION-1KG', item_name: 'Onions 1kg', price: 42, stock: 7, category: 'Vegetables' },
    ],
  });

  assert.equal(payload.message_type, 'list');
  assert.match(payload.body_text, /what would you like today/i);
  assert.match(payload.body_text, /cart: 2 items/i);
  const allRows = payload.list_sections.flatMap((section) => section.rows);
  assert.ok(allRows.some((row) => row.id === 'browse_category__daily_essentials'));
  assert.ok(allRows.some((row) => row.id === 'checkout'));
  assert.ok(allRows.some((row) => row.id === 'view_cart'));
});

test('browse category opens item picker and browse item opens quantity picker', () => {
  const items = [
    { sku: 'MILK-500', item_name: 'Amul Milk 500ml', price: 32, stock: 9, category: 'Dairy' },
    { sku: 'BREAD-400', item_name: 'Bread White 400g', price: 40, stock: 5, category: 'Bakery' },
  ];

  const categoryPayload = vm.runInNewContext(`(function(){ ${context.browseFormatCode()} })()`, {
    $: (name) => ({
      first() {
        if (name === 'Start') return { json: { tool_input: { entry_point: 'browse_category', category_key: 'daily_essentials' } } };
        if (name === 'Resolve Browse Context') return { json: { chat_id: '917995653349', store_name: 'Local Store', cart_item_count: 0, cart_total: 0 } };
        throw new Error(`unexpected first() lookup for ${name}`);
      },
    }),
    $input: { all() { return items.map((json) => ({ json })); } },
    Buffer,
  })[0].json;

  assert.equal(categoryPayload.message_type, 'list');
  assert.ok(categoryPayload.list_sections[0].rows.some((row) => row.id === 'browse_item__MILK-500'));

  const pickerPayload = vm.runInNewContext(`(function(){ ${context.browseFormatCode()} })()`, {
    $: (name) => ({
      first() {
        if (name === 'Start') return { json: { tool_input: { entry_point: 'browse_item', focus_sku: 'MILK-500' } } };
        if (name === 'Resolve Browse Context') return { json: { chat_id: '917995653349', store_name: 'Local Store', cart_item_count: 1, cart_total: 32 } };
        throw new Error(`unexpected first() lookup for ${name}`);
      },
    }),
    $input: { all() { return items.map((json) => ({ json })); } },
    Buffer,
  })[0].json;

  assert.equal(pickerPayload.message_type, 'list');
  assert.ok(pickerPayload.list_sections[0].rows.some((row) => row.id === 'set_qty__MILK-500__1'));
  assert.ok(pickerPayload.list_sections[0].rows.some((row) => row.id === 'set_qty_custom__MILK-500'));
});

test('browse falls back to a guided empty-catalog prompt when no items are available', () => {
  const payload = runBrowse({
    contextRow: {
      chat_id: '917995653349',
      store_name: 'Local Store',
      cart_item_count: 0,
      cart_total: 0,
    },
    items: [],
  });

  assert.equal(payload.message_type, 'button');
  assert.deepEqual(Array.from(payload.buttons, (button) => button.id), ['view_cart', 'get_promos']);
  assert.match(payload.body_text, /setting up items/i);
});

test('place order return bill does not crash when address is still required', () => {
  const payload = runReturnBill({
    draft: {
      chat_id: '917995653349',
      needs_address: true,
      last_address: '',
    },
    store: {},
  })[0].json;

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['add_address', 'add_more', 'view_cart']);
  assert.match(payload.body_text, /delivery address/i);
});

test('place order return bill shows change-address and add-more actions on the summary', () => {
  const payload = runReturnBill({
    draft: {
      chat_id: '917995653349',
      confirmation_message: 'Order Summary\n\n- Amul Milk 500ml x 2 pack = ₹64.00\n\nDeliver to: 12 MG Road\nSubtotal: ₹64.00\nYou save: ₹0.00\nTotal Payable: ₹64',
      final_order_total: 64,
      order_id: 'ORD-1',
    },
    store: {
      store_name: 'Local Store',
      upi_id: 'local@upi',
    },
  })[0].json;

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['confirm_order', 'add_address', 'add_more']);
  assert.match(payload.body_text, /review your order/i);
  assert.match(payload.body_text, /upi payment/i);
});

test('track order shows feedback buttons after delivery', () => {
  const payload = runTrackOrder({
    order: {
      order_id: 'ORD-1',
      order_created_at: new Date('2026-03-13T12:00:00Z').toISOString(),
      shipping_address: '12 MG Road',
      final_order_total: 64,
    },
    items: [{ name: 'Amul Milk 500ml', quantity: 2 }],
    liveStatus: 'delivered',
    toolInput: { chat_id: '917995653349' },
  });

  assert.equal(payload.message_type, 'list');
  assert.deepEqual(Array.from(payload.list_sections[0].rows, (row) => row.id), ['rate_good__ORD-1', 'rate_bad__ORD-1', 'new_order']);
  assert.match(payload.confirmation_message, /status: delivered/i);
});
