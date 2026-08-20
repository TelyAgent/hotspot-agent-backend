# 内容生成与账号任务实现计划

> **给后续执行者：** 本计划已完成第一阶段实现。若继续往下做候选生成，请继续使用测试驱动方式，每个任务先写失败测试，再写实现。

**目标：** 实现后端链路：触发后的 Event 进入账号响应任务创建流程，但不在任务创建时提前生成内容候选。

**架构：** 在现有 Workflow Runtime 旁边新增 `content` 模块。Event 命令仍只负责 Event 持久化；内容账号任务由独立的 Content Repository、Content Command Executor 和 Content Assignment Service 处理。

**技术栈：** NestJS、Prisma、Jest、TypeScript，沿用现有 WorkflowRepository 风格。

**对应设计文档：** `docs/CONTENT_ACCOUNT_TASK_WORKFLOW_ARCHITECTURE.md`

## 全局约束

- Event 触发后只创建账号任务，不创建内容候选。
- 同一个 `eventId + accountId` 最多创建一个账号响应任务。
- 基础生产线账号默认自动分配；人设账号后续由账号分配 Workflow 决定。
- 候选生成延后到任务详情页生成入口。
- 行为变化必须先有失败测试覆盖。

---

### 任务 1：内容任务领域模型与命令执行器

**文件：**
- 新增：`src/content/content.types.ts`
- 新增：`src/content/content.repository.ts`
- 新增：`src/content/in-memory-content.repository.ts`
- 新增：`src/content/content-command.executor.ts`
- 测试：`test/unit/content-command.executor.spec.ts`

**接口：**
- 输出：`ContentCommandExecutor.execute(input): Promise<ContentCommandExecutionRecord>`
- 输出：`ContentRepository.createContentTask(input): MaybePromise<ContentTaskRecord>`

- [x] **步骤 1：写失败测试**

覆盖账号任务创建幂等、重复 idempotency key 跳过、重复 `eventId + accountId` 跳过。

- [x] **步骤 2：运行测试并确认失败**

运行：`npm test -- test/unit/content-command.executor.spec.ts --runInBand`

- [x] **步骤 3：实现最小领域模型、仓库和执行器**

新增内容命令类型和内存仓库，风格对齐 `InMemoryWorkflowRepository`。

- [x] **步骤 4：运行测试并确认通过**

运行：`npm test -- test/unit/content-command.executor.spec.ts --runInBand`

### 任务 2：Prisma 数据模型与 Repository

**文件：**
- 修改：`prisma/schema.prisma`
- 新增：`src/content/prisma-content.repository.ts`
- 测试：`test/unit/content-prisma-mapping.spec.ts`

**接口：**
- 输出：`PrismaContentRepository` 实现 `ContentRepository`

- [x] **步骤 1：写失败的映射测试**

覆盖 Prisma 可空字段映射为 TypeScript optional 字段，以及通过 `eventId + accountId` 复合唯一键查找任务。

- [x] **步骤 2：运行测试并确认失败**

运行：`npm test -- test/unit/content-prisma-mapping.spec.ts --runInBand`

- [x] **步骤 3：添加 Prisma 模型与 repository 映射**

新增 `ContentTask`、`ContentCandidateBatch`、`ContentCandidate`、`PublicationRecord`。

- [x] **步骤 4：运行校验和测试**

运行：`npm run db:validate`

运行：`npm test -- test/unit/content-prisma-mapping.spec.ts --runInBand`

### 任务 3：Content 模块与任务 API

**文件：**
- 新增：`src/content/content.module.ts`
- 新增：`src/content/content.service.ts`
- 新增：`src/content/content.controller.ts`
- 新增：`src/content/content.tokens.ts`
- 修改：`src/app.module.ts`
- 测试：`test/unit/content.service.spec.ts`

**接口：**
- 输出：`GET /content/tasks`
- 输出：`GET /content/tasks/:id`
- 输出：`POST /content/tasks/:id/generate`，当前返回 `501`，直到候选生成实现完成

- [x] **步骤 1：写失败的 service 测试**

覆盖任务列表/详情 DTO，以及 generate 入口当前不会创建候选。

- [x] **步骤 2：运行测试并确认失败**

运行：`npm test -- test/unit/content.service.spec.ts --runInBand`

- [x] **步骤 3：实现 module、service、controller**

开放任务列表、任务详情和受保护的候选生成占位入口。

- [x] **步骤 4：运行测试**

运行：`npm test -- test/unit/content.service.spec.ts --runInBand`

### 任务 4：Event 响应入口接入，但不生成候选

**文件：**
- 修改：`src/workflow/event-command.executor.ts`
- 修改：`src/workflow/workflow.module.ts`
- 测试：`test/unit/event-command.executor.spec.ts`
- 测试：`test/unit/content-assignment.service.spec.ts`

**接口：**
- 消费：`ContentAssignmentService`
- 消费：`ContentCommandExecutor`
- 输出：创建 Event 且 `startResponsePipeline = true` 时，启动账号任务创建入口，但不创建内容候选。

- [x] **步骤 1：写失败测试**

扩展 Event Command Executor 测试，证明响应链路启动时会调用内容响应入口。

- [x] **步骤 2：写账号分配 starter 测试**

证明启用的基础生产线账号会创建 `ready_for_generation` 任务；人设账号先跳过，等待后续 Workflow 决策；候选 batch 和 candidate 均为空。

- [x] **步骤 3：实现最小 hook**

给 `EventCommandExecutor` 注入可选的内容响应 starter，并在 `WorkflowModule` 接入 `ContentModule`。

- [x] **步骤 4：运行相关测试和类型检查**

运行：`npm test -- test/unit/event-command.executor.spec.ts test/unit/content-command.executor.spec.ts --runInBand`

运行：`npm run typecheck`

## 当前完成状态

第一阶段已经完成：Event 触发后可以创建账号响应任务，并且不会提前生成候选。

第二阶段已经完成：任务详情页生成入口已经从 501 占位改为可用接口。调用 `POST /content/tasks/:id/generate` 时，会读取任务、Event Context Pack 和账号配置，创建一个候选批次，并保存 3 条候选。候选生成已经接入 `workflows/content/account-task-candidate-generation` Markdown Workflow；模板生成器保留为 Workflow 不可用时的兜底。

第三阶段已经完成：账号分配链路加入了 Workflow 角色决策器。基础生产线账号仍自动创建任务；人设账号会读取 Event Context Pack 和账号角色定义，由 `workflows/content/account-assignment` 返回参与、观察或跳过。关键词规则版保留为 Workflow 不可用时的兜底。

第四阶段已经完成：候选生成后会立即进入 Workflow 风险预检器。预检结果会写入每条候选的 `riskStatus`、`status` 和 `precheckPayload`；低风险候选进入 `available`，中风险候选进入 `warning`，高风险或禁止候选进入 `blocked`。账号任务会记录本批候选的最高风险等级；只要存在可发布候选，任务进入 `ready_for_publish`，否则进入 `precheck_blocked`。风险预检已经接入 `workflows/content/risk-precheck`；规则预检器保留为 Workflow 不可用时的兜底。

第五阶段已经完成：任务详情页可以对任意可用候选直接回填有效的 X/Twitter URL 创建发布记录，不再有任务级“选择/未选择”状态。`blocked` 候选不能发布；重复 URL 会被拒绝。发布成功后，候选状态变为 `published`，账号任务状态变为 `published`，发布记录进入 `tracking` 状态并设置默认 7 天追踪结束时间。

第六阶段已经完成：发布记录支持写入互动指标快照，并支持结束追踪。调用 `POST /content/publications/:id/metrics` 可以记录点赞、回复、转发、引用和浏览量；调用 `POST /content/publications/:id/complete-tracking` 可以把发布记录标记为 `completed`，并推动账号任务进入 `completed`。当前指标来源仍是接口写入，不会自动抓取真实 X 指标。

第七阶段已经完成：content 的账号分配、候选生成和风险预检 Workflow 已接入 workflow run 级审计。每次成功调用会保存 Workflow Definition、创建 Workflow Run，并在完成后写入 output；模型输出不合法或运行失败时，会把 Run 标记为 `failed`，再回落到规则/模板兜底实现，避免阻断主链路。

第八阶段已经完成：发布后的自动指标采集已经接入调度器。`ContentTrackingSchedulerService` 每分钟检查 `tracking` 状态的发布记录；首次采集或距离上次采集超过 1 小时时，通过 `PublicationMetricsCollector` 拉取 X 指标并写入 `PublicationMetric`。当前默认采集器通过发布 URL 解析账号和 statusId，再调用 `x.getAccountPosts` 拉账号时间线匹配对应帖子；追踪窗口到期后会自动调用完成追踪，把发布记录和账号任务推进到 `completed`。

尚未完成的后续阶段：

- Workflow 命令级审计增强：当前 content Workflow 已有 run 级审计；后续如果需要像 Event Workflow Runner 一样逐条保存 commands 和 executions，还需要扩展 `WorkflowCommandRecord` 的通用命令类型。
