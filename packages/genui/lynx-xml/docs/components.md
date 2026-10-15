# Components

Template mode supports retained compound components alongside native Lynx
elements. The exported `LYNX_XML_COMPONENT_CATALOG` in
`src/component-catalog.ts` defines their props, defaults, children, and events.
The generation prompt uses this contract, and assembly validates it while
preserving the original component tags.

## Selection priority

Template generation first matches UI requirements to the defined component
catalog by meaning, supported props, and events. When a component covers the
requested control, the model uses it automatically, even if the user only
describes a product page and never mentions component names. Styling differences
use declared variants, classes, and styles.

Only controls whose required meaning or behavior cannot be expressed by the
defined components fall back to supported primitive Lynx elements. Page layout
and uncovered content can also use primitives. Fallback does not permit invented
component tags or unsupported component props. This selection policy is part of
the system prompt; users do not need to repeat it in each request.

For example, a product page's "Add to cart" and "Buy now" actions use `Button`.
Until components for product summaries or price displays are defined, those
parts use primitive `view` and `text` elements.

## Button

```xml
<Button id="submit" label="Submit" variant="primary" disabled="false" />
```

`Button` is case-sensitive and has no children. Use a self-closing tag.

| Attribute                                           | Values                                                 | Default   |
| --------------------------------------------------- | ------------------------------------------------------ | --------- |
| `label`                                             | Required non-empty literal string; escape XML entities | Required  |
| `variant`                                           | `primary`, `secondary`, `tertiary`                     | `primary` |
| `disabled`                                          | Literal `"true"` or `"false"`                          | `"false"` |
| `id`, `class`, `style`, `data-*`, `accessibility-*` | Common root element attributes                         | Omitted   |

Bind `tap` using the id and the existing event API. With ScriptReuse:

```js
definePage({
  render(ctx) {
    ctx.on(ctx.nodes.submit, 'tap', () => {
      ctx.setText(ctx.nodes.status, 'Submitted');
    });
  },
});
```

`label`, `variant`, and `disabled` are initial props in this version. Update a
separate text element for changing counters and status messages. Do not call
`ctx.setText` on the Button root or change component props through raw Element
attributes. `class` and `style` apply to the root.

## Client parsing

The delivered artifact retains `<Button>` within `<template>`. A native client
registers the component and renders it according to the catalog. Its
`createFragment(page, pageId)` appends the initial tree and returns explicit ids,
mapping each Button id to its tappable root. A disabled Button must ignore taps.
Native clients own their component implementation and visual design.

The explicit `compileLynxXmlFragment` adapter renders a Button as a styled
`view` containing a `text` label, forwards common attributes to the root, and
disables hit testing with `pointer-events: none` for disabled buttons. This
adapter powers Web preview; its internal view/text tree is not stored or
published as the generated XML. This package does not install a native parser
or automatically register native components.

## Try it

In Playground Create, enable **Template**. **ScriptReuse** may also be enabled.
Use this prompt:

> Create a product detail page for a coffee maker. Show its name, price, and
> description, with "Add to cart" and "Buy now" actions. Each action should
> display its corresponding confirmation message when tapped.

No component names are needed in this request. The generated template should
use `<Button>` for both actions, with primitive layout and product content
where the catalog has no matching component. This is a generation instruction,
not a guarantee of model compliance; inspect the result when evaluating a model.

The **Button Component** example provides counter interactions without a model
call. Check Original or Transformed for retained `<Button>` tags; the native
XML URL serves the assembled artifact containing those tags.
