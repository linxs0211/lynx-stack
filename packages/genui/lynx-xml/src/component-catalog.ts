// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Compound component contracts for retained Lynx XML tags and client parsers.
 * @example
 * ```ts
 * const button = LYNX_XML_COMPONENT_CATALOG.Button;
 * // <Button id="submit" label="Submit" variant="primary" />
 * ```
 */
export const LYNX_XML_COMPONENT_CATALOG = {
  Button: {
    props: {
      label: { type: 'string', required: true },
      variant: {
        type: 'string',
        enum: ['primary', 'secondary', 'tertiary'],
        default: 'primary',
      },
      disabled: { type: 'boolean', default: false },
    },
    children: false,
    events: ['tap'],
  },
} as const;

const BUTTON_VARIANTS = {
  primary: { background: '#245c45', color: '#ffffff', border: '#245c45' },
  secondary: { background: '#e7eee9', color: '#245c45', border: '#c4d5ca' },
  tertiary: {
    background: 'transparent',
    color: '#245c45',
    border: 'transparent',
  },
} as const;

/** Validate literal component props and provide its Web adapter element tree. @internal */
export function expandButton(
  attributes: Record<string, string>,
): Record<string, unknown> {
  const definition = LYNX_XML_COMPONENT_CATALOG.Button;
  for (const name of Object.keys(attributes)) {
    if (
      !Object.hasOwn(definition.props, name)
      && !['id', 'class', 'style'].includes(name)
      && !name.startsWith('data-') && !name.startsWith('accessibility-')
    ) {
      throw new Error(`Unsupported Button attribute: ${name}`);
    }
  }
  if (typeof attributes['label'] !== 'string' || !attributes['label'].trim()) {
    throw new Error('Button requires a non-empty label attribute');
  }
  const variant = attributes['variant'] ?? definition.props.variant.default;
  if (!definition.props.variant.enum.some(value => value === variant)) {
    throw new Error(`Unsupported Button variant: ${String(variant)}`);
  }
  const disabled = attributes['disabled']
    ?? String(definition.props.disabled.default);
  if (disabled !== 'true' && disabled !== 'false') {
    throw new Error('Button disabled must be "true" or "false"');
  }
  const colors = BUTTON_VARIANTS[variant as keyof typeof BUTTON_VARIANTS];
  const rootAttributes = Object.fromEntries(
    Object.entries(attributes).filter(([name]) =>
      !Object.hasOwn(definition.props, name)
    ),
  );
  return {
    view: [{
      text: [{ '#text': attributes['label'] }],
      ':@': {
        style:
          `font-size:16px;font-weight:600;white-space:nowrap;text-align:center;color:${colors.color};`,
      },
    }],
    ':@': {
      ...rootAttributes,
      class: `genui-button${
        attributes['class'] ? ` ${String(attributes['class'])}` : ''
      }`,
      style:
        'display:flex;flex-direction:row;align-items:center;justify-content:center;'
        + 'min-height:44px;padding:12px 20px;border-radius:12px;border-width:1px;border-style:solid;'
        + `background-color:${colors.background};border-color:${colors.border};`
        + `${attributes['style'] ? `${String(attributes['style'])};` : ''}`
        + (disabled === 'true' ? 'opacity:0.45;pointer-events:none;' : ''),
    },
  };
}

/** Model-facing component rules shared by every Template generation mode. @internal */
export function componentInstructions(): string {
  const button = LYNX_XML_COMPONENT_CATALOG.Button;
  return `Lynx XML component contract:
- Component selection priority: first match each requested UI control to the defined component catalog (${
    Object.keys(LYNX_XML_COMPONENT_CATALOG).join(', ')
  }), using its meaning, supported props, and events. Select matching components automatically from the user's product requirements, even when the user does not name any components or tags.
- When a defined component can express the required control, use that component and retain its tag in the template. Apply its declared variants, class, and style for visual customization; a different visual design alone is not a reason to reimplement it with primitive elements.
- Only compose a control from supported primitive Lynx elements when no defined component can express its required meaning or behavior. Primitive elements remain available for page layout and uncovered content. Never invent an undefined component name or unsupported component props to fill a gap.
- For a labeled action control covered by Button's props and tap event, use the case-sensitive, self-closing <Button> component. Actions such as submitting, buying, adding to cart, confirming, or resetting use Button automatically. Keep <Button> in the delivered template for the client parser.
- Button props: label is a required non-empty literal string; variant is ${
    button.props.variant.enum.join(' | ')
  } (default ${button.props.variant.default}); disabled is a literal "true" or "false" (default ${button.props.disabled.default}). Button has no children. Example: <Button id="submit" label="Submit" variant="primary" />.
- Common Button attributes: id, class, style, data-* and accessibility-*. Do not invent component names, props, or inline event attributes. XML entity escaping also applies to label.
- A Button id resolves to its root control. Bind ${
    button.events.join(', ')
  } through the existing node event API, such as ctx.on(ctx.nodes.submit, "tap", handler) in ScriptReuse mode. Disabled buttons do not receive taps.
- label, variant and disabled are initial component props in this version. Update separate text nodes for counters/status; never pass a Button root to ctx.setText or mutate its component props through Element attributes. class/style apply to the root control.
- The client owns Button rendering and default visuals. The Web adapter uses a styled view with a text label; do not emit its implementation or internal children into the template.`;
}
