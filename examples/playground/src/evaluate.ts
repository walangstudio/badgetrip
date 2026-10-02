import { prepare } from './config.js';

export type Evaluated =
  | { ok: true; value: unknown }
  | { ok: false; message: string; line?: number; column?: number };

let runs = 0;

/**
 * Run one tab's code as a JavaScript expression with `scope` in reach. It goes through a
 * script element rather than `new Function` because only a script's error event says where a
 * syntax error is. The code is the user's own and runs only in their own page.
 */
export function evaluate(code: string, scope: Record<string, unknown>): Evaluated {
  const slot = `__badgetrip${++runs}`;
  const w = window as unknown as Record<string, unknown>;
  let result: Evaluated = { ok: false, message: 'The code did not run.' };
  w[slot] = {
    scope,
    done: (value: unknown) => {
      result = { ok: true, value };
    },
  };
  const onError = (e: ErrorEvent) => {
    e.preventDefault();
    const message = e.message
      .replace(/^Uncaught /, '')
      .replace(/Failed to execute 'appendChild' on 'Node': /, '');
    // A position is only the user's when the error comes from this inline script, not from
    // library code it called. The wrapper takes line 1, so their line N is the script's N + 1.
    const own = !e.filename || e.filename === location.href;
    result = own
      ? { ok: false, message, line: Math.max(1, e.lineno - 1), column: e.colno }
      : { ok: false, message };
  };
  window.addEventListener('error', onError);
  const script = document.createElement('script');
  const names = Object.keys(scope).join(', ');
  script.textContent = `'use strict'; { const { ${names} } = window.${slot}.scope; window.${slot}.done((\n${prepare(code)}\n)); }`;
  document.head.appendChild(script);
  script.remove();
  window.removeEventListener('error', onError);
  delete w[slot];
  return result;
}
