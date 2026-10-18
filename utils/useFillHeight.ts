import { useCallback, useLayoutEffect, useState } from 'react';

/** The height that takes an element from its top down to the window's bottom, less what must stay below it. */
export function fillHeight(top: number, windowHeight: number, below: number, min = 420): number {
  return Math.max(min, Math.round(windowHeight - top - below));
}

const px = (el: Element, prop: 'paddingBottom' | 'borderBottomWidth') => parseFloat(getComputedStyle(el)[prop]) || 0;

/**
 * What stays under an element down to the page's end: going up from it to the app shell, whatever sits below it
 * in each container (not beside it: a neighbouring column does not count), and each container's bottom padding and
 * border. Measured from the layout, not from the window, and not from a container's height, which a longer
 * neighbouring column would set.
 */
export function spaceBelow(el: HTMLElement): number {
  let total = 0;
  let node: HTMLElement = el;
  while (node.parentElement && node.parentElement !== document.body) {
    const parent = node.parentElement;
    const bottom = node.getBoundingClientRect().bottom;
    let lowest = bottom;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !sibling.getClientRects().length) continue;
      const box = sibling.getBoundingClientRect();
      if (box.top >= bottom - 1 && getComputedStyle(sibling).position !== 'absolute' && getComputedStyle(sibling).position !== 'fixed') lowest = Math.max(lowest, box.bottom);
    }
    total += lowest - bottom + px(parent, 'paddingBottom') + px(parent, 'borderBottomWidth');
    if (parent.classList.contains('app-shell')) break;
    node = parent;
  }
  return Math.round(total);
}

/**
 * A column that reaches the bottom of the browser window on a desktop-width screen, whatever sits above it: the
 * height is measured, not guessed from the header's size, and measured again when the window, the column or the
 * page changes.
 * `below` is the room kept under it: 'auto' keeps exactly what the page has below it, so the page does not scroll;
 * a number keeps that many pixels (for a column beside a longer one that scrolls). A sticky column is not measured
 * while the page is scrolled. Below 1024 px wide the column keeps its natural height.
 */
export function useFillHeight<T extends HTMLElement>(below: number | 'auto' = 'auto', min = 420): (el: T | null) => void {
  const [el, setEl] = useState<T | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const apply = () => {
      if (window.innerWidth < 1024) { el.style.height = ''; return; }
      // A column on a stage that is hidden has no box to measure; it is measured when it is shown.
      if (!el.getClientRects().length) return;
      if (getComputedStyle(el).position === 'sticky' && window.scrollY > 0) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const height = `${fillHeight(top, window.innerHeight, below === 'auto' ? spaceBelow(el) : below, min)}px`;
      if (el.style.height !== height) el.style.height = height;
    };
    apply();
    // The body is always the window's height; what changes is the column itself (shown, hidden) and <main>.
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    const main = el.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('resize', apply);
    // A column also moves without changing size (a header or a notice above it grows): its top is checked a few
    // times a second and the height measured again when the top has moved or the page below it has changed.
    let lastKey = '';
    const watch = window.setInterval(() => {
      if (!el.getClientRects().length) return;
      const key = `${Math.round(el.getBoundingClientRect().top + window.scrollY)}:${document.documentElement.scrollHeight}:${window.innerHeight}`;
      if (key !== lastKey) { lastKey = key; apply(); }
    }, 250);
    return () => { observer.disconnect(); window.removeEventListener('resize', apply); window.clearInterval(watch); };
  }, [el, below, min]);
  return useCallback((node: T | null) => setEl(node), []);
}
