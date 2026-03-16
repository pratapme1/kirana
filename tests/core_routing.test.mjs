import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Customer Rule Engine', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Customer Rule Engine');
  });

  // ── Button ID routing ──

  it('button confirm_order → direct confirm_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '911234567890', message: '', button_id: 'confirm_order', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'confirm_order');
    assert.equal(r.tool_calls[0].tool_input.chat_id, '911234567890');
  });

  it('button cancel_order → direct cancel_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '911234567890', message: '', button_id: 'cancel_order', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'cancel_order');
  });

  it('button view_cart → direct view_cart', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'view_cart', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'view_cart');
  });

  it('button track_order → direct track_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'track_order', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'track_order');
  });

  it('button get_promos → direct get_promotions', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'get_promos', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'get_promotions');
  });

  it('button browse → browse_catalog with entry_point browse_home', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'browse', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'browse_catalog');
    assert.equal(r.tool_calls[0].tool_input.entry_point, 'browse_home');
  });

  it('button language_select → direct language_select', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'language_select', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'language_select');
  });

  it('button set_lang__hi → direct language_select with lang_code hi', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'set_lang__hi', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'language_select');
    assert.equal(r.tool_calls[0].tool_input.lang_code, 'hi');
  });

  it('button browse_category__dairy → browse_catalog with category_key dairy', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'browse_category__dairy', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'browse_catalog');
    assert.equal(r.tool_calls[0].tool_input.entry_point, 'browse_category');
    assert.equal(r.tool_calls[0].tool_input.category_key, 'dairy');
  });

  it('button set_qty__MILK-500__2 → add_items with sku_direct and qty 2', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'set_qty__MILK-500__2', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.sku_direct, 'MILK-500');
    assert.equal(r.tool_calls[0].tool_input.quantity, 2);
  });

  // ── Text shortcuts ──

  it('text "confirm" with STATE_C → confirm_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'confirm', button_id: '', user_language: 'en', db_state: '[DB_STATE: STATE_C] pending order' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'confirm_order');
  });

  it('text "ok" with STATE_A → no bypass (goes to AI)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'ok', button_id: '', user_language: 'en', db_state: '[DB_STATE: STATE_A] idle' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, false);
  });

  it('text "cancel" with STATE_B → cancel_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'cancel', button_id: '', user_language: 'en', db_state: '[DB_STATE: STATE_B] has cart' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'cancel_order');
  });

  it('text "no" with STATE_A → no bypass (goes to AI)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'no', button_id: '', user_language: 'en', db_state: '[DB_STATE: STATE_A] idle' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, false);
  });

  it('text "cart" → view_cart', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'cart', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'view_cart');
  });

  it('text "track" → track_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'track', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'track_order');
  });

  it('text "offers" → get_promotions', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'offers', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'get_promotions');
  });

  it('text "setup" from non-owner → no bypass (goes to AI, Is Owner? guards routing)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'setup', button_id: '', user_language: 'en', is_owner: false } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, false);
  });

  it('text "browse" → browse_catalog', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'browse', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'browse_catalog');
  });

  it('text "language" → language_select (priority 1)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'language', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'language_select');
  });

  // ── Product add patterns ──

  it('text "2 milk" → add_items with qty 2', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '2 milk', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.quantity, 2);
    assert.match(r.tool_calls[0].tool_input.product_name.toLowerCase(), /milk/);
  });

  it('text "add 3 eggs" → add_items with qty 3', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'add 3 eggs', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.quantity, 3);
  });

  it('text "milk qty 5" → add_items suffix_explicit with qty 5', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'milk qty 5', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.quantity, 5);
    assert.equal(r.tool_calls[0].tool_input.quantity_hint_position, 'suffix_explicit');
  });

  // ── Multi-item fan-out ──

  it('text "2 milk and 1 bread" → directMany with 2 tool_calls', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '2 milk and 1 bread', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls.length, 2);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[1].tool_name, 'add_items');
  });

  it('text "milk, bread, eggs" → directMany with 3 tool_calls', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'milk, bread, eggs', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls.length, 3);
  });

  // ── Browse context: awaiting_qty ──

  it('browse_context awaiting_qty__MILK-500 + "3" → add_items sku_direct', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '111', message: '3', button_id: '',
      browse_context: 'awaiting_qty__MILK-500', user_language: 'en',
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.sku_direct, 'MILK-500');
    assert.equal(r.tool_calls[0].tool_input.quantity, 3);
    assert.equal(r.tool_calls[0].tool_input.quantity_hint_position, 'browse_context');
  });

  it('browse_context awaiting_search + message → browse_catalog search', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '111', message: 'amul milk', button_id: '',
      browse_context: 'awaiting_search', user_language: 'en',
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'browse_catalog');
    assert.equal(r.tool_calls[0].tool_input.entry_point, 'browse_search');
    assert.equal(r.tool_calls[0].tool_input.user_query, 'amul milk');
  });

  it('browse_context awaiting_address + address → process_order', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '111', message: '12 MG Road, Indiranagar, Bengaluru',
      button_id: '', browse_context: 'awaiting_address', user_language: 'en',
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'process_order');
    assert.equal(r.tool_calls[0].tool_input.address, '12 MG Road, Indiranagar, Bengaluru');
  });

  // ── Falls through to AI ──

  it('text "hello" → bypass_llm false (AI)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'hello', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, false);
  });

  it('text "what time do you close?" → bypass_llm false (AI)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'what time do you close?', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, false);
  });

  // ── Remove pattern ──

  it('text "remove milk" → add_items with mode remove qty 0', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'remove milk', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.mode, 'remove');
    assert.equal(r.tool_calls[0].tool_input.quantity, 0);
  });

  // ── NLP auto language detection ──

  it('Hindi script with en language → auto_switch to hi', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '111', message: 'नमस्ते दूध चाहिए', button_id: '', user_language: 'en',
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'language_select');
    assert.equal(r.tool_calls[0].tool_input.auto_switch, 'hi');
  });

  // ── Rate feedback buttons ──

  it('button rate_good__ORD123 → order_feedback feedback_good', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'rate_good__ORD123', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'order_feedback');
    assert.equal(r.tool_calls[0].tool_input.action, 'feedback_good');
    assert.equal(r.tool_calls[0].tool_input.order_id, 'ORD123');
  });

  it('button rate_bad__ORD123 → order_feedback feedback_issue_start', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'rate_bad__ORD123', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'order_feedback');
    assert.equal(r.tool_calls[0].tool_input.action, 'feedback_issue_start');
  });

  // ── Address: state-gated via awaiting_address browse_context ──

  it('awaiting_address + any free text → process_order regardless of format', () => {
    const cases = [
      '42 Banjara Hills',          // no keyword, no comma
      'near dmart kondapur',        // no number
      'behind the temple',          // completely freeform
      'H No 5, Kukatpally, Hyderabad', // comma-separated (would have been multi-item)
      'kondapur',                   // single word
      'flat 3 green park 2nd floor bangalore 560001', // long address
    ];
    for (const msg of cases) {
      const ctx = makeCtx({ $json: { chat_id: '111', message: msg, button_id: '', user_language: 'en', browse_context: 'awaiting_address' } });
      const [r] = runCode(code, ctx);
      assert.equal(r.tool_calls[0].tool_name, 'process_order', `failed for: "${msg}"`);
      assert.equal(r.tool_calls[0].tool_input.address, msg, `address not passed for: "${msg}"`);
    }
  });

  it('awaiting_address + button press → button routing wins (user can escape)', () => {
    // cancel_order button should still cancel, not submit as address
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'cancel_order', user_language: 'en', browse_context: 'awaiting_address', db_state: '[DB_STATE: STATE_B]' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_calls[0].tool_name, 'cancel_order');
  });

  it('awaiting_address + view_cart button → view_cart (not process_order)', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'view_cart', user_language: 'en', browse_context: 'awaiting_address' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_calls[0].tool_name, 'view_cart');
  });

  it('no awaiting_address → random address text does NOT go to process_order', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '42 Banjara Hills', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.notEqual(r.tool_calls?.[0]?.tool_name, 'process_order');
  });

  // ── looksLikeCatalogLine fallback ──

  it('text "milk" (bare product name) → add_items with qty 1', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: 'milk', button_id: '', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.quantity, 1);
  });

  // ── Add_qty button ──
  it('button add_qty__RICE-1KG__2 → add_items sku_direct RICE-1KG qty 2', () => {
    const ctx = makeCtx({ $json: { chat_id: '111', message: '', button_id: 'add_qty__RICE-1KG__2', user_language: 'en' } });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_llm, true);
    assert.equal(r.tool_calls[0].tool_name, 'add_items');
    assert.equal(r.tool_calls[0].tool_input.sku_direct, 'RICE-1KG');
    assert.equal(r.tool_calls[0].tool_input.quantity, 2);
  });
});
