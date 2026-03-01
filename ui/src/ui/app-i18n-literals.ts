import { hasLiteralTranslations, translateLiteral } from "../i18n/index.ts";

const SKIP_TEXT_TAGS = new Set([
  "CODE",
  "PRE",
  "SCRIPT",
  "STYLE",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
]);

type TrackedAttribute = "title" | "placeholder" | "aria-label";

type TextLiteralState = {
  sourceCore: string;
  lastAppliedCore: string | null;
};

type AttributeLiteralState = {
  sourceValue: string;
  lastAppliedValue: string | null;
};

const textLiteralStates = new WeakMap<Text, TextLiteralState>();
const attributeLiteralStates = new WeakMap<
  Element,
  Partial<Record<TrackedAttribute, AttributeLiteralState>>
>();

// Tracks whether we've mutated literal nodes/attrs before; used to allow one
// restoration pass when switching from generated locale back to English.
let hadLiteralMutations = false;

function shouldSkipElement(el: Element | null): boolean {
  if (!el) {
    return true;
  }
  if (SKIP_TEXT_TAGS.has(el.tagName)) {
    return true;
  }
  if (el.closest("[data-i18n-literal-ignore]")) {
    return true;
  }
  if (el.classList.contains("mono") || el.closest(".mono")) {
    return true;
  }
  return false;
}

function resolveLiteralTarget(sourceLiteral: string, hasRuntimeLiterals: boolean): string {
  if (!hasRuntimeLiterals) {
    return sourceLiteral;
  }
  const translated = translateLiteral(sourceLiteral);
  if (!translated || translated === sourceLiteral) {
    return sourceLiteral;
  }
  return translated;
}

function resolveTextLiteralState(node: Text, core: string): TextLiteralState {
  const existing = textLiteralStates.get(node);
  if (!existing) {
    const created: TextLiteralState = {
      sourceCore: core,
      lastAppliedCore: null,
    };
    textLiteralStates.set(node, created);
    return created;
  }
  const isLastApplied = existing.lastAppliedCore !== null && core === existing.lastAppliedCore;
  const isSource = core === existing.sourceCore;
  // If content changed externally (not from our last application), treat new value as source.
  if (!isLastApplied && !isSource) {
    existing.sourceCore = core;
    existing.lastAppliedCore = null;
  }
  return existing;
}

function resolveAttributeLiteralState(
  el: Element,
  attr: TrackedAttribute,
  value: string,
): AttributeLiteralState {
  const bucket = attributeLiteralStates.get(el) ?? {};
  let state = bucket[attr];
  if (!state) {
    state = {
      sourceValue: value,
      lastAppliedValue: null,
    };
    bucket[attr] = state;
    attributeLiteralStates.set(el, bucket);
    return state;
  }
  const isLastApplied = state.lastAppliedValue !== null && value === state.lastAppliedValue;
  const isSource = value === state.sourceValue;
  if (!isLastApplied && !isSource) {
    state.sourceValue = value;
    state.lastAppliedValue = null;
  }
  return state;
}

function translateTextNode(node: Text, hasRuntimeLiterals: boolean): boolean {
  const parent = node.parentElement;
  if (shouldSkipElement(parent)) {
    return false;
  }
  const raw = node.data;
  if (!raw.trim()) {
    return false;
  }
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const core = raw.slice(leading.length, raw.length - trailing.length);
  const state = resolveTextLiteralState(node, core);
  const targetCore = resolveLiteralTarget(state.sourceCore, hasRuntimeLiterals);
  if (targetCore === core) {
    state.lastAppliedCore = targetCore === state.sourceCore ? null : targetCore;
    return false;
  }
  node.data = `${leading}${targetCore}${trailing}`;
  state.lastAppliedCore = targetCore === state.sourceCore ? null : targetCore;
  return true;
}

function translateAttributeValue(
  el: Element,
  attr: TrackedAttribute,
  hasRuntimeLiterals: boolean,
): boolean {
  if (shouldSkipElement(el)) {
    return false;
  }
  const value = el.getAttribute(attr);
  if (!value) {
    return false;
  }
  const state = resolveAttributeLiteralState(el, attr, value);
  const targetValue = resolveLiteralTarget(state.sourceValue, hasRuntimeLiterals);
  if (targetValue === value) {
    state.lastAppliedValue = targetValue === state.sourceValue ? null : targetValue;
    return false;
  }
  el.setAttribute(attr, targetValue);
  state.lastAppliedValue = targetValue === state.sourceValue ? null : targetValue;
  return true;
}

export function applyLiteralTranslations(root: ParentNode) {
  const hasRuntimeLiterals = hasLiteralTranslations();
  if (!hasRuntimeLiterals && !hadLiteralMutations) {
    return;
  }

  let mutated = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    mutated = translateTextNode(current as Text, hasRuntimeLiterals) || mutated;
    current = walker.nextNode();
  }

  if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) {
    if (hasRuntimeLiterals) {
      hadLiteralMutations ||= mutated;
    } else {
      hadLiteralMutations = mutated;
    }
    return;
  }
  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    mutated = translateAttributeValue(el, "title", hasRuntimeLiterals) || mutated;
    mutated = translateAttributeValue(el, "placeholder", hasRuntimeLiterals) || mutated;
    mutated = translateAttributeValue(el, "aria-label", hasRuntimeLiterals) || mutated;
  }

  if (hasRuntimeLiterals) {
    hadLiteralMutations ||= mutated;
  } else {
    hadLiteralMutations = mutated;
  }
}
