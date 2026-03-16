import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Normalize Feedback Input', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Normalize Feedback Input');
  });

  it('extracts fields from tool_input', () => {
    const ctx = makeCtx({
      inputItems: [{
        tool_input: {
          action: 'feedback_good',
          order_id: 'ORD123',
          chat_id: '111',
        },
      }],
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.action, 'feedback_good');
    assert.equal(r.order_id, 'ORD123');
    assert.equal(r.chat_id, '111');
  });

  it('extracts fields from top level if no tool_input', () => {
    const ctx = makeCtx({
      inputItems: [{
        action: 'feedback_issue_start',
        order_id: 'ORD456',
        chat_id: '222',
        issue_type: 'quality_issue',
      }],
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.action, 'feedback_issue_start');
    assert.equal(r.order_id, 'ORD456');
    assert.equal(r.issue_type, 'quality_issue');
  });
});

describe('Good: Build Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Good: Build Response');
  });

  it('returns positive feedback response with shop again buttons', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /Thanks/i);
    assert.match(r.body_text, /well/i);
    assert.equal(r.message_type, 'button');
    assert.ok(r.buttons.some(b => b.id === 'new_order'));
  });
});

describe('Issue Start: Build Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Issue Start: Build Response');
  });

  it('shows issue type picker', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /ORD123/);
    assert.match(r.body_text, /What went wrong/i);
    assert.equal(r.message_type, 'list');
    const section = r.list_sections[0];
    assert.ok(section.rows.some(row => row.id.startsWith('issue_wrong_items__ORD123')));
    assert.ok(section.rows.some(row => row.id.startsWith('issue_quality__ORD123')));
    assert.ok(section.rows.some(row => row.id.startsWith('issue_late__ORD123')));
  });
});

describe('Issue Type: Build Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Issue Type: Build Response');
  });

  it('wrong_items → human readable label in message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123', issue_type: 'wrong_items' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.customer_ui_state, 'FEEDBACK_DETAIL_PENDING');
    assert.match(r.body_text, /wrong items/i);
  });

  it('quality_issue → quality label', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123', issue_type: 'quality_issue' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /quality issue/i);
  });

  it('late_delivery → late delivery label', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123', issue_type: 'late_delivery' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /late delivery/i);
  });

  it('unknown issue_type → generic "an issue" fallback', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123', issue_type: 'something_else' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /an issue/i);
  });
});

describe('Issue Text: Build Response', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Issue Text: Build Response');
  });

  it('returns feedback submitted message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': { chat_id: '111', order_id: 'ORD123', message: 'Items were wrong' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.match(r.body_text, /Feedback submitted/i);
    assert.match(r.body_text, /store has been notified/i);
    assert.equal(r.customer_ui_state, 'TRACKING');
  });
});

describe('Issue Text: Build Owner Alert', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('w5D4XMey0WjTcJtp');
    code = getCode(wf, 'Issue Text: Build Owner Alert');
  });

  it('builds owner alert with issue details', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Normalize Feedback Input': {
          chat_id: '111',
          order_id: 'ORD123',
          message: 'Got stale bread',
          issue_type: 'quality_issue',
        },
        'Issue Text: Get Order Context': {
          owner_whatsapp_number: '917995653349',
          issue_type: 'quality_issue',
          store_name: 'Test Kirana',
        },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '917995653349');
    assert.match(r.body_text, /Quality issue/);
    assert.match(r.body_text, /ORD123/);
    assert.match(r.body_text, /Got stale bread/);
    assert.equal(r.message_type, 'text');
  });
});
