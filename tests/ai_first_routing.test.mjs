import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/deploy_ai_first_routing.js', import.meta.url), 'utf8');

function extractFunction(fnName) {
  const explicitBoundaries = {
    customerRuleCode: 'function parseToolCallsCode(',
    parseToolCallsCode: 'function normalizeOutboundResponseCode(',
  };
  if (explicitBoundaries[fnName]) {
    const start = source.indexOf(`function ${fnName}(`);
    assert.notEqual(start, -1, `missing function ${fnName}`);
    const end = source.indexOf(explicitBoundaries[fnName], start);
    assert.notEqual(end, -1, `missing boundary for function ${fnName}`);
    return source.slice(start, end).trimEnd();
  }

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

const context = {
  Buffer,
  wrapCustomerRuntimeCode(runtimeSource) {
    const encodedRuntime = Buffer.from(String(runtimeSource || ''), 'utf8').toString('base64');
    return `
const runtimeSource = Buffer.from(${JSON.stringify(encodedRuntime)}, 'base64').toString('utf8');
const __runtimeBindings = {
  $: (typeof $ !== 'undefined') ? $ : undefined,
  $json: (typeof $json !== 'undefined') ? $json : undefined,
  $input: (typeof $input !== 'undefined') ? $input : undefined,
  Buffer,
};
const rawResult = (() => {
  const $ = __runtimeBindings.$;
  const $json = __runtimeBindings.$json;
  const $input = __runtimeBindings.$input;
  const Buffer = __runtimeBindings.Buffer;
  return eval('(function(){\\n' + runtimeSource + '\\n})()');
})();
const first = Array.isArray(rawResult) ? rawResult[0] : rawResult;
const normalized = first && typeof first === 'object' && Object.prototype.hasOwnProperty.call(first, 'json')
  ? first.json
  : first;

if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
  throw new Error('Wrapped customer code node must resolve to a json object');
}

return [{ json: normalized }];
`.trim();
  },
};
vm.runInNewContext(
  [
    extractFunction('customerRuleCode'),
    extractFunction('attachButtonsCode'),
    extractFunction('buildWaPayloadCode'),
    extractFunction('entryIfConditions'),
    extractFunction('v1OwnerRuleCode'),
    extractFunction('v1OwnerHelpCode'),
    extractFunction('detectOwnerQuery'),
    extractFunction('ownerIntentPromptCode'),
    extractFunction('ownerIntentParseCode'),
  ].join('\n'),
  context,
);

function runCustomerRule({ message = '', button_id = '', feedback_pending = false, feedback_order_id = '', feedback_issue_type = '', last_address = '' } = {}) {
  const code = context.customerRuleCode();
  const fn = new Function('$json', code);
  return fn({
    message,
    button_id,
    chat_id: '917995653349',
    feedback_pending,
    feedback_order_id,
    feedback_issue_type,
    last_address,
  })[0].json;
}

function runOwnerRule({ message = '', button_id = '', source_type = 'text' } = {}) {
  const code = context.v1OwnerRuleCode();
  const fn = new Function('$json', code);
  return fn({
    message,
    button_id,
    source_type,
    chat_id: '919148969183',
    owner_store_id: 1,
    owner_onboarding_step: 6,
    owner_setup_complete: true,
  })[0].json;
}

function runOwnerHelp({ help_topic = 'general', owner_inventory_count = 0 } = {}) {
  const code = context.v1OwnerHelpCode();
  const lookup = (name) => ({
    first() {
      if (name === 'Inject DB State') return { json: { chat_id: '919148969183', test_mode: true } };
      if (name === 'Detect Owner') return { json: { owner_store_name: 'Urban Mart', owner_inventory_count } };
      throw new Error(`unexpected lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${code} })()`, { $: lookup, $json: { help_topic } })[0].json;
}

function runOwnerIntentParse({ message = '', aiPayload = {} } = {}) {
  const promptInput = {
    chat_id: '919148969183',
    message,
    button_id: '',
    source_type: 'text',
    owner_store_id: 1,
  };
  const dollar = (name) => ({
    first() {
      if (name === 'Build Owner Intent Prompt') return { json: promptInput };
      if (name === 'Claude Owner Intent Extractor') return { json: { text: JSON.stringify(aiPayload) } };
      throw new Error(`unexpected lookup for ${name}`);
    },
  });
  return vm.runInNewContext(`(function(){ ${context.ownerIntentParseCode()} })()`, { $: dollar })[0].json;
}

test('customer router keeps guided-commerce shortcuts deterministic and leaves complex cases to AI', () => {
  assert.equal(runCustomerRule({ button_id: 'confirm_order' }).bypass_llm, true);
  assert.equal(runCustomerRule({ button_id: 'issue_quality__ORD-123' }).bypass_llm, true);
  assert.equal(runCustomerRule({ button_id: 'checkout', last_address: 'MG Road' }).bypass_llm, true);
  assert.equal(runCustomerRule({ button_id: 'get_promos' }).bypass_llm, true);
  assert.equal(runCustomerRule({ button_id: 'start_shopping' }).bypass_llm, true);

  assert.equal(runCustomerRule({ message: 'confirm' }).bypass_llm, true);
  assert.equal(runCustomerRule({ message: '12 MG Road, Indiranagar, Bengaluru 560038' }).bypass_llm, true);
  assert.equal(runCustomerRule({ message: '2kg onions and 2kg tomatoes' }).bypass_llm, true);
  assert.equal(
    runCustomerRule({
      message: 'milk packet was leaking',
      feedback_pending: true,
      feedback_order_id: 'ORD-123',
      feedback_issue_type: 'quality_issue',
    }).bypass_llm,
    true,
  );
});

test('customer router maps guided-commerce buttons to deterministic customer tools', () => {
  const checkout = runCustomerRule({ button_id: 'checkout', last_address: '45 MG Road' });
  assert.equal(checkout.tool_calls[0].tool_name, 'process_order');
  assert.equal(checkout.tool_calls[0].tool_input.address, '45 MG Road');

  const reuse = runCustomerRule({ button_id: 'use_last_address', last_address: '12 Park Street' });
  assert.equal(reuse.tool_calls[0].tool_name, 'process_order');
  assert.equal(reuse.tool_calls[0].tool_input.address, '12 Park Street');

  const addMore = runCustomerRule({ button_id: 'add_more' });
  assert.equal(addMore.tool_calls[0].tool_name, 'browse_catalog');
  assert.equal(addMore.tool_calls[0].tool_input.chat_id, '917995653349');
  assert.equal(addMore.tool_calls[0].tool_input.entry_point, 'add_more');

  const category = runCustomerRule({ button_id: 'browse_category__daily_essentials' });
  assert.equal(category.tool_calls[0].tool_name, 'browse_catalog');
  assert.equal(category.tool_calls[0].tool_input.category_key, 'daily_essentials');

  const item = runCustomerRule({ button_id: 'browse_item__MILK-500' });
  assert.equal(item.tool_calls[0].tool_name, 'browse_catalog');
  assert.equal(item.tool_calls[0].tool_input.focus_sku, 'MILK-500');

  const qty = runCustomerRule({ button_id: 'set_qty__MILK-500__3' });
  assert.equal(qty.tool_calls[0].tool_name, 'add_items');
  assert.equal(qty.tool_calls[0].tool_input.sku_direct, 'MILK-500');
  assert.equal(qty.tool_calls[0].tool_input.quantity, 3);
});

test('customer router sends browse-like text intents to browse catalog deterministically', () => {
  const browse = runCustomerRule({ message: 'browse' });
  assert.equal(browse.tool_calls[0].tool_name, 'browse_catalog');
  assert.equal(browse.tool_calls[0].tool_input.entry_point, 'browse');
});

test('customer router can deterministically split simple multi-item cart messages', () => {
  const result = runCustomerRule({ message: '2 milk and 1 bread' });
  assert.equal(result.bypass_llm, true);
  assert.equal(result.tool_calls.length, 2);
  assert.equal(result.tool_calls[0].tool_name, 'add_items');
  assert.equal(result.tool_calls[0].tool_input.product_name, 'milk');
  assert.equal(result.tool_calls[0].tool_input.quantity, 2);
  assert.equal(result.tool_calls[1].tool_input.product_name, 'bread');
  assert.equal(result.tool_calls[1].tool_input.quantity, 1);
});

test('owner router keeps buttons deterministic and sends free text to AI classifier', () => {
  const delivered = runOwnerRule({
    button_id: 'delivered__ORD-123__917995653349',
    source_type: 'button',
  });
  assert.equal(delivered.tool_name, 'owner_order_mgr');
  assert.equal(delivered.tool_input.order_id, 'ORD-123');
  assert.equal(delivered.tool_input.customer_chat_id, '917995653349');

  assert.equal(runOwnerRule({ message: 'setup' }).tool_name, 'owner_onboarding');
  assert.equal(runOwnerRule({ message: 'menu' }).tool_name, 'owner_help');
  assert.equal(runOwnerRule({ message: 'cancel' }).tool_name, 'owner_help');
  assert.equal(runOwnerRule({ source_type: 'image', message: '' }).tool_name, 'owner_inventory');
  assert.equal(runOwnerRule({ message: 'Onions 50% off' }).tool_name, 'owner_intent_ai');
  assert.equal(runOwnerRule({ message: 'make eggs stock 20' }).tool_name, 'owner_intent_ai');
});

test('owner help uses bootstrap menu for empty catalogs and full menu otherwise', () => {
  const bootstrap = runOwnerHelp({ owner_inventory_count: 0 });
  assert.equal(bootstrap.message_type, 'list');
  assert.match(bootstrap.body_text, /catalog is empty/i);
  assert.deepEqual(Array.from(bootstrap.list_sections[0].rows, (entry) => entry.id), ['owner_catalog_manual', 'owner_catalog_import']);

  const full = runOwnerHelp({ owner_inventory_count: 4 });
  assert.equal(full.message_type, 'list');
  assert.match(full.body_text, /choose a catalog action/i);
  assert.deepEqual(Array.from(full.list_sections[0].rows, (entry) => entry.id), ['owner_catalog_manual', 'owner_catalog_import', 'owner_catalog_update', 'owner_catalog_discount']);
});

test('owner AI parser routes promo and inventory safely', () => {
  const promo = runOwnerIntentParse({
    message: 'Onions 50% off',
    aiPayload: {
      route: 'owner_promo',
      normalized_message: 'Onions 50% off',
      help_topic: '',
      confidence: 0.96,
      clarify_message: '',
      promo_request: {
        intent: 'create_promo',
        discount_type: 'percentage',
        discount_value: 50,
        min_cart_value: null,
        target_text: 'Onions',
        scope_hint: 'single',
        promo_code: '',
        clarification_reason: '',
      },
    },
  });
  assert.equal(promo.tool_name, 'owner_promo');
  assert.equal(promo.tool_input.message, 'Onions 50% off');
  assert.equal(promo.tool_input.owner_ai_payload.promo_request.discount_value, 50);
  assert.equal(promo.tool_input.owner_ai_payload.promo_request.target_text, 'Onions');

  const inventory = runOwnerIntentParse({
    message: 'please make eggs stock 20',
    aiPayload: {
      route: 'owner_inventory',
      normalized_message: 'eggs stock 20',
      help_topic: '',
      confidence: 0.9,
      clarify_message: '',
      inventory_request: {
        intent: 'create_or_update',
        scope_hint: 'single',
        search_term: '',
        clarification_reason: '',
        items: [
          {
            item_text: 'eggs',
            price: null,
            stock: 20,
            unit: '',
            category: '',
            brand: '',
            action_hint: 'update',
          },
        ],
      },
    },
  });
  assert.equal(inventory.tool_name, 'owner_inventory');
  assert.equal(inventory.tool_input.message, 'eggs stock 20');
  assert.equal(inventory.tool_input.owner_ai_payload.inventory_request.items[0].item_text, 'eggs');
  assert.equal(inventory.tool_input.owner_ai_payload.inventory_request.items[0].stock, 20);

  const unclear = runOwnerIntentParse({
    message: 'do the thing',
    aiPayload: {
      route: 'owner_help',
      normalized_message: '',
      help_topic: 'general',
      confidence: 0.31,
      clarify_message: 'I was not fully sure what you wanted.',
    },
  });
  assert.equal(unclear.tool_name, 'owner_help');
  assert.match(unclear.clarify_message, /not fully sure/i);
});

test('customer AI system prompt includes feedback tool and state guidance', () => {
  assert.match(source, /FEEDBACK_PENDING: \{\{ \$json\.feedback_pending/);
  assert.match(source, /order_feedback:/);
  assert.match(source, /R17\. If FEEDBACK_PENDING is true/);
});

test('owner router prompt is memory-aware and keeps session state authoritative', () => {
  assert.match(source, /Recent owner chat memory is available as supplemental context/);
  assert.match(source, /ACTIVE_SESSION_TYPE and ACTIVE_SESSION_STAGE are authoritative/);
  assert.match(source, /inventory_request must be an object/);
  assert.match(source, /promo_request must be an object/);
  assert.match(source, /name: 'Owner Postgres Chat Memory'/);
  assert.match(source, /tableName: 'owner_router_chat_memory'/);
});

test('owner detect query exposes inventory count for bootstrap routing', () => {
  const query = context.detectOwnerQuery();
  assert.match(query, /owner_inventory_count/);
  assert.match(query, /LEFT JOIN LATERAL \(\s*SELECT COUNT\(\*\)::int AS inventory_count/s);
});

test('entry gate allows document and image messages to reach routing', () => {
  const conditions = context.entryIfConditions();
  assert.equal(conditions.combinator, 'or');
  const leftValues = conditions.conditions.map((condition) => condition.leftValue);
  assert.ok(leftValues.some((value) => value.includes('.document') && value.includes('.id')));
  assert.ok(leftValues.some((value) => value.includes('.image') && value.includes('.id')));
});

test('media ingress audit query records document metadata', () => {
  assert.match(source, /INSERT INTO public\.owner_media_ingress_audit/);
  assert.match(source, /media_mime_type/);
  assert.match(source, /media_filename/);
  assert.match(source, /IN \('document', 'image'\)/);
});

test('attach buttons converts more than two customer actions into a list menu', () => {
  const code = context.attachButtonsCode();
  const fn = new Function('$json', '$', code);
  const result = fn({
    tool_name: 'view_cart',
    text_to_send: 'Cart summary',
    chat_id_to_use: '917995653349',
    message_type: 'button',
    buttons: [
      { id: 'checkout', title: 'Checkout' },
      { id: 'add_more', title: 'Add more items' },
      { id: 'cancel_order', title: 'Clear cart' },
    ],
  }, () => ({ context: { noItemsLeft: true } }))[0].json;

  assert.equal(result.message_type, 'list');
  assert.equal(result.list_sections[0].rows.length, 3);
});

test('wa payload builder uses menu list when more than two actions are present', () => {
  const code = context.buildWaPayloadCode();
  const fn = new Function('$json', code);
  const result = fn({
    chat_id: '917995653349',
    message_type: 'button',
    body_text: 'Choose',
    buttons: [
      { id: 'checkout', title: 'Checkout' },
      { id: 'view_cart', title: 'View Cart' },
      { id: 'add_more', title: 'Add More' },
    ],
  })[0].json;

  assert.equal(result.type, 'interactive');
  assert.equal(result.interactive.type, 'list');
  assert.equal(result.interactive.action.button, 'Menu');
});
