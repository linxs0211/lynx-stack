// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
/** @rstest-environment jsdom */
/* eslint-disable n/no-unsupported-features/node-builtins -- Browser source loading uses Web APIs. */

import { afterEach, beforeEach, expect, rstest, test } from '@rstest/core';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { LynxXmlView } from './LynxXmlView.js';
import { createLocalLynxXmlSourcePayload } from '../utils/renderUrl.js';

rstest.mock('@lynx-js/web-core/client', () => ({}));
rstest.mock('@lynx-js/web-elements/all', () => ({}));
rstest.mock('../utils/renderUrl.js', { mock: true });

const SOURCE =
  '<!doctype lynx><lynx engine-version="4.2"><template><text id="count">8</text></template><script thread="main">createFragment(page, pageId);</script></lynx>';
const dispose = rstest.fn();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dispose.mockClear();
  rstest.mocked(createLocalLynxXmlSourcePayload).mockReset();
  rstest.mocked(createLocalLynxXmlSourcePayload).mockReturnValue({
    sourceUrl: 'blob:runtime-preview',
    dispose,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
  rstest.unstubAllGlobals();
});

test.each([false, true])(
  'adapts retained source only for the live preview (remote=%s)',
  async remote => {
    const fetchSource = rstest.fn<typeof fetch>().mockResolvedValue(
      new Response(SOURCE),
    );
    rstest.stubGlobal('fetch', fetchSource);
    await React.act(async () =>
      root.render(React.createElement(
        LynxXmlView,
        remote
          ? { sourceUrl: 'https://assets.test/index.lynxml' }
          : { source: SOURCE },
      ))
    );
    await expect.poll(() =>
      (container.querySelector('lynx-view') as
        | (HTMLElement & { url?: string })
        | null)?.url
    ).toBe('blob:runtime-preview');
    const runtime =
      rstest.mocked(createLocalLynxXmlSourcePayload).mock.calls[0]![0];
    expect(runtime).not.toContain('<template>');
    expect(runtime).toContain('nodeMap["count"] = element;');
    expect(SOURCE).toContain('<template>');
    expect(fetchSource).toHaveBeenCalledTimes(remote ? 1 : 0);
    if (remote) {
      expect(fetchSource).toHaveBeenCalledWith(
        'https://assets.test/index.lynxml',
        expect.objectContaining({ credentials: 'omit' }),
      );
    }
    await React.act(async () => root.render(null));
    expect(dispose).toHaveBeenCalledTimes(1);
  },
);

test('aborts a pending remote source and creates no stale Blob after unmount', async () => {
  let resolveSource!: (response: Response) => void;
  const fetchSource = rstest.fn<typeof fetch>().mockReturnValue(
    new Promise(resolve => {
      resolveSource = resolve;
    }),
  );
  rstest.stubGlobal('fetch', fetchSource);
  await React.act(async () =>
    root.render(
      React.createElement(LynxXmlView, {
        sourceUrl: 'https://assets.test/slow.lynxml',
      }),
    )
  );
  const signal = fetchSource.mock.calls[0]![1]!.signal!;
  await React.act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await React.act(async () => resolveSource(new Response(SOURCE)));
  expect(createLocalLynxXmlSourcePayload).not.toHaveBeenCalled();
});
