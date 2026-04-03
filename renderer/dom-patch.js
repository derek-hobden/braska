// ── DOM reconciliation utilities ────────────────────────────────
// Lightweight keyed-list reconciler for incremental DOM updates.
// No virtual DOM — just compares new data against existing elements
// and adds/removes/reorders the minimum set of changes.

/**
 * Reconcile children of a parent element against a new list of items.
 * Existing elements are matched by a data attribute key, then updated
 * in-place. New items are created; stale items are removed.
 *
 * @param {HTMLElement} parent - Container element
 * @param {Array} items - New data items to render
 * @param {string} keyAttr - Dataset attribute name used as key (e.g. 'section' reads data-section)
 * @param {function} keyFn - (item) => string key for the item
 * @param {function} createFn - (item) => HTMLElement, builds a new element
 * @param {function} updateFn - (existingEl, item) => void, patches an existing element
 */
export function reconcileChildren(parent, items, keyAttr, keyFn, createFn, updateFn) {
  // Build map of existing keyed children
  const existing = new Map();
  for (const child of parent.children) {
    const key = child.dataset[keyAttr];
    if (key != null) existing.set(key, child);
  }

  let prevEl = null;
  for (const item of items) {
    const key = keyFn(item);
    const el = existing.get(key);

    if (el) {
      // Element exists — update it
      updateFn(el, item);
      existing.delete(key);

      // Move to correct position if needed
      const expectedNext = prevEl ? prevEl.nextElementSibling : parent.firstElementChild;
      if (el !== expectedNext) {
        parent.insertBefore(el, expectedNext);
      }
      prevEl = el;
    } else {
      // New element — create and insert
      const newEl = createFn(item);
      newEl.dataset[keyAttr] = key;
      const ref = prevEl ? prevEl.nextElementSibling : parent.firstElementChild;
      parent.insertBefore(newEl, ref);
      prevEl = newEl;
    }
  }

  // Remove elements that are no longer in the items list
  for (const [, el] of existing) {
    el.remove();
  }
}

/**
 * Set textContent on a descendant only if the value changed.
 * Avoids unnecessary reflows from redundant DOM writes.
 *
 * @param {HTMLElement} el - Parent element to search within
 * @param {string} selector - CSS selector for the target element
 * @param {string} text - New text content
 */
export function patchText(el, selector, text) {
  const target = el.querySelector(selector);
  if (target && target.textContent !== text) target.textContent = text;
}

/**
 * Set innerHTML on a descendant only if the value changed.
 *
 * @param {HTMLElement} el - Parent element to search within
 * @param {string} selector - CSS selector for the target element
 * @param {string} html - New innerHTML
 */
export function patchHtml(el, selector, html) {
  const target = el.querySelector(selector);
  if (target && target.innerHTML !== html) target.innerHTML = html;
}
