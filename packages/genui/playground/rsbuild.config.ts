// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rsbuild/core';
import type { RsbuildPlugin } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

import { normalizeLynxXmlArtifact } from '@lynx-js/genui/lynx-xml';

import { resolveGenuiServerUrl } from './genui-server-url.js';

const PORT = Number(process.env.PORT ?? 3000);
const GENUI_SERVER_URL = resolveGenuiServerUrl(process.env.GENUI_SERVER_URL);
const PHASE_TWO_SCREENSHOT_DIRECTORY = fileURLToPath(
  new URL('./src/pages/bench/assets/phase-two/screenshots', import.meta.url),
);
const HAS_PHASE_TWO_SCREENSHOTS = existsSync(PHASE_TWO_SCREENSHOT_DIRECTORY)
  && readdirSync(PHASE_TWO_SCREENSHOT_DIRECTORY).some((fileName) =>
    fileName.endsWith('.png')
  );
const CLIENT_PAYLOAD_STORE_ENABLED = process.env.NODE_ENV !== 'production'
  && process.env.A2UI_PLAYGROUND_CLIENT_PAYLOAD_PUBLISH !== '0';

// In-memory development stores keep preview URLs short enough for QR codes.
interface StoredPayload {
  messages?: unknown;
  actionMocks?: unknown;
  rawText?: string;
  source?: string;
  createdAt: number;
}
const payloadStore = new Map<string, StoredPayload>();
const lynxXmlPayloadStore = new Map<string, StoredPayload>();
const MAX_LYNX_XML_PAYLOADS = 32;
const MAX_LYNX_XML_BODY_BYTES = 2 * 1024 * 1024;
const PAYLOAD_TTL_MS = 30 * 60 * 1000; // 30 minutes

function gcPayloads(): void {
  const now = Date.now();
  for (const store of [payloadStore, lynxXmlPayloadStore]) {
    for (const [id, p] of store) {
      if (now - p.createdAt > PAYLOAD_TTL_MS) {
        store.delete(id);
      }
    }
  }
}

function readJsonBody(
  req: IncomingMessage,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (c: Buffer) => {
      if (bytes > maxBytes) return;
      bytes += c.length;
      if (bytes > maxBytes) {
        chunks.length = 0;
        reject(new Error('Payload exceeds the size limit'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (bytes > maxBytes) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function a2uiPayloadMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const url = req.url ?? '';

  if (
    req.method === 'OPTIONS'
    && (
      url.startsWith('/__a2ui_payload')
      || url.startsWith('/__a2ui/')
      || url.startsWith('/__openui_payload')
      || url.startsWith('/__openui/')
      || url.startsWith('/__lynx_xml_payload')
      || url.startsWith('/__lynx_xml/')
    )
  ) {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }

  if (req.method === 'POST' && url === '/__lynx_xml_payload') {
    void (async () => {
      try {
        const body = (await readJsonBody(req, MAX_LYNX_XML_BODY_BYTES)) as {
          source?: unknown;
        };
        if (typeof body?.source !== 'string') {
          sendJson(res, 400, { error: 'source is required' });
          return;
        }
        const source = normalizeLynxXmlArtifact(body.source);
        gcPayloads();
        if (lynxXmlPayloadStore.size >= MAX_LYNX_XML_PAYLOADS) {
          const oldest = lynxXmlPayloadStore.keys().next().value;
          if (oldest) lynxXmlPayloadStore.delete(oldest);
        }
        const id = randomUUID();
        lynxXmlPayloadStore.set(id, { source, createdAt: Date.now() });
        sendJson(res, 200, {
          sourceUrl: `/__lynx_xml/${id}/index.lynxml`,
        });
      } catch (e) {
        sendJson(res, 400, {
          error: e instanceof Error ? e.message : 'bad request',
        });
      }
    })();
    return;
  }

  if (req.method === 'GET' && url.startsWith('/__lynx_xml/')) {
    gcPayloads();
    const match = /^\/__lynx_xml\/([^/]+)\/index\.lynxml(?:\?|$)/u.exec(url);
    const entry = match?.[1] ? lynxXmlPayloadStore.get(match[1]) : undefined;
    if (typeof entry?.source === 'string') {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      sendText(res, 200, entry.source, 'application/xml; charset=utf-8');
    } else {
      sendJson(res, 404, { error: 'not found' });
    }
    return;
  }

  if (req.method === 'POST' && url.startsWith('/__a2ui_payload')) {
    void (async () => {
      try {
        gcPayloads();
        const body = (await readJsonBody(req)) as {
          messages?: unknown;
          actionMocks?: unknown;
        };
        const id = randomUUID();
        payloadStore.set(id, {
          messages: body.messages,
          actionMocks: body.actionMocks,
          createdAt: Date.now(),
        });
        sendJson(res, 200, {
          id,
          messagesUrl: `/__a2ui/${id}/messages`,
          actionMocksUrl: body.actionMocks === undefined
            ? undefined
            : `/__a2ui/${id}/actionMocks`,
        });
      } catch (e) {
        sendJson(res, 400, {
          error: e instanceof Error ? e.message : 'bad request',
        });
      }
    })();
    return;
  }

  if (req.method === 'POST' && url.startsWith('/__openui_payload')) {
    void (async () => {
      try {
        gcPayloads();
        const body = (await readJsonBody(req)) as {
          rawText?: unknown;
        };
        if (typeof body.rawText !== 'string') {
          sendJson(res, 400, { error: 'rawText is required' });
          return;
        }
        const id = randomUUID();
        payloadStore.set(id, {
          rawText: body.rawText,
          createdAt: Date.now(),
        });
        sendJson(res, 200, {
          id,
          rawTextUrl: `/__openui/${id}/rawText`,
        });
      } catch (e) {
        sendJson(res, 400, {
          error: e instanceof Error ? e.message : 'bad request',
        });
      }
    })();
    return;
  }

  if (req.method === 'GET' && url.startsWith('/__a2ui/')) {
    // Sweep expired entries before reads too — otherwise an idle dev
    // server keeps stale payloads retrievable far past the TTL.
    gcPayloads();
    const m = /^\/__a2ui\/([^/]+)\/(messages|actionMocks)(?:\?|$)/.exec(url);
    if (m) {
      const [, id, field] = m;
      const entry = id ? payloadStore.get(id) : undefined;
      if (entry) {
        const value = field === 'messages'
          ? entry.messages
          : entry.actionMocks;
        sendJson(res, 200, value ?? null);
        return;
      }
    }
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  if (req.method === 'GET' && url.startsWith('/__openui/')) {
    gcPayloads();
    const m = /^\/__openui\/([^/]+)\/rawText(?:\?|$)/.exec(url);
    if (m) {
      const [, id] = m;
      const entry = id ? payloadStore.get(id) : undefined;
      if (typeof entry?.rawText === 'string') {
        sendText(res, 200, entry.rawText);
        return;
      }
    }
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  next();
}

const a2uiPayloadPlugin: RsbuildPlugin = {
  name: 'genui-playground:payload-store',
  setup(api) {
    api.onBeforeStartDevServer(({ server }) => {
      server.middlewares.use(a2uiPayloadMiddleware);
    });
  },
};
function findLocalIp(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name] ?? [];
    for (
      const net of list as Array<{
        address: string;
        family: string | number;
        internal: boolean;
      }>
    ) {
      const family = typeof net.family === 'string'
        ? net.family
        : `IPv${net.family}`;
      if (family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function buildRspeedyBundleUrl(port: number): string {
  const ip = findLocalIp();
  return `http://${ip}:${port}/a2ui.lynx.js`;
}

export default defineConfig({
  plugins: [pluginReact(), a2uiPayloadPlugin],
  source: {
    define: {
      __A2UI_PLAYGROUND_CLIENT_PAYLOAD_STORE__: JSON.stringify(
        CLIENT_PAYLOAD_STORE_ENABLED,
      ),
      __GENUI_SERVER_URL__: JSON.stringify(GENUI_SERVER_URL),
    },
    entry: {
      index: './src/entry.tsx',
      render: './src/render/index.tsx',
    },
  },
  html: {
    title: 'Lynx GenUI Playground',
    tags: [
      {
        tag: 'link',
        attrs: {
          rel: 'icon',
          type: 'image/svg+xml',
          href:
            'https://lf-lynx.tiktok-cdns.com/obj/lynx-artifacts-oss-sg/lynx-website/assets/lynx-dark-logo.svg',
        },
      },
    ],
  },
  output: {
    assetPrefix: process.env.ASSET_PREFIX,
    copy: [
      {
        from: 'src/mock/basic/*.json',
        to: 'demos/[name][ext]',
      },
      {
        from: 'src/mock/a2ui-gallery/*.json',
        to: 'demos/[name][ext]',
      },
      {
        from: 'src/mock/lynx-xml/*.lynxml',
        to: 'demos/lynx-xml/[name][ext]',
      },
      ...(HAS_PHASE_TWO_SCREENSHOTS
        ? [{
          from: 'src/pages/bench/assets/phase-two/screenshots/*.png',
          to: 'bench/phase-two/screenshots/[name][ext]',
        }]
        : []),
    ],
  },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            test: /\.lynxml$/,
            resourceQuery: /raw/,
            type: 'asset/source',
          },
        ],
      },
    },
  },
  server: {
    port: PORT,
    host: '0.0.0.0',
    cors: {
      origin: '*',
    },
    publicDir: [
      {
        name: 'public',
        copyOnBuild: true,
        watch: true,
      },
      {
        name: 'www',
        copyOnBuild: true,
        watch: true,
      },
    ],
    setup: ({ server, action }) => {
      if (action !== 'dev') {
        return;
      }
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/__rspeedy_url')) {
          const url = buildRspeedyBundleUrl(req.socket.localPort ?? PORT);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ url }));
          return;
        }
        next();
      });
    },
  },
});
