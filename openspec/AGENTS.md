# DOM Locator OpenSpec Guide

## Project Scope

`dom-locator` is a Chrome extension that reads an inspection attribute from DOM nodes in development pages and opens the matching source location in VS Code on macOS.

Current source-of-truth inspection attribute format:

```text
<relative-path>:<line>:<column>:<extra>
```

Example:

```text
packages/L2/play-shared/src/components/SkillManagerV2/components/ManageCard.tsx:159:7:div
```

## Project Structure

```text
browser-plugins/dom-locator/
  AGENTS.md
  openspec/
    AGENTS.md
  manifest.json
  background.js
  content-script.js
  options.html
  options.css
  options.js
  README.md
```

## Guidelines

1. Keep the extension dependency-free unless there is a clear benefit.
2. Default to plain JavaScript so the extension can be loaded with `Load unpacked` immediately.
3. Preserve user privacy:
   - no telemetry
   - no network requests
   - no remote service dependencies
4. Treat `vscode://` launching as the only supported editor integration unless the user explicitly expands scope.
5. Host filtering and user-configured workspace root are part of the core behavior, not optional polish.

## When Making Changes

Open a change proposal when:

- adding a new editor integration
- changing the DOM attribute format
- adding iframe, multi-workspace, or popup-based workflows
- changing permissions in a way that expands data access

For small bug fixes and implementation work inside the current MVP, direct edits are fine.
