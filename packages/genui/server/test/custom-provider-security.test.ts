// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, rstest, test } from '@rstest/core';

import {
  ALLOWED_CUSTOM_PROVIDER_BASE_URLS,
  CUSTOM_JEV_BASE_URL,
  assertAllowedCustomProviderBaseURL,
  createCustomProviderFetch,
  isCustomJevBaseURL,
} from '../agent/common/custom-provider-security.js';
import { createLLMProvider } from '../agent/common/openai-provider.js';

describe('custom provider allow-list', () => {
  test('recognizes the official Jev evaluation endpoint without allowing it as a chat provider', () => {
    expect(isCustomJevBaseURL(CUSTOM_JEV_BASE_URL)).toBe(true);
    expect(isCustomJevBaseURL(`${CUSTOM_JEV_BASE_URL}/`)).toBe(true);
    expect(() => assertAllowedCustomProviderBaseURL(CUSTOM_JEV_BASE_URL))
      .toThrow('available only in A2UI Create');
    for (
      const url of [
        'http://api.typesafe.ai/v1',
        'https://api.typesafe.ai:443/v1',
        'https://key@api.typesafe.ai/v1',
        'https://api.typesafe.ai.evil.example/v1',
        'https://api.typesafe.ai/v1?url=http://127.0.0.1',
        'https://api.typesafe.ai/v1#fragment',
        'https://api.typesafe.ai/v1//',
        'https://api.typesafe.ai/v1/../v1',
        'https://127.0.0.1/v1',
      ]
    ) {
      expect(isCustomJevBaseURL(url)).toBe(false);
      expect(() => assertAllowedCustomProviderBaseURL(url)).toThrow(
        'supported provider URLs',
      );
    }
  });
  test.each(ALLOWED_CUSTOM_PROVIDER_BASE_URLS)(
    'accepts supported provider URL %s',
    (baseURL) => {
      expect(assertAllowedCustomProviderBaseURL(baseURL)).toBe(baseURL);
      expect(assertAllowedCustomProviderBaseURL(`${baseURL}/`)).toBe(baseURL);
    },
  );

  test.each([
    'not a URL',
    'http://api.openai.com/v1',
    'https://user:secret@api.openai.com/v1',
    'https://API.OPENAI.COM/v1',
    'https://api.openai.com:443/v1',
    'https://api.openai.com:444/v1',
    'https://api.openai.com/v1?target=https://127.0.0.1',
    'https://api.openai.com/v1#fragment',
    'https://api.openai.com/v1/extra',
    'https://api.openai.com/v1/../v1',
    'https://api.openai.com/v1//',
    'https://api.openai.com.evil.example/v1',
    'https://example.com/v1',
    'https://api.deepseek.com',
    'http://api.moonshot.cn/v1',
    'https://api.moonshot.ai:443/v1',
    'https://secret@api.moonshot.cn/v1',
    'https://api.moonshot.cn.evil.example/v1',
    'https://api.moonshot.ai/v1?target=http://127.0.0.1',
    'https://api.moonshot.cn/v1#fragment',
    'https://api.moonshot.ai/v1/extra',
    'https://api.moonshot.cn/v1/../v1',
    'https://api.moonshot.ai/v1//',
    'http://api.kimi.com/coding/v1',
    'https://api.kimi.ai:443/coding/v1',
    'https://secret@api.kimi.com/coding/v1',
    'https://api.kimi.com.evil.example/coding/v1',
    'https://api.kimi.ai/coding/v1?target=http://127.0.0.1',
    'https://api.kimi.com/coding/v1#fragment',
    'https://api.kimi.ai/coding/v1/messages',
    'https://api.kimi.com/coding/v1/../v1',
    'https://api.kimi.ai/coding/v1//',
    'https://127.0.0.1/v1',
    'https://169.254.169.254/latest/meta-data',
  ])('rejects unsupported provider URL %s', (baseURL) => {
    expect(() => assertAllowedCustomProviderBaseURL(baseURL)).toThrow(
      'must be one of the supported provider URLs',
    );
  });

  test('uses a stable error code', () => {
    try {
      assertAllowedCustomProviderBaseURL('https://example.com/v1');
      throw new Error('expected provider policy to reject the URL');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe(
        'ERR_GENUI_UNSUPPORTED_CUSTOM_PROVIDER_URL',
      );
    }
  });

  test.each([
    'https://api.kimi.com/coding/v1',
    'https://api.kimi.ai/coding/v1',
  ])('sends Kimi Code credentials to %s through the SDK', async (baseURL) => {
    const fetch = rstest.spyOn(globalThis, 'fetch').mockImplementation(
      (url, init) => {
        expect(url instanceof Request ? url.url : String(url)).toBe(
          `${baseURL}/chat/completions`,
        );
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer test-kimi-code-key',
        );
        expect(init?.redirect).toBe('error');
        expect(JSON.parse(init!.body as string)).toMatchObject({
          model: 'kimi-for-coding',
        });
        return Promise.resolve(Response.json({
          id: 'kimi-code-test',
          object: 'chat.completion',
          created: 1,
          model: 'kimi-for-coding',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finish_reason: 'stop',
          }],
        }));
      },
    );
    try {
      const { provider, model } = createLLMProvider({
        apiKey: '  test-kimi-code-key  ',
        baseURL,
        model: 'kimi-for-coding',
      });
      const result = await provider.chat(model).doGenerate({
        prompt: [{
          role: 'user',
          content: [{ type: 'text', text: 'Say Hello' }],
        }],
      });
      expect(result.content).toContainEqual({ type: 'text', text: 'Hello' });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  });

  test('disables redirects even when a caller requests them', async () => {
    let receivedInit: RequestInit | undefined;
    const fetchImpl = ((_input, init) => {
      receivedInit = init;
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    await createCustomProviderFetch(fetchImpl)(
      'https://api.openai.com/v1/models',
      { redirect: 'follow' },
    );

    expect(receivedInit?.redirect).toBe('error');
  });
});
