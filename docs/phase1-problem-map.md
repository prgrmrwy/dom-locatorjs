# DOM Locator Phase-1 Problem Map

## Scope Guard (must stay in)
- Chrome only
- Dev env only
- Page already has `data-insp-path`-like metadata
- Browser consumer layer only (parse/highlight/click/open/diagnostics)
- VS Code default only

## Out of Scope (phase-1)
- Metadata injection pipeline redesign
- React Fiber/DevTools internals route
- Production env support
- Cross-domain iframe topology
- Full IDE matrix

---

## Community Signal (initial)

### A. Attr exists but parse/open fails
1. Metadata format variability (`path:line:col:extra` with extra `:` segments) causes parser ambiguity
2. Path value includes edge chars/spaces/Windows-like fragments causing malformed `vscode://` URLs
3. `Alt+Click` can be swallowed by page listeners or framework overlays

### B. Attr exists but mapping fails (workspace mismatch)
1. Monorepo sub-package path cannot resolve under single root
2. Runtime host and code workspace drift (multi-app local env)
3. Symlink/pnpm workspace path mismatch

### C. Editor open chain unstable
1. Browser external protocol prompt behavior differs and user thinks action failed
2. `vscode://` opens empty tab when line/column malformed
3. No structured error when background open fails

### D. Config/rule driven failures
1. Host whitelist too strict/too loose; user cannot quickly confirm current host state
2. Attr key mismatch (`data-insp-path` vs custom key) with no obvious diagnosis
3. Modifier conflict (`Alt` with browser/page default behavior)

### E. Diagnostics missing (highest pain)
1. User cannot answer "why this click failed?" in one glance
2. No phase breakdown: attr read -> parse -> map -> protocol -> browser open
3. No copyable debug bundle for issue report

---

## Product Capability Buckets

1. **Readability**: attr detection + target element resolution
2. **Parseability**: raw metadata parse/validation
3. **Mappability**: relative path -> absolute path correctness
4. **Openability**: protocol trigger + callback/error visibility
5. **Diagnosability**: structured, copyable failure reasons

---

## Current Code Baseline (as-is)
- ✅ Highlight + tooltip
- ✅ Alt + click open flow
- ✅ Custom attr / host list / single workspace in options
- ⚠️ Broad permissions (`<all_urls>`, `tabs`, `activeTab`) need tighten plan for store review
- ⚠️ No structured diagnostics panel (only transient status/toast)
- ⚠️ No path mapping layer (single root only)
- ⚠️ No explicit failure taxonomy surfaced to user

---

## Phase-1 Candidate Fixes (prioritized)

P0 (stability + diagnostics first)
1. Add deterministic error codes (E_ATTR_MISSING / E_PARSE_INVALID / E_ROOT_EMPTY / E_OPEN_FAILED)
2. Add in-page mini diagnostics state block (toggleable)
3. Add options-page diagnostics test matrix (host/attr/root/open)

P1 (small but high leverage)
4. Improve parser tolerance with explicit validation output
5. Add safe URL construction + preflight checks for path/line/column
6. Improve host matching introspection (show which rule matched)

P2 (planned-pro marker only, not full build)
7. Add config schema placeholders for multi-workspace and prefix mapping (feature flagged, disabled)
