// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { runInNewContext } from 'node:vm';

import { expect, test } from '@rstest/core';

import {
  LYNX_XML_COMPONENT_CATALOG,
  assembleLynxXmlArtifact,
  compileLynxXmlFragment,
  generateMainThreadScriptResult,
} from '../src/index.js';

function document(fragment: string): string {
  return `<!doctype lynx><lynx engine-version="4.2"><template>${fragment}</template><script thread="main">createFragment(page, pageId);</script></lynx>`;
}

test('retains compound Button tags for client parsing and expands only in the explicit adapter', () => {
  const fragment =
    '<Button id="submit" label="提交 &amp; 保存" variant="secondary" />';
  const { text } = assembleLynxXmlArtifact(document(fragment), {
    enableHtmlFragment: true,
  });
  expect(text).toContain(`<template>${fragment}</template>`);
  expect(text).not.toContain('genui-button');
  expect(text).not.toContain('function createFragment(');
  const runtime = compileLynxXmlFragment(text).text;
  expect(runtime).not.toContain('<Button');
  expect(runtime).not.toContain('<template>');
  expect(runtime).toContain('nodeMap["submit"] = element;');
  expect(runtime).toContain('__CreateRawText("提交 & 保存")');
  expect(runtime).not.toContain('__CreateElement("Button"');
});

test.each(LYNX_XML_COMPONENT_CATALOG.Button.props.variant.enum)(
  'maps the %s Button id to its root and preserves common attributes',
  variant => {
    const { javascript, bindings } = generateMainThreadScriptResult(
      `<Button id="submit" label="&lt;确认&gt; &amp; 继续" variant="${variant}" class="custom" style="border-radius:8px" data-action="save" accessibility-label="保存" />`,
    );
    interface Node {
      tag: string;
      attributes: Record<string, string>;
      children: Node[];
    }
    const create = (tag: string): Node => ({
      tag,
      attributes: {},
      children: [],
    });
    const page = create('page');
    const map = runInNewContext(javascript + '\nnodeMap;', {
      page,
      pageId: 0,
      __CreateView: () => create('view'),
      __CreateText: () => create('text'),
      __CreateRawText: (value: string) => ({
        ...create('raw-text'),
        attributes: { value },
      }),
      __AppendElement: (parent: Node, child: Node) =>
        parent.children.push(child),
      __SetID: (node: Node, value: string) => {
        node.attributes['id'] = value;
      },
      __SetClasses: (node: Node, value: string) => {
        node.attributes['class'] = value;
      },
      __SetInlineStyles: (node: Node, value: string) => {
        node.attributes['style'] = value;
      },
      __SetAttribute: (node: Node, name: string, value: string) => {
        node.attributes[name] = value;
      },
      __AddDataset: (node: Node, name: string, value: string) => {
        node.attributes[`data-${name}`] = value;
      },
    }) as Record<string, Node>;
    const button = map['submit']!;
    expect(bindings).toEqual({ submit: 'nodeMap["submit"]' });
    expect(button).toBe(page.children[0]);
    expect(button.tag).toBe('view');
    expect(button.attributes).toMatchObject({
      id: 'submit',
      class: 'genui-button custom',
      'data-action': 'save',
      'accessibility-label': '保存',
    });
    expect(button.attributes['style']).toContain(
      'display:flex;flex-direction:row;',
    );
    expect(button.attributes['style']).toContain('border-radius:8px;');
    expect(button.attributes).not.toHaveProperty('variant');
    expect(button.attributes).not.toHaveProperty('label');
    expect(button.attributes).not.toHaveProperty('disabled');
    expect(button.children[0]?.tag).toBe('text');
    expect(button.children[0]?.children[0]?.attributes['value']).toBe(
      '<确认> & 继续',
    );
  },
);

test('defaults to an enabled primary button and suppresses hit testing when initially disabled', () => {
  const enabled =
    generateMainThreadScriptResult('<Button label="继续" />').javascript;
  expect(enabled).toContain('background-color:#245c45;');
  expect(enabled).not.toContain('pointer-events:none;');
  expect(enabled).not.toContain('opacity:0.45;');
  const disabled = generateMainThreadScriptResult(
    '<Button label="继续" disabled="true" style="pointer-events:auto" />',
  ).javascript;
  expect(disabled).toContain(
    'pointer-events:auto;opacity:0.45;pointer-events:none;',
  );
  expect(
    generateMainThreadScriptResult('<Button label="继续" disabled="false" />')
      .javascript,
  ).toBe(enabled);
});

test.each([
  ['<Button />', 'non-empty label'],
  ['<Button label=" " />', 'non-empty label'],
  ['<Button label="确认" variant="danger" />', 'Unsupported Button variant'],
  ['<Button label="确认" disabled="yes" />', 'disabled must be'],
  ['<Button label="确认" disabled />', 'Invalid XML fragment'],
  ['<Button label="确认" onTap="submit" />', 'Unsupported Button attribute'],
  ['<Button label="确认" unknown="x" />', 'Unsupported Button attribute'],
  [
    '<Button label="确认"><text>子节点</text></Button>',
    'must not have children',
  ],
  ['<Button label="确认">内容</Button>', 'must not have children'],
  ['<Button id="same" label="确认" /><text id="same" />', 'Duplicate XML id'],
  ['<Unknown label="确认" />', 'Unsupported XML element'],
])(
  'rejects invalid component markup in retained and adapted output: %s',
  (fragment, message) => {
    expect(() =>
      assembleLynxXmlArtifact(document(fragment), { enableHtmlFragment: true })
    ).toThrow(message);
    expect(() => compileLynxXmlFragment(document(fragment))).toThrow(message);
  },
);
