import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = fs.readFileSync(new URL('../scripts/update_owner_catalog_workflows.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const context = { Buffer, require };
vm.runInNewContext(source.replace(/^#!.*\n/, '').replace(/\nasync function main\(\)[\s\S]*$/, '\n'), context);

function runOwnerRule({ message = '', button_id = '', source_type = 'text', customer_chat_id = '' } = {}) {
  const code = context.v1OwnerRuleCode();
  const fn = new Function('$json', code);
  return fn({
    message,
    button_id,
    source_type,
    chat_id: '919148969183',
    customer_chat_id,
    owner_store_id: 1,
    owner_onboarding_step: 6,
    owner_setup_complete: true,
  })[0].json;
}

function runPromoParse({ message = '', inventoryNames = [], owner_ai_payload = null, promoRows = [] } = {}) {
  const normalizeInput = {
    chat_id: '919148969183',
    message,
    button_id: '',
    source_type: 'text',
    owner_ai_payload,
  };
  const store = {
    store_id: 1,
    store_name: 'Urban Mart',
    onboarding_step: 6,
    upi_id: 'Nae@upi',
    delivery_area: 'Bengaluru Central,560064',
    operating_hours: '8am-10pm',
  };
  const inventory = inventoryNames.map((item_name, index) => ({
    item_name,
    sku: `SKU${index + 1}`,
    category: 'General',
    is_active: true,
  }));
  const promos = promoRows;
  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Input') return { json: normalizeInput };
      if (name === 'Resolve Store Context') return { json: store };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
    all() {
      if (name === 'Load Inventory Snapshot') return inventory.map((json) => ({ json }));
      if (name === 'Load Promo Snapshot') return promos.map((json) => ({ json }));
      throw new Error(`unexpected all() lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.promoParseCode()} })()`, { $: dollar, Buffer })[0].json;
}

test('owner router keeps typo-ish percentage discounts in promo flow', () => {
  assert.equal(runOwnerRule({ message: '50% of an onions' }).tool_name, 'owner_promo');
  assert.equal(runOwnerRule({ message: '50% off on eggs' }).tool_name, 'owner_promo');
  assert.equal(runOwnerRule({ message: 'Onions 50% off' }).tool_name, 'owner_promo');
  assert.equal(runOwnerRule({ message: 'cancel' }).tool_name, 'owner_help');
});

test('owner router parses order action buttons without corrupting order_id or customer chat', () => {
  const result = runOwnerRule({
    message: 'Mark Delivered',
    button_id: 'delivered__ORD-123__917995653349__undefined__undefined',
    source_type: 'button',
  });
  assert.equal(result.tool_name, 'owner_order_mgr');
  assert.equal(result.tool_input.action, 'delivered');
  assert.equal(result.tool_input.order_id, 'ORD-123');
  assert.equal(result.tool_input.customer_chat_id, '917995653349');
});

function runCustomerRule(message) {
  const code = context.customerRuleCode();
  const fn = new Function('$json', code);
  return fn({
    message,
    button_id: '',
    chat_id: '919148969183',
  })[0].json;
}

function runCustomerRuleWithState({ message = '', button_id = '', feedback_pending = false, feedback_order_id = '', feedback_issue_type = '' } = {}) {
  const code = context.customerRuleCode();
  const fn = new Function('$json', code);
  return fn({
    message,
    button_id,
    chat_id: '917995653349',
    feedback_pending,
    feedback_order_id,
    feedback_issue_type,
  })[0].json;
}

test('customer router keeps suffix count phrases intact for catalog resolution', () => {
  const result = runCustomerRule('eggs 10');
  assert.equal(result.bypass_llm, true);
  assert.equal(result.tool_calls[0].tool_name, 'add_items');
  assert.equal(result.tool_calls[0].tool_input.product_name, 'eggs 10');
  assert.equal(result.tool_calls[0].tool_input.quantity, 1);
  assert.equal(result.tool_calls[0].tool_input.quantity_hint, null);
});

test('customer router sends multi-item and weight-style phrases to AI instead of single-item bypass', () => {
  assert.equal(runCustomerRule('2kgs onions and 2kg tomatoes').bypass_llm, false);
  assert.equal(runCustomerRule('2kg onions').bypass_llm, false);
});

test('customer router sends delivery feedback buttons into order feedback flow', () => {
  const good = runCustomerRuleWithState({ button_id: 'rate_good__ORD-123' });
  assert.equal(good.tool_calls[0].tool_name, 'order_feedback');
  assert.equal(good.tool_calls[0].tool_input.action, 'feedback_good');
  assert.equal(good.tool_calls[0].tool_input.order_id, 'ORD-123');

  const issue = runCustomerRuleWithState({ button_id: 'issue_quality__ORD-123' });
  assert.equal(issue.tool_calls[0].tool_name, 'order_feedback');
  assert.equal(issue.tool_calls[0].tool_input.action, 'feedback_issue_type');
  assert.equal(issue.tool_calls[0].tool_input.issue_type, 'quality_issue');
});

test('customer router keeps complaint text in feedback flow while issue details are pending', () => {
  const result = runCustomerRuleWithState({
    message: 'milk packet was leaking',
    feedback_pending: true,
    feedback_order_id: 'ORD-123',
    feedback_issue_type: 'quality_issue',
  });
  assert.equal(result.tool_calls[0].tool_name, 'order_feedback');
  assert.equal(result.tool_calls[0].tool_input.action, 'feedback_issue_text');
  assert.equal(result.tool_calls[0].tool_input.order_id, 'ORD-123');
  assert.equal(result.tool_calls[0].tool_input.issue_type, 'quality_issue');
});

test('promo parser strips helper words from the target item', () => {
  const eggs = runPromoParse({ message: '50% off on eggs', inventoryNames: ['eggs', 'onions'] });
  assert.equal(eggs.action, 'preview_promo');
  assert.equal(eggs.preview_rows[0].target_label, 'Eggs');
  assert.equal(eggs.preview_rows[0].promo_code, 'EGGS50');

  const onions = runPromoParse({ message: '50% of an onions', inventoryNames: ['eggs', 'onions'] });
  assert.equal(onions.action, 'preview_promo');
  assert.equal(onions.preview_rows[0].target_label, 'Onions');
  assert.equal(onions.preview_rows[0].promo_code, 'ONIONS50');
});

test('promo parser uses owner AI extraction to resolve a single strong catalog match', () => {
  const result = runPromoParse({
    message: '10% off on Sonamasuri',
    inventoryNames: ['Rice Sonamasuri 5kg', 'Toor Dal 1kg'],
    owner_ai_payload: {
      confidence: 0.94,
      promo_request: {
        intent: 'create_promo',
        discount_type: 'percentage',
        discount_value: 10,
        min_cart_value: null,
        target_text: 'Sonamasuri',
        scope_hint: 'single',
        promo_code: '',
        clarification_reason: '',
      },
    },
  });

  assert.equal(result.action, 'preview_promo');
  assert.equal(result.preview_rows.length, 1);
  assert.equal(result.preview_rows[0].target_label, 'Rice Sonamasuri 5kg');
  assert.equal(result.preview_rows[0].promo_group_code, result.preview_rows[0].promo_code);
});

test('promo parser creates grouped previews for family-wide owner AI targets', () => {
  const result = runPromoParse({
    message: 'amul 10% discount',
    inventoryNames: ['Amul Milk 500ml', 'Amul Milk 1l'],
    owner_ai_payload: {
      confidence: 0.91,
      promo_request: {
        intent: 'create_promo',
        discount_type: 'percentage',
        discount_value: 10,
        min_cart_value: null,
        target_text: 'amul',
        scope_hint: 'family',
        promo_code: '',
        clarification_reason: '',
      },
    },
  });

  assert.equal(result.action, 'preview_promo');
  assert.equal(result.preview_rows.length, 2);
  assert.deepEqual(Array.from(new Set(result.preview_rows.map((row) => row.promo_group_code))), [result.preview_rows[0].promo_group_code]);
  assert.equal(result.preview_rows[0].target_count, 2);
  assert.notEqual(result.preview_rows[0].promo_code, result.preview_rows[1].promo_code);
  assert.match(result.preview_rows[0].group_label, /Amul Milk/i);
});
