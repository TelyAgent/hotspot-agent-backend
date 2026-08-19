# Future Event Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working backend slice for workflow-driven future event operations, compatible with the existing Schedule page.

**Architecture:** Source data is stored as auditable future source runs/items, then converted into future events through stable services and workflow-ready command boundaries. The first slice implements database models, manual source import, stable `/future-events` APIs, and a workflow directory/schema skeleton so later source/rule changes do not require frontend changes.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, Jest, existing Markdown workflow runtime conventions.

**Spec:** `hotspot-agent-backend/docs/FUTURE_EVENT_OPERATIONS_WORKFLOW_ARCHITECTURE.md`

## Global Constraints

- Source fetching and database writes are service responsibilities; Markdown workflows only output validated commands.
- Manual import must require a source URL and default to `needs_verification` plus `internal_only`.
- `Schedule.tsx` must keep consuming stable `/future-events` APIs.
- All response paths must create or reuse unified Event records before content or campaign generation.
- Historical evidence, old times, score versions, and workflow versions must remain auditable.
- Twitter heat data may be empty while Twitter credentials are unavailable; do not fabricate heat.

---

### Task 1: Future Event Persistence Models

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `test/unit/future-event.mapper.spec.ts`

**Interfaces:**
- Produces Prisma models: `FutureSourceConfig`, `FutureSourceRun`, `FutureSourceItem`, `FutureEvent`, `FutureEventEvidence`, `FutureEventWindow`, `FutureEventHeatQuery`, `FutureEventHeatBucket`, `FutureEventScoreVersion`, `FutureResponseCard`, `FutureEventResponseLink`.
- Produces pure mapper function: `mapFutureEventView(input: FutureEventAggregate): FutureEventView`.

- [ ] **Step 1: Write the failing mapper test**

Create `test/unit/future-event.mapper.spec.ts`:

```ts
import { mapFutureEventView } from '../../src/future-events/future-event.mapper';

describe('mapFutureEventView', () => {
  it('maps normalized storage rows to Schedule.tsx compatible fields', () => {
    const view = mapFutureEventView({
      event: {
        id: 'future_1',
        title: '美国 CPI 数据发布',
        subject: '美国劳工统计局',
        eventType: '经济数据发布',
        factTime: new Date('2026-09-10T12:30:00.000Z'),
        factEndTime: null,
        timezone: 'America/New_York',
        schedulePrecision: 'exact_time',
        confirmationLevel: 'confirmed',
        expressionBoundary: 'factual',
        relatedEventId: null,
        entryMode: null,
        ruleVersion: 'future-event-window-score@v1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        updatedAt: new Date('2026-08-19T00:00:00.000Z'),
      },
      evidence: [
        {
          id: 'evidence_1',
          url: 'https://www.bls.gov/schedule/news_release/bls.ics',
          sourceType: 'bls',
          verifiedAt: new Date('2026-08-19T00:00:00.000Z'),
          claims: ['BLS lists CPI release time.'],
          originalId: 'bls-cpi-2026-09',
        },
      ],
      windows: [],
      heatQuery: null,
      heatBuckets: [],
      latestScore: null,
    });

    expect(view).toMatchObject({
      id: 'future_1',
      title: '美国 CPI 数据发布',
      factTime: '2026-09-10T12:30:00.000Z',
      confirmationLevel: 'confirmed',
      expressionBoundary: 'factual',
      evidence: [{ sourceType: 'bls' }],
      actionScore: { total: 0 },
      heat: { buckets: [], cumulative: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- future-event.mapper.spec.ts`

Expected: FAIL because `future-event.mapper` does not exist.

- [ ] **Step 3: Add Prisma models and mapper**

Add the models named above to `prisma/schema.prisma`, with table names matching the design document. Implement `src/future-events/future-event.mapper.ts` with strict Schedule-compatible output and empty heat fallback.

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
npm test -- future-event.mapper.spec.ts
npm run typecheck
```

Expected: PASS.

### Task 2: Future Event Stable API

**Files:**
- Create: `src/future-events/future-events.module.ts`
- Create: `src/future-events/future-events.controller.ts`
- Create: `src/future-events/future-events.service.ts`
- Modify: `src/app.module.ts`
- Test: `test/unit/future-events.service.spec.ts`

**Interfaces:**
- Consumes Prisma models from Task 1.
- Produces `GET /future-events`, `GET /future-events/:id`, `GET /future-events/:id/heat`, `GET /future-events/sources/status`.

- [ ] **Step 1: Write failing service test**

Create `test/unit/future-events.service.spec.ts` that constructs `FutureEventsService` with a typed fake Prisma object and asserts `list({ month: '2026-09' })` filters by UTC month and returns mapped views.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- future-events.service.spec.ts`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement controller and service**

Implement the API routes used by `hotspot-master/src/api/futureEvents.ts`. The service queries `futureEvent` with included evidence, windows, heat query, heat buckets, latest score, and maps each result through `mapFutureEventView`.

- [ ] **Step 4: Register module and verify**

Run:

```bash
npm test -- future-events.service.spec.ts
npm run typecheck
```

Expected: PASS.

### Task 3: Manual Future Event Import

**Files:**
- Modify: `src/future-events/future-events.service.ts`
- Test: `test/unit/future-events.manual-import.spec.ts`

**Interfaces:**
- Consumes `createManualFutureEvent(input)` and `importCsv(csv)`.
- Produces `POST /future-events` and `POST /future-events/import`.

- [ ] **Step 1: Write failing manual create/import tests**

Create tests asserting:

- missing `sourceUrl` throws an error;
- manual event creates `FutureSourceRun`, `FutureSourceItem`, `FutureEvent`, and `FutureEventEvidence`;
- CSV skips invalid rows and imports valid rows.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- future-events.manual-import.spec.ts`

Expected: FAIL until service methods exist.

- [ ] **Step 3: Implement manual source path**

Implement manual input as a source run/item first, then upsert a FutureEvent with default `needs_verification`, `internal_only`, and score 0. Use deterministic `dedupeKey` derived from title, subject, event type, and fact date when present.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- future-events.manual-import.spec.ts future-events.service.spec.ts
npm run typecheck
```

Expected: PASS.

### Task 4: Response Gate To Unified Event

**Files:**
- Modify: `src/future-events/future-events.service.ts`
- Test: `test/unit/future-events.respond.spec.ts`

**Interfaces:**
- Consumes `respondFutureEvent(id, kind)`.
- Produces `POST /future-events/:id/respond`.

- [ ] **Step 1: Write failing response test**

Create a test asserting that responding to a future event creates or reuses one `Event`, writes one `EventIntake`, one `EventSourceContext`, one `EventEvidence`, and one `FutureEventResponseLink`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- future-events.respond.spec.ts`

Expected: FAIL because response link behavior does not exist.

- [ ] **Step 3: Implement response link**

Implement `scheduled_manual_response` Event creation/reuse using `future_event_response_link`. Respect expression boundary: `internal_only` and `blocked` cannot generate outward content or campaign output.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- future-events.respond.spec.ts
npm run typecheck
```

Expected: PASS.

### Task 5: Workflow Skeletons

**Files:**
- Create: `workflows/future-events/future-source-intake-normalization/WORKFLOW.md`
- Create: `workflows/future-events/future-source-intake-normalization/output.schema.json`
- Create: `workflows/future-events/future-event-window-score/WORKFLOW.md`
- Create: `workflows/future-events/future-event-window-score/output.schema.json`
- Create: `workflows/future-events/future-event-response-gate/WORKFLOW.md`
- Create: `workflows/future-events/future-event-response-gate/output.schema.json`

**Interfaces:**
- Produces workflow files that the existing `WorkflowLoader` pattern can load after runtime methods are added.

- [ ] **Step 1: Write workflow schema files**

Create strict JSON schemas for command outputs:

- normalization: `upsert_future_event`, `ignore_future_candidate`;
- score: `update_future_event_windows_score`;
- gate: `create_pending_response`, `create_event_intake`, `update_event_context`, `ignore_future_event_signal`.

- [ ] **Step 2: Write workflow Markdown files**

Write Chinese workflow instructions matching the design document and SPEC boundaries.

- [ ] **Step 3: Validate JSON schema syntax**

Run:

```bash
node -e "for (const f of require('fs').globSync('workflows/future-events/*/output.schema.json')) JSON.parse(require('fs').readFileSync(f, 'utf8'))"
npm run typecheck
```

Expected: PASS.

## Self-Review

- Spec coverage: this plan covers persistence, stable APIs, manual import, Event response link, and workflow skeletons. Official Connector implementations are intentionally deferred to keep the first slice testable without external credentials.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: API names match `hotspot-master/src/api/futureEvents.ts`; entry modes match the SPEC.
