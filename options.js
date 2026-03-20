const DEFAULT_SETTINGS = {
  workspaceRoot: "",
  attrName: "data-insp-path",
  enabledHosts: ["localhost"],
  modifierKey: "Alt",
};

function getElements() {
  return {
    form: document.getElementById("settings-form"),
    workspaceRoot: document.getElementById("workspaceRoot"),
    attrName: document.getElementById("attrName"),
    enabledHosts: document.getElementById("enabledHosts"),
    modifierKey: document.getElementById("modifierKey"),
    resetButton: document.getElementById("resetButton"),
    testButton: document.getElementById("testButton"),
    status: document.getElementById("status"),
  };
}

function setStatus(message, variant = "") {
  const { status } = getElements();
  status.textContent = message;
  if (variant) {
    status.dataset.variant = variant;
  } else {
    delete status.dataset.variant;
  }
}

function parseHostsInput(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeHosts(hosts) {
  return Array.isArray(hosts) ? hosts.join("\n") : "";
}

function isAbsoluteRootPath(p) {
  if (typeof p !== "string") return false;
  // macOS/Linux: starts with /
  if (p.startsWith("/")) return true;
  // Windows: D:\ or D:/
  if (/^[A-Za-z]:[/\\]/.test(p)) return true;
  return false;
}

function validateSettings(settings) {
  if (!settings.attrName.trim()) {
    return "Attribute name is required.";
  }

  if (settings.workspaceRoot && !isAbsoluteRootPath(settings.workspaceRoot)) {
    return "Workspace root must be an absolute path (e.g. /Users/name/project or D:\\project).";
  }

  if (settings.enabledHosts.length === 0) {
    return "At least one host rule is required.";
  }

  return "";
}

function readForm() {
  const elements = getElements();
  return {
    workspaceRoot: elements.workspaceRoot.value.trim(),
    attrName: elements.attrName.value.trim() || DEFAULT_SETTINGS.attrName,
    enabledHosts: parseHostsInput(elements.enabledHosts.value),
    modifierKey: elements.modifierKey.value,
  };
}

function writeForm(settings) {
  const elements = getElements();
  elements.workspaceRoot.value = settings.workspaceRoot || "";
  elements.attrName.value = settings.attrName || DEFAULT_SETTINGS.attrName;
  elements.enabledHosts.value = serializeHosts(settings.enabledHosts);
  elements.modifierKey.value = settings.modifierKey || DEFAULT_SETTINGS.modifierKey;
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  writeForm(settings);
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = readForm();
  const validationError = validateSettings(settings);

  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  await chrome.storage.sync.set(settings);
  setStatus("Settings saved.", "success");
}

async function resetDefaults() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  writeForm(DEFAULT_SETTINGS);
  setStatus("Defaults restored.", "success");
}

async function testVsCodeLink() {
  const settings = readForm();
  const validationError = validateSettings({
    ...settings,
    enabledHosts: settings.enabledHosts.length ? settings.enabledHosts : DEFAULT_SETTINGS.enabledHosts,
  });

  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  if (!settings.workspaceRoot) {
    setStatus("Workspace root is required for the test link.", "error");
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "OPEN_IN_VSCODE",
      payload: {
        absolutePath: settings.workspaceRoot,
        line: 1,
        column: 1,
      },
    },
    (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        setStatus("Unable to trigger VS Code link.", "error");
        return;
      }

      setStatus("VS Code link triggered. Check Chrome's external protocol prompt.", "success");
    }
  );
}

// ─── P0-3: Diagnostics Test Matrix ───────────────────────────────────────────

function hostMatchesRule(hostname, rule) {
  if (!rule) return false;
  if (rule === "*") return true;
  if (rule.startsWith("*.")) return hostname.endsWith(rule.slice(1));
  return hostname === rule;
}

function renderDiagRow(phase, status, detail) {
  // status: "ok" | "fail" | "warn"
  const icons = { ok: "✅", fail: "❌", warn: "⚠️" };
  const row = document.createElement("div");
  row.className = "diag-row";
  row.dataset.status = status;

  const icon = document.createElement("span");
  icon.className = "diag-icon";
  icon.textContent = icons[status] || "○";

  const body = document.createElement("div");
  body.className = "diag-body";

  const phaseEl = document.createElement("div");
  phaseEl.className = "diag-phase";
  phaseEl.textContent = phase;

  const detailEl = document.createElement("div");
  detailEl.className = "diag-detail";
  detailEl.textContent = detail;

  body.appendChild(phaseEl);
  body.appendChild(detailEl);
  row.appendChild(icon);
  row.appendChild(body);
  return row;
}

async function runDiagnosticsMatrix() {
  const diagResults = document.getElementById("diagResults");
  const diagButton = document.getElementById("diagButton");
  diagResults.innerHTML = "";
  diagButton.disabled = true;
  diagButton.textContent = "Running…";

  const settings = readForm();
  const rows = [];

  // Test 1: Host Rule (check active tab hostname against rules)
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.url && !tab.url.startsWith("chrome://")) {
      const hostname = new URL(tab.url).hostname;
      const rules = settings.enabledHosts;
      const matched = rules.some((r) => hostMatchesRule(hostname, r));
      rows.push(
        renderDiagRow(
          "Host Rule",
          matched ? "ok" : "fail",
          matched
            ? `"${hostname}" matches your host rules`
            : `"${hostname}" does not match any host rule — add it to Enabled Hosts`
        )
      );
    } else if (tab && tab.url && tab.url.startsWith("chrome://")) {
      rows.push(
        renderDiagRow("Host Rule", "warn", "Active tab is a Chrome internal page — open a dev page to test")
      );
    } else {
      rows.push(
        renderDiagRow("Host Rule", "warn", "No active tab found — open a dev page and retry")
      );
    }
  } catch (_) {
    rows.push(renderDiagRow("Host Rule", "warn", "Cannot access active tab"));
  }

  // Test 2: Attribute Name
  const attrOk = Boolean(settings.attrName && settings.attrName.trim());
  rows.push(
    renderDiagRow(
      "Attribute Name",
      attrOk ? "ok" : "fail",
      attrOk
        ? `Looking for: ${settings.attrName}`
        : "No attribute name configured — use default \"data-insp-path\""
    )
  );

  // Test 3: Workspace Root
  if (!settings.workspaceRoot) {
    rows.push(
      renderDiagRow("Workspace Root", "fail", "[E_ROOT_EMPTY] Not configured — set an absolute path above")
    );
  } else if (!settings.workspaceRoot.startsWith("/")) {
    rows.push(
      renderDiagRow(
        "Workspace Root",
        "fail",
        `[E_ROOT_EMPTY] "${settings.workspaceRoot}" is not an absolute path (must start with /)`
      )
    );
  } else {
    rows.push(
      renderDiagRow("Workspace Root", "ok", `Configured: ${settings.workspaceRoot}`)
    );
  }

  // Test 4: VS Code Open (attempt vscode:// link via background)
  const openResult = await new Promise((resolve) => {
    if (!settings.workspaceRoot || !settings.workspaceRoot.startsWith("/")) {
      resolve({ ok: false, skipped: true });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "OPEN_IN_VSCODE",
        payload: { absolutePath: settings.workspaceRoot, line: 1, column: 1 },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { ok: false, error: "No response" });
      }
    );
  });

  if (openResult.skipped) {
    rows.push(
      renderDiagRow(
        "VS Code Open",
        "warn",
        "[E_OPEN_FAILED] Skipped — configure workspace root first"
      )
    );
  } else if (openResult.ok) {
    rows.push(
      renderDiagRow("VS Code Open", "ok", "VS Code link triggered — check if the file opened")
    );
  } else {
    rows.push(
      renderDiagRow(
        "VS Code Open",
        "fail",
        `[E_OPEN_FAILED] ${openResult.error || "Failed to open VS Code link"}`
      )
    );
  }

  for (const row of rows) {
    diagResults.appendChild(row);
  }

  diagButton.disabled = false;
  diagButton.textContent = "Run Diagnostics";
}

// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
  const elements = getElements();
  elements.form.addEventListener("submit", saveSettings);
  elements.resetButton.addEventListener("click", resetDefaults);
  elements.testButton.addEventListener("click", testVsCodeLink);

  const diagButton = document.getElementById("diagButton");
  if (diagButton) {
    diagButton.addEventListener("click", () => {
      runDiagnosticsMatrix().catch(() => {
        const diagResults = document.getElementById("diagResults");
        if (diagResults) diagResults.textContent = "Diagnostics failed unexpectedly.";
      });
    });
  }
}

bindEvents();
loadSettings().catch(() => {
  setStatus("Failed to load settings.", "error");
});
