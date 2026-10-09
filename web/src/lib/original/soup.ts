/**
 * The handful of BeautifulSoup behaviours the debate splitter relies on,
 * implemented over an htmlparser2 DOM:
 *
 * - `get_text(separator, strip)` (only plain text nodes count; text inside
 *   `script`, `style`, `template`, `rt` and `rp` is a different string type in
 *   bs4 and is skipped, comments are skipped);
 * - `find` / `find_all` (pre-order descendants);
 * - `decode_contents()` with bs4's "minimal" formatter (escape `&`, `<`, `>`,
 *   void elements written as `<br/>`).
 */

import { parseDocument } from "htmlparser2";
import type { AnyNode, Document, Element } from "domhandler";
import { isComment, isTag, isText } from "domhandler";

import { pyStrip } from "@/lib/py";

const SPECIAL_STRING_CONTAINERS = new Set(["script", "style", "template", "rt", "rp"]);

// bs4 HTMLTreeBuilder.empty_element_tags
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "menuitem",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "basefont",
  "bgsound",
  "command",
  "frame",
  "image",
  "isindex",
  "nextid",
  "spacer",
]);

export function parseHtml(html: string): Document {
  return parseDocument(html, {
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
    recognizeSelfClosing: true,
  });
}

type Parent = Document | Element;

/** Plain text strings under `node`, in document order (bs4 `_all_strings`). */
export function allStrings(node: Parent): string[] {
  const out: string[] = [];
  const walk = (n: AnyNode, inSpecial: boolean) => {
    if (isText(n)) {
      if (!inSpecial) out.push(n.data);
      return;
    }
    if (isTag(n)) {
      const special = inSpecial || SPECIAL_STRING_CONTAINERS.has(n.name);
      for (const c of n.children) walk(c, special);
    } else if ("children" in n && !isComment(n)) {
      for (const c of (n as Parent).children) walk(c, inSpecial);
    }
  };
  const startSpecial =
    isTag(node as AnyNode) && SPECIAL_STRING_CONTAINERS.has((node as Element).name);
  for (const c of node.children) walk(c, startSpecial);
  return out;
}

/** bs4 `get_text(separator, strip=...)`. */
export function getText(node: Parent, separator = "", strip = false): string {
  let strings = allStrings(node);
  if (strip) strings = strings.map((s) => pyStrip(s)).filter((s) => s.length > 0);
  return strings.join(separator);
}

/** bs4 `find_all(name)`: matching descendant elements in pre-order. */
export function findAll(node: Parent, name: string): Element[] {
  const out: Element[] = [];
  const walk = (n: AnyNode) => {
    if (isTag(n)) {
      if (n.name === name) out.push(n);
      for (const c of n.children) walk(c);
    }
  };
  for (const c of node.children) walk(c);
  return out;
}

/** bs4 `find(name)`. */
export function find(node: Parent, name: string): Element | null {
  const walk = (n: AnyNode): Element | null => {
    if (isTag(n)) {
      if (n.name === name) return n;
      for (const c of n.children) {
        const hit = walk(c);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const c of node.children) {
    const hit = walk(c);
    if (hit) return hit;
  }
  return null;
}

const escapeText = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function quoteAttribute(value: string): string {
  let v = escapeText(value);
  if (v.includes('"')) {
    if (v.includes("'")) v = v.replaceAll('"', "&quot;");
    else return `'${v}'`;
  }
  return `"${v}"`;
}

function serialize(n: AnyNode, inRaw: boolean): string {
  if (isText(n)) return inRaw ? n.data : escapeText(n.data);
  if (isComment(n)) return `<!--${n.data}-->`;
  if (isTag(n)) {
    const attrs = Object.entries(n.attribs)
      .map(([k, v]) => ` ${k}=${quoteAttribute(v)}`)
      .join("");
    if (VOID_ELEMENTS.has(n.name) && n.children.length === 0) return `<${n.name}${attrs}/>`;
    const raw = n.name === "script" || n.name === "style";
    return `<${n.name}${attrs}>${n.children.map((c) => serialize(c, raw)).join("")}</${n.name}>`;
  }
  return "";
}

/** bs4 `Tag.decode_contents()` (minimal formatter, no pretty-printing). */
export function decodeContents(el: Element): string {
  return el.children.map((c) => serialize(c, el.name === "script" || el.name === "style")).join("");
}
