---
name: user-research-domain
description: 用户的研究领域、技术栈和工作流偏好
metadata: 
  node_type: memory
  type: user
  originSessionId: 54ac3193-1e94-4941-8f43-f6ed6880910a
---

## 研究领域

**自动驾驶激光雷达感知（LiDAR-based 3D Perception for Autonomous Driving）**

- **核心方向**：点云 3D 目标检测，基于 OpenPCDet 框架（支持 PointRCNN, PV-RCNN, Voxel R-CNN, CenterPoint, MPPNet, DSVT, BEVFusion 等）
- **标准数据集**：KITTI, Waymo Open Dataset, nuScenes, Argoverse2
- **延伸方向 1**：恶劣天气激光雷达鲁棒性（雨雾衰减建模、降雨数据合成、恶劣天气目标识别）
- **延伸方向 2**：单光子激光雷达（SPAD）感知算法
- **延伸方向 3**：目标近场激光回波生成（物理建模/仿真）

**Zotero 文库结构**：
- 3D目标检测算法（含子分类：小目标多尺度检测）
- 单光子激光雷达
- 恶劣天气激光雷达（含子分类：数据集、目标识别、降雨数据合成）
- 目标近场激光回波生成
- 现代测试技术（英）

**GitHub**：LitureG

## 技术栈

- Python / PyTorch / CUDA
- OpenPCDet（主要代码框架）
- Claude Code（AI 编程助手）
- Zotero（文献管理，含 AI 自动总结标注）

## 工作流偏好

- 使用 Claude Code 作为主要 AI 助手，已配置 skills（code-reader, paper-summary, literature-review, wos-*, research-manager 等）
- 文献管理在 Zotero 中，带有 AI 生成的摘要和表格化笔记
- 目前已启用 ARA research-manager skill（领域适配版），在每次对话结束时自动记录研究过程
- 遵循 Karpathy 编码准则 + 全局 AI 行为准则（CLAUDE.md）

## 跨领域属性

虽然是 AI/ML 研究范式（训模型、跑 benchmark、调超参），但涉及物理建模（激光回波、大气衰减）和传感器硬件约束，不完全等同于纯深度学习研究。[[ara-config-work]]
