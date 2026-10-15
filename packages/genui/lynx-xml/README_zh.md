# Lynx XML

[English](./README.md) | 简体中文

`@lynx-js/genui/lynx-xml` 为完整、零构建的 `.lynxml` 产物提供 System Prompt、
确定性转换，以及产物提取、规范化和校验能力。模型使用 Vanilla Lynx 的 Template 标签或 Direct Element PAPI 生成 UI，
也可以启用 Template、ScriptReuse 和 StylePreset 转换。

这是一个 headless 包。业务负责模型调用、流式传输、产物存储和 Lynx XML 渲染。
生成的产物包含可执行 JavaScript 和 CSS，无需 A2UI Catalog、OpenUI Library
或 ReactLynx 组件渲染器。

## 安装

```sh
pnpm add @lynx-js/genui
```

## 快速开始

使用 Direct 模式时，将 System Prompt 传给模型，再从完整响应中提取、规范化并校验产物：

```ts
import {
  buildLynxXmlSystemPrompt,
  normalizeLynxXmlArtifact,
} from '@lynx-js/genui/lynx-xml';

const systemPrompt = buildLynxXmlSystemPrompt();

// 业务模型调用使用 systemPrompt，得到 modelOutput。
const artifact = normalizeLynxXmlArtifact(modelOutput);
// 将 artifact 交给 Lynx XML 渲染器，或保存为 .lynxml 文件。
```

`normalizeLynxXmlArtifact` 从说明文字或 Markdown 代码块中提取产物，补齐缺失的
doctype，并在产物级契约不合法时抛出异常。它不会执行 JavaScript，也不校验 CSS、
Element PAPI 语义或渲染效果。

启用 Template、ScriptReuse 或 StylePreset 时，保持 Prompt 与转换选项一致，
然后提取、规范化并校验转换后的产物：

```ts
import {
  assembleLynxXmlArtifact,
  buildLynxXmlSystemPrompt,
  normalizeLynxXmlArtifact,
} from '@lynx-js/genui/lynx-xml';

const options = {
  enableHtmlFragment: true,
  enableScriptReuse: true,
  stylePreset: 'default',
} as const;
const systemPrompt = buildLynxXmlSystemPrompt(options);

// 业务模型调用使用 systemPrompt，得到 modelOutput。
const { text } = assembleLynxXmlArtifact(modelOutput, options);
const artifact = normalizeLynxXmlArtifact(text);
```

组装后保留 `<template>` 和其中的 UI 标签，同时补齐启用的脚本与样式辅助逻辑。
客户端提供 `createFragment(page, pageId)`，解析并追加初始树，返回显式 id 到节点的映射。
不支持模板解析的运行时可在加载前本地调用 `compileLynxXmlFragment(artifact)`；
存储和交付仍使用保留标签的组装产物。组装不执行模型代码，也无需额外调用模型。包 API 默认关闭这三个选项。

## 文档目录

- [组件标准](./docs/components.md)：保留的 `Button` 标签、属性、事件、客户端解析契约和测试 Prompt。
- [概览与架构](./docs/overview_zh.md)：职责边界、生成模式和完整处理流程。
- [产物与校验](./docs/artifact-guide_zh.md)：产物提取、规范化与校验、Template、ScriptReuse、
  StylePreset 和片段转换。
- [System Prompts](./docs/system-prompts_zh.md)：Prompt 选项和运行时约束。

可以通过 [GenUI Playground](https://lynx-stack.dev/genui/#/lynx-xml) 生成并预览 Lynx XML
产物。
