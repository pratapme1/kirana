import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

// ── Owner Order Manager ────────────────────────────────────────────────────

describe('Owner Order Manager — Build Notify Alert', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('g6rGUma60FIEypEb');
    code = getCode(wf, 'Build Notify Alert');
  });

  it('builds new order alert with accept/reject buttons', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': {
          chat_id: '917995653349',
          owner_whatsapp_number: '917995653349',
          order_id: 'ORD123',
          customer_chat_id: '911234567890',
          shipping_address: '12 MG Road',
          final_order_total: '150.00',
          user_language: 'en',
          order_details: {
            items_in_final_order: [
              { original_name: 'Milk', quantity: 2, line_total: 50 },
            ],
          },
        },
        'Get Pricing Flag': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '917995653349');
    assert.equal(r.message_type, 'button');
    assert.match(r.body_text, /New Order/i);
    assert.match(r.body_text, /ORD123/);
    assert.ok(r.buttons.some(b => b.id.startsWith('accept__ORD123')));
    assert.ok(r.buttons.some(b => b.id.startsWith('reject__ORD123')));
  });

  it('customer_chat_id embedded in button IDs', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': {
          chat_id: '917995653349',
          owner_whatsapp_number: '917995653349',
          order_id: 'ORD456',
          customer_chat_id: '919876543210',
          shipping_address: 'Test Address',
          final_order_total: '200.00',
          user_language: 'en',
          order_details: { items_in_final_order: [] },
        },
        'Get Pricing Flag': { enable_pricing: true },
      },
    });
    const [r] = runCode(code, ctx);
    const acceptBtn = r.buttons.find(b => b.id.startsWith('accept__'));
    assert.ok(acceptBtn.id.includes('919876543210'));
  });
});

describe('Owner Order Manager — Accept: Notify Customer', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('g6rGUma60FIEypEb');
    code = getCode(wf, 'Accept: Notify Customer');
  });

  it('sends accepted message to customer chat_id', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': {
          order_id: 'ORD123',
          customer_chat_id: '911234567890',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '911234567890');
    assert.match(r.body_text, /accepted/i);
    assert.match(r.body_text, /ORD123/);
  });
});

describe('Owner Order Manager — Accept: Build Dispatch Button', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('g6rGUma60FIEypEb');
    code = getCode(wf, 'Accept: Build Dispatch Button');
  });

  it('builds dispatch button for owner', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': {
          chat_id: '917995653349',
          owner_whatsapp_number: '917995653349',
          order_id: 'ORD123',
          customer_chat_id: '911234567890',
          user_language: 'en',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'button');
    assert.match(r.body_text, /accepted/i);
    const dispatchBtn = r.buttons.find(b => b.id.startsWith('dispatch__ORD123'));
    assert.ok(dispatchBtn, 'Expected dispatch button');
  });
});

// ── Owner Inventory Manager ────────────────────────────────────────────────

describe('Owner Inventory Manager — Normalize Input', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yfCi0KEpBibSXI3M');
    code = getCode(wf, 'Normalize Input');
  });

  it('extracts fields from tool_input', () => {
    const ctx = makeCtx({
      $json: {
        tool_input: {
          chat_id: '111',
          message: 'add milk 40 stock 20',
          button_id: '',
          source_type: 'text',
          user_language: 'en',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.equal(r.message, 'add milk 40 stock 20');
    assert.equal(r.source_type, 'text');
    assert.equal(r.user_language, 'en');
  });

  it('button_id detected → source_type set to button', () => {
    const ctx = makeCtx({
      $json: {
        tool_input: {
          chat_id: '111',
          message: '',
          button_id: 'owner_catalog_manual',
          user_language: 'en',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.source_type, 'button');
    assert.equal(r.button_id, 'owner_catalog_manual');
  });

  it('media_caption used as message when message is empty', () => {
    const ctx = makeCtx({
      $json: {
        tool_input: {
          chat_id: '111',
          message: '',
          media_caption: 'catalog update',
          source_type: 'document',
          user_language: 'en',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message, 'catalog update');
  });
});

describe('Owner Inventory Manager — Format Direct Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('yfCi0KEpBibSXI3M');
    code = getCode(wf, 'Format Direct Response');
  });

  const makeInvCtx = (action) => makeCtx({
    $json: {},
    nodeOutputs: {
      'Parse Inventory Request': {
        chat_id: '111',
        action,
        test_mode: false,
        user_language: 'en',
      },
    },
  });

  it('action=prompt_manual → text message with item format examples', () => {
    const [r] = runCode(code, makeInvCtx('prompt_manual'));
    assert.equal(r.message_type, 'text');
    assert.match(r.body_text, /one per line/i);
  });

  it('action=prompt_update → text message with update examples', () => {
    const [r] = runCode(code, makeInvCtx('prompt_update'));
    assert.equal(r.message_type, 'text');
    assert.match(r.body_text, /stock\s/i);
  });

  it('action=prompt_import → list message with import options', () => {
    const [r] = runCode(code, makeInvCtx('prompt_import'));
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /XLS|CSV|Google/i);
  });

  it('action=clarify → text with clarify_message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Parse Inventory Request': {
          chat_id: '111',
          action: 'clarify',
          clarify_message: 'Please be more specific.',
          test_mode: false,
          user_language: 'en',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'text');
    assert.equal(r.body_text, 'Please be more specific.');
  });

  it('unknown action → list with owner menu sections', () => {
    const [r] = runCode(code, makeInvCtx('unknown_action'));
    assert.equal(r.message_type, 'list');
    assert.ok(Array.isArray(r.list_sections));
  });
});

// ── Owner Promo Manager ────────────────────────────────────────────────────

describe('Owner Promo Manager — Normalize Input', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('oiggfS3oMsdKNRRn');
    code = getCode(wf, 'Normalize Input');
  });

  it('extracts message and button_id from tool_input', () => {
    const ctx = makeCtx({
      $json: {
        tool_input: {
          chat_id: '111',
          message: '20% off rice',
          button_id: '',
          source_type: 'text',
          user_language: 'hi',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.equal(r.message, '20% off rice');
    assert.equal(r.user_language, 'hi');
  });
});
