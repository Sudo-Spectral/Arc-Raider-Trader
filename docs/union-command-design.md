# Command & Data Model Design

This document proposes concrete command surfaces, payload schemas, and data structures for the Union activity expansion (escort missions, quests/bounties, and limited-time events). It builds on the goals outlined in `union-expansion-goals.md`.

## 1. Slash Commands Overview

| Command | Purpose | Key options | Permissions |
|---------|---------|-------------|-------------|
| `/trade` | Existing item exchange flow | *(unchanged)* | Seller role / default |
| `/escort create` | Spin up an escort mission thread | `client`, `route`, `escorts`, `payment`, `notes` | Anyone with Send Messages |
| `/escort complete` | Manually confirm completion if button is unavailable | `mission_id` | Client, escorts, or Clerks |
| `/quest create` | Publish a new quest/bounty | `title`, `description`, `reward_rep`, `reward_items`, `assignee`, `deadline`, `notes` | Anyone |
| `/quest assign` | Attach an operative post-creation | `quest_id`, `assignee` | Quest owner or Clerks |
| `/quest complete` | Finish the quest and grant rep | `quest_id`, optional `assignee_override` | Quest owner, assignee, or Clerks |
| `/event create` | Register limited-time event metadata | `name`, `description`, `start`, `end`, `reward_structure`, `thread_visibility` | Clerks only |
| `/event update` | Edit description/timing/rewards | `event_id`, partial fields | Clerks |
| `/event award` | Grant rep for event placements | `event_id`, `participant`, `rep` or `placement`, `notes` | Clerks |
| `/rep summary` | Show unified reputation for a user | `user` | Everyone (ephemeral) |
| `/rep history` | Show ledger entries (paginated) | `user`, optional `limit` | Clerks |
| `/rep adjust` | Manual adjustments for audits | `user`, `amount`, `reason` | Clerks |

### Buttons / Components
- `mission:complete:<id>` — escort and quest completion button; matches `/escort complete` logic.
- `mission:cancel:<id>` — optional staff cancel button.
- Event scoreboard message uses select menus for award options (optional).

## 2. Data Structures

All stores continue to live in `data/` as JSON files backed by the existing `JsonStore` utility.

### 2.1 Generic Task Record
```
interface TaskRecord {
  id: string;
  type: "trade" | "escort" | "quest";
  interactionId?: string; // for deduplication
  title?: string; // quests/events
  description?: string;
  channelId: string;
  threadId: string;
  status: "open" | "awaiting_completion" | "awaiting_rating" | "completed" | "cancelled";
  createdAt: string;
  createdBy: string; // user id
  participants: {
    role: "seller" | "buyer" | "client" | "escort" | "operative";
    userId: string;
  }[];
  reward: {
    rep: number; // default per task type
    items?: string;
    notes?: string;
  };
  metadata: Record<string, unknown>; // route, deadline, etc.
}
```

Implementation detail: reuse `tradeStore` for `type === "trade"` and add `missionStore` for escorts/quests if we prefer to separate concerns. Both can share a base `TaskStore` class.

### 2.2 Reputation Ledger
```
interface RepEntry {
  id: string;
  userId: string;
  amount: number; // positive or negative
  source: {
    type: "trade_rating" | "escort" | "quest" | "event" | "manual";
    recordId?: string; // trade/mission/event id
  };
  reason: string;
  createdAt: string;
  createdBy: string; // who triggered the change (bot or clerk)
}
```
- Stored in `data/rep.json`.
- `/rep summary` aggregates by `userId`.
- `/rate` still writes +1/-1 entries via `source.type = "trade_rating"`.

### 2.3 Event Structures
```
interface EventRecord {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  rewardStructure: { label: string; rep: number }[];
  channelId: string;
  messageId?: string; // scoreboard or announcement
  createdAt: string;
  createdBy: string;
  status: "scheduled" | "running" | "closed";
}

interface EventAward {
  id: string;
  eventId: string;
  userId: string;
  placement?: string;
  rep: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}
```

Award issuance writes both an `EventAward` entry and a `RepEntry` (source=`event`).

## 3. Rating & Rep Logic

- `/rate` (trade) continues to rely on `ratingStore`. When a rating is logged, also insert a rep entry of +1/-1 for the target user.
- Escort completion: once both client and escorts confirm, insert rep entries: `+1` for each escort + `+1` for client (configurable constant). Optionally, allow staff override via `/escort complete amount:2`.
- Quest completion: rep amount defaults to the quest's `reward.rep`. If no assignee, whichever user runs the completion command becomes the recipient.
- Event awards: rep is determined either by matching `placement` against `rewardStructure` or by explicit `rep` argument.

## 4. Validation Rules & Edge Cases

- **Thread reuse**: ensure `interactionId` locks cover `/escort` and `/quest` creation to avoid duplicates.
- **Cancellation**: add status update endpoints to prevent awarding rep on cancelled missions.
- **Multi-member escorts**: store escorts as array; awarding rep iterates over each member.
- **Permission checks**: only original poster or Clerks can edit/complete missions; escorts/assignees can confirm completion if they’re participants.
- **Deadlines**: if `deadline` passes without completion, emit a reminder (future improvement) but do not auto-cancel in MVP.

## 5. Channel & Config Needs

Add new `.env` entries (all optional with fallbacks):
- `ESCORT_CHANNEL_ID`
- `QUEST_CHANNEL_ID`
- `EVENT_CHANNEL_ID`

If unset, default to `TRADES_CHANNEL_ID` for backwards compatibility.

---
This design gives us a clear blueprint for implementing the new commands, data stores, and reputation ledger while reusing existing infrastructure like threads and buttons.
