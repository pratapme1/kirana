import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Build WA Payload', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Build WA Payload');
  });

  it('message_type=text → plain text WhatsApp message', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '911234567890',
      message_type: 'text',
      body_text: 'Hello, how can I help?',
      buttons: [],
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.type, 'text');
    assert.equal(r.to, '911234567890');
    assert.equal(r.text.body, 'Hello, how can I help?');
  });

  it('message_type=button with 2 buttons → interactive button type', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '911234567890',
      message_type: 'button',
      body_text: 'Choose an action',
      buttons: [
        { id: 'view_cart', title: 'View Cart' },
        { id: 'checkout', title: 'Checkout' },
      ],
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.type, 'interactive');
    assert.equal(r.interactive.type, 'button');
    assert.equal(r.interactive.body.text, 'Choose an action');
    assert.equal(r.interactive.action.buttons.length, 2);
    assert.equal(r.interactive.action.buttons[0].reply.id, 'view_cart');
  });

  it('message_type=button with 3 buttons → converts to list type', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '911234567890',
      message_type: 'button',
      body_text: 'Choose an action',
      buttons: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.type, 'interactive');
    assert.equal(r.interactive.type, 'list');
  });

  it('message_type=list with list_sections → interactive list', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '911234567890',
      message_type: 'list',
      body_text: 'Browse items',
      list_sections: JSON.stringify([{
        title: 'Categories',
        rows: [{ id: 'cat1', title: 'Dairy' }, { id: 'cat2', title: 'Grains' }],
      }]),
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.type, 'interactive');
    assert.equal(r.interactive.type, 'list');
    assert.equal(r.interactive.action.sections[0].title, 'Categories');
  });

  it('empty buttons and no message_type → falls through to text', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '911234567890',
      message_type: '',
      body_text: 'Fallback text',
      buttons: [],
    }});
    const [r] = runCode(code, ctx);
    assert.equal(r.type, 'text');
    assert.equal(r.text.body, 'Fallback text');
  });

  it('body_text over 1020 chars is truncated in button messages', () => {
    const longText = 'A'.repeat(1050);
    const ctx = makeCtx({ $json: {
      chat_id: '111',
      message_type: 'button',
      body_text: longText,
      buttons: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    }});
    const [r] = runCode(code, ctx);
    assert.ok(r.interactive.body.text.length <= 1020);
    assert.match(r.interactive.body.text, /\.\.\.$/);
  });

  it('button titles are sliced to 20 chars in interactive button', () => {
    const ctx = makeCtx({ $json: {
      chat_id: '111',
      message_type: 'button',
      body_text: 'Pick',
      buttons: [
        { id: 'x', title: 'This is a very long button title that exceeds limit' },
        { id: 'y', title: 'Short' },
      ],
    }});
    const [r] = runCode(code, ctx);
    assert.ok(r.interactive.action.buttons[0].reply.title.length <= 20);
  });
});

describe('Attach Buttons', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('IdnN367mtxGrQvh0');
    code = getCode(wf, 'Attach Buttons');
  });

  const makeAttachCtx = (overrides = {}) => makeCtx({
    $json: {
      chat_id_to_use: '911234567890',
      text_to_send: 'Test message',
      tool_name: '',
      message_type: '',
      buttons: [],
      list_sections: [],
      current_state_fresh: 'STATE_A',
      bypass_path: false,
      ...overrides,
    },
    nodeOutputs: {
      'Split In Batches': { __context: { noItemsLeft: true } },
    },
  });

  it('explicit 2 buttons → button message type', () => {
    const ctx = makeAttachCtx({
      buttons: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'button');
    assert.equal(r.buttons.length, 2);
  });

  it('explicit 3 buttons → list message type with sections', () => {
    const ctx = makeAttachCtx({
      buttons: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'list');
    assert.ok(r.list_sections.length > 0);
  });

  it('tool_name=add_items with cart total in body (regex format) → checkout buttons', () => {
    // The Attach Buttons regex for add_items cart total is strict: cart[:₹]₹NUMBER
    // e.g. "Cart:₹150" matches; "Cart total: ₹150" does NOT match
    // So we use "Cart:₹150" which is a format that does match the regex
    const ctx = makeAttachCtx({
      tool_name: 'add_items',
      text_to_send: 'Added to cart\n\nCart:₹150',
    });
    const [r] = runCode(code, ctx);
    // Should have checkout/view cart/add more buttons from the add_items branch
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('checkout') || ids.includes('view_cart'));
  });

  it('tool_name=add_items no cart total match → text type no buttons', () => {
    // When cart total regex doesn't match, add_items branch produces empty buttons
    // The code then returns final result with message_type='text' and no buttons
    const ctx = makeAttachCtx({
      tool_name: 'add_items',
      text_to_send: 'Added to cart\n\nCart total: ₹150',  // Format not matching regex
      current_state_fresh: 'STATE_A',
    });
    const [r] = runCode(code, ctx);
    // add_items with cartTotal=0 → buttons=[] → message_type='text'
    assert.equal(r.message_type, 'text');
    assert.equal(r.buttons.length, 0);
  });

  it('tool_name=view_cart with "cart is empty" text → isError path → text type', () => {
    // "cart is empty" triggers the isError check BEFORE the view_cart branch
    // so the result is text type with no buttons
    const ctx = makeAttachCtx({
      tool_name: 'view_cart',
      text_to_send: 'Your cart is empty.',
    });
    const [r] = runCode(code, ctx);
    // isError fires because text includes 'cart is empty'
    assert.equal(r.message_type, 'text');
    assert.equal(r.buttons.length, 0);
  });

  it('tool_name=view_cart with empty message not triggering isError → start_shopping buttons', () => {
    // Use text that triggers isEmpty check in view_cart but NOT the isError check
    // isError checks: 'cart is empty' → triggers isError
    // view_cart isEmpty checks: includes 'empty', 'nothing', 'no items'
    // We need text with 'empty' but NOT 'cart is empty'
    const ctx = makeAttachCtx({
      tool_name: 'view_cart',
      text_to_send: 'Nothing here yet. Add some items.',  // contains 'nothing' → isEmpty=true
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('start_shopping'));
  });

  it('tool_name=view_cart with items → checkout/add more buttons', () => {
    const ctx = makeAttachCtx({
      tool_name: 'view_cart',
      text_to_send: '🛒 Your cart\n\n• Milk × 2',
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('checkout'));
  });

  it('tool_name=confirm_order → track/shop again buttons', () => {
    const ctx = makeAttachCtx({
      tool_name: 'confirm_order',
      text_to_send: 'Order confirmed!',
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('track_order'));
    assert.ok(ids.includes('new_order'));
  });

  it('tool_name=cancel_order → shop/offers buttons', () => {
    const ctx = makeAttachCtx({
      tool_name: 'cancel_order',
      text_to_send: 'Cart cleared.',
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('start_shopping'));
  });

  it('error text → no buttons appended (text type)', () => {
    const ctx = makeAttachCtx({
      tool_name: '',
      text_to_send: 'Something went wrong. Please try again.',
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.message_type, 'text');
    assert.equal(r.buttons.length, 0);
  });

  it('tool_name=answer_user STATE_A → default home buttons', () => {
    const ctx = makeAttachCtx({
      tool_name: 'answer_user',
      text_to_send: 'Sure, here you go!',
      current_state_fresh: 'STATE_A',
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('get_promos') || ids.includes('start_shopping'));
  });

  it('tool_name=answer_user STATE_B → cart/checkout buttons', () => {
    const ctx = makeAttachCtx({
      tool_name: 'answer_user',
      text_to_send: 'Added!',
      current_state_fresh: 'STATE_B',
    });
    const [r] = runCode(code, ctx);
    const allButtons = r.buttons.length > 0 ? r.buttons : (r.list_sections?.[0]?.rows || []);
    const ids = allButtons.map(b => b.id);
    assert.ok(ids.includes('view_cart') || ids.includes('checkout'));
  });
});
