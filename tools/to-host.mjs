// AST Codegen tool: Rewrites standard web HTML JSX elements (div, span, button, table, etc.)
// into <Host tag="..."> components so web-authored layouts render correctly on React Native.
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import fs from 'fs';
import path from 'path';

const traverse = _traverse.default ?? _traverse;
const generate = _generate.default ?? _generate;
const HTML = new Set([
  'div',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'p',
  'label',
  'nav',
  'main',
  'section',
  'header',
  'footer',
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'option',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'br',
  'ul',
  'li',
  'h1',
  'h2',
  'form',
]);

function convert(src, hostImport) {
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  let used = false;
  traverse(ast, {
    JSXOpeningElement(p) {
      const name = p.node.name;
      if (!t.isJSXIdentifier(name) || !HTML.has(name.name)) return;
      const tag = name.name;
      used = true;
      name.name = 'Host';
      p.node.attributes.unshift(t.jsxAttribute(t.jsxIdentifier('tag'), t.stringLiteral(tag)));
    },
    JSXClosingElement(p) {
      const name = p.node.name;
      if (!t.isJSXIdentifier(name) || !HTML.has(name.name)) return;
      name.name = 'Host';
    },
  });
  if (used) {
    const imp = t.importDeclaration(
      [t.importSpecifier(t.identifier('Host'), t.identifier('Host'))],
      t.stringLiteral(hostImport),
    );
    ast.program.body.unshift(imp);
  }
  return generate(ast, { jsescOption: { minimal: true } }, src).code;
}

const root = path.resolve('src/roles');
const jobs = [['agent/Agent.tsx', '../../../AppData/Local/Temp/cc-pretty/roles/agent/Agent.tsx']];

const map = {
  'roles/agent/Agent.tsx': process.env.TEMP + '/cc-pretty/roles/agent/Agent.tsx',
  'roles/buyer/Buyer.tsx': process.env.TEMP + '/cc-pretty/roles/buyer/Buyer.tsx',
  'roles/driver/Driver.tsx': process.env.TEMP + '/cc-pretty/roles/driver/Driver.tsx',
  'roles/farmer/Farmer.tsx': process.env.TEMP + '/cc-pretty/roles/farmer/Farmer.tsx',
  'roles/ops/Ops.tsx': process.env.TEMP + '/cc-pretty/roles/ops/Ops.tsx',
};

for (const [rel, abs] of Object.entries(map)) {
  const out = path.resolve('src', rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const code = convert(fs.readFileSync(abs, 'utf8'), '../../ui/host');
  fs.writeFileSync(out, code);
  console.log('wrote', rel, code.length);
}
