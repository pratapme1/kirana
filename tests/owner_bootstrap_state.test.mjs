import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/update_owner_catalog_workflows.js', import.meta.url), 'utf8');

function extractFunction(fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  assert.notEqual(start, -1, `missing function ${fnName}`);
  let index = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let templateDepth = 0;
  let lineComment = false;
  let blockComment = false;

  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (!quote && char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (quote === '`' && char === '$' && next === '{') {
        templateDepth += 1;
        depth += 1;
        index += 1;
        continue;
      }
      if (char === quote) {
        if (quote !== '`' || templateDepth === 0) quote = '';
        continue;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (templateDepth > 0) templateDepth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${fnName}`);
}

const context = {};
vm.runInNewContext(
  [
    extractFunction('onboardingBuildCode'),
    extractFunction('onboardingGetStateQuery'),
  ].join('\n'),
  context,
);

function runOnboardingBuild(routeCtx, latest = {}) {
  const code = context.onboardingBuildCode();
  const lookup = (name) => ({
    first() {
      if (name === 'Decide Onboarding Route') return { json: routeCtx };
      throw new Error(`unexpected lookup for ${name}`);
    },
  });
  const input = {
    first() {
      return { json: latest };
    },
  };
  return vm.runInNewContext(`(function(){ ${code} })()`, { $: lookup, $input: input })[0].json;
}

test('onboarding save_bootstrap uses bootstrap-only buttons for empty catalog', () => {
  const response = runOnboardingBuild({
    chat_id: '919148969183',
    route: 'save_bootstrap',
    bootstrap_choice: 'skip',
    inventory_count: 0,
    store_name: 'Urban Mart',
    upi_id: 'urban@upi',
    delivery_area: 'Bengaluru',
    operating_hours: '8am-10pm',
  });

  assert.equal(response.message_type, 'list');
  assert.match(response.body_text, /catalog is empty/i);
  assert.deepEqual(Array.from(response.list_sections[0].rows, (entry) => entry.id), ['owner_catalog_manual', 'owner_catalog_import']);
});

test('onboarding already_done uses bootstrap-only buttons for empty catalog', () => {
  const response = runOnboardingBuild({
    chat_id: '919148969183',
    route: 'already_done',
    inventory_count: 0,
    store_name: 'Urban Mart',
    upi_id: 'urban@upi',
    delivery_area: 'Bengaluru',
    operating_hours: '8am-10pm',
  });

  assert.equal(response.message_type, 'list');
  assert.match(response.body_text, /catalog is empty/i);
  assert.deepEqual(Array.from(response.list_sections[0].rows, (entry) => entry.id), ['owner_catalog_manual', 'owner_catalog_import']);
});

test('onboarding already_done uses full menu once inventory exists', () => {
  const response = runOnboardingBuild({
    chat_id: '919148969183',
    route: 'already_done',
    inventory_count: 3,
    store_name: 'Urban Mart',
    upi_id: 'urban@upi',
    delivery_area: 'Bengaluru',
    operating_hours: '8am-10pm',
  });

  assert.equal(response.message_type, 'list');
  assert.match(response.body_text, /what would you like to do next/i);
  assert.deepEqual(Array.from(response.list_sections[0].rows, (entry) => entry.id), ['owner_catalog_manual', 'owner_catalog_import', 'owner_catalog_update', 'owner_catalog_discount']);
});

test('onboarding state query exposes inventory_count', () => {
  const query = context.onboardingGetStateQuery();
  assert.match(query, /inventory_count/);
  assert.match(query, /SELECT COUNT\(\*\)::int FROM public\.inventory/);
  assert.match(query, /regexp_replace\(COALESCE\(owner_whatsapp_number, ''\), '\[\^0-9\]', '', 'g'\)/);
});
