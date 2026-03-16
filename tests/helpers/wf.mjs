import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WF_DIR = path.resolve(fileURLToPath(import.meta.url), '../../../workflows/latest');

export function loadWorkflow(pattern) {
  const files = fs.readdirSync(WF_DIR);
  const match = files.find(f => f.includes(pattern));
  if (!match) throw new Error(`No workflow matching: ${pattern}`);
  return JSON.parse(fs.readFileSync(path.join(WF_DIR, match), 'utf8'));
}

export function getCode(workflow, nodeName) {
  const node = workflow.nodes.find(n => n.name === nodeName);
  if (!node) throw new Error(`Node not found: ${nodeName}`);
  const code = node.parameters?.jsCode;
  if (!code) throw new Error(`No jsCode in node: ${nodeName}`);
  // Handle base64-wrapped code
  const b64Match = code.match(/Buffer\.from\("([^"]+)",\s*"base64"\)/);
  if (b64Match) {
    return Buffer.from(b64Match[1], 'base64').toString('utf8');
  }
  return code;
}

export function makeCtx({ $json = {}, nodeOutputs = {}, inputItems = null, $binary = null } = {}) {
  const items = inputItems ? inputItems.map(j => ({ json: j })) : [{ json: $json }];

  function makeNodeProxy(nodeName) {
    const outputs = nodeOutputs[nodeName];
    const nodeItems = Array.isArray(outputs)
      ? outputs.map(j => ({ json: j }))
      : outputs ? [{ json: outputs }] : [];
    return {
      first: () => nodeItems[0] || { json: {} },
      all: () => nodeItems,
      get item() { return nodeItems[0] || { json: {} }; },
      context: outputs?.__context || {},
    };
  }

  return {
    $json,
    $input: {
      first: () => items[0] || { json: {} },
      all: () => items,
      get item() { return items[0] || { json: {} }; },
    },
    $: (nodeName) => makeNodeProxy(nodeName),
    $binary,
    Buffer,
    console,
  };
}

export function runCode(jsCode, ctx) {
  // Wrap in function to allow return statements at top level
  const wrapped = `(function(__ctx) {
    const $json = __ctx.$json;
    const $input = __ctx.$input;
    const $ = __ctx.$;
    const Buffer = __ctx.Buffer;
    const console = __ctx.console;
    const $binary = __ctx.$binary;
    return (function() { ${jsCode} })();
  })(__ctx)`;

  const script = new vm.Script(wrapped);
  const result = script.runInNewContext({ __ctx: ctx });

  // Normalize: n8n Code nodes return array of {json: ...} or single object
  if (Array.isArray(result)) return result.map(r => r && r.json !== undefined ? r.json : r);
  if (result && typeof result === 'object' && result.json !== undefined) return [result.json];
  if (result !== undefined) return [result];
  return [];
}
