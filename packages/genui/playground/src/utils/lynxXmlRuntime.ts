// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { compileLynxXmlFragment } from '@lynx-js/genui/lynx-xml';

/** Adapt retained UI tags only when entering a runtime without template parsing. */
export function prepareLynxXmlRuntimeSource(source: string): string {
  const markup = source.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gu,
    '',
  );
  return /<template\s*>/u.test(markup)
    ? compileLynxXmlFragment(source).text
    : source;
}
