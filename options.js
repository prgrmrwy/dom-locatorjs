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

function validateSettings(settings) {
  if (!settings.attrName.trim()) {
    return "Attribute name is required.";
  }

  if (settings.workspaceRoot && !settings.workspaceRoot.startsWith("/")) {
    return "Workspace root must be an absolute macOS path.";
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

function bindEvents() {
  const elements = getElements();
  elements.form.addEventListener("submit", saveSettings);
  elements.resetButton.addEventListener("click", resetDefaults);
  elements.testButton.addEventListener("click", testVsCodeLink);
}

bindEvents();
loadSettings().catch(() => {
  setStatus("Failed to load settings.", "error");
});
