import { writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const ITEMS_URL = "https://ardb.app/api/items";
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..", "..");
const outputPath = join(__dirname, "data", "items.json");

type ArdbItem = {
  name?: string;
};

async function scrape(): Promise<string[]> {
  const response = await fetch(ITEMS_URL, {
    headers: {
      "User-Agent": "Arc-Raider-Trader-Bot/1.0 (+https://github.com/)",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download items (${response.status})`);
  }
  const data = (await response.json()) as ArdbItem[];
  const items = new Set<string>();

  data.forEach((item) => {
    const name = item.name?.trim();
    if (name) {
      items.add(name.replace(/\s+/g, " "));
    }
  });

  return Array.from(items).filter((item) => /[a-z]/i.test(item)).sort((a, b) => a.localeCompare(b));
}

(async () => {
  const items = await scrape();
  await writeFile(outputPath, JSON.stringify(items, null, 2));
  console.log(`Saved ${items.length} items to ${outputPath}`);
})().catch((error) => {
  console.error("Failed to scrape items", error);
  process.exit(1);
});
