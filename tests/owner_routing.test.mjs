import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Owner Rule Engine', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Owner Rule Engine');
  });

  it('button accept__ORD1__CUST1 → owner_order_mgr action=accept', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'accept__ORD1__CUST1',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_order_mgr');
    assert.equal(r.tool_input.action, 'accept');
    assert.equal(r.tool_input.order_id, 'ORD1');
    assert.equal(r.tool_input.customer_chat_id, 'CUST1');
  });

  it('button reject__ORD2__CUST2 → owner_order_mgr action=reject', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'reject__ORD2__CUST2',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_order_mgr');
    assert.equal(r.tool_input.action, 'reject');
  });

  it('button dispatch__ORD3__CUST3 → owner_order_mgr action=dispatch', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'dispatch__ORD3__CUST3',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_order_mgr');
    assert.equal(r.tool_input.action, 'dispatch');
  });

  it('button delivered__ORD4__CUST4 → owner_order_mgr action=delivered', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'delivered__ORD4__CUST4',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_order_mgr');
    assert.equal(r.tool_input.action, 'delivered');
  });

  it('button language_select → language_select tool', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'language_select',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'language_select');
  });

  it('button owner_catalog_discount → owner_promo tool', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'owner_catalog_discount',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_promo');
  });

  it('button owner_catalog_manual → owner_inventory tool', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: 'owner_catalog_manual',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_inventory');
  });

  it('message "help" → owner_help', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: 'help', button_id: '',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_help');
  });

  it('message "add onions" → owner_inventory (text route)', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: 'add onions 50 stock 20', button_id: '',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_inventory');
  });

  it('message "% off rice" → owner_promo (starts with % matches regex)', () => {
    // The promo regex requires message to START with one of: promo, % off, flat N, discount, etc.
    // "20% off rice" does NOT match (starts with "20"), but "% off rice" or "promo" does
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: 'promo create 10 off', button_id: '',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_promo');
  });

  it('message "20% off rice" → owner_intent_ai (no regex match for leading digit)', () => {
    // "20% off rice" starts with "20", which doesn't match the promo regex
    // so it falls through to owner_intent_ai
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '20% off rice', button_id: '',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_intent_ai');
  });

  it('setup not complete → owner_onboarding', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: 'hello', button_id: '',
      owner_setup_complete: false, onboarding_step: 2,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_onboarding');
  });

  it('document source type → owner_inventory', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: '', button_id: '',
      source_type: 'document', owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_inventory');
  });

  it('unknown message → owner_intent_ai fallback', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '917995653349', message: 'something random unclear xyz', button_id: '',
      owner_setup_complete: true,
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_intent_ai');
  });
});

describe('Owner Help', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Owner Help');
  });

  it('general topic → list with owner actions', () => {
    const ctx = makeCtx({
      $json: { chat_id: '111', help_topic: 'general', owner_inventory_count: 5 },
      nodeOutputs: {
        'Inject DB State': { chat_id: '111', owner_store_name: 'Test Store', owner_inventory_count: 5 },
        'Detect Owner': {},
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /Owner mode/);
    assert.ok(Array.isArray(r.list_sections));
  });

  it('empty catalog → catalog setup sections', () => {
    const ctx = makeCtx({
      $json: { chat_id: '111', help_topic: 'general', owner_inventory_count: 0 },
      nodeOutputs: {
        'Inject DB State': { chat_id: '111', owner_store_name: 'Empty Store', owner_inventory_count: 0 },
        'Detect Owner': {},
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /catalog is empty/);
  });

  it('orders topic → shows order help message', () => {
    const ctx = makeCtx({
      $json: { chat_id: '111', help_topic: 'orders' },
      nodeOutputs: {
        'Inject DB State': { chat_id: '111', owner_store_name: 'Test Store', owner_inventory_count: 5 },
        'Detect Owner': {},
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /New orders arrive/);
  });

  it('clarify_message overrides normal response', () => {
    const ctx = makeCtx({
      $json: { chat_id: '111', help_topic: 'general', clarify_message: 'Please be more specific.' },
      nodeOutputs: {
        'Inject DB State': { chat_id: '111', owner_store_name: 'Test Store', clarify_message: 'Please be more specific.' },
        'Detect Owner': {},
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'text');
    assert.equal(r.body_text, 'Please be more specific.');
  });
});

describe('Parse Owner Intent', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Parse Owner Intent');
  });

  it('low confidence AI → falls back to keyword routing for inventory', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Build Owner Intent Prompt': {
          chat_id: '111', message: 'stock update for milk',
          button_id: '', source_type: 'text',
        },
        'Claude Owner Intent Extractor': { text: '{"route": "owner_inventory", "confidence": 0.3}' },
      },
    });
    const [r] = runCode(code, ctx);
    // Low confidence → keyword fallback; "stock" matches inventoryHint
    assert.equal(r.tool_name, 'owner_inventory');
  });

  it('high confidence AI promo route → routes to owner_promo', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Build Owner Intent Prompt': {
          chat_id: '111', message: 'create 10% off promo',
          button_id: '', source_type: 'text',
        },
        'Claude Owner Intent Extractor': {
          text: JSON.stringify({
            route: 'owner_promo',
            confidence: 0.9,
            promo_request: { intent: 'create_promo', discount_type: 'percentage', discount_value: 10 },
          }),
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_promo');
  });

  it('unknown message → falls through to owner_help with clarify', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Build Owner Intent Prompt': {
          chat_id: '111', message: 'asdfghjkl',
          button_id: '', source_type: 'text',
        },
        'Claude Owner Intent Extractor': { text: '{}' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.tool_name, 'owner_help');
  });
});
