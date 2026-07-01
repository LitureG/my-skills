---
name: todo
description: Manage Todoist tasks via natural language. Add tasks, check progress, list upcoming work — from any project, without explaining context. Trigger when user says things like "添加任务", "提醒我", "看看我的任务", "今天有什么", "进度", "创建一个计划", "/todo".
allowed-tools: Bash(python3 /home/glc/plans/todoist_cli.py:*), Bash(python3 ~/plans/todoist_cli.py:*), Bash(/home/glc/plans/todoist_cli.py:*), Bash(python3 /home/glc/bin/todoist:*)
---

# Todo — AI-Powered Todoist Task Management

Use `python3 /home/glc/plans/todoist_cli.py` (hereafter `todoist`) to manage Todoist tasks. Config is at `~/.config/todoist-cli/config.json`.

## Core commands

```
# Read
todoist projects                          # list all projects
todoist tasks [--project-id <id>]          # list active tasks  
todoist sync [--project-id <id>]           # progress report (active + completed)
todoist task-create <content> [options]    # create a task
todoist task-update <id> [options]         # modify a task
todoist task-close <id>                    # mark complete
todoist task-delete <id>                   # delete task
todoist project-create <name>              # create a project

# Options for task-create / task-update
--due "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"  # for specific time
--project-id <id>          # target project
--priority 1-4            # 1=low(p4), 2=medium(p3), 3=high(p2), 4=urgent(p1)
--description <text>      # details, links, notes
--labels tag1,tag2        # comma-separated labels
```

## Workflow rules

### 0. CRITICAL: Review-before-create rule
**NEVER create tasks or projects directly in Todoist without user review and explicit confirmation.** This is the most important rule.

- For **single tasks**: show the parsed task (content, due date, project, priority) and ask the user to confirm before running `task-create`.
- For **multi-task plans**: always present the full plan in a readable format first. Wait for the user to say "确认", "没问题", "添加", or similar before batch-creating.
- The ONLY exception: the user explicitly says "直接添加" or "不用确认".

### 1. Adding a task
When the user asks to add a task/reminder/plan:
- Parse natural language into: content, due date, project, priority, labels
- **Date resolution**: "明天" = tomorrow, "下周三" = next Wednesday, "今晚" = today evening. Always convert to `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`.
- **Project matching**: check existing projects first (`todoist projects`). If the user mentions a topic/subject, create or reuse a project for it. If no project context, default to Inbox (`6gcXC27phwCf8Hcq`).
- **Context awareness**: if the user is working on a file/notebook related to a topic, infer the project from that context.
- **Show first, create later**: present the parsed task to the user for confirmation before calling `task-create`.
- After creation, confirm with task ID and due date.
- **No reminders**: Todoist free accounts don't support API reminders. Just set due dates.

### 2. Checking tasks
When the user asks "what's on my plate", "今天有什么任务", "进度怎样":
- Run `todoist sync` for a full picture, or `todoist tasks` for active only
- Summarize concisely: overdue items first, then today, then upcoming
- Highlight completion rate and any concerning patterns (e.g., tasks repeatedly delayed)

### 3. Creating a multi-task plan
When the user wants a study/reading/work plan spanning days or weeks:
- Ask about: scope, timeline, available time
- Generate a structured plan with milestones
- **Present the plan for user review — do NOT create anything yet**
- Wait for explicit user confirmation before batch-creating with `todoist task-create`

### 4. Adjusting tasks
When the user wants to reschedule, reprioritize, or cancel:
- Use `todoist task-update` (don't delete + recreate)
- If the user is overwhelmed, suggest reducing scope rather than just pushing dates

## Project conventions (only 3 projects — never exceed)

| 项目 | ID | 用途 |
|------|-----|------|
| **Inbox** | `6gcXC27phwCf8Hcq` | Todoist 自带收件箱，仅用于临时快速捕捉，不主动归入 |
| **学习计划** | `6gcXHGp97JQp5MRp` | 所有自我提升：代码阅读、论文、SLAM、数学、书籍、技术博客 |
| **项目推进** | `6gf3RF3pgH3jG3Qw` | 所有外部驱动：导师任务、课题节点、DDL、汇报、合作 |
| **日常安排** | `6gf3RF74C33mPqwf` | 生活中的计划安排 |

### Project selection rule

添加任务时，优先归入已有项目。判断逻辑：

1. 这个任务属于自我提升/学习 → 学习计划
2. 属于导师/课题/外部驱动 → 项目推进
3. 属于生活日常 → 日常安排
4. 无法判断或临时一闪而过的想法 → Inbox
5. 只有在遇到全新的、长期的任务类别，且确实不属于以上任何项目时，才考虑创建新项目。创建前必须先告知用户并说明理由，等确认后再操作。

## Quick reference: today's date
Check the current date from the system — always use real dates, never guess.
