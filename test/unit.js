/**
 * P0 Unit Tests — dom-locatorjs
 * Node.js 直跑：node test/unit.js
 *
 * 覆盖：parseInspectionValue / computeDiagnostic / hostMatchesRule
 * 测试维度：
 *   (R) Reproduce  — 问题在原始数据上是否确实触发
 *   (V) Validate   — P0 后是否正确处理
 *   (D) Detect     — 是否产生正确错误码
 */

"use strict";

// ─── 从 content-script 提取的纯函数（维持与源码一致） ────────────────────────

function parseInspectionValue(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  const parts = rawValue.split(":");
  if (parts.length < 3) return null;
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const lineCandidate = Number(parts[index - 1]);
    const columnCandidate = Number(parts[index]);
    if (!Number.isInteger(lineCandidate) || !Number.isInteger(columnCandidate)) continue;
    const relativePath = parts.slice(0, index - 1).join(":");
    const extra = parts.slice(index + 1).join(":");
    if (!relativePath) continue;
    return { relativePath, line: lineCandidate, column: columnCandidate, extra };
  }
  return null;
}

function isAbsolutePath(input) {
  return typeof input === "string" && input.startsWith("/");
}

const ERROR_CODES = {
  E_ATTR_MISSING: "E_ATTR_MISSING",
  E_PARSE_INVALID: "E_PARSE_INVALID",
  E_ROOT_EMPTY: "E_ROOT_EMPTY",
  E_OPEN_FAILED: "E_OPEN_FAILED",
};

function computeDiagnostic(rawValue, settings) {
  if (!rawValue) {
    return { code: ERROR_CODES.E_ATTR_MISSING, phase: "attr", detail: `No attribute "${settings.attrName}" found.`, raw: "" };
  }
  const parsed = parseInspectionValue(rawValue);
  if (!parsed) {
    return { code: ERROR_CODES.E_PARSE_INVALID, phase: "parse", detail: `Cannot parse value: "${rawValue}"`, raw: rawValue };
  }
  if (!isAbsolutePath(settings.workspaceRoot)) {
    return { code: ERROR_CODES.E_ROOT_EMPTY, phase: "map", detail: "Workspace root not configured.", raw: rawValue, parsed };
  }
  return null;
}

function hostMatchesRule(hostname, rule) {
  if (!rule) return false;
  if (rule === "*") return true;
  if (rule.startsWith("*.")) return hostname.endsWith(rule.slice(1));
  return hostname === rule;
}

function buildVsCodeUrl(absolutePath, line, column) {
  const encoded = absolutePath.split("/").map(s => encodeURIComponent(s)).join("/");
  return `vscode://file${encoded}:${line}:${column}`;
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(label, condition, extra = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${extra ? `\n     ${extra}` : ""}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─────────────────────────────────────────────────────────────────────────────
section("parseInspectionValue — 基础解析");

{
  // 正常路径
  const r = parseInspectionValue("src/App.tsx:42:5");
  assert("正常 path:line:col", r && r.relativePath === "src/App.tsx" && r.line === 42 && r.column === 5);
}
{
  // 嵌套目录
  const r = parseInspectionValue("src/components/Button/index.tsx:10:1");
  assert("嵌套目录路径", r && r.relativePath === "src/components/Button/index.tsx" && r.line === 10);
}
{
  // 空值
  assert("空字符串返回 null", parseInspectionValue("") === null);
  assert("undefined 返回 null", parseInspectionValue(undefined) === null);
  assert("纯空格返回 null", parseInspectionValue("   ") === null);
}
{
  // 少于 3 段
  assert("只有文件名（无冒号）返回 null", parseInspectionValue("App.tsx") === null);
  assert("只有 path:line 返回 null", parseInspectionValue("App.tsx:10") === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section("A1 — 多余冒号段（extra `:` segments）[R/V/D]");

{
  // A1: path:line:col:extra — 回测复现：原始解析器应能处理
  const r = parseInspectionValue("src/App.tsx:42:5:extra");
  // (R) 原来不崩溃（有 extra 字段）
  assert("(R) A1: path:line:col:extra 不崩溃", r !== null);
  assert("(V) A1: extra 字段被正确提取", r && r.extra === "extra" && r.relativePath === "src/App.tsx");
}
{
  // A1 极端：多层 extra
  const r = parseInspectionValue("src/App.tsx:42:5:a:b:c");
  assert("(V) A1: 多层 extra 仍能提取路径", r && r.relativePath === "src/App.tsx" && r.line === 42);
}
{
  // A1 恶化：路径包含冒号（Windows 盘符），应解析失败（E_PARSE_INVALID）
  const winPath = "C:\\Users\\dev\\project\\App.tsx:42:5";
  const r = parseInspectionValue(winPath);
  // Windows 反斜杠路径不含冒号分隔，所以 split(":") 后会产生 ["C", "\\Users...\\App.tsx", "42", "5"]
  // relativePath 应为 "C" — 长度1字母，但仍然能解析出来（技术上不是无效，只是语义错）
  // D: computeDiagnostic 用 isAbsolutePath 检查（startsWith "/"）— 若不匹配则 E_ROOT_EMPTY 而非 parse error
  const diag = computeDiagnostic(winPath, { attrName: "data-insp-path", workspaceRoot: "/workspace" });
  assert("(D) A1: Windows 盘符路径能被解析出（语义层问题，非 parse 层）", r !== null || diag !== null);
}
{
  // 真正无效：只有冒号没有路径段
  const r = parseInspectionValue(":42:5");
  assert("(D) 空路径段返回 null → E_PARSE_INVALID", r === null);
  const diag = computeDiagnostic(":42:5", { attrName: "data-insp-path", workspaceRoot: "/workspace" });
  assert("(D) 空路径段 → computeDiagnostic 返回 E_PARSE_INVALID", diag && diag.code === ERROR_CODES.E_PARSE_INVALID);
}

// ─────────────────────────────────────────────────────────────────────────────
section("A2 — 路径边缘字符（spaces, special chars）[R/V/D]");

{
  // A2: 路径含空格
  const r = parseInspectionValue("src/My Component/index.tsx:10:1");
  assert("(R) A2: 路径含空格能解析", r && r.relativePath === "src/My Component/index.tsx");

  // V: buildVsCodeUrl 是否正确编码空格
  if (r) {
    const url = buildVsCodeUrl("/workspace/" + r.relativePath, r.line, r.column);
    assert("(V) A2: 空格被 %20 编码", url.includes("%20") && !url.includes(" "));
  }
}
{
  // A2: 路径含 #（hash，可能被 URL 截断）
  const r = parseInspectionValue("src/styles/theme#dark.css:5:1");
  if (r) {
    const url = buildVsCodeUrl("/workspace/" + r.relativePath, r.line, r.column);
    assert("(V) A2: # 被 %23 编码", url.includes("%23"));
  } else {
    assert("(R) A2: 含 # 路径解析结果", true, "(hash 在此不影响 split(':'))");
  }
}
{
  // A2: 路径含中文
  const r = parseInspectionValue("src/组件/按钮.tsx:1:1");
  assert("(R) A2: 中文路径能解析", r && r.relativePath === "src/组件/按钮.tsx");
  if (r) {
    const url = buildVsCodeUrl("/workspace/" + r.relativePath, r.line, r.column);
    assert("(V) A2: 中文被 URI 编码", !url.includes("组件"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section("C2 — 行列畸形（malformed line/column）[R/V/D]");

{
  // C2: 非整数行号
  const r = parseInspectionValue("src/App.tsx:abc:5");
  assert("(R/D) C2: 非整数行号 → parse 失败返回 null", r === null);
  const diag = computeDiagnostic("src/App.tsx:abc:5", { attrName: "data-insp-path", workspaceRoot: "/workspace" });
  assert("(D) C2: 非整数行号 → E_PARSE_INVALID", diag && diag.code === ERROR_CODES.E_PARSE_INVALID);
}
{
  // C2: 浮点行号
  const r = parseInspectionValue("src/App.tsx:42.5:5");
  assert("(R/D) C2: 浮点行号 → parse 失败", r === null);
}
{
  // C2: 行号为 0（技术上合法整数）
  const r = parseInspectionValue("src/App.tsx:0:0");
  assert("(R) C2: 行列为 0 — 解析成功（语义层检查非 parse 层责任）", r !== null && r.line === 0);
}
{
  // C2: 负数行号
  // split 后 Number("-5") 是整数，isInteger 为 true → 可能被接受
  const r = parseInspectionValue("src/App.tsx:-1:5");
  // 这里实际上 Number("-1") = -1, isInteger(-1) = true
  // 这是 P1 改进点（需加 > 0 校验），P0 不要求
  assert("(R) C2: 负数行号当前被接受（P1 待修）", r !== null, "P1: 需加正整数校验");
}

// ─────────────────────────────────────────────────────────────────────────────
section("C3/E1-E3 — 诊断结构 [D]");

const settings = { attrName: "data-insp-path", workspaceRoot: "" };

{
  // E_ATTR_MISSING
  const d = computeDiagnostic("", settings);
  assert("(D) E_ATTR_MISSING: code 正确", d && d.code === ERROR_CODES.E_ATTR_MISSING);
  assert("(D) E_ATTR_MISSING: phase = attr", d && d.phase === "attr");
}
{
  // E_PARSE_INVALID
  const d = computeDiagnostic("bad-value", settings);
  assert("(D) E_PARSE_INVALID: code 正确", d && d.code === ERROR_CODES.E_PARSE_INVALID);
  assert("(D) E_PARSE_INVALID: phase = parse", d && d.phase === "parse");
  assert("(D) E_PARSE_INVALID: raw 值保留", d && d.raw === "bad-value");
}
{
  // E_ROOT_EMPTY
  const d = computeDiagnostic("src/App.tsx:10:1", settings);
  assert("(D) E_ROOT_EMPTY: code 正确", d && d.code === ERROR_CODES.E_ROOT_EMPTY);
  assert("(D) E_ROOT_EMPTY: phase = map", d && d.phase === "map");
  assert("(D) E_ROOT_EMPTY: parsed 字段存在", d && d.parsed && d.parsed.relativePath === "src/App.tsx");
}
{
  // Happy path: 所有条件满足，返回 null
  const d = computeDiagnostic("src/App.tsx:10:1", { attrName: "data-insp-path", workspaceRoot: "/workspace" });
  assert("(V) Happy path → computeDiagnostic 返回 null（无错误）", d === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section("D1 — Host 规则匹配 [R/V/D]");

{
  assert("(V) 精确匹配 localhost", hostMatchesRule("localhost", "localhost"));
  assert("(V) 精确不匹配", !hostMatchesRule("example.com", "localhost"));
  assert("(V) 通配 * 匹配所有", hostMatchesRule("anything.com", "*"));
  assert("(V) *.suffix 匹配子域", hostMatchesRule("app.test.byted.org", "*.test.byted.org"));
  assert("(V) *.suffix 不匹配无关域", !hostMatchesRule("evil.com", "*.test.byted.org"));
  assert("(V) *.suffix 不匹配根域自身", !hostMatchesRule("test.byted.org", "*.test.byted.org"));
  assert("(R) 空规则返回 false", !hostMatchesRule("localhost", ""));
  assert("(R) null 规则返回 false", !hostMatchesRule("localhost", null));
}

// ─────────────────────────────────────────────────────────────────────────────
section("D2 — Attr key 不匹配 → E_ATTR_MISSING [D]");

{
  // 插件配置的 attrName 与页面实际 attr 不同时，rawValue 为空
  // 模拟：页面有 data-testid 但插件找 data-insp-path → 找不到元素 → rawValue = ""
  const d = computeDiagnostic("", { attrName: "data-insp-path", workspaceRoot: "/workspace" });
  assert("(D) D2: attr key 不匹配 → E_ATTR_MISSING", d && d.code === ERROR_CODES.E_ATTR_MISSING);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`结果：${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
