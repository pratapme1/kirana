import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Format Browse Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('Xu9ngaO9mBg1sEIC');
    code = getCode(wf, 'Format Browse Response');
  });

  const makeCtxWith = ({ rows = [], toolInput = {}, context = {}, inputItems = null } = {}) => {
    const items = inputItems !== null ? inputItems : rows;
    return makeCtx({
      $json: {},
      inputItems: items,
      nodeOutputs: {
        'Start': { tool_input: { chat_id: '111', entry_point: 'browse', ...toolInput } },
        'Resolve Browse Context': {
          chat_id: '111', store_name: 'Test Kirana', cart_item_count: 0, cart_total: 0,
          recent_skus_json: '[]', ...context,
        },
      },
    });
  };

  it('empty rows → shop setup message', () => {
    const ctx = makeCtxWith({ rows: [] });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_HOME');
    assert.match(r.body_text, /setting up/i);
    assert.equal(r.chat_id, '111');
  });

  it('browse_home with items → grouped by category list', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk 500ml', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
        { sku: 'RICE-1KG', item_name: 'Basmati Rice 1kg', price: 80, unit: 'kg', stock: 100, category_tag: 'staples' },
      ],
      toolInput: { entry_point: 'browse', user_query: '' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_HOME');
    assert.equal(r.message_type, 'list');
    assert.ok(Array.isArray(r.list_sections));
    // Should have browse categories section
    const categorySection = r.list_sections.find(s => s.title === 'Browse categories');
    assert.ok(categorySection, 'Expected a Browse categories section');
  });

  it('browse_search with results → search results list', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk 500ml', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
      ],
      toolInput: { entry_point: 'browse_search', user_query: 'milk' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_SEARCH');
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /milk/i);
    const resultsSection = r.list_sections.find(s => s.title === 'Results');
    assert.ok(resultsSection);
    assert.ok(resultsSection.rows[0].id.startsWith('browse_item__'));
  });

  it('browse_search with no results → no results message', () => {
    const ctx = makeCtxWith({
      rows: [],
      toolInput: { entry_point: 'browse_search', user_query: 'xyz123' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_HOME');
    assert.match(r.body_text, /No results found/i);
  });

  it('browse_search_prompt → awaiting_search browse_context', () => {
    const ctx = makeCtxWith({
      rows: [],
      toolInput: { entry_point: 'browse_search_prompt' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_SEARCH_PROMPT');
    assert.equal(r.browse_context_to_set, 'awaiting_search');
  });

  it('browse_item with focusSku → quantity picker list', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
      ],
      toolInput: { entry_point: 'browse_item', focus_sku: 'MILK-500', sku: 'MILK-500' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'ITEM_QUANTITY_PICKER');
    assert.equal(r.message_type, 'list');
    const pickerSection = r.list_sections.find(s => s.title === 'Pick quantity');
    assert.ok(pickerSection);
    // Should have qty 1-5 and custom
    assert.ok(pickerSection.rows.some(row => row.id.startsWith('set_qty__MILK-500__')));
  });

  it('browse_category with items → category list', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
        { sku: 'CURD-400', item_name: 'Fresh Curd', price: 35, unit: 'pcs', stock: 30, category_tag: 'dairy' },
      ],
      toolInput: { entry_point: 'browse_category', category_key: 'dairy' },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'BROWSE_CATEGORY');
    assert.equal(r.message_type, 'list');
    // browse_item__ rows
    const catSection = r.list_sections.find(s => s.rows.some(row => row.id.startsWith('browse_item__')));
    assert.ok(catSection);
  });

  it('hasMore=true (11 rows) → show more button appended in search results', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      sku: `SKU-${i}`, item_name: `Item ${i}`, price: 10 + i, unit: 'pcs', stock: 10, category_tag: 'general',
    }));
    const ctx = makeCtxWith({
      rows,
      toolInput: { entry_point: 'browse_search', user_query: 'item', page: 0 },
    });
    const [r] = runCode(code, ctx);
    const resultsSection = r.list_sections.find(s => s.title === 'Results');
    assert.ok(resultsSection);
    // Should have 10 items + 1 "Show more" row
    assert.equal(resultsSection.rows.length, 11);
    assert.ok(resultsSection.rows[10].id.startsWith('browse_search_more__'));
  });

  it('cart context shown in browse home header', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
      ],
      context: { cart_item_count: 2, cart_total: 50 },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /Cart/i);
  });

  it('recent skus shown in home if provided', () => {
    const ctx = makeCtxWith({
      rows: [
        { sku: 'MILK-500', item_name: 'Amul Milk', price: 25, unit: 'pcs', stock: 50, category_tag: 'dairy' },
      ],
      context: { recent_skus_json: '["MILK-500"]' },
    });
    const [r] = runCode(code, ctx);
    const recentSection = r.list_sections.find(s => s.title === 'Recently added');
    assert.ok(recentSection, 'Expected recently added section');
  });
});
