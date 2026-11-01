import { EN } from "./i18n-en.ts";

export type Lang = "ar" | "en";
const KEY = "speed-lang";

export function getLang(): Lang {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}
export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage unavailable: language stays Arabic */
  }
}
/** Translate one UI string. Arabic is the source language; unknown strings stay as-is. */
export function t(text: string, lang: Lang = getLang()): string {
  if (lang === "ar") return text;
  const key = text.trim();
  const hit = EN[key];
  return hit ? text.replace(key, hit) : text;
}

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
/** Translate every text node / attribute under root to English and keep translating new content. */
export function translateTree(root: HTMLElement): () => void {
  const apply = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || "";
      const next = t(value, "en");
      if (next !== value) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value) {
        const next = t(value, "en");
        if (next !== value) el.setAttribute(name, next);
      }
    }
    el.childNodes.forEach(apply);
  };
  apply(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") apply(record.target);
      else if (record.type === "attributes") apply(record.target);
      else record.addedNodes.forEach(apply);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return () => observer.disconnect();
}
