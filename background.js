const DEFAULT_SETTINGS = {
  workspaceRoot: "",
  attrName: "data-insp-path",
  enabledHosts: ["localhost"],
  modifierKey: "Alt",
};

function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

function encodeAbsolutePath(absolutePath) {
  return absolutePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildVsCodeUrl({ absolutePath, line, column }) {
  const encodedPath = encodeAbsolutePath(absolutePath);
  return `vscode://file${encodedPath}:${line}:${column}`;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "OPEN_IN_VSCODE") {
    return false;
  }

  const { absolutePath, line, column } = message.payload || {};

  if (!absolutePath || !Number.isInteger(line) || !Number.isInteger(column)) {
    sendResponse({ ok: false, error: "Invalid payload" });
    return false;
  }

  const url = buildVsCodeUrl({ absolutePath, line, column });

  chrome.tabs.create({ url, active: false }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    sendResponse({ ok: true });
  });

  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "GET_SETTINGS") {
    return false;
  }

  getSettings()
    .then((settings) => sendResponse({ ok: true, settings }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
