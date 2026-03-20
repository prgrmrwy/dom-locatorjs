# HANDOFF-P0 (dom-locatorjs)

更新时间：2026-03-21 00:21 (Asia/Shanghai)

## 1) 当前目标
完成 P0 前置环境打通 + 最小链路验证：
- 远程触发 PC 上 `code -g <file>:1:1`
- 成功时确认可打开 VS Code
- 失败时拿到可诊断错误

## 2) 已完成
- 仓库已就绪：`/root/mydir/dom-locatorjs`
- P0 问题分类文档已建：`docs/phase1-problem-map.md`
- PC 节点已配对：`Ken-PC`（paired=true, connected=true）
- SSH 隧道方案已打通（PC -> ct101 -> gateway loopback）
- `system.which` 可用，确认本机有：`code.cmd`、`git.exe`

## 3) 当前阻塞
- `system.run` 被审批策略拦截：`SYSTEM_RUN_DENIED: approval required`
- `approvals set --file` 在 PC 上执行后未按预期覆盖（hash/条目几乎不变）

## 4) 推荐立即动作（PowerShell 一行）
在 PC 上执行（补齐 allowlist）：

```powershell
"*git.exe","*node.exe","*npm.cmd","*pnpm.cmd","*yarn.cmd","*powershell.exe" | % { openclaw approvals allowlist add $_ }; openclaw approvals get
```

目标：`Allowlist` >= 8（至少包含 `*code.cmd`、`*cmd.exe` 及上述 6 条）

## 5) 下一步第一条命令（服务端）
allowlist 补齐后，立刻重跑最小链路：

```json
nodes.invoke system.run: cmd /c code -g "D:\apps\dom-locator\README.md:1:1"
```

并记录：
- 成功：返回 ok + 用户确认 VS Code 已打开
- 失败：完整错误（stderr/exit）写入 `docs/HANDOFF-P0.md` 与 `memory/2026-03-21.md`

## 6) P0 编码范围（确认）
仅做 Free + P0：
1. 错误码体系（E_ATTR_MISSING/E_PARSE_INVALID/E_ROOT_EMPTY/E_OPEN_FAILED）
2. 最小诊断面板（content-script）
3. options 诊断测试矩阵

不做：注入端重构、全 IDE、跨域复杂拓扑。
