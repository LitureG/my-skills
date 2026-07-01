---
name: wos-literature-review
description: End-to-end WoS literature review — two-pass search (broad + focused) with citation-based tiered quality filtering, subagent title/abstract screening, Zotero import, and a documented reading list; review writing is gated on user confirmation. Trigger when the user asks to survey a field via WoS, e.g. "用WoS调研X文献", "检索X加入Zotero", "WoS literature review on X".
argument-hint: "[研究领域/主题] [--collection Zotero集合路径] [--year 年限]"
user-invocable: true
disable-model-invocation: false
---

# WoS 文献调研 → Zotero 入库 → 综述

端到端文献调研编排：**两路检索（宽口径 + 细分方向）→ 引用数分档质量筛查 → subagent 标题摘要精筛 → Zotero 入库 → 记录文档 → 用户确认后撰写综述**。整合 `wos-dom`/`wos-search` 的 API 知识 + Zotero MCP + chrome-devtools MCP 自动化，并固化镜像站踩坑经验。

## 浏览器自动化方式：MCP 优先，CDP 备选

**主路径用 chrome-devtools MCP**（`navigate_page` / `evaluate_script` / `take_snapshot` 等）。本 skill 所有"在 WoS 页面执行 JS、导航、取数"操作均通过 MCP 完成。

**备选路径**：本目录下保留两个自包含、零 npm 依赖（需 node ≥ 22）的 CDP 脚本，仅在 chrome-devtools MCP 不可用时启用（见文末「CDP 备选方案」）：

| 脚本 | 作用 |
|---|---|
| `wos_cdp.js` | CDP 桥接。模式: `targets`/`nav`/`eval`/`evalfile`/`setdownload`/`raw`。封装 `Runtime.evaluate`/`Page.navigate`/`setDownloadBehavior`。 |
| `wos_search.js` | WoS 检索取数。参数: `'<TS表达式>' <年限> <取条数> <输出json> [端口]`。自动 queryJson 导航 + API 翻页。 |

两者底层都是 CDP；MCP 的 `evaluate_script`/`navigate_page` 与 `wos_cdp.js` 的 `eval`/`nav` 对"在 WoS 页面执行 JS fetch"这类纯 JS 场景完全等效，逻辑可互换。

## 漏斗数量目标（默认，可调）

两路并行漏斗，各阶段数量为默认参考值，按领域灵活调整；每阶段向用户报告当前条目数与调整建议。

| 阶段 | 宽口径 | 细分方向 |
|---|---|---|
| 检索命中 | 500±10% | 200±10% |
| 质量筛查后 | 300±10% | 100±10% |
| 精细筛选后 | 60±10% | 40±10% |

---

## Step 0 前置环境检查（一次性）

### 0.1 Zotero 集合
- `search_collections` 按名称找目标集合，取 `key`；不存在则 `create_collection`（支持 `parentCollection` 嵌套）。
- 记下集合 key，后续 `add_items_to_collection` 用。

### 0.2 Chrome 调试端口（WSL2 + Windows 场景）
1. **网络模式**：依赖 `.wslconfig` 的 `networkingMode=mirrored`（WSL localhost 直通 Windows）。确认：`cat /mnt/c/Users/*/.wslconfig | grep networkingMode`。
2. **诊断端口**：从 WSL 调 PowerShell 查 9222 是否被占用：
   ```bash
   powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue | Select LocalAddress,OwningProcess"
   ```
   - **9222 常被 svchost 占用**（`0.0.0.0:9222`），导致 Chrome CDP 绑定异常、`curl` 返回空。**默认换 9223**。
3. **启动 Chrome**（独立 user-data-dir，不影响日常 Chrome）：
   ```bash
   powershell.exe -NoProfile -Command "Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9223','--user-data-dir=C:\Temp\chrome-wos','--no-first-run','--no-default-browser-check','https://www.webofscience.com'"
   ```
4. **验证 CDP**：
   ```bash
   curl -s http://127.0.0.1:9223/json/version   # 应返回 JSON(Browser/Protocol-Version)
   ```
   若空响应 → 端口被占，换 9224/9225 重试。

> 单次会话只需做一次 0.1/0.2。Chrome 窗口保持开着即可（WoS 中国镜像 `clarivate.cn` 通常 IP 认证免登录）。
>
> **MCP 端口对齐**：chrome-devtools MCP 的 `--browser-url` 端口必须与 Chrome 实际监听的调试端口一致。若 MCP 配的是 9222 但本机 9222 被 svchost 占用，二选一：①让 Chrome 启动时用 MCP 配置的端口（并先释放 9222）；②改 MCP 配置换到 9223 并重启 Claude Code。可用 `mcp__chrome-devtools__list_pages` 验证 MCP 是否连上目标 Chrome。

---

## Step 1 检索式构造与调参

WoS 核心库主要索引英文文献，中文关键词先译英文。领域术语分散时用 OR 聚合同义词。字段标签 / queryJson 格式见 `wos-dom`。

### 1.1 两路检索
- **宽口径**：TS 广覆盖同义词，目标命中 **500±10%**（450-550）。
- **细分方向**：聚焦子方向 TS（如 `"few-shot class-incremental learning"`），目标命中 **200±10%**（180-220）。

### 1.2 调参闭环（每路独立）
检索后看 `total`，反复调整至达标：
- **超范围**（>550 / >220）→ 先查检索式是否过宽（收紧 TS、去掉宽泛同义词）；仍超 → 加 `AND WC=...`（限定研究方向）/ 缩 `PY` 年限。
- **低于范围**（<450 / <180）→ 放宽 OR 同义词 / 去掉 `AND` 限定。
- **每步告知用户**：当前检索式、返回条目数、建议的下一步调整。

> 调参只用检索时可控手段（TS / WC / PY）。引用数、IF、JCR 等是**取回后过滤**，不在检索阶段调（见 `wos-dom` 字段说明与「镜像站 API 差异」）。

## Step 2 取数（chrome-devtools MCP）

每路检索达标后，按 `times-cited-descending` 翻页取回**全部命中**条目的元数据。镜像站三坑（不带 `editions` / `retrieve.first` 1-based / 步长 20）见 `wos-dom`。

### 2.1 导航建立 SID

`navigate_page` 到 queryJson URL（镜像站域名 `clarivate.cn`；`.com` 站用 `webofscience.com`）：
- `url`: `https://webofscience.clarivate.cn/wos/woscc/general-summary?queryJson=<ENCODED_JSON>`
- `initScript`: `"Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"`

queryJson 形如 `[{"rowBoolean":null,"rowField":"TS","rowText":"..."}]`，年限作为单独一行 `{"rowBoolean":"AND","rowField":"PY","rowText":"2015-2026"}` 追加。字段标签与多行规则见 `wos-dom`。

### 2.2 evaluate_script 翻页取数

调用前先把 query 数组 `JSON.stringify` 成字符串（自动转义 TS 表达式里的双引号），替换 `{QUERY_JSON}`；`{WANT}` 替换为该路命中数（宽口径≈500，细分≈200，全取）：

```javascript
async () => {
  const query = JSON.parse('{QUERY_JSON}');
  const sid = performance.getEntriesByType('resource').map(r => r.name.match(/SID=([^&]+)/)?.[1]).filter(Boolean)[0] || '';
  if (!sid) return { status: 'no_session', message: 'SID 丢失，先 navigate 到 WoS 页面' };
  const WANT = {WANT};
  const all = []; let total = 0;
  for (let fr = 1; all.length < WANT; fr += 20) {           // 镜像站单次最多 20 条
    const body = { product: "WOSCC", searchMode: "general", viewType: "search", serviceMode: "summary",
      search: { mode: "general", database: "WOSCC", query },  // 镜像站：不带 editions（带了返回 0 条）
      retrieve: { count: 20, first: fr, history: true, jcr: true, sort: "times-cited-descending", analyzes: [], locale: "en" },
      eventMode: null };
    const r = await fetch('/api/wosnx/core/runQuerySearch?SID=' + sid, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/x-ndjson' }, body: JSON.stringify(body) });
    const lines = (await r.text()).trim().split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    const si = lines.find(l => l.key === 'searchInfo')?.payload;
    const rd = lines.find(l => l.key === 'records')?.payload;
    total = si?.RecordsFound || total;
    if (!rd || Object.keys(rd).length === 0) break;
    for (const [, rec] of Object.entries(rd)) {
      all.push({ wosId: rec.colluid, title: rec.titles?.item?.en?.[0]?.title || '',
        authors: (rec.names?.author?.en?.filter(Boolean).map(a => a.wos_standard) || []).join('; '),
        source: rec.titles?.source?.en?.[0]?.title || '', year: rec.pub_info?.pubyear || '',
        vol: rec.pub_info?.vol || '', issue: rec.pub_info?.issue || '', pages: rec.pub_info?.page_no || '',
        doi: rec.doi || '', citations: rec.citation_related?.counts?.WOSCC || 0,
        citationsAll: rec.citation_related?.counts?.ALLDB || 0, docType: rec.doctypes?.[0] || '',
        abstract: (rec.abstract?.basic?.en?.abstract || '').replace(/<[^>]*>/g, '').slice(0, 500), oa: rec.oa || false });
      if (all.length >= WANT) break;
    }
    if (all.length >= WANT) { all.length = WANT; break; }
    await new Promise(r => setTimeout(r, 500));
  }
  return { status: 'ok', total, count: all.length, records: all };
}
```

返回 JSON: `{status, total, count, records:[{wosId,title,authors,source,year,vol,issue,pages,doi,citations,citationsAll,docType,abstract,oa}]}`。落盘：宽口径 `/tmp/wos_broad.json`，细分 `/tmp/wos_focus.json`。500 条≈25 页翻页，约 1-2 分钟/路。

### 镜像站三坑
详见 `wos-dom`「镜像站 (clarivate.cn) API 差异」：不带 `editions` / `retrieve.first` 1-based 分页 / 单次最多 20 条。判定：地址栏域名 `clarivate.cn` 即镜像站；`.com` 站可正常用 editions + count≤50。

## Step 3 质量筛查：引用数分时间档过滤

对每路取回的文献，按出版年 `PY` 分三档，**档内分别**按被引数升序排序，**并集排除**（满足任一即排除）：

| 时间档 | PY | 排除条件（默认可调） |
|---|---|---|
| 近5年以外 | ≤2019 | 档内被引后20% **或** <10 |
| 近1-5年 | 2020-2024 | 档内被引后20% **或** <3 |
| 近1年 | 2025-2026 | 全部保留 |

- 过滤后目标：宽口径 **~300±10%**（270-330），细分 **~100±10%**（90-110）。
- **若不在范围**：超了→收紧（绝对下限 +5 / 百分位提到后30%）；不够→放宽（降绝对下限 / 降到后10%），重筛并告知用户。
- 用 python 按档统计被引分位 + 过滤，落盘 `/tmp/wos_broad_q.json`、`/tmp/wos_focus_q.json`。
- 默认参数（后20%、`<10`/`<3`、年份边界）均可按领域调整，执行时告知用户采用值。

> 用引用数代替 IF/JCR 作质量代理：WoS 检索 API 不返回 IF/JCR（仅 full-record 页有，见 `wos-dom`），引用数在一定程度上反映质量；分时间档设阈值消除"老文献引用积累多"的偏差，近1年文献引用未攒起故全留。

## Step 4 精细筛选：subagent + Haiku 标题摘要分析

将质量筛查后的文献交由**便宜模型 subagent（Haiku）**做标题+摘要相关性筛选，降低主会话 token 开销。

- 按 **~30 条/批**分批，每批 spawn 一个 Haiku subagent。
- 给 subagent：调研主题 + 该批文献清单（wosId / 标题 / 摘要 / 被引 / 年份 / docType）。
- subagent 返回每条：**保留 / 排除 + 理由**（基于标题摘要与主题的相关性）。
- 主会话汇总，目标：宽口径 **~60±10%**，细分 **~40±10%**。
- **交用户确认**剩余条目（数量 + 清单），用户可增删。
- 确认后两路按 `wosId` 合并去重，落盘 `/tmp/wos_final.json`。

## Step 5 Zotero 入库

### 5.1 类型与作者映射
- `docType` 映射：`Proceedings Paper` → `conferencePaper`；`Article`/`Review` → `journalArticle`。
- 作者 `wos_standard` 格式 `"Last, F"` → `{creatorType:'author', lastName:'Last', firstName:'F'}`；无逗号则用 `{name:...}`。
- `publicationTitle` 放来源（期刊/会议名）；`extra` 存 `WoS: {wosId} | Citations: {n}`。

### 5.2 批量创建
- `write_item` create 逐条建（**分批并行 5–7 条/批**）。
- **MCP 分类器偶发 "temporarily unavailable"** → 失败的条目重试即可。
- 收集所有返回 `itemKey`，最后**一次** `add_items_to_collection`（collectionKey + itemKeys 数组）批量入集合。

## Step 6 记录文档

产出 markdown 到 `./docs/`（目录不存在则创建），文件名用中文主题 + "文献调研报告.md"。记录：
- **检索历程**：每路每次检索式 + 返回条目数（含调参过程）。
- **质量筛查**：分档参数 + 各档筛前/筛后条目数。
- **精筛结果**：subagent 排除/保留统计 + 用户确认的最终清单。
- **入库情况**：Zotero 集合路径、条目数、PDF 附件状态（默认无）。
- **推荐阅读（按优先级）**：P0 必读 / P1 重点 / P2 扩展，每篇标注推荐理由（为什么读、读什么）。

## Step 7 综述确认（用户确认后才撰写）

- 至此文献筛查检索工作完成。**询问用户**：是否撰写综述？综述结构如何？
- 用户确认后才进入综述撰写。
- 建引用编号映射：`[n]` ↔ 文献 ↔ Zotero itemKey（便于追溯）。
- **默认结构模板（以增量学习领域为例；换领域时调整第 4 节子方向。用户指定其他模板时改用用户模板）**：
  1. 引言（背景 + 定义 + 综述目的）
  2. 问题定义与分类（场景分类、核心障碍、评价指标）
  3. 方法流派（按领域主线分小节，每节引代表性文献）
  4. 关键子方向（如小样本增量、抗遗忘评测等）
  5. 评价与基准
  6. 应用与扩展
  7. 与目标场景/赛题的关联（逐约束对应表）
  8. 结论与展望
  9. 参考文献（作者. **标题.** *出处*, 年, 卷(期): 页. DOI. (被引数)）
- 产出 `./docs/中文主题文献综述.md`，引用密集，每个论点挂 `[n]`；参考文献编号与正文一致。

---

## 已知限制

- **PDF 自动下载默认不做**：出版商 Cloudflare/订阅墙阻断自动化 Chrome（MCP/CDP 均被识别为自动化）与 curl（过不了 JS 挑战）。需 PDF 时**提示用户手动下载**；若可接受预印本，可用 arXiv API 按标题检索 `http://export.arxiv.org/api/query?search_query=ti:"..."` 下载（无反爬，但需标题相似度校验，且为预印本非最终版）。
- **端口 9222 常被 svchost 占用** → 默认 9223。
- **MCP 分类器偶发不可用** → `write_item` 重试。
- **镜像站 API 差异**见 `wos-dom`「镜像站 (clarivate.cn) API 差异」。
- **IF/JCR 不可批量获取**：WoS 检索 API 不返回 IF/JCR（仅 full-record 页有），故 Step 3 质量筛查用引用数分时间档代替；IF/JCR 精确值仅在最终小批量逐条 full-record 时可取。
- **会议 CCF 等级 WoS 不标注**：需外部 CCF 列表对照来源名，本 skill 默认不强制。

## 产出清单（交付前自检）

- [ ] 两路检索命中数达 500/200±10%（或已与用户确认调整后的目标）
- [ ] 质量筛查后达 300/100±10%
- [ ] subagent 精筛 + 用户确认，最终清单已去重
- [ ] Zotero 目标集合内已入库（含元数据 + WoS号 + 被引数）
- [ ] `./docs/` 下有文献调研报告（检索历程 + 推荐阅读）
- [ ] 已询问用户是否撰写综述（综述为可选后续）
- [ ] 已说明 PDF 附件状态（默认无，需手动下载）

---

## 附录：CDP 备选方案（chrome-devtools MCP 不可用时）

若 chrome-devtools MCP 未配置或连不上目标 Chrome，改用本目录下的 CDP 脚本（零 npm 依赖，需 node ≥ 22）。与 MCP 主路径逻辑等效，仅调用方式不同。

### 取数（替代 Step 2）
```bash
node ~/.claude/skills/wos-literature-review/wos_search.js \
  '("incremental learning" OR "continual learning" OR "catastrophic forgetting")' \
  2015-2026 80 /tmp/wos_out.json
# 端口可用 CDP_PORT=9223 覆盖
```
`wos_search.js` 已封装 queryJson 导航 + API 翻页，镜像站三坑同样固化在内。

### 通用 CDP 桥（替代 navigate_page / evaluate_script）
- `node wos_cdp.js nav <url>` —— 等效 `navigate_page`
- `node wos_cdp.js eval "<js>"` / `evalfile <file>` —— 等效 `evaluate_script`
- `node wos_cdp.js targets` —— 列出标签页（等效 `list_pages`，用于排查连接）

> 切换到 CDP 时，Step 0.2 的端口诊断/Chrome 启动步骤不变；只需确保 `CDP_PORT` 与 Chrome 监听端口一致。
