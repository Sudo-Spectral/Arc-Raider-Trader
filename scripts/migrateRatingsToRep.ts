import fs from "fs-extra";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import type { RatingRecord, RepEntry } from "../src/types.js";

const { ensureDir, readJSON, writeJSON } = fs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");
const ratingsPath = join(dataDir, "ratings.json");
const repPath = join(dataDir, "rep.json");

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return (await readJSON(filePath)) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  await ensureDir(dataDir);
  const ratings = await readJsonFile<RatingRecord[]>(ratingsPath, []);
  const repEntries = await readJsonFile<RepEntry[]>(repPath, []);

  const existingKeys = new Set(
    repEntries
      .filter((entry) => entry.source.type === "trade_rating" && entry.source.recordId)
      .map((entry) => `${entry.source.recordId}:${entry.userId}:${entry.amount}`)
  );

  const newEntries: RepEntry[] = [];
  for (const rating of ratings) {
    const amount = rating.rating;
    const key = `${rating.tradeId}:${rating.targetUserId}:${amount}`;
    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    newEntries.push({
      id: nanoid(10),
      userId: rating.targetUserId,
      amount,
      source: {
        type: "trade_rating",
        recordId: rating.tradeId,
      },
      reason: amount > 0 ? "Positive trade review (migration)" : "Negative trade review (migration)",
      createdAt: rating.createdAt,
      createdBy: rating.reviewerUserId,
    });
  }

  if (!newEntries.length) {
    console.log("No new reputation entries to write.");
    return;
  }

  await writeJSON(repPath, [...repEntries, ...newEntries], { spaces: 2 });
  console.log(`Migrated ${newEntries.length} rating(s) into rep.json.`);
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
