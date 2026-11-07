import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { envelope, output, matches, nodes, sameWindow, textOf } from './observation.js';

const selector = z.object({ role: z.string().min(1), name: z.string() }).strict();
const scope = { app: z.string().min(1), window_id: z.string().min(1).optional() };
export const chatSchemas = {
  pilot_request_status: z.object({ request_id: z.string().min(1).max(128) }).strict(),
  pilot_chat_read: z.object({ ...scope, region: selector.optional(), from: z.enum(['start', 'end']).default('end'), max_chars: z.number().int().min(100).max(30000).default(12000) }).strict(),
  pilot_chat_write: z.object({ ...scope, target: selector, text: z.string().min(1).max(10000), replace: z.boolean().default(false), send: selector.optional(), request_id: z.string().min(1).max(128) }).strict(),
  pilot_chat_wait: z.object({ ...scope, region: selector, contains: z.string().min(1).optional(), baseline: z.string().max(100000).optional(), require_change: z.boolean().default(true), stable_ms: z.number().int().min(200).max(5000).default(800), timeout_ms: z.number().int().min(500).max(15000).default(10000) }).strict()
};
const descriptions = {
  pilot_request_status: 'Read the cached state and result for a chat write request_id in this process without operating the desktop. Unknown does not prove non-delivery in another process or before restart.',
  pilot_chat_read: 'Read bounded text from a desktop chat or terminal accessibility tree; list observed editable controls. Region must be unique. Does not infer message authors.',
  pilot_chat_write: 'Write and verify exact multiline text in a unique accessible composer. Preserves an existing draft unless replace=true. Optional send clicks a fresh unique button once. request_id prevents replay in this process; reuse it after uncertain delivery. Never sends Enter to a terminal.',
  pilot_chat_wait: 'Poll a unique accessible response region until text changes (by default) and becomes stable, optionally containing a string. Stable does not mean generation is complete. Supply baseline from your last read to avoid missing fast responses.'
};
export const chatTools = Object.entries(chatSchemas).map(([name, schema]) => ({ name, description: descriptions[name], inputSchema: z.toJSONSchema(schema), annotations: { readOnlyHint: name !== 'pilot_chat_write', idempotentHint: name !== 'pilot_chat_write', openWorldHint: true } }));
const failure = (code, detail = {}) => output({ ok: false, error: { code, ...detail } }, true);
export class Chat {
  constructor(raw, clock = () => performance.now(), sleep = delay) { this.raw = raw; this.clock = clock; this.sleep = sleep; this.requests = new Map(); }
  async snapshot(a, window, timeout_ms = 3000) {
    return envelope(await this.raw('desktop_snapshot', { app: a.app, ...(window?.id || a.window_id ? { window_id: window?.id || a.window_id } : {}), timeout_ms }));
  }
  async call(name, a, signal) {
    signal?.throwIfAborted();
    if (name === 'pilot_request_status') {
      const entry = this.requests.get(a.request_id);
      return output({ ok: true, request_id: a.request_id, state: entry?.state ?? 'unknown', result: entry?.state === 'finished' ? entry.result : undefined, scope: 'current_process' });
    }
    if (name === 'pilot_chat_write') {
      const fingerprint = JSON.stringify(a);
      const old = this.requests.get(a.request_id);
      if (old) return old.fingerprint === fingerprint ? old.result : failure('REQUEST_ID_CONFLICT');
      if (this.requests.size >= 128) return failure('REQUEST_CACHE_FULL', { message: 'Start a fresh MCP session after checking outstanding actions.' });
      const entry = { fingerprint, state: 'running', result: failure('DELIVERY_UNKNOWN', { retry: 'unsafe', request_id: a.request_id }) };
      this.requests.set(a.request_id, entry);
      try { entry.result = await this.write(a); } catch (error) {
        entry.result = failure('DELIVERY_UNKNOWN', { retry: 'unsafe', request_id: a.request_id, message: error.message });
      }
      entry.state = 'finished';
      return entry.result;
    }
    return name === 'pilot_chat_read' ? this.read(a) : this.wait(a, signal);
  }
  async read(a) {
    const snap = await this.snapshot(a);
    if (!snap.ok) return output(snap, true);
    const regions = a.region ? matches(snap.data.tree, a.region) : [snap.data.tree];
    if (regions.length !== 1) return failure('REGION_NOT_UNIQUE', { matches: regions.length });
    const text = textOf(regions[0]);
    const inputs = nodes(regions[0]).filter(n => ['textfield', 'textarea', 'textbox', 'entry'].includes(n.role)).map(n => ({ role: n.role, name: n.name ?? '', ref_id: n.ref_id }));
    return output({ ok: true, window: snap.data.window, complete: snap.data.complete, text: a.from === 'start' ? text.slice(0, a.max_chars) : text.slice(-a.max_chars), start_char: a.from === 'start' ? 0 : Math.max(0, text.length - a.max_chars), truncated: text.length > a.max_chars || !snap.data.complete, total_chars: text.length, composers: inputs.slice(0, 50), composers_truncated: inputs.length > 50, hint: inputs.length ? undefined : 'No accessible composer observed. A terminal TUI may require a native API or explicit physical input; no semantic typing is claimed.' });
  }
  async write(a) {
    const before = await this.snapshot(a);
    if (!before.ok) return output(before, true);
    if (!before.data.complete || !before.data.window?.id) return failure('COMPLETE_WINDOW_REQUIRED');
    const target = matches(before.data.tree, a.target);
    if (target.length !== 1 || !target[0].ref_id) return failure('COMPOSER_NOT_UNIQUE');
    const composer = target[0];
    if (!['textfield', 'textarea', 'textbox', 'entry'].includes(composer.role)) return failure('UNSUPPORTED_COMPOSER', { message: 'A terminal surface is not a verified text field.' });
    if (typeof composer.value !== 'string') return failure('DRAFT_NOT_READABLE');
    if (composer.value && composer.value !== a.text && !a.replace) return failure('EXISTING_DRAFT');
    let write = { ok: true, skipped: 'already_matches' };
    if (composer.value !== a.text) {
      write = envelope(await this.raw('desktop_set_value', { ref_id: composer.ref_id, value: a.text }));
      if (!write.ok) return output({ ok: false, stage: 'write', action: write }, true);
    }
    const after = await this.snapshot(a, before.data.window);
    if (!after.ok || !after.data.complete || !sameWindow(before.data.window, after.data.window)) return failure('WRITE_NOT_VERIFIED', { action: write });
    const updated = matches(after.data.tree, a.target);
    if (updated.length !== 1 || updated[0].value !== a.text) return failure('WRITE_NOT_VERIFIED', { action: write });
    if (!a.send) return output({ ok: true, status: 'draft_verified', request_id: a.request_id, window: after.data.window });
    const buttons = matches(after.data.tree, a.send);
    if (buttons.length !== 1 || !buttons[0].ref_id || buttons[0].role !== 'button') return failure('SEND_BUTTON_NOT_UNIQUE', { draft_verified: true });
    const sent = envelope(await this.raw('desktop_click', { ref_id: buttons[0].ref_id }));
    return output({ ok: sent.ok, status: sent.ok ? 'send_dispatched' : 'send_failed_or_unknown', request_id: a.request_id, action: sent, response_verified: false, window: after.data.window }, !sent.ok);
  }
  async wait(a, signal) {
    const deadline = this.clock() + a.timeout_ms;
    let window, baseline = a.baseline, last, stableSince, observations = 0;
    while (this.clock() < deadline) {
      signal?.throwIfAborted();
      const snap = await this.snapshot(a, window, Math.max(1, Math.min(1000, Math.floor(deadline - this.clock()))));
      if (!snap.ok) return output(snap, true);
      if (!snap.data.complete || !snap.data.window?.id) return failure('COMPLETE_WINDOW_REQUIRED');
      if (window && !sameWindow(window, snap.data.window)) return failure('WINDOW_CHANGED');
      window = snap.data.window;
      const region = matches(snap.data.tree, a.region);
      if (region.length > 1) return failure('REGION_NOT_UNIQUE', { matches: region.length });
      if (region.length === 0) {
        baseline ??= '';
        last = undefined;
        stableSince = undefined;
        const remaining = deadline - this.clock();
        if (remaining > 0) await this.sleep(Math.min(200, remaining), undefined, { signal });
        continue;
      }
      const text = textOf(region[0]); observations++;
      if (baseline === undefined) baseline = text;
      if (text !== last) { last = text; stableSince = this.clock(); }
      const eligible = text.trim().length && (!a.require_change || text !== baseline) && (!a.contains || text.includes(a.contains));
      if (this.clock() <= deadline && eligible && this.clock() - stableSince >= a.stable_ms) return output({ ok: true, status: 'text_stable', generation_complete: 'unknown', window, text: text.slice(0, 30000), truncated: text.length > 30000, observations });
      const remaining = deadline - this.clock();
      if (remaining > 0) await this.sleep(Math.min(200, remaining), undefined, { signal });
    }
    return failure('WAIT_TIMEOUT', { observations, window, message: 'No matching stable response observed before the deadline.' });
  }
}
