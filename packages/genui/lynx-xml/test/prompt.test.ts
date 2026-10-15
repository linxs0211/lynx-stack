// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, test } from '@rstest/core';

import styleReference from '@lynx-js/skill-vanilla-lynx/references/style.md?raw';

import {
  LYNX_XML_ENGINE_VERSION,
  LYNX_XML_HTML_FRAGMENT_INSTRUCTIONS,
  LYNX_XML_HTML_FRAGMENT_SYSTEM_PROMPT,
  LYNX_XML_SYSTEM_PROMPT,
  buildLynxXmlSystemPrompt,
} from '../src/index.js';
import type { BuildLynxXmlSystemPromptOptions } from '../src/index.js';

const PROMPT_MODES: [string, BuildLynxXmlSystemPromptOptions][] = [
  ['direct', {}],
  ['template', { enableHtmlFragment: true }],
  ['style-preset', { stylePreset: 'default' }],
  ['script-reuse', { enableScriptReuse: true }],
  ['template-style-preset', {
    enableHtmlFragment: true,
    stylePreset: 'default',
  }],
  ['template-script-reuse', {
    enableHtmlFragment: true,
    enableScriptReuse: true,
  }],
  ['style-preset-script-reuse', {
    stylePreset: 'default',
    enableScriptReuse: true,
  }],
  ['template-style-preset-script-reuse', {
    enableHtmlFragment: true,
    stylePreset: 'default',
    enableScriptReuse: true,
  }],
];

describe('buildLynxXmlSystemPrompt', () => {
  test.each(PROMPT_MODES)(
    'matches the complete prompt for %s',
    async (mode, options) => {
      // Snapshot the exact model input, including section order and whitespace.
      await expect(buildLynxXmlSystemPrompt(options)).toMatchFileSnapshot(
        `./__snapshots__/prompt/${mode}.snap.txt`,
      );
    },
  );

  test.each(PROMPT_MODES)(
    'defaults to scrolling with only an explicit single-screen exception for %s',
    (_mode, options) => {
      // Guard the policy separately so updating snapshots cannot relax it.
      const contract = buildLynxXmlSystemPrompt(options)
        .split('Lynx XML adaptation contract:\n')[1]!
        .split('\n\nArtifact boundaries:')[0]!
        .replace(/\s+/gu, ' ');

      expect(contract).toContain(
        'Default to a vertical scroll view, including when content height is uncertain.',
      );
      expect(contract).toContain(
        'Use a non-scrolling root only when the user explicitly requests a fixed single-screen layout',
      );
      expect(contract).toContain(
        'fitting one viewport alone is not an exception.',
      );
      expect(contract).not.toContain('only if content fits one viewport');
    },
  );

  test('keeps the exported prompts aligned with their generation modes', () => {
    expect(LYNX_XML_ENGINE_VERSION).toBe('4.2');
    expect(LYNX_XML_SYSTEM_PROMPT).toBe(buildLynxXmlSystemPrompt());
    expect(LYNX_XML_HTML_FRAGMENT_SYSTEM_PROMPT).toBe(buildLynxXmlSystemPrompt({
      enableHtmlFragment: true,
    }));
    expect(LYNX_XML_HTML_FRAGMENT_SYSTEM_PROMPT).toContain(
      LYNX_XML_HTML_FRAGMENT_INSTRUCTIONS,
    );
  });

  test.each(PROMPT_MODES)(
    'exposes the Button component contract only for Template in %s',
    (_mode, options) => {
      const prompt = buildLynxXmlSystemPrompt(options);
      expect(prompt.includes('Lynx XML component contract:')).toBe(
        Boolean(options.enableHtmlFragment),
      );
      if (options.enableHtmlFragment) {
        expect(prompt).toContain(
          'first match each requested UI control to the defined component catalog (Button)',
        );
        expect(prompt).toContain(
          'even when the user does not name any components or tags',
        );
        expect(prompt).toContain(
          'a different visual design alone is not a reason to reimplement it',
        );
        expect(prompt).toContain(
          'Only compose a control from supported primitive Lynx elements when no defined component can express its required meaning or behavior',
        );
        expect(prompt).toContain(
          'Never invent an undefined component name or unsupported component props',
        );
        expect(prompt).toContain(
          'adding to cart, confirming, or resetting use Button automatically',
        );
        expect(prompt).toContain('self-closing <Button>');
        expect(prompt).toContain('variant is primary | secondary | tertiary');
        expect(prompt).toContain(
          'label is a required non-empty literal string',
        );
        expect(prompt).toContain('disabled are initial component props');
      }
    },
  );

  test('treats explicitly disabled features as the default mode', () => {
    expect(buildLynxXmlSystemPrompt({
      enableHtmlFragment: false,
      enableScriptReuse: false,
      stylePreset: false,
    })).toBe(LYNX_XML_SYSTEM_PROMPT);
  });

  test.each([false, true])(
    'keeps initial UI tags in the client contract (reuse=%s)',
    enableScriptReuse => {
      const prompt = buildLynxXmlSystemPrompt({
        enableHtmlFragment: true,
        enableScriptReuse,
      });
      expect(prompt).toContain(
        'The final artifact preserves <template> and its UI tags',
      );
      expect(prompt).not.toContain('server removes <template>');
      expect(prompt).not.toContain('server supplies createFragment');
      expect(prompt).toContain('initial UI hierarchy in XML tags');
    },
  );

  test.each(PROMPT_MODES)(
    'preserves the upstream CSS property lists for %s',
    (_mode, options) => {
      // Keep this independent of snapshots so an update cannot silently bless
      // accidentally dropped allowed or forbidden properties.
      const propertyLists = [
        ...styleReference.matchAll(/```text\n([\s\S]*?)\n```/gu),
      ].map(match => match[1]!);
      expect(propertyLists).toHaveLength(2);

      const prompt = buildLynxXmlSystemPrompt(options);
      const section = prompt.split('#### CSS Property Allowlist\n')[1]!
        .split('#### Responsive Sizing')[0]!;
      const [allowed, forbidden] = section.split(
        'Never emit these properties:',
      );
      expect(allowed).toContain(propertyLists[0]);
      expect(forbidden).toContain(propertyLists[1]);
      expect(prompt).not.toContain('```');
    },
  );

  test('uses ctx helpers as the Template plus ScriptReuse mutation surface', () => {
    const prompt = buildLynxXmlSystemPrompt({
      enableHtmlFragment: true,
      enableScriptReuse: true,
    });
    const helperSignatures = [
      'ctx.createView()',
      'ctx.createScrollView()',
      'ctx.createText(value)',
      'ctx.createImage()',
      'ctx.append(parent, child)',
      'ctx.replaceChildren(parent, children)',
      'ctx.setText(textNode, value)',
      'ctx.setClasses(node, classes)',
      'ctx.setAttribute(node, name, value)',
      'ctx.setInlineStyles(node, styles)',
      'ctx.listen(eventName, handler)',
      'ctx.emit(eventName, data)',
      'ctx.flush()',
    ];

    for (const signature of helperSignatures) {
      expect(prompt).toContain(signature);
    }
    expect(prompt).toContain('Treat ElementRef values as opaque handles');
    expect(prompt).toContain('Do not call raw Element PAPI');
    expect(prompt).not.toContain('ctx.pageId');
    expect(prompt).not.toMatch(/__[A-Z]/u);
    expect(prompt).not.toContain('lynx.getCoreContext()');
    expect(prompt).not.toContain('localContext.dispatchEvent');
    expect(prompt).toContain(
      'ctx.replaceChildren removes listeners from discarded subtrees',
    );
  });

  test('keeps raw Element PAPI guidance outside Template plus ScriptReuse', () => {
    const prompt = buildLynxXmlSystemPrompt({ enableScriptReuse: true });

    expect(prompt).toContain('`__CreateView(pageId: number)`');
    expect(prompt).toContain('`__SetAttribute');
    expect(prompt).toContain('`__AppendElement');
  });

  test('supports a validated engine version and caller appendix', () => {
    const prompt = buildLynxXmlSystemPrompt({
      engineVersion: ' 5.1 ',
      appendix: '  Prefer a compact information hierarchy.  ',
    });

    expect(prompt).toContain(
      'Set the <lynx> root\'s engine-version to "5.1".',
    );
    expect(prompt).not.toContain(
      'Set the <lynx> root\'s engine-version to "4.2".',
    );
    expect(prompt.endsWith('Prefer a compact information hierarchy.')).toBe(
      true,
    );
  });

  test.each(['', 'latest', '4.x', '4.2" other="value'])(
    'rejects invalid engine version %j',
    engineVersion => {
      expect(() => buildLynxXmlSystemPrompt({ engineVersion })).toThrow(
        'Invalid Lynx engine version',
      );
    },
  );

  test('ignores an empty appendix', () => {
    expect(buildLynxXmlSystemPrompt({ appendix: '  ' })).toBe(
      LYNX_XML_SYSTEM_PROMPT,
    );
  });
});
