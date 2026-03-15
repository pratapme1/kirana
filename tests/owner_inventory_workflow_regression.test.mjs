import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = fs.readFileSync(new URL('../scripts/update_owner_catalog_workflows.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const context = { Buffer, require };
vm.runInNewContext(source.replace(/^#!.*\n/, '').replace(/\nasync function main\(\)[\s\S]*$/, '\n'), context);

function runInventoryParse({ message = '', button_id = '', source_type = 'text', inventoryNames = [], sessionRows = [], owner_ai_payload = null } = {}) {
  const normalizeInput = {
    chat_id: '919148969183',
    message,
    button_id,
    source_type,
    media_id: '',
    media_mime_type: '',
    media_filename: '',
    owner_ai_payload,
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

  const dollar = (name) => ({
    first() {
      if (name === 'Normalize Input') return { json: normalizeInput };
      if (name === 'Resolve Store Context') return { json: store };
      throw new Error(`unexpected first() lookup for ${name}`);
    },
    all() {
      if (name === 'Load Inventory Snapshot') return inventory.map((json) => ({ json }));
      if (name === 'Load Inventory Session State') return sessionRows.map((json) => ({ json }));
      throw new Error(`unexpected all() lookup for ${name}`);
    },
  });

  return vm.runInNewContext(`(function(){ ${context.inventoryParseCode()} })()`, { $: dollar, Buffer })[0].json;
}

function runOnboardingBuild(routeCtx, latest = {}) {
  const dollarInput = {
    first() {
      return { json: latest };
    },
  };
  return vm.runInNewContext(
    `(function(){ ${context.onboardingBuildCode()} })()`,
    {
      Buffer,
      $: (name) => {
        if (name === 'Decide Onboarding Route') {
          return { first() { return { json: routeCtx }; } };
        }
        throw new Error(`unexpected lookup for ${name}`);
      },
      $input: dollarInput,
    },
  )[0].json;
}

test('inventory parser blocks typo-ish updates instead of direct-saving them', () => {
  const result = runInventoryParse({
    message: 'nions price 2',
    inventoryNames: ['Onions'],
  });
  assert.equal(result.action, 'preview_manual');
  assert.equal(result.cleanup_summary.has_blockers, true);
  assert.notEqual(result.preview_rows[0].action, 'update_existing');
});

test('inventory parser turns Google Sheets links into staged bulk intake actions', () => {
  const result = runInventoryParse({
    message: 'https://docs.google.com/spreadsheets/d/abc123DEF456/edit#gid=789',
  });

  assert.equal(result.action, 'bulk_intake');
  assert.equal(result.bulk_mode, 'google_sheet');
  assert.equal(result.spreadsheet_id, 'abc123DEF456');
  assert.equal(result.gid, '789');
  assert.equal(result.export_url, 'https://docs.google.com/spreadsheets/d/abc123DEF456/export?format=csv&gid=789');
});

test('inventory parser treats typed manual-entry command as prompt_manual', () => {
  const result = runInventoryParse({
    message: 'Add items manually',
  });

  assert.equal(result.action, 'prompt_manual');
});

test('inventory parser treats typed update command as start_update_session', () => {
  const result = runInventoryParse({
    message: 'Update stock/price',
  });

  assert.equal(result.action, 'start_update_session');
});

test('inventory parser uses owner AI extraction for messy manual update phrases', () => {
  const result = runInventoryParse({
    message: 'Garlic pric 10 stock 100 kg',
    inventoryNames: ['Garlic'],
    owner_ai_payload: {
      confidence: 0.93,
      inventory_request: {
        intent: 'create_or_update',
        scope_hint: 'single',
        search_term: '',
        clarification_reason: '',
        items: [
          {
            item_text: 'garlic',
            price: 10,
            stock: 100,
            unit: 'kg',
            category: '',
            brand: '',
            action_hint: 'update',
          },
        ],
      },
    },
  });

  assert.equal(result.action, 'direct_single_update');
  assert.equal(result.existing_item_name, 'Garlic');
  assert.equal(result.price, 10);
  assert.equal(result.stock, 100);
  assert.equal(result.item_name, 'Garlic');
});

test('inventory parser avoids malformed fallback names when AI resolves typo-ish item text', () => {
  const result = runInventoryParse({
    message: 'Garic price 19 and stock 100 kg',
    inventoryNames: ['Garlic'],
    owner_ai_payload: {
      confidence: 0.9,
      inventory_request: {
        intent: 'create_or_update',
        scope_hint: 'single',
        search_term: '',
        clarification_reason: '',
        items: [
          {
            item_text: 'garlic',
            price: 19,
            stock: 100,
            unit: 'kg',
            category: '',
            brand: '',
            action_hint: 'update',
          },
        ],
      },
    },
  });

  assert.equal(result.action, 'direct_single_update');
  assert.equal(result.existing_item_name, 'Garlic');
  assert.equal(result.item_name, 'Garlic');
  assert.equal(result.price, 19);
  assert.equal(result.stock, 100);
});

test('inventory parser routes bulk review confirmations from active session text replies', () => {
  const result = runInventoryParse({
    message: 'apply',
    sessionRows: [
      {
        session_id: 'bulk_job_123',
        operation_type: 'bulk_import_review',
        status: 'awaiting_review',
      },
    ],
  });

  assert.equal(result.action, 'bulk_apply');
  assert.equal(result.job_id, 'job_123');
});

test('inventory parser keeps awaiting upload session scoped until file or sheet link arrives', () => {
  const result = runInventoryParse({
    message: 'here is the stock list',
    sessionRows: [
      {
        session_id: 'invimport_123',
        operation_type: 'bulk_import_awaiting_upload',
        status: 'awaiting_upload',
      },
    ],
  });

  assert.equal(result.action, 'clarify');
  assert.match(result.clarify_message, /stock-sheet upload is waiting/i);
});

test('inventory parser allows preview confirmation from active pending preview sessions', () => {
  const result = runInventoryParse({
    message: 'confirm',
    sessionRows: [
      {
        session_id: 'inv_123',
        operation_type: 'inventory_preview',
        status: 'pending_preview',
      },
    ],
  });

  assert.equal(result.action, 'confirm_session');
  assert.equal(result.session_id, 'inv_123');
});

test('inventory parser prefers exact variant matches over generic base items', () => {
  const result = runInventoryParse({
    message: 'onions 1kg stock 700',
    inventoryNames: ['Onions', 'Onions 1kg'],
  });
  assert.equal(result.action, 'direct_single_update');
  assert.equal(result.existing_item_name, 'Onions 1kg');
});

test('inventory parser treats exact existing items as updates, not duplicate creates', () => {
  const result = runInventoryParse({
    message: 'honey price 45 stock 230',
    inventoryNames: ['Honey'],
  });
  assert.equal(result.action, 'direct_single_update');
  assert.equal(result.existing_item_name, 'Honey');
});

test('inventory clarify text deduplicates repeated identical catalog labels', () => {
  const result = runInventoryParse({
    message: 'hide milk',
    inventoryNames: ['Amul Milk 500ml', 'Amul Milk 500ml', 'Amul Milk 1l'],
  });
  assert.equal(result.action, 'clarify');
  const count500 = (result.clarify_message.match(/Amul Milk 500ml/g) || []).length;
  assert.equal(count500, 1);
});

test('onboarding completion returns a list menu instead of menu-only text', () => {
  const result = runOnboardingBuild(
    {
      chat_id: '919148969183',
      route: 'save_bootstrap',
      bootstrap_choice: 'skip',
      inventory_count: 0,
      test_mode: false,
      store_name: 'Urban Mart',
      upi_id: 'urban@upi',
      delivery_area: 'Bengaluru',
      operating_hours: '8am-10pm',
    },
    {},
  );

  assert.equal(result.message_type, 'list');
  assert.equal(
    result.list_sections[0].rows.map((button) => button.id).join(','),
    'owner_catalog_manual,owner_catalog_import',
  );
  assert.match(result.body_text, /catalog is empty/i);
});

test('workflow deploy source reapplies inventory parser and promo patch', () => {
  assert.match(source, /findNode\(workflow, 'Parse Inventory Request'\)\.parameters\.jsCode = inventoryParseCode\(\);/);
  assert.match(source, /const promo = patchPromo\(await fetchWorkflow\(WORKFLOW_IDS\.promo\)\);/);
});

test('workflow deploy source routes inventory uploads through bulk intake workflow', () => {
  assert.match(source, /Run Bulk Import Intake/);
  assert.match(source, /bulkIntake/);
  assert.match(source, /\['bulk_intake', 'bulk_apply', 'bulk_cancel'\]/);
});
