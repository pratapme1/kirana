import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/deploy_canonical_catalog_workflows.js', import.meta.url), 'utf8');

function extractFunction(fnName) {
  const start = source.indexOf(`function ${fnName}()`);
  assert.notEqual(start, -1, `missing function ${fnName}`);
  let index = source.indexOf('{', start);
  let depth = 0;
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${fnName}`);
}

const context = {};
vm.runInNewContext(
  `${extractFunction('promoPromptCode')}\n${extractFunction('promoParseCode')}`,
  context,
);

function runPromoParse({ message, inventoryNames = [] }) {
  const normalizeInput = {
    chat_id: '919148969183',
    message,
    button_id: '',
    source_type: 'text',
  };
  const store = {
    store_id: 32,
    store_name: 'Urban Mart',
    onboarding_step: 6,
    upi_id: 'urban@upi',
    delivery_area: 'Bengaluru',
    operating_hours: '8am-10pm',
  };
  const inventory = inventoryNames.map((item_name, index) => ({
    item_name,
    sku: `SKU${index + 1}`,
    category: 'General',
    is_active: true,
  }));
  const promos = [];
  const sessions = [];

  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Input') return { json: normalizeInput };
      if (name === 'Resolve Store Context') return { json: store };
      if (name === 'Claude Promo Extractor') return { json: { text: '{"intent":"","promo_type":"unknown","target_text":"","discount_value":null,"min_cart_value":null,"expiry_text":"","priority_text":"","promo_code":"","confidence":0.5}' } };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
    all() {
      if (name === 'Load Inventory Snapshot') return inventory.map((json) => ({ json }));
      if (name === 'Load Promo Snapshot') return promos.map((json) => ({ json }));
      if (name === 'Load Promo Session State') return sessions.map((json) => ({ json }));
      throw new Error(`unexpected all() lookup for ${name}`);
    },
  });

  return vm.runInNewContext(`(function(){ ${context.promoParseCode()} })()`, { $: dollar })[0].json;
}

test('invalid mixed promo phrasing stays in promo clarification instead of falling back to menu', () => {
  const result = runPromoParse({
    message: 'flat 50% off on all orders more than 200',
    inventoryNames: ['Onions 1kg'],
  });
  assert.equal(result.action, 'clarify');
  assert.match(result.clarify_message, /Try one of these formats/);
});
