/**
 * Builds docs/catalogue.md: a map of every source file in the repo — what it is for, what it exports
 * (with each export's one-line doc), what it depends on — plus the Python tools and generated assets.
 * Generated from the code with the TypeScript compiler API, so it can't drift: a test fails when the
 * committed catalogue differs from a fresh build (run `pnpm catalogue` to update it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/..." and resolves to "D:\D:\...".
const HERE = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(HERE), "..", "..");
export const OUT = path.join(ROOT, "docs", "catalogue.md");

const PACKAGES: { dir: string; title: string; about: string }[] = [
  { dir: "shared/src", title: "shared", about: "Pure game logic and data used by server and client. No Phaser, Colyseus or Node imports." },
  { dir: "server/src", title: "server", about: "Colyseus server. `game/` is the network-free simulation; `rooms/` forwards messages and mirrors it into the schema." },
  { dir: "client/src", title: "client", about: "Phaser 3 + Vite client: rendering, prediction, cinematics, audio, DOM UI." },
  { dir: "desktop/src", title: "desktop", about: "Electron shell: embedded server, UPnP host report, app:// protocol." },
  { dir: "tools/catalogue", title: "tools/catalogue", about: "This catalogue's generator." },
];

interface ExportInfo {
  name: string;
  kind: string;
  doc: string;
}

interface FileInfo {
  rel: string;
  about: string;
  exports: ExportInfo[];
  localDeps: string[];
  packages: string[];
  test: boolean;
}

function walk(dir: string, ext: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (ext.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** First sentence of a doc comment, on one line. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  return (m ? m[1] : flat).slice(0, 220);
}

function jsDocOf(node: ts.Node, sf: ts.SourceFile): string {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const c = sf.text.slice(ranges[i].pos, ranges[i].end);
    if (c.startsWith("/**")) return c.replace(/^\/\*\*|\*\/$/g, "").replace(/^\s*\* ?/gm, "").trim();
  }
  return "";
}

function kindOf(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) return "const";
  return "export";
}

function analyse(file: string): FileInfo {
  // Line endings vary with the checkout (Windows CI uses CRLF); the catalogue must not.
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const exports: ExportInfo[] = [];
  const localDeps = new Set<string>();
  const packages = new Set<string>();
  let about = "";

  // A file comment is a /** */ block at the very top that isn't attached to an export, or the
  // doc of the first statement when that's the only documentation.
  const head = ts.getLeadingCommentRanges(text, 0) ?? [];
  for (const r of head) {
    const c = text.slice(r.pos, r.end);
    if (c.startsWith("/**") || c.startsWith("//")) {
      about = firstSentence(c.replace(/^\/\*\*|\*\/$/g, "").replace(/^\s*(\*|\/\/) ?/gm, ""));
      break;
    }
  }

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || (ts.isExportDeclaration(st) && st.moduleSpecifier)) {
      const spec = (st.moduleSpecifier as ts.StringLiteral).text;
      if (spec.startsWith(".")) {
        const target = path.relative(ROOT, path.resolve(path.dirname(file), spec)).split(path.sep).join("/").replace(/\.js$/, "");
        localDeps.add(target);
        if (ts.isExportDeclaration(st)) exports.push({ name: `* from "${spec}"`, kind: "re-export", doc: "" });
      } else packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const doc = firstSentence(jsDocOf(st, sf));
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) exports.push({ name: d.name.getText(sf), kind: "const", doc });
    } else {
      const name = (st as ts.DeclarationStatement).name?.getText(sf) ?? "default";
      exports.push({ name, kind: kindOf(st), doc });
    }
  }
  if (!about) {
    // Otherwise the first doc comment anywhere in the file, then the first export's doc.
    const m = /\/\*\*([\s\S]*?)\*\//.exec(text);
    about = m ? firstSentence(m[1].replace(/^\s*\* ?/gm, "")) : (exports[0]?.doc ?? "");
  }
  return { rel, about, exports, localDeps: [...localDeps].sort(), packages: [...packages].sort(), test: /\.test\.ts$/.test(file) };
}

function pythonTools(): string[] {
  const lines: string[] = [];
  for (const file of walk(path.join(ROOT, "tools"), /\.py$/)) {
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const doc = /^"""([\s\S]*?)"""/m.exec(text)?.[1] ?? "";
    const defs = [...text.matchAll(/^def ([a-zA-Z]\w*)\(/gm)].map((m) => m[1]);
    lines.push(`| \`${rel}\` | ${firstSentence(doc) || "—"} | ${defs.map((d) => `\`${d}\``).join(", ") || "—"} |`);
  }
  return lines;
}

function assets(): string[] {
  const base = path.join(ROOT, "client", "public", "assets");
  const lines: string[] = [];
  for (const dir of fs.existsSync(base) ? fs.readdirSync(base).sort() : []) {
    const files = fs.readdirSync(path.join(base, dir)).sort();
    const names = files.map((f) => f.replace(/\.(png|json|ogg|webp)$/, "")).filter((v, i, a) => a.indexOf(v) === i);
    lines.push(`- **\`client/public/assets/${dir}/\`** (${files.length} files): ${names.map((n) => `\`${n}\``).join(", ")}`);
  }
  return lines;
}

const esc = (s: string) => s.replace(/\|/g, "\\|");

export function buildCatalogue(): string {
  const out: string[] = [
    "# Broken Ash — code catalogue",
    "",
    "> Generated by `tools/catalogue/catalogue.ts` (`pnpm catalogue`). Don't edit by hand: a test fails when",
    "> this file is out of date. For architecture and conventions see `CLAUDE.md`; for the game, `docs/design.md`.",
    "",
  ];
  const all = PACKAGES.map((p) => ({ ...p, files: walk(path.join(ROOT, p.dir), /\.ts$/).map(analyse) }));
  out.push("## Contents", "");
  for (const p of all) out.push(`- [${p.title}](#${p.title.replace(/\//g, "")}) — ${p.files.filter((f) => !f.test).length} files, ${p.files.filter((f) => f.test).length} test files`);
  out.push("- [Python tools](#python-tools)", "- [Generated assets](#generated-assets)", "");

  for (const p of all) {
    out.push(`## ${p.title}`, "", p.about, "");
    out.push("| File | Purpose | Exports | Depends on |", "|---|---|---|---|");
    for (const f of p.files.filter((x) => !x.test)) {
      const exps = f.exports.map((e) => (e.kind === "re-export" ? e.name : `\`${e.name}\``)).join(", ") || "—";
      const deps = [...f.localDeps.map((d) => `\`${d}\``), ...f.packages.map((x) => `${x}`)].join(", ") || "—";
      out.push(`| \`${f.rel}\` | ${esc(f.about) || "—"} | ${esc(exps)} | ${esc(deps)} |`);
    }
    const tests = p.files.filter((x) => x.test);
    if (tests.length) out.push("", `Tests: ${tests.map((t) => `\`${t.rel}\``).join(", ")}`);
    const documented = p.files.filter((f) => !f.test).flatMap((f) => f.exports.filter((e) => e.doc).map((e) => ({ f, e })));
    if (documented.length) {
      out.push("", "<details><summary>Exported symbols</summary>", "");
      for (const { f, e } of documented) out.push(`- \`${e.name}\` (${e.kind}, \`${f.rel}\`) — ${e.doc}`);
      out.push("", "</details>");
    }
    out.push("");
  }
  out.push("## Python tools", "", "| File | Purpose | Functions |", "|---|---|---|", ...pythonTools(), "");
  out.push("## Generated assets", "", ...assets(), "");
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  fs.writeFileSync(OUT, buildCatalogue());
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
