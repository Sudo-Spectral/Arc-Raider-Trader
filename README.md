# Arc Raider Trader Bot

Discord bot for Arc Raiders trading communities. It opens moderated trade threads, matches fuzzy item names against the complete loot table, and lets buyers rate sellers after a transaction.

## Features

- `/trade` command that spins up a private thread between seller and buyer, logging matched items, notes, and optional pricing.
- `/tradeedit` lets sellers correct the recorded items if they made a typo, either by referencing the trade ID or running it inside the thread
- Automatic fuzzy matching against the entire ~~[Arc Raiders items list](https://arc-raiders.fandom.com/wiki/Items)~~ scraped via `npm run scrape:items`.
- `/rate` command buyers use inside the thread (or with an ID) to log positive/negative feedback.
- `/seller` command that shows a seller's aggregated reputation.
- `/escort` command that creates an escort mission thread between an escort and client, awarding +1 rep to both once completed.
- Optional activity log channel that mirrors major trade, escort, and quest actions for auditability.
- JSON storage for trades and ratings with nanoid identifiers.

## Project setup

### Prerequisites

- Node.js 18+
- Discord application with a bot token
- Permission to create private threads in the chosen trades channel

### Installation

```bash
npm install
npm run scrape:items
```

Create a `.env` file:

```
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-id
GUILD_ID=primary-guild-id
TRADES_CHANNEL_ID=text-channel-for-trades
ESCORT_CHANNEL_ID=optional-text-channel-for-escort-threads
QUEST_CHANNEL_ID=optional-text-channel-for-quests
EVENT_CHANNEL_ID=optional-text-channel-for-event-announcements
LOG_CHANNEL_ID=optional-text-channel-for-activity-logs
```

Then register slash commands:

```bash
npm run register
```

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
npm start
```

### Additional scripts

- `npm run scrape:items`: Refresh the official item list and store it in `data/items.json`.
- `npm run migrate:rep`: Backfill the new reputation ledger (`data/rep.json`) from existing `ratings.json` entries. Safe to rerun.
- `npm test`: Run Vitest-based unit tests (currently focused on fuzzy matching).

### Migrations

- See `docs/migrations/2025-11-rep-ledger.md` for the step-by-step upgrade guide to this release.

## Usage

1. `/trade buyer:@User item:"Arc powercell" price:"25"(seeds) notes:"Whatever is relevant for trade"`
   - Bot creates `trade-seller-to-buyer` thread, invites both members, and logs matches.
2. `/tradeedit items:"Arc Powercell, ARC Motion Core"` (inside the trade thread or with `trade_id:ABC123`)
   - Updates the stored item list, re-runs fuzzy matching, and posts a correction note in the thread.
3. Buyer completes the trade and runs `/rate` inside the thread (or anywhere with the `trade_id`).
4. Anyone can run `/seller @User` to inspect the positive/negative tally.

### Escort missions

1. `/escort client:@Traveler route:"From Union HQ to Highroad" payment:"2x BP" notes:"Expect ARC resistance"`
   - Bot creates `escort-escort-to-client` thread, invites both members, and logs mission details.
2. Once the escort is done, either participant presses **Mark escort complete** inside the thread (or runs `/escort` again with completion subcommand in future iterations).
3. Bot grants +1 rep to both escort and client and posts a confirmation inside the thread.

## Data storage

All state is stored under `data/`:

- `items.json`: scraped list of valid items
- `trades.json`: chronological log of trade metadata
- `ratings.json`: buyer feedback entries

If you prefer a database, implement a drop-in replacement for the JSON stores in `src/services`.

## Troubleshooting

- **Slash commands missing**: re-run `npm run register` after changing command definitions.
- **Thread creation fails**: ensure `TRADES_CHANNEL_ID` points at a guild text channel where the bot has `Manage Threads` and `Send Messages` permissions.
- **Item matching is empty**: re-run `npm run scrape:items` or confirm the data file exists.
