import { load } from "cheerio";
import { writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
const ITEMS_URL = "https://arc-raiders.fandom.com/wiki/Items";
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..", "..");
const outputPath = join(__dirname, "data", "items.json");
async function scrape() {
    const response = await fetch(ITEMS_URL, {
        headers: {
            "User-Agent": "Arc-Raider-Trader-Bot/1.0 (+https://github.com/)",
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to download items (${response.status})`);
    }
    const html = await response.text();
    const $ = load(html);
    const items = new Set();
    $("table tr")
        .toArray()
        .forEach((row) => {
        $(row)
            .find("td")
            .toArray()
            .forEach((cell) => {
            const text = $(cell).text().trim();
            if (text && !/\$|x\s*\d+/i.test(text) && text.length < 60) {
                items.add(text.replace(/\s+/g, " "));
            }
        });
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
