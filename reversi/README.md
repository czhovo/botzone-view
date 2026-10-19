# Reversi 开发观察与正式赛静态归档

[打开观察页](index.html) · [打开正式赛](tournament.html) · [报告目录](reports/README.md)

前五页保留五位参与者的算法演进、工作摘要、事件、用量、开发测试及验收和追加测试记录。拖动时间线小人或使用方向键、Home、End 回看开发时刻；到交卷终点恢复最终统计。没有开发测试的棋盘历史，也不会自动回放这些测试。记录仍可展开说明。

第六页包含全部 640 场正式比赛结果、相互战绩、Elo 与顺序敏感性范围。每局棋谱独立保存在 `matches/mNNNN.json`，点击回放时才加载；支持逐手、拖动、播放、暂停、速度调整和终局查看。首页及第六页不会预加载棋谱。

全部页面为静态 HTML/CSS/JavaScript，无 Python API、无 localhost 依赖、无外部脚本 CDN。报告只有 Markdown。建议使用 GitHub Pages 或任意静态 HTTP 服务，浏览器对直接 file:// 打开的 JSON fetch 可能有限制。

JSON 棋谱保留原生裁判全部动作、初始局面、逐步棋盘、翻子、PASS、终局和响应耗时。删除的是输入中重复传递的历史及进程 stderr，不删棋盘步骤。故障局按原始终止记录回放，不补造未进行的着法。

本包不包含参赛源码、二进制、权重、CLI 私有原文或凭证。`data/verification.json` 为赛事核验；`data/archive-verification.json` 为静态导出检查。640 局正式赛与开发／验收阶段不是同一批记录。
