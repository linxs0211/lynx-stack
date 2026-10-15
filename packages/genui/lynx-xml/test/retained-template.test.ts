// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { expect, test } from '@rstest/core';

import {
  assembleLynxXmlArtifact,
  compileLynxXmlFragment,
  normalizeLynxXmlArtifact,
} from '../src/index.js';

const FRAGMENT =
  '\n<view class="flex flex-col p-4"><text id="label"> Hello &amp; 你好 </text></view>\n';

test.each([false, true])(
  'retains UI tags with independent style and script options (reuse=%s)',
  enableScriptReuse => {
    for (const stylePreset of [false, 'default'] as const) {
      const source =
        `<!doctype lynx><lynx engine-version="4.2"><template>${FRAGMENT}</template><script thread="main">${
          enableScriptReuse
            ? 'definePage({render(ctx) { ctx.setText(ctx.nodes.label, "ready"); }});'
            : 'const nodes = createFragment(page, pageId);'
        }</script></lynx>`;
      const artifact = assembleLynxXmlArtifact(source, {
        enableHtmlFragment: true,
        enableScriptReuse,
        stylePreset,
      });
      expect(artifact.xmlFragment).toBe(FRAGMENT);
      expect(artifact.text).toContain(`<template>${FRAGMENT}</template>`);
      expect(artifact.text).not.toContain('function createFragment(');
      expect(artifact.text).not.toContain('const parents = [page]');
      expect(artifact.text.includes('function definePage(')).toBe(
        enableScriptReuse,
      );
      expect(artifact.text.includes('.p-4 { padding: 16px; }')).toBe(
        Boolean(stylePreset),
      );
      expect(normalizeLynxXmlArtifact(artifact.text)).toBe(artifact.text);

      // A client without a template parser can still adapt the delivered artifact.
      const runtime = compileLynxXmlFragment(artifact.text).text;
      expect(runtime).not.toContain('<template>');
      expect(runtime).toContain('nodeMap["label"] = element;');
      expect(runtime).toContain('__CreateRawText(" Hello & 你好 ")');
      expect(runtime.match(/function createFragment\(/gu)).toHaveLength(1);
      expect(runtime.match(/function definePage\(/gu) ?? []).toHaveLength(
        enableScriptReuse ? 1 : 0,
      );
      expect(artifact.text).toContain(`<template>${FRAGMENT}</template>`);
    }
  },
);

test.each([
  ['<view id="same"/><text id="same"/>', 'Duplicate XML id'],
  ['<view><text></view>', 'Invalid XML fragment'],
  ['<raw-text><view/></raw-text>', 'only literal text'],
  ['<view>'.repeat(65) + '</view>'.repeat(65), '64 levels'],
  ['<text>' + 'x'.repeat(100_000) + '</text>', '100000 characters'],
])(
  'validates retained markup without emitting a node factory: %s',
  (fragment, message) => {
    const source =
      `<!doctype lynx><lynx engine-version="4.2"><template>${fragment}</template><script thread="main">createFragment(page, pageId);</script></lynx>`;
    expect(() => assembleLynxXmlArtifact(source, { enableHtmlFragment: true }))
      .toThrow(message);
  },
);
