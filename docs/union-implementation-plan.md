# Union Expansion Implementation Plan

This roadmap turns the goals and design docs into actionable engineering steps, grouped by milestone. Each milestone ends in a fully testable state so we can deploy incrementally.

## Milestone 0 – Prep Work (Current sprint)

1. **Refactor stores**
   - Extract a reusable `TaskStore` base (wraps `JsonStore`).
   - Add `interactionId` fields where missing and migrate existing `trades.json` entries (script + docs).
2. **Reputation ledger foundation**
   - Implement `repStore` with add/list/summary APIs.
   - Update `/rate` flow to write rep entries alongside rating records.
   - Update `/seller` to source totals from `repStore` + `ratingStore` (temporary hybrid).
3. **Config scaffolding**
   - Extend `.env.example` with `ESCORT_CHANNEL_ID`, `QUEST_CHANNEL_ID`, `EVENT_CHANNEL_ID`, `LOG_CHANNEL_ID`.
   - Update README/setup instructions.

**Testing**: unit tests for new stores, manual `/rate` regression test.

## Milestone 1 – Escort Missions

1. **New command module**: `src/commands/escort.ts` exports `/escort create`.
2. **Thread flow**: reuse `resolveTradeChannel` variant that reads `ESCORT_CHANNEL_ID` fallback.
3. **Completion logic**
   - Add `mission:complete:<id>` button builder.
   - On completion, mark task status and insert rep entries for client + escorts.
4. **Manual command**: `/escort complete mission_id` for failsafe when button unavailable.
5. **Locking & validation**: integrate `acquireInteractionLock` to prevent duplicate missions.

**Testing**: Vitest coverage for escort store + completion; manual Discord smoke test on staging server.

## Milestone 2 – Quests & Bounties

1. **Command suite**: `/quest create`, `/quest assign`, `/quest complete`.
2. **Data model**: extend task schema with `title`, `description`, `deadline`, `reward`.
3. **Permissions**: ensure only quest creator, assigned operative, or Clerk role can complete/assign.
4. **Rep grant**: completion awards `reward.rep` to operative.
5. **Announcement hook** (optional): configurable “quests board” channel message linking to thread.

**Testing**: unit tests for quest store transitions; manual regression ensuring escorts still function.

## Milestone 3 – Event Framework

1. **Event store**: `events.json` + `eventAwards.json`.
2. **Commands**: `/event create`, `/event update`, `/event award`, `/event close` (Clerk only).
3. **Scoreboard message**: optional embed with standings (update on each award).
4. **Rep integration**: awarding participants writes to `repStore` with source=`event`.
5. **Audit commands**: `/rep history` to view ledger entries (Clerk only).

**Testing**: unit tests for event award calculations, scoreboard updater, and ledger integrity.

## Milestone 4 – Polish & Docs

1. **README updates**: document new commands, required permissions, and env setup.
2. **Migration guide**: how to upgrade existing deployments (scripts, manual steps).
3. **Automation**: add npm scripts for running migrations/tests (e.g., `npm run migrate:data`).
4. **Observability**: add logging for task creation/completion outcomes.

**Testing**: full regression suite (`npm run test`, `npm run build`). Consider adding integration tests via Discord mock library if time permits.

## Open Dependencies
- Need confirmation on Clerk role ID for permission checks.
- Decide on storage capacity limits (e.g., max tasks per JSON file before recommending DB move).

Following this plan keeps risk low: we land foundational refactors first, then ship features in escalating scope (escort → quest → events) with rep ledger powering all of them.
