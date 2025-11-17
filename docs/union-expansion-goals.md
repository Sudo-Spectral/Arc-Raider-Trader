# Union Activity Expansion Goals

This document translates the high-level vision for expanding the Union bot beyond trading into concrete, testable requirements. It focuses on three new activity families—Escort missions, Quests/Bounties, and Limited-Time Events—while keeping the existing trade workflow intact.

## Guiding Principles

1. **Union-first identity**: The bot should feel like a faction coordinator that happens to support trading, not just a marketplace bot.
2. **Thread-first collaboration**: Every activity should produce a focused discussion space that logs context, status, and completion.
3. **Consistent reputation ("rep")**: Reputation rewards can come from any activity; ensure gain/loss rules are explicit so clerks can audit them.
4. **Manual payouts**: Item or currency rewards remain informational. The bot records promises, but humans still deliver them in-game.

## Activity Profiles

### 1. Escort Missions

**Goal**: Pair a client needing protection with an escort team.

**Command concept**: `/escort`

**Inputs**
- `client` *(required user)*: Who is requesting protection.
- `route_or_goal` *(required string)*: Brief description of the path/destination/objective.
- `escort_team` *(optional user/role list)*: Named escorts if already selected; otherwise the thread can recruit.
- `payment_items` *(optional string)*: Rewards promised to the escorts (items, currency, favors).
- `notes` *(optional string)*: Tactical notes, meeting time, loadout requirements, etc.

**Thread behavior**
- Creates a private thread under the configured Union operations channel.
- Auto-invites the client and each listed escort; clerks can add others later.
- Posts a summary embed with mission details and promised payment.

**Completion rules**
- Pressing "Mark escort complete" sets the status to `awaiting_rating`.
- Both client and escort team receive **+1 rep each** once completion is confirmed.
- Optional follow-up: client can still rate escorts via `/rate`, but the rep grant should not depend on it.

### 2. Quests & Bounties

**Goal**: Support freeform objectives posted by Union members (e.g., defend an elevator, hunt a target).

**Command concept**: `/quest`

**Inputs**
- `title` *(required string)*: Short name for the mission.
- `description` *(required string)*: Detailed objective.
- `reward_rep` *(optional integer, default 1)*: Rep earned upon completion.
- `reward_items` *(optional string)*: Tangible rewards (blueprints, gear, etc.).
- `assignee` *(optional user)*: Pre-selected operative; if omitted, thread remains open for volunteers.
- `deadline` *(optional string/datetime)*: When the quest expires.
- `notes` *(optional string)*: Extra instructions.

**Thread behavior**
- Creates a private thread for coordination, tagged with the quest title.
- Invites the quest giver and the assignee (if provided).
- Posts summary message plus any deadlines/rewards.

**Completion rules**
- "Mark quest complete" button grants `reward_rep` to the assignee (or the user confirming completion if no assignee was set).
- Quest giver does **not** automatically earn rep; the reward is for the operative.
- Rewards like blueprints remain informational for manual delivery.

### 3. Limited-Time Events

**Goal**: Run seasonal competitions (e.g., "Great Scrap Drive") with leaderboard-style rep prizes.

**Command concept**: `/event create`

**Inputs**
- `event_name` *(required string)*.
- `description` *(required string)*.
- `start_time` & `end_time` *(required datetimes)*.
- `reward_structure` *(required JSON-ish field or repeated options)*: e.g., `[ { place: 1, rep: 5 }, { place: 2, rep: 3 }, { place: 3, rep: 2 } ]`.
- `submission_instructions` *(optional string)*.

**Thread behavior**
- Either posts a persistent embed in the channel or spawns a public thread for submissions, depending on staff preference.
- Needs `/event update` and `/event close` management commands.

**Award flow**
- `/event award` takes `event_id`, `participant`, `place_or_rep`, and optionally `notes`.
- Awards rep according to the configured structure (default fallback to manual amount).
- Logs each award with timestamp and clerk ID for auditing.

## Reputation Rules Summary

| Activity type | Who automatically gains rep | Amount | Notes |
|---------------|-----------------------------|--------|-------|
| Trade         | Buyer & seller via `/rate`  | ±1 via sentiment | Existing behavior remains.
| Escort        | Client & escort team        | +1 each | Given when the escort is marked complete; no negative option in MVP.
| Quest/Bounty  | Assigned operative(s)       | Configurable (default +1) | Quest giver manually delivers other rewards.
| Event         | Participants per placement  | Defined per event | Logged through staff-only award commands.

## Non-goals for this phase

- Automated matchmaking or route planning.
- Automated item delivery or escrow.
- Complex reputation decay/negative scoring outside of trade ratings.

## Open Questions

1. Should escort missions allow more than +1 rep (e.g., client decides amount)?
2. Do we need public visibility for quests/bounties (announcements) in addition to private planning threads?
3. How should we handle multi-winner quests (multiple operatives each getting rep)?
4. For events, do we want automatic reminders before the deadline?

Answering these will influence the command surfaces, but the core goals above give us a firm baseline to start implementing.
