(() => {
  const DEFAULT_SETTINGS = {
    workspaceRoot: "",
    attrName: "data-insp-path",
    enabledHosts: ["localhost"],
    modifierKey: "Alt",
  };

  const OVERLAY_ID = "__dom_locator_overlay__";
  const TOOLTIP_ID = "__dom_locator_tooltip__";
  const DIAG_PANEL_ID = "__dom_locator_diag__";
  const TOOLTIP_OFFSET = 10;

  // P0-1: Deterministic error codes
  const ERROR_CODES = {
    E_ATTR_MISSING: "E_ATTR_MISSING",   // element has no inspection attribute
    E_PARSE_INVALID: "E_PARSE_INVALID", // attribute value cannot be parsed
    E_ROOT_EMPTY: "E_ROOT_EMPTY",       // workspace root not configured
    E_OPEN_FAILED: "E_OPEN_FAILED",     // vscode:// protocol trigger failed
  };

  // Phase labels for diagnostics breadcrumb
  const PHASES = ["attr", "parse", "map", "open"];

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    enabledForHost: false,
    inspectMode: false,
    hoverNode: null,
    parsedValue: null,
    rawValue: "",
    frameId: 0,
    lastError: null, // P0-1: track last structured error
  };

  function isAbsolutePath(input) {
    return typeof input === "string" && input.startsWith("/");
  }

  function normalizeRoot(rootPath) {
    return String(rootPath || "").replace(/\/+$/, "");
  }

  function normalizeRelativePath(relativePath) {
    return String(relativePath || "").replace(/^\/+/, "");
  }

  function joinAbsolutePath(rootPath, relativePath) {
    return `${normalizeRoot(rootPath)}/${normalizeRelativePath(relativePath)}`;
  }

  function encodeAbsolutePath(absolutePath) {
    return absolutePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  function buildVsCodeUrl(absolutePath, line, column) {
    const encodedPath = encodeAbsolutePath(absolutePath);
    return `vscode://file${encodedPath}:${line}:${column}`;
  }

  function parseEnabledHosts(input) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function hostMatchesRule(hostname, rule) {
    if (!rule) {
      return false;
    }

    if (rule === "*") {
      return true;
    }

    if (rule.startsWith("*.")) {
      const suffix = rule.slice(1);
      return hostname.endsWith(suffix);
    }

    return hostname === rule;
  }

  function isEnabledForHost(hostname, settings) {
    const rules = parseEnabledHosts(settings.enabledHosts);
    if (rules.length === 0) {
      return false;
    }

    return rules.some((rule) => hostMatchesRule(hostname, rule));
  }

  function parseInspectionValue(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return null;
    }

    const parts = rawValue.split(":");
    if (parts.length < 3) {
      return null;
    }

    for (let index = parts.length - 1; index >= 1; index -= 1) {
      const lineCandidate = Number(parts[index - 1]);
      const columnCandidate = Number(parts[index]);
      if (!Number.isInteger(lineCandidate) || !Number.isInteger(columnCandidate)) {
        continue;
      }

      const relativePath = parts.slice(0, index - 1).join(":");
      const extra = parts.slice(index + 1).join(":");
      if (!relativePath) {
        continue;
      }

      return {
        relativePath,
        line: lineCandidate,
        column: columnCandidate,
        extra,
      };
    }

    return null;
  }

  // P0-1: Compute structured diagnostic for a node interaction
  // Returns null if all phases pass, or { code, phase, detail, raw } on failure.
  function computeDiagnostic(rawValue, settings) {
    // Phase: attr
    if (!rawValue) {
      return {
        code: ERROR_CODES.E_ATTR_MISSING,
        phase: "attr",
        detail: `No attribute "${settings.attrName}" found on element or its ancestors.`,
        raw: "",
      };
    }

    // Phase: parse
    const parsed = parseInspectionValue(rawValue);
    if (!parsed) {
      return {
        code: ERROR_CODES.E_PARSE_INVALID,
        phase: "parse",
        detail: `Cannot parse value. Expected format: "relative/path:line:col". Got: "${rawValue}"`,
        raw: rawValue,
      };
    }

    // Phase: map (workspace root check)
    if (!isAbsolutePath(settings.workspaceRoot)) {
      return {
        code: ERROR_CODES.E_ROOT_EMPTY,
        phase: "map",
        detail: "Workspace root is not configured. Open extension settings and set an absolute path.",
        raw: rawValue,
        parsed,
      };
    }

    return null; // all phases clear
  }

  function getComposedTarget(event) {
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      if (Array.isArray(path) && path.length > 0) {
        return path[0];
      }
    }

    return event.target;
  }

  function findInspectableElement(startNode, attrName) {
    let current = startNode instanceof Node ? startNode : null;

    while (current) {
      if (current.nodeType === Node.ELEMENT_NODE && current.hasAttribute(attrName)) {
        return current;
      }

      if (current.parentNode) {
        current = current.parentNode;
        continue;
      }

      const root = typeof current.getRootNode === "function" ? current.getRootNode() : null;
      if (root && root.host) {
        current = root.host;
        continue;
      }

      current = null;
    }

    return null;
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    let tooltip = document.getElementById(TOOLTIP_ID);

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0 auto auto 0",
        boxSizing: "border-box",
        border: "2px solid #0f766e",
        background: "rgba(15, 118, 110, 0.15)",
        borderRadius: "6px",
        zIndex: "2147483646",
        pointerEvents: "none",
        display: "none",
      });
      document.documentElement.appendChild(overlay);
    }

    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      Object.assign(tooltip.style, {
        position: "fixed",
        maxWidth: "480px",
        padding: "8px 10px",
        fontFamily:
          "ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
        fontSize: "12px",
        lineHeight: "1.4",
        color: "#ecfeff",
        background: "rgba(15, 23, 42, 0.94)",
        border: "1px solid rgba(45, 212, 191, 0.5)",
        borderRadius: "8px",
        boxShadow: "0 8px 30px rgba(15, 23, 42, 0.35)",
        zIndex: "2147483647",
        pointerEvents: "none",
        display: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      });
      document.documentElement.appendChild(tooltip);
    }

    return { overlay, tooltip };
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    const tooltip = document.getElementById(TOOLTIP_ID);

    if (overlay) {
      overlay.style.display = "none";
    }

    if (tooltip) {
      tooltip.style.display = "none";
    }
  }

  function getTooltipText() {
    if (!state.hoverNode) {
      return "";
    }

    if (!state.rawValue) {
      return `[${ERROR_CODES.E_ATTR_MISSING}] No inspection metadata`;
    }

    if (!state.parsedValue) {
      return `[${ERROR_CODES.E_PARSE_INVALID}] Invalid path\n${state.rawValue}`;
    }

    const lines = [
      state.parsedValue.relativePath,
      `${state.parsedValue.line}:${state.parsedValue.column}`,
    ];

    if (!isAbsolutePath(state.settings.workspaceRoot)) {
      lines.push(`[${ERROR_CODES.E_ROOT_EMPTY}] Workspace root not configured`);
    }

    return lines.join("\n");
  }

  // ─── P0-2: Diagnostics Panel ─────────────────────────────────────────────

  function buildPhaseBreadcrumb(failedPhase) {
    return PHASES.map((p) => {
      const phaseDone = PHASES.indexOf(p) < PHASES.indexOf(failedPhase);
      const phaseFailed = p === failedPhase;
      if (phaseFailed) return `${p} ✗`;
      if (phaseDone) return `${p} ✓`;
      return `${p} ○`;
    }).join(" → ");
  }

  function buildDebugBundle(diagnostic) {
    return JSON.stringify(
      {
        code: diagnostic.code,
        phase: diagnostic.phase,
        detail: diagnostic.detail,
        raw: diagnostic.raw || "",
        host: window.location.hostname,
        workspaceRoot: state.settings.workspaceRoot || "",
        attrName: state.settings.attrName,
        url: window.location.href,
        ts: new Date().toISOString(),
      },
      null,
      2
    );
  }

  function showDiagPanel(diagnostic) {
    hideDiagPanel();

    const panel = document.createElement("div");
    panel.id = DIAG_PANEL_ID;

    Object.assign(panel.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      maxWidth: "420px",
      width: "calc(100vw - 40px)",
      padding: "14px 16px",
      fontFamily:
        "ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
      fontSize: "12px",
      lineHeight: "1.5",
      color: "#fef3c7",
      background: "rgba(15, 23, 42, 0.97)",
      border: "1px solid rgba(251, 191, 36, 0.5)",
      borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
      zIndex: "2147483647",
      pointerEvents: "all",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
      color: "#ffffff",
      fontWeight: "bold",
      fontSize: "12px",
    });
    header.innerHTML =
      '<span>🔍 DOM Locator — Diagnostic</span>';

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      background: "none",
      border: "none",
      color: "#94a3b8",
      cursor: "pointer",
      fontSize: "14px",
      padding: "0 0 0 8px",
      lineHeight: "1",
    });
    closeBtn.addEventListener("click", hideDiagPanel);
    header.appendChild(closeBtn);

    const divider = document.createElement("div");
    Object.assign(divider.style, {
      borderTop: "1px solid rgba(255,255,255,0.1)",
      marginBottom: "10px",
    });

    const codeEl = document.createElement("div");
    Object.assign(codeEl.style, { color: "#fca5a5", fontWeight: "bold", marginBottom: "6px" });
    codeEl.textContent = `⚠ ${diagnostic.code}`;

    const breadcrumb = document.createElement("div");
    Object.assign(breadcrumb.style, { color: "#93c5fd", marginBottom: "8px", fontSize: "11px" });
    breadcrumb.textContent = `Phase: ${buildPhaseBreadcrumb(diagnostic.phase)}`;

    const detail = document.createElement("div");
    Object.assign(detail.style, { color: "#e2e8f0", marginBottom: "10px" });
    detail.textContent = diagnostic.detail;

    if (diagnostic.raw) {
      const rawEl = document.createElement("div");
      Object.assign(rawEl.style, {
        color: "#94a3b8",
        fontSize: "11px",
        marginBottom: "10px",
        wordBreak: "break-all",
      });
      rawEl.textContent = `Raw: ${diagnostic.raw}`;
      panel.appendChild(header);
      panel.appendChild(divider);
      panel.appendChild(codeEl);
      panel.appendChild(breadcrumb);
      panel.appendChild(detail);
      panel.appendChild(rawEl);
    } else {
      panel.appendChild(header);
      panel.appendChild(divider);
      panel.appendChild(codeEl);
      panel.appendChild(breadcrumb);
      panel.appendChild(detail);
    }

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy debug info";
    Object.assign(copyBtn.style, {
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.15)",
      color: "#e2e8f0",
      cursor: "pointer",
      fontSize: "11px",
      padding: "4px 10px",
      borderRadius: "5px",
    });
    copyBtn.addEventListener("click", () => {
      const bundle = buildDebugBundle(diagnostic);
      navigator.clipboard
        .writeText(bundle)
        .then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy debug info";
          }, 1500);
        })
        .catch(() => {
          copyBtn.textContent = "Copy failed";
        });
    });
    panel.appendChild(copyBtn);

    document.documentElement.appendChild(panel);
    state.lastError = diagnostic;
  }

  function hideDiagPanel() {
    const panel = document.getElementById(DIAG_PANEL_ID);
    if (panel) {
      panel.remove();
    }
    state.lastError = null;
  }

  // ─────────────────────────────────────────────────────────────────────────

  function updateOverlayPosition() {
    state.frameId = 0;

    if (!state.inspectMode || !state.hoverNode || !document.documentElement.contains(state.hoverNode)) {
      hideOverlay();
      return;
    }

    const { overlay, tooltip } = ensureOverlay();
    const rect = state.hoverNode.getBoundingClientRect();

    if (rect.width <= 0 && rect.height <= 0) {
      hideOverlay();
      return;
    }

    overlay.style.display = "block";
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    tooltip.style.display = "block";
    tooltip.textContent = getTooltipText();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipRect = tooltip.getBoundingClientRect();
    const preferredTop = rect.top - tooltipRect.height - TOOLTIP_OFFSET;
    const fallbackTop = rect.bottom + TOOLTIP_OFFSET;
    const top = preferredTop >= 8 ? preferredTop : Math.min(fallbackTop, viewportHeight - tooltipRect.height - 8);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, viewportWidth - tooltipRect.width - 8)
    );

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function scheduleOverlayUpdate() {
    if (state.frameId) {
      return;
    }

    state.frameId = window.requestAnimationFrame(updateOverlayPosition);
  }

  function setHoverNode(node) {
    if (state.hoverNode === node) {
      scheduleOverlayUpdate();
      return;
    }

    state.hoverNode = node;
    state.rawValue = node ? node.getAttribute(state.settings.attrName) || "" : "";
    state.parsedValue = parseInspectionValue(state.rawValue);
    scheduleOverlayUpdate();
  }

  function enableInspectMode() {
    if (!state.enabledForHost || state.inspectMode) {
      return;
    }

    state.inspectMode = true;
    document.documentElement.style.cursor = "crosshair";
  }

  function disableInspectMode() {
    if (!state.inspectMode) {
      return;
    }

    state.inspectMode = false;
    state.hoverNode = null;
    state.parsedValue = null;
    state.rawValue = "";
    document.documentElement.style.cursor = "";
    hideOverlay();
    hideDiagPanel();
  }

  function isModifierEvent(event) {
    return event.key === state.settings.modifierKey;
  }

  function openVsCodeLink(absolutePath, line, column) {
    const url = buildVsCodeUrl(absolutePath, line, column);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.style.display = "none";
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function handleMouseMove(event) {
    if (!state.inspectMode || !state.enabledForHost) {
      return;
    }

    const startNode = getComposedTarget(event);
    const match = findInspectableElement(startNode, state.settings.attrName);
    setHoverNode(match);
  }

  function handleClick(event) {
    if (!state.inspectMode || !state.enabledForHost) {
      return;
    }

    const startNode = getComposedTarget(event);
    const match = findInspectableElement(startNode, state.settings.attrName);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // P0-1 + P0-2: Compute diagnostic before attempting open
    const rawValue = match ? match.getAttribute(state.settings.attrName) || "" : "";
    const diagnostic = computeDiagnostic(rawValue, state.settings);

    if (diagnostic) {
      setHoverNode(match);
      showDiagPanel(diagnostic);
      return;
    }

    // All phases clear — attempt to open
    hideDiagPanel();
    const parsedValue = parseInspectionValue(rawValue);
    const absolutePath = joinAbsolutePath(state.settings.workspaceRoot, parsedValue.relativePath);
    openVsCodeLink(absolutePath, parsedValue.line, parsedValue.column);
  }

  function handleKeyDown(event) {
    if (!isModifierEvent(event)) {
      // Allow Escape to close diagnostics panel even outside inspect mode
      if (event.key === "Escape" && state.lastError) {
        hideDiagPanel();
      }
      return;
    }

    enableInspectMode();
  }

  function handleKeyUp(event) {
    if (!isModifierEvent(event)) {
      return;
    }

    disableInspectMode();
  }

  function handleWindowBlur() {
    disableInspectMode();
  }

  function handleViewportChange() {
    if (state.inspectMode) {
      scheduleOverlayUpdate();
    }
  }

  function applySettings(settings) {
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      enabledHosts: parseEnabledHosts(settings.enabledHosts),
    };
    state.enabledForHost = isEnabledForHost(window.location.hostname, state.settings);

    if (!state.enabledForHost) {
      disableInspectMode();
    } else if (state.inspectMode) {
      scheduleOverlayUpdate();
    }
  }

  function fetchSettings() {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        applySettings(DEFAULT_SETTINGS);
        return;
      }

      applySettings(response.settings);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const nextSettings = { ...state.settings };
    for (const [key, change] of Object.entries(changes)) {
      nextSettings[key] = change.newValue;
    }
    applySettings(nextSettings);
  });

  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);

  fetchSettings();
})();
