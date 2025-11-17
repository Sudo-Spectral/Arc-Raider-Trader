# Migration: Reputation Ledger & Task Store (Nov 2025)

These steps upgrade an existing deployment to the new shared task store and reputation ledger.

## 1. Prep
1. Stop the running bot process.
2. Back up the `data/` folder (`trades.json`, `ratings.json`, etc.).

## 2. Install dependencies
```bash
npm install
```

## 3. Generate rep ledger entries from historic ratings
```bash
npm run migrate:rep
```
- Reads every entry in `data/ratings.json` and writes missing equivalents to `data/rep.json`.
- Safe to run multiple times; existing ledger rows for the same trade/user are skipped.

## 4. Verify data
- Inspect `data/rep.json` to confirm the new entries look correct.
- Optionally restart the bot in dev mode to ensure `/seller` reports a "ledger" score instead of the legacy fallback notice.

## 5. Restart in production
```bash
npm run build
npm start
```

## Troubleshooting
- **Missing rep.json**: The migration script will create it automatically. Make sure the bot process has write access to `data/`.
- **Duplicate entries**: If you previously experimented with manual ledger rows, delete them or re-run the migration after cleaning `rep.json`.
- **Rollback**: Restore the backed-up `data/` folder and redeploy the previous release.
