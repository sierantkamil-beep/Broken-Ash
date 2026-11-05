export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const tip = () => $("tooltip");

/** Shows a small tooltip next to the cursor while hovering `target`. */
export function tooltip(target: HTMLElement, html: () => string) {
  target.addEventListener("mouseenter", () => {
    tip().innerHTML = html();
    tip().hidden = false;
  }, scoped());
  target.addEventListener("mousemove", (e) => {
    const t = tip();
    const x = Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 14);
    const y = Math.min(window.innerHeight - t.offsetHeight - 8, e.clientY + 14);
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
  }, scoped());
  target.addEventListener("mouseleave", () => (tip().hidden = true), scoped());
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

let session = new AbortController();

/**
 * Listener options tied to the current game session. The UI classes are rebuilt for every
 * character that enters the world while the DOM stays, so their listeners must go with them —
 * otherwise the previous session's chat handler swallows the input (and drops fire twice).
 */
export const scoped = (): AddEventListenerOptions => ({ signal: session.signal });

export function endSession() {
  session.abort();
  session = new AbortController();
}
