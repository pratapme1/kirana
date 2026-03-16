import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, getCode, makeCtx, runCode } from './helpers/wf.mjs';

describe('Build Confirm', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('RMAW7qsDBClxmRQy');
    code = getCode(wf, 'Build Confirm');
  });

  it('English lang_code → English confirmation message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', lang_code: 'en' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.equal(r.customer_ui_state, 'LANGUAGE_SET');
    assert.match(r.body_text, /English/);
    assert.equal(r.message_type, 'button');
    assert.ok(r.buttons.some(b => b.id === 'browse'));
    assert.ok(r.buttons.some(b => b.id === 'view_cart'));
  });

  it('Hindi lang_code → Hindi confirmation message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', lang_code: 'hi' },
      },
    });
    const [r] = runCode(code, ctx);
    // Hindi confirmation message should contain some Hindi text
    assert.match(r.body_text, /हिंदी/);
  });

  it('Telugu lang_code → Telugu confirmation message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', lang_code: 'te' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /తెలుగు/);
  });

  it('auto_switch hi → Hindi auto-switch message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', auto_switch: 'hi', lang_code: '' },
      },
    });
    const [r] = runCode(code, ctx);
    // Auto-switch message for Hindi
    assert.match(r.body_text, /हिंदी/);
    assert.ok(r.body_text.length > 10);
  });

  it('auto_switch te → Telugu auto-switch message', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', auto_switch: 'te', lang_code: '' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /తెలుగు/);
  });

  it('unknown lang_code → falls back to English', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111', lang_code: 'zz' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.match(r.body_text, /English/);
  });
});

describe('Build Lang Menu', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('RMAW7qsDBClxmRQy');
    code = getCode(wf, 'Build Lang Menu');
  });

  it('returns language selection list', () => {
    const ctx = makeCtx({
      $json: {},
      nodeOutputs: {
        'Start': { chat_id: '111' },
      },
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.chat_id, '111');
    assert.equal(r.message_type, 'list');
    assert.match(r.body_text, /Choose your language/i);
    // list_sections is JSON stringified
    const sections = JSON.parse(r.list_sections);
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length >= 2);
    const allRows = sections.flatMap(s => s.rows);
    assert.ok(allRows.some(row => row.id === 'set_lang__en'));
    assert.ok(allRows.some(row => row.id === 'set_lang__hi'));
    assert.ok(allRows.some(row => row.id === 'set_lang__te'));
    assert.ok(allRows.some(row => row.id === 'set_lang__ta'));
    assert.ok(allRows.some(row => row.id === 'set_lang__bn'));
  });
});

describe('Return', () => {
  let wf, code;

  before(() => {
    wf = loadWorkflow('RMAW7qsDBClxmRQy');
    code = getCode(wf, 'Return');
  });

  it('adds bypass_path: true to the payload', () => {
    const ctx = makeCtx({
      inputItems: [{
        chat_id: '111',
        message_type: 'button',
        body_text: 'Language set',
        buttons: [],
      }],
    });
    const [r] = runCode(code, ctx);
    assert.equal(r.bypass_path, true);
    assert.equal(r.chat_id, '111');
    assert.equal(r.message_type, 'button');
  });
});
