import { useEffect, useState } from 'react';
import { APP_DICT, APP_PATTERNS } from './appDictionary';

/**
 * Hark's runtime translator, ported 1:1 from mangatrack-app-v3.html.
 *
 * The app is written in Italian (source of truth), and English is produced by
 * walking text nodes / placeholders and swapping known strings. Keeping this
 * DOM-based means every component keeps working with its Italian literals —
 * including strings that come from the data layer (statuses, toasts, empty
 * states) — without threading a `t()` call through the whole codebase.
 */

const STORAGE_KEY = 'mt-lang';
const SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  '.notr',
  '[data-notr]',
  '.login-root',
  'input',
  'textarea',
  'select',
  'option',
  'code',
  'pre',
  '[contenteditable="true"]',
].join(',');

const listeners = new Set();
let lang = readStoredLanguage();
let observer = null;
let installed = false;

function readStoredLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'it';
  } catch {
    return 'it';
  }
}

function storeLanguage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage can be unavailable in private mode — translation still works */
  }
}

/** Translate one string, preserving the surrounding whitespace. */
export function translateString(input) {
  const match = input.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return input;

  const lead = match[1];
  const tail = match[3];
  let core = match[2];
  if (!core) return input;

  if (Object.prototype.hasOwnProperty.call(APP_DICT, core)) {
    core = APP_DICT[core];
  } else {
    let out = core;
    for (const [pattern, replacement] of APP_PATTERNS) {
      out = out.replace(pattern, replacement);
    }
    if (out === core) return input;
    core = out;
  }

  return lead + core + tail;
}

function isSkipped(node) {
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!element || typeof element.closest !== 'function') return true;
  return Boolean(element.closest(SKIP_SELECTOR));
}

function translateTextNode(node) {
  if (isSkipped(node)) return;

  const current = node.nodeValue;
  if (current == null) return;

  // `__mtSource` stores the original Italian so switching back to IT restores
  // it exactly. React may later write new Italian into the same node, which we
  // detect by comparing against the last value we produced ourselves.
  if (node.__mtApplied !== current) {
    node.__mtSource = current;
  }
  const source = node.__mtSource == null ? current : node.__mtSource;
  const next = lang === 'en' ? translateString(source) : source;

  node.__mtApplied = next;
  if (next !== current) node.nodeValue = next;
}

function translatePlaceholder(element) {
  if (!element.hasAttribute || !element.hasAttribute('placeholder')) return;
  // Textareas/inputs are skipped for text translation, but their placeholder
  // is still translatable — exactly like Hark. Only the login owns its copy.
  if (!element.closest || element.closest('.login-root, [data-notr]')) return;

  const current = element.getAttribute('placeholder');
  if (current == null) return;

  if (element.__mtAppliedPlaceholder !== current) {
    element.__mtSourcePlaceholder = current;
  }
  const source = element.__mtSourcePlaceholder == null
    ? current
    : element.__mtSourcePlaceholder;
  const next = lang === 'en' ? translateString(source) : source;

  element.__mtAppliedPlaceholder = next;
  if (next !== current) element.setAttribute('placeholder', next);
}

function walk(root) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    if (isSkipped(root)) return;
    translatePlaceholder(root);
    if (root.querySelectorAll) {
      root.querySelectorAll('[placeholder]').forEach(translatePlaceholder);
    }
  } else if (root.nodeType !== Node.DOCUMENT_NODE
    && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node);
    node = walker.nextNode();
  }
}

/** Re-apply the active language to the whole document. */
export function applyAppLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  if (document.body) walk(document.body);
}

/** Play Hark's little flip-in animation on the active view's headings. */
function replayHeadingFlip() {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll('.view.on h1, .view.on h2, .view.on .i7c span')
    .forEach((element) => {
      element.classList.remove('trflip');
      void element.offsetWidth;
      element.classList.add('trflip');
    });
}

export function getAppLanguage() {
  return lang;
}

export function setAppLanguage(next, { animate = true } = {}) {
  const value = next === 'en' ? 'en' : 'it';
  if (value === lang) {
    // Still re-apply: the caller may be toggling right after new content
    // mounted, before the observer had a chance to translate it.
    applyAppLanguage();
    return lang;
  }

  lang = value;
  storeLanguage(value);
  applyAppLanguage();
  if (animate) replayHeadingFlip();
  listeners.forEach((listener) => listener(lang));
  return lang;
}

export function toggleAppLanguage() {
  return setAppLanguage(lang === 'it' ? 'en' : 'it');
}

export function subscribeAppLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Observe the app shell so late React renders get translated too. */
export function installAppLanguage() {
  if (installed || typeof document === 'undefined' || !document.body) return;
  installed = true;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateTextNode(mutation.target);
      } else if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(walk);
      } else if (mutation.type === 'attributes') {
        translatePlaceholder(mutation.target);
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder'],
  });

  // React StrictMode mounts effects twice in development; avoid duplicating.
  applyAppLanguage();

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      lang = event.newValue === 'en' ? 'en' : 'it';
      applyAppLanguage();
      listeners.forEach((listener) => listener(lang));
    });
  }
}

export function uninstallAppLanguage() {
  if (observer) observer.disconnect();
  observer = null;
  installed = false;
}

/** React binding: `const [language, setLanguage] = useAppLanguage()`. */
export function useAppLanguage() {
  const [value, setValue] = useState(getAppLanguage);

  useEffect(() => {
    // Sync in case the language changed between render and effect.
    setValue(getAppLanguage());
    return subscribeAppLanguage(setValue);
  }, []);

  return [value, setAppLanguage];
}
