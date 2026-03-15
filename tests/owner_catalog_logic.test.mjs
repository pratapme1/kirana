import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessImportBatch,
  assessImportRow,
  buildReportManifest,
  buildSku,
  canonicalizeItemName,
  chunkRows,
  decideOnboardingRoute,
  extractCatalogTokens,
  nextPromoCode,
  normalizeConfidence,
  normalizeImportRecord,
  normalizeName,
  parseInventoryLine,
  parseGoogleSheetReference,
  resolveCatalogItem,
  scoreCandidate,
  stageBulkRows,
} from '../scripts/owner_catalog_logic.mjs';

test('normalizeName collapses punctuation and spacing', () => {
  assert.equal(normalizeName('  Amul-Milk 500ml  '), 'amul milk 500ml');
});

test('canonicalizeItemName keeps sellable variants but standardizes format', () => {
  assert.equal(canonicalizeItemName('amul milk 500 ml'), 'Amul Milk 500ml');
  assert.equal(canonicalizeItemName(' eggs-10 '), 'Eggs 10');
  assert.equal(canonicalizeItemName('onions 1 KG'), 'Onions 1kg');
});

test('extractCatalogTokens separates base and variant tokens', () => {
  const eggs = extractCatalogTokens('Eggs 10');
  assert.deepEqual(eggs.base_tokens, ['egg']);
  assert.deepEqual(eggs.variant_tokens, ['10']);

  const milk = extractCatalogTokens('Amul Milk 500ml');
  assert.deepEqual(milk.base_tokens, ['amul', 'milk']);
  assert.deepEqual(milk.variant_tokens, ['500ml']);
});

test('resolveCatalogItem prefers exact sellable variants over quantity fallback lookalikes', () => {
  const inventory = [
    { item_name: 'Eggs 6', sku: 'EGGS_6', is_active: true },
    { item_name: 'Eggs 10', sku: 'EGGS_10', is_active: true },
    { item_name: 'Onions', sku: 'ONIONS', is_active: true },
    { item_name: 'Onions 1kg', sku: 'ONIONS_1KG', is_active: true },
    { item_name: 'Amul Milk 500ml', sku: 'AMUL_500', is_active: true },
    { item_name: 'Amul Milk 1L', sku: 'AMUL_1L', is_active: true },
  ];

  const eggs = resolveCatalogItem('eggs 10', inventory);
  assert.equal(eggs.status, 'selected');
  assert.equal(eggs.row.sku, 'EGGS_10');

  const onions = resolveCatalogItem('onions', inventory);
  assert.equal(onions.status, 'selected');
  assert.equal(onions.row.sku, 'ONIONS');

  const milk = resolveCatalogItem('amul milk', inventory);
  assert.equal(milk.status, 'ambiguous');
  assert.deepEqual(milk.matches, ['Amul Milk 500ml', 'Amul Milk 1l']);
});

test('scoreCandidate prefers exact and prefix matches', () => {
  assert.equal(scoreCandidate('milk', 'milk'), 1);
  assert.equal(scoreCandidate('milk', 'milk packet'), 0.9);
  assert.ok(scoreCandidate('full cream milk', 'milk') >= 0.82);
});

test('parseInventoryLine parses compact manual inventory lines', () => {
  assert.deepEqual(parseInventoryLine('milk 40 20'), {
    action: 'parsed',
    raw_line: 'milk 40 20',
    item_name: 'Milk',
    normalized_name: 'milk',
    price: 40,
    stock: 20,
    unit: '',
    category: '',
    brand: '',
  });
});

test('parseInventoryLine parses explicit stock and price fields', () => {
  const parsed = parseInventoryLine('atta price 320 stock 10 unit kg');
  assert.equal(parsed.item_name, 'Atta');
  assert.equal(parsed.price, 320);
  assert.equal(parsed.stock, 10);
  assert.equal(parsed.unit, 'kg');
});

test('buildSku generates stable unique store-scoped codes', () => {
  const reserved = new Set();
  const rows = [{ sku: 'MILK' }, { sku: 'MILK_2' }];
  assert.equal(buildSku('milk', rows, reserved), 'MILK_3');
  assert.equal(buildSku('rice flour', rows, reserved), 'RICE_FLOUR');
});

test('normalizeConfidence accepts fractions and percentages', () => {
  assert.equal(normalizeConfidence(0.92), 0.92);
  assert.equal(normalizeConfidence(92), 0.92);
  assert.equal(normalizeConfidence('88'), 0.88);
  assert.equal(normalizeConfidence('bad'), null);
});

test('assessImportRow blocks noisy OCR rows with guessed zero values', () => {
  const result = assessImportRow(
    { item_name: 'importfix tsa 49 11', price: 0, stock: 0, row_confidence: 0.61 },
    { parseMode: 'image', rowConfidenceThreshold: 0.9 },
  );
  assert.equal(result.blocked, true);
  assert.ok(result.reasons.includes('missing or invalid price'));
  assert.ok(result.reasons.includes('low OCR confidence'));
});

test('assessImportRow allows valid sheet rows without OCR confidence', () => {
  const result = assessImportRow(
    { item_name: 'amul milk 500ml', price: 31, stock: 8 },
    { parseMode: 'sheet' },
  );
  assert.equal(result.blocked, false);
  assert.deepEqual(result.reasons, []);
});

test('assessImportBatch flags low document confidence for OCR imports', () => {
  const result = assessImportBatch(
    [{ item_name: 'amul milk', price: 31, stock: 8, row_confidence: 0.95 }],
    { parseMode: 'image', documentConfidence: 0.72, documentConfidenceThreshold: 0.88 },
  );
  assert.equal(result.documentBlocked, true);
  assert.ok(result.documentReasons.includes('low document OCR confidence'));
  assert.equal(result.assessments[0].assessment.blocked, false);
});

test('nextPromoCode handles collisions', () => {
  assert.equal(nextPromoCode('SAVE10', ['SAVE10', 'SAVE10_2']), 'SAVE10_3');
});

test('decideOnboardingRoute advances through bootstrap selection', () => {
  const boot = decideOnboardingRoute({
    hasStore: true,
    step: 5,
    complete: false,
    text: '',
    sourceType: 'text',
    buttonId: '',
  });
  assert.equal(boot.route, 'prompt_bootstrap');

  const save = decideOnboardingRoute({
    hasStore: true,
    step: 6,
    complete: true,
    text: '',
    sourceType: 'button',
    buttonId: 'owner_bootstrap_import',
  });
  assert.equal(save.route, 'save_bootstrap');
  assert.equal(save.bootstrapChoice, 'import');
});

test('parseGoogleSheetReference builds CSV export URL', () => {
  const parsed = parseGoogleSheetReference('https://docs.google.com/spreadsheets/d/abc123DEF456/edit#gid=789');
  assert.equal(parsed.spreadsheetId, 'abc123DEF456');
  assert.equal(parsed.gid, '789');
  assert.equal(parsed.exportUrl, 'https://docs.google.com/spreadsheets/d/abc123DEF456/export?format=csv&gid=789');
});

test('chunkRows splits large imports by configured size', () => {
  const input = Array.from({ length: 620 }, (_, index) => index + 1);
  const chunks = chunkRows(input, 250);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 250);
  assert.equal(chunks[1].length, 250);
  assert.equal(chunks[2].length, 120);
});

test('normalizeImportRecord maps common sheet headers', () => {
  const row = normalizeImportRecord({
    Product: 'Amul Milk 500ml',
    Rate: '31',
    Qty: '8',
    UOM: 'pcs',
    Group: 'Dairy',
  });
  assert.equal(row.item_name, 'Amul Milk 500ml');
  assert.equal(row.price, 31);
  assert.equal(row.stock, 8);
  assert.equal(row.unit, 'pcs');
  assert.equal(row.category, 'Dairy');
});

test('stageBulkRows groups matched, new, ambiguous, and invalid rows', () => {
  const inventory = [
    { item_name: 'Amul Milk 500ml', sku: 'AMUL_MILK_500ML', is_active: true },
    { item_name: 'Aashirvaad Atta 5kg', sku: 'ATTA_5KG', is_active: true },
    { item_name: 'Toned Milk 1L', sku: 'TONED_MILK_1L', is_active: true },
    { item_name: 'Full Cream Milk 1L', sku: 'FULL_CREAM_MILK_1L', is_active: true },
  ];

  const { stagedRows, summary } = stageBulkRows([
    { item_name: 'Amul Milk 500ml', price: 31, stock: 8 },
    { item_name: 'Sona Masoori Rice 5kg', price: 410, stock: 4 },
    { item_name: 'milk 1l', price: 68, stock: 3 },
    { item_name: '', price: 10, stock: 1 },
  ], inventory, { parseMode: 'sheet' });

  assert.equal(summary.matched_rows, 1);
  assert.equal(summary.new_rows, 1);
  assert.equal(summary.ambiguous_rows, 1);
  assert.equal(summary.invalid_rows, 1);
  assert.equal(stagedRows[0].match_status, 'matched');
  assert.equal(stagedRows[1].match_status, 'new');
  assert.equal(stagedRows[2].match_status, 'ambiguous');
  assert.equal(stagedRows[3].match_status, 'invalid');
});

test('stageBulkRows collapses identical duplicate rows', () => {
  const { stagedRows, summary } = stageBulkRows([
    { item_name: 'Moong Dal', price: 120, stock: 5 },
    { item_name: 'Moong Dal', price: 120, stock: 5 },
  ], [], { parseMode: 'sheet' });

  assert.equal(stagedRows.length, 1);
  assert.equal(summary.skipped_duplicates, 1);
  assert.equal(stagedRows[0].match_status, 'new');
});

test('buildReportManifest returns stable webhook URLs', () => {
  const manifest = buildReportManifest('https://example.com/', 'job_123', 'token_456');
  assert.equal(manifest.summary_url, 'https://example.com/webhook/owner-import-report-bulk-v1?job=job_123&token=token_456&kind=summary');
  assert.equal(manifest.invalid_url, 'https://example.com/webhook/owner-import-report-bulk-v1?job=job_123&token=token_456&kind=invalid');
});
