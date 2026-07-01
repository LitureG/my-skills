---
name: ara-config-work
description: ARA research-manager skill 的配置工作和领域适配记录
metadata: 
  node_type: memory
  type: project
  originSessionId: 54ac3193-1e94-4941-8f43-f6ed6880910a
---

## ARA research-manager 已配置完成

2026-06-05 完成了 ARA（Agent-Native Research Artifact）research-manager skill 的配置和领域适配。

**Why**: 用户希望自动记录 AI 辅助研究过程（决策、实验、失败路径），且 ARA 的原始 schema 针对通用 AI/ML 设计，需要适配激光雷达感知领域。

**已完成的工作**：

1. **本地 skill 安装**（`~/.claude/skills/research-manager/`）：
   - `SKILL.md` — 领域适配版，新增 `evidence/benchmarks/`、`evidence/ablation/`、`trace/checkpoints.yaml`、三类约束（传感器SC/环境EC/部署DC）
   - `references/event-taxonomy.md` — 扩展了 benchmark_run、ablation_result、dataset_decision、sensor_config 事件类型

2. **GitHub 公开仓库**：https://github.com/LitureG/ara-research-manager
   - 包含原始论文版（未修改的）skill 文件，供其他人参考

3. **ARA 项目 Issue**：https://github.com/AmberLJC/Agent-Native-Research-Artifact/issues/4
   - 向 ARA 作者反馈了领域适配实践

**How to apply**: `/research-manager` 命令已可用，在每次对话结束时自动运行。ara/ 目录在项目根目录下生成。如需调整 schema（如新增证据类型、修改约束分类），直接编辑 `~/.claude/skills/research-manager/SKILL.md`，但注意 CLAUDE.md 要求先提交修改方案再执行。

**原 ARA 论文**: arXiv:2604.24658, "The Last Human-Written Paper: Agent-Native Research Artifacts"

[[user-research-domain]]
