# CLAUDE.md · 守灯

给下一个接手的人 / agent 的短指南。先读 `GAME_DESIGN.md` 的范围，再看这里。

## 跑起来

```bash
npm run serve      # http://localhost:4321
npm test           # 模拟层测试，必须全绿
npm run balance    # 200 局机器人，改数值后看分布
node server.mjs --qa   # 需要截图验收时
```

## 铁律

1. **`src/sim.js` 不准出现 DOM、Canvas、`window`、`performance.now()`、`Math.random()`。**
   随机只能用 `rand(state)` / `randRange(state, ...)`；时间只用传入的 `dt`。
2. **模拟和渲染分离。** 渲染层只读状态；所有需要反馈的事情由 `step()` 往 `state.events` 里推事件，`main.js` 在同一帧交给 `render.js` 和 `audio.js`。
3. **数值全部进 `src/data.js`。** 不要在 `sim.js` 里写魔法数；新遗物必须有 `id / name / desc / apply`，并跑测试。
4. **固定步长 1/60。** 不要用可变 `dt` 驱动模拟；`advanceTime(ms)` 必须可复现。
5. **事件数组每步开头清空。** 多步一帧时，每一步都要立刻消费掉事件。
6. **中文只用系统字体栈。** 不引外部字体，避免离线或子集化问题。

## 改完必须验

- 逻辑：`npm test`。
- 平衡：`npm run balance`，通关率低于 40% 或高于 75% 都要重新想。
- 画面：`node server.mjs --qa`，在页面里 `__lantern.startAt(n)` + `__lantern.bot(true)` + `advanceTime(...)`，
  然后 POST `__lantern.snapshot()` 到 `/__shot?name=xxx`，看 `shots/xxx.png`。
- 交互：真实点一遍开始、移动、照射、冲刺、暂停、三选一、结算。

## 已知坑

- 页面必须走 HTTP（ES modules + `file://` 会被拦）。
- `startAt` 是 QA 专用，标记了 `qaRun`，不会写最佳记录。
- 触屏是「左半屏移动 / 右半屏瞄准」的双摇杆映射，`body.touch` 控制冲刺按钮显示。
- 最容易被改坏的地方：`updateEnemies()` 里死亡标记与 `alive` 数组的重建；加新敌人时记得同时处理 `dead`、`burnTick`、扑火。
- 影王死亡会直接把 `mode` 设为 `won`，不要再在 `killEnemy` 之后假设波次会自然清空。
