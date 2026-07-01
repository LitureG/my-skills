---
name: code-read-style
description: Help user read and understand deep learning algorithm source code using a 3-layer reading method. Distinguishes universal design patterns from one-off tricks. Trigger when user says "帮我读一下这个算法", "分析这个网络", "这个模块我不太懂", "帮我理解这段代码", "read this code", or is working on algorithm source files.
---

# Code Reader — Deep Learning Algorithm Source Code Analysis

## Trigger

Respond with this method when the user says things like "帮我读一下这个算法", "分析这个网络", "这个模块我不太懂", or is actively reading algorithm source code across multiple files.

## The 3-Layer Reading Method

### Layer 1: Orientation (always do first, ~5 min per module)

Do NOT read line by line. Answer exactly three questions:

1. **Data flow**: What does this module take in and put out? (input/output tensor shapes)
2. **Purpose**: What problem does it solve in the network? (one sentence, under 20 words)
3. **Components**: What module-level building blocks does it use? (at "Conv+BN+ReLU" granularity, NOT every line)

### Layer 2: Deep Dive (only when user designates a module)

After Layer 1 is complete and the user picks a module to go deeper on, expand into internal logic. Focus on **how data transforms**, not on individual API parameter names. Skip implementation details that don't affect data flow.

### Layer 3: Check (after every module, mandatory)

Ask the user these three verification questions:

1. In your own words: what does this module do?
2. What are its input/output shapes? At which step does a critical shape change happen?
3. If you removed or replaced this module, would the network still work? Why or why not?

## 通用 vs 单次 判定（代码模式）

每当用户遇到代码模式/结构时，立即分类：

| 类型 | 特征 | 处理方式 |
|------|------|----------|
| **通用模式** | 跨网络出现（如 Conv+BN+ReLU、锚框检测头、FPN、残差连接等） | 标记 → 询问用户是否已了解 → 如不了解，开启深入分支系统讲解 |
| **领域惯例** | 特定领域常见做法（点云中的体素化、NMS；检测中的 RoI Pooling 等） | 指出是领域惯例 → 简要解释为什么这么做 → 建议系统理解 |
| **单次技巧** | 仅本文/本网络特有（如特殊初始化、特殊损失权重、特定数据增强） | 仅解释当前用法 → 明确说明"这是本网络特有的，不是通用模式" |

## 通用 vs 单次 判定（数学/理论）

When reading code, mathematical concepts will appear. Apply the same classification:

| 类型 | 特征 | 处理方式 | 示例 |
|------|------|----------|------|
| **通用数学** | 众多算法核心机制的基础 | 标记 → 询问用户是否有几何直觉 → 如没有，**以当前代码为锚点**讲解（避免教科书风格） | SVD/PCA 用于数据压缩、最小二乘（矩阵投影视角）、梯度下降直觉、特征值/向量作为"不变方向" |
| **领域数学** | 特定子领域关键，但非普遍 | 指出概念 → 说明所属子领域 → 建议**进入该子领域遇到实际代码时**再系统学习 | EKF/贝叶斯滤波（SLAM）、因子图（SLAM 后端）、马尔可夫链（状态估计）、信息论（压缩、VAE） |
| **小众数学** | 仅用于理论证明或极窄研究 | 简要提及 → 明确说明"工程场合不需要，跳过" | 泛函分析、高级测度论、收敛性证明、李群细节 |

### 数学判定启发法

自问：**"理解这个概念是否能直接帮助用户调试或设计接下来遇到的 3 个网络？"**

- 是，属于可直接操作的机制 → 通用数学 → 投入时间，以代码为上下文讲解
- 是，但仅在进入特定子领域时 → 领域数学 → 标记，现在不深入
- 否，纯理论 → 小众数学 → 跳过

### 初步数学分类参考

| 概念 | 分类 | 触发子领域 |
|------|------|-----------|
| SVD、特征值分解 | 通用数学 | — |
| 最小二乘（几何直觉） | 通用数学 | — |
| 梯度下降、损失景观直觉 | 通用数学 | — |
| 卷积（互相关、频域） | 通用数学 | — |
| PCA、协方差矩阵 | 通用数学 | — |
| 贝叶斯规则、条件概率 | 领域数学 | SLAM、状态估计 |
| 卡尔曼滤波（KF/EKF/UKF） | 领域数学 | SLAM、传感器融合 |
| 粒子滤波 | 领域数学 | SLAM、跟踪 |
| 因子图、图优化 | 领域数学 | SLAM 后端 |
| 马尔可夫链、马尔可夫过程 | 领域数学 | 状态估计 |
| 信息论（熵、KL 散度） | 领域数学 | 生成模型、VAE |
| 泛函分析 | 小众数学 | — |
| 数值分析（误差传播） | 领域数学 | 嵌入式部署 |
| KD-Tree、八叉树、空间哈希 | 通用数学（数据结构） | — |
| 哈希表、队列、图（数据结构） | 通用数学（数据结构） | — |

### 数学讲解风格

讲解通用数学时，遵循以下模板：

1. **它出现在当前代码的哪里**（具体、直接）
2. **它捕捉了什么几何/物理直觉**（一句话）
3. **为什么作者选择了它而不是替代方案**（工程权衡）
4. **如果搞错了会怎样**（调试线索）

绝不从定义开始。始终从用户正在看的代码出发。

## 示例对话

```
User: 帮我读一下这个网络的检测头
Claude:

【Layer 1 · Orientation】
  Input:  spatial_features (B, C, H, W)
  Output: cls_preds (B, num_anchors*num_class, H, W)
          box_preds (B, num_anchors*7, H, W)
  Purpose: Predict class and box offsets for every anchor at every spatial location
  Components: Two 1×1 Convs for classification and regression

  [Code Pattern] This is a **universal anchor-based detection head** design.
  Same pattern in: Faster R-CNN / SSD / RetinaNet / PointPillars / CenterPoint.
  You'll see this in the next 3+ papers. Already familiar? Want me to explain?

【Layer 3 · Check】
  1. In your own words: what does this head output mean?
  2. Why does output channel count = num_anchors * num_class?
  3. If we replaced the 1×1 conv with a 3×3 conv, what would change?
```

```
User: (reading VFE code) 这里用 scatter 把点云映射到 pillar，为什么这么做？
Claude:

  [Data Structure] This is a **spatial hash** — a universal data structure.
  Point (x,y,z) → hash to integer pillar index → O(1) lookup.
  Same concept: voxelization in VoxelNet, spatial grid in SECOND.
  The alternative (nearest-neighbor per point) would be O(N²).

  [Math] The underlying idea is **space-partitioning via hashing** — one of the
  4 core data structures you need (hash table, KD-tree, graph, queue).
  Need me to explain why hashing is O(1) and why that matters here?
```

## Scope

This method applies to any deep learning algorithm source code:
- Point cloud detection: PointPillars, VoxelNet, SECOND, CenterPoint, PointNet family
- Image detection/segmentation: Faster R-CNN, YOLO, Mask R-CNN
- SLAM: ORB-SLAM, LOAM, LeGO-LOAM
- And any other algorithm source the user encounters

## 重要

- Layer 1 必须始终在任何深入之前完成
- 第一遍绝不逐行阅读
- 始终区分通用和单次 — **对代码模式和数学概念均如此** — 这是本 skill 提供的最有价值的服务
- Layer 3 的 3 个验证问题是强制性的，不是可选的
- 讲解通用数学时，从代码上下文出发，而非定义
- 数学分类参考是初步的 — 根据实际遇到的代码更新判定
