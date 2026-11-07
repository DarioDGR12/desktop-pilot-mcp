export function envelope(result) {
  if (result.structuredContent?.ok !== undefined) return result.structuredContent;
  for (const c of result.content ?? []) if (c.type === 'text') {
    try { const x = JSON.parse(c.text); if (typeof x.ok === 'boolean') return x; } catch {}
  }
  throw new Error('Upstream response has no agent-desktop envelope');
}
export const output = (data, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
export function nodes(tree) { return tree ? [tree, ...(tree.children ?? []).flatMap(nodes)] : []; }
export function matches(tree, selector) {
  return nodes(tree).filter(n => n.role === selector.role && n.name === selector.name && (selector.value === undefined || n.value === selector.value));
}
export function sameWindow(a, b) {
  return !!(a?.id && b?.id === a.id && a.pid !== undefined && b.pid === a.pid && b.process_instance === a.process_instance);
}
export function textOf(tree) {
  return nodes(tree).flatMap(n => [n.name, n.value].filter((v, i, values) => typeof v === 'string' && v.length && values.indexOf(v) === i)).join('\n');
}
