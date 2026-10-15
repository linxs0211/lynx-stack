// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
/** @rstest-environment jsdom */
/* eslint-disable n/no-unsupported-features/node-builtins -- Tests exercise browser publishing APIs. */

import { afterEach, beforeEach, expect, rstest, test } from '@rstest/core';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import { PreviewPanel } from './PreviewPanel.js';
import type { LynxXmlPreviewSource } from './PreviewPanel.js';

rstest.mock('./QrCode.js', () => ({ QrCode: () => null }));

const SOURCE =
  '<!doctype lynx><lynx engine-version="4.2"><template><text>Native XML</text></template><script thread="main">createFragment(page, pageId);</script></lynx>';
const LAN_ORIGIN = 'http://192.168.1.2:3000';
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  rstest.stubGlobal('React', React);
  rstest.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rstest.stubGlobal('__A2UI_PLAYGROUND_CLIENT_PAYLOAD_STORE__', true);
  rstest.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: rstest.fn(),
    removeEventListener: rstest.fn(),
  }));
  window.localStorage.clear();
  window.history.replaceState(null, '', '/#/lynx-xml');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
  rstest.unstubAllGlobals();
});

async function renderSource(source: LynxXmlPreviewSource) {
  await React.act(async () =>
    root.render(React.createElement(
      PreviewPanel,
      {
        title: 'Preview',
        previewSource: source,
      } as React.ComponentProps<typeof PreviewPanel>,
      null,
    ))
  );
}

test('publishes retained XML and shares device-reachable Native and Web URLs', async () => {
  const publish = rstest.fn<typeof fetch>().mockImplementation((url, init) => {
    if (url === '/__rspeedy_url') {
      return Promise.resolve(
        Response.json({ url: `${LAN_ORIGIN}/a2ui.lynx.js` }),
      );
    }
    expect(url).toBe('/__lynx_xml_payload');
    expect(JSON.parse(init!.body as string)).toEqual({ source: SOURCE });
    return Promise.resolve(
      Response.json({ sourceUrl: '/__lynx_xml/id/index.lynxml' }),
    );
  });
  rstest.stubGlobal('fetch', publish);
  await renderSource({ kind: 'lynx-xml', source: SOURCE });
  await expect.poll(() => container.textContent).toContain(
    `${LAN_ORIGIN}/__lynx_xml/id/index.lynxml`,
  );
  const urls = Array.from(container.querySelectorAll('.previewQrUrlText')).map(
    node => node.textContent!,
  );
  expect(urls).toHaveLength(2);
  const webUrl = new URL(urls[0]!);
  expect(webUrl.origin).toBe(LAN_ORIGIN);
  expect(webUrl.searchParams.get('sourceUrl')).toBe(urls[1]);
  expect(urls[1]).toBe(`${LAN_ORIGIN}/__lynx_xml/id/index.lynxml`);
  expect(publish).toHaveBeenCalled();
});

test('keeps an existing published XML URL without uploading it again', async () => {
  const publish = rstest.fn<typeof fetch>().mockImplementation((url) => {
    expect(url).toBe('/__rspeedy_url');
    return Promise.resolve(
      Response.json({ url: `${LAN_ORIGIN}/a2ui.lynx.js` }),
    );
  });
  rstest.stubGlobal('fetch', publish);
  await renderSource({
    kind: 'lynx-xml',
    source: SOURCE,
    sourcePath: 'https://assets.example/index.lynxml',
  });
  expect(container.textContent).toContain(
    'https://assets.example/index.lynxml',
  );
  expect(publish).toHaveBeenCalledTimes(1);
});

test('keeps unavailable cards when the development store is disabled', async () => {
  rstest.stubGlobal('__A2UI_PLAYGROUND_CLIENT_PAYLOAD_STORE__', false);
  const publish = rstest.fn<typeof fetch>().mockImplementation((url) => {
    expect(url).toBe('/__rspeedy_url');
    return Promise.resolve(
      Response.json({ url: `${LAN_ORIGIN}/a2ui.lynx.js` }),
    );
  });
  rstest.stubGlobal('fetch', publish);
  await renderSource({ kind: 'lynx-xml', source: SOURCE });
  expect(container.querySelectorAll('.previewQrPlaceholderText')).toHaveLength(
    2,
  );
  expect(container.textContent).not.toContain('local edits');
  expect(publish).toHaveBeenCalledTimes(1);
});

test('aborts old source uploads and never restores stale XML links', async () => {
  let resolveOld!: (response: Response) => void;
  const signals: AbortSignal[] = [];
  rstest.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url === '/__rspeedy_url') {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    const { source } = JSON.parse(init!.body as string) as { source: string };
    if (source === SOURCE) {
      signals.push(init!.signal!);
      return new Promise<Response>(resolve => {
        resolveOld = resolve;
      });
    }
    return Promise.resolve(
      Response.json({ sourceUrl: '/__lynx_xml/new/index.lynxml' }),
    );
  });
  await renderSource({ kind: 'lynx-xml', source: SOURCE });
  await renderSource({
    kind: 'lynx-xml',
    source: SOURCE.replace('Native XML', 'New XML'),
  });
  expect(signals[0]?.aborted).toBe(true);
  await React.act(async () =>
    resolveOld(Response.json({ sourceUrl: '/__lynx_xml/old/index.lynxml' }))
  );
  expect(container.textContent).toContain('/__lynx_xml/new/index.lynxml');
  expect(container.textContent).not.toContain('/__lynx_xml/old/index.lynxml');
});
