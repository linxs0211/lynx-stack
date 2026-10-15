// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { expect, test } from '@rstest/core';

import { assembleLynxXmlArtifact } from '@lynx-js/genui/lynx-xml';

import { prepareLynxXmlRuntimeSource } from './lynxXmlRuntime.js';

test('adapts a delivered template locally without changing the saved artifact or duplicating helpers', () => {
  const source =
    '<!doctype lynx><lynx engine-version="4.2"><template><text id="count" class="p-4">8</text></template><script thread="main">definePage({render(ctx) { ctx.on(ctx.nodes.count, "tap", () => ctx.setText(ctx.nodes.count, 9)); }});</script></lynx>';
  const artifact = assembleLynxXmlArtifact(source, {
    enableHtmlFragment: true,
    enableScriptReuse: true,
    stylePreset: 'default',
  }).text;
  const runtime = prepareLynxXmlRuntimeSource(artifact);
  expect(artifact).toContain('<template><text id="count"');
  expect(runtime).not.toContain('<template>');
  expect(runtime).toContain('nodeMap["count"] = element;');
  expect(runtime).toContain('.p-4 { padding: 16px; }');
  expect(runtime.match(/function definePage\(/gu)).toHaveLength(1);
  expect(runtime.match(/function createFragment\(/gu)).toHaveLength(1);
  expect(prepareLynxXmlRuntimeSource(runtime)).toBe(runtime);
});

test('preserves old script-only artifacts containing template-looking literals and comments', () => {
  const source =
    '<!doctype lynx><lynx engine-version="4.2"><!-- <template><view/></template> --><style>/* <template> */</style><script thread="main">const example = "<template><view/></template>";</script></lynx>';
  expect(prepareLynxXmlRuntimeSource(source)).toBe(source);
});
