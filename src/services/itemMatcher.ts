import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { MatchData, Searcher, sortKind } from "fast-fuzzy";
import { TradeItemMatch } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");
const defaultItemsPath = join(rootDir, "data", "items.json");

interface ItemEntry {
  original: string;
  normalized: string;
  tokens: string[];
}

export class ItemMatcher {
  private items: string[] = [];
  private entries: ItemEntry[] = [];
  private loaded = false;
  private readonly itemsPath: string;
  private searcher?: Searcher<ItemEntry, { returnMatchData: true }>;

  constructor(options: { itemsPath?: string; preloadItems?: string[] } = {}) {
    this.itemsPath = options.itemsPath ?? defaultItemsPath;
    if (options.preloadItems) {
      this.items = options.preloadItems;
      this.buildSearcher();
      this.loaded = true;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const file = await readFile(this.itemsPath, "utf-8");
      const parsed = JSON.parse(file);
      if (Array.isArray(parsed)) {
        this.items = parsed as string[];
      }
    } catch {
      this.items = [];
    }
    this.buildSearcher();
    this.loaded = true;
  }

  private buildSearcher(): void {
    this.entries = this.items.map((original) => ({
      original,
      normalized: this.normalize(original),
      tokens: this.tokenize(this.normalize(original)),
    }));

    this.searcher = new Searcher(this.entries, {
      keySelector: (entry: ItemEntry) => entry.normalized,
      ignoreCase: true,
      normalizeWhitespace: true,
      returnMatchData: true,
      sortBy: sortKind.bestMatch,
    });
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private tokenize(value: string): string[] {
    return value.split(" ").filter((token) => token.length > 0);
  }

  private tokenOverlap(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    const matches = a.filter((token) => setB.has(token));
    return matches.length / a.length;
  }

  private splitInput(rawInput: string): string[] {
    return rawInput
      .split(/[,;\n]/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
  }

  async match(rawInput: string, suggestionsPerItem = 1): Promise<TradeItemMatch[]> {
    await this.ensureLoaded();
    if (!this.items.length || !this.searcher) {
      return [];
    }
    const inputs = this.splitInput(rawInput);
    const matches: TradeItemMatch[] = [];
    for (const input of inputs) {
      const normalizedInput = this.normalize(input);
      const tokens = this.tokenize(normalizedInput);

      const direct = this.entries.find((entry) => entry.normalized === normalizedInput);
      if (direct) {
        matches.push({ input, match: direct.original, score: 0 });
        continue;
      }

      const results = this.searcher.search(normalizedInput, {
        returnMatchData: true,
        threshold: 0.35,
      }) as MatchData<ItemEntry>[];
      const ranked = results.slice(0, Math.max(suggestionsPerItem, 3));
      const suggestions = ranked.map((candidate) => candidate.item.original);
      const best = ranked[0];

      if (best) {
        const confidence = 1 - best.score;
        const overlap = this.tokenOverlap(tokens, best.item.tokens);
        const confident = confidence >= 0.7 || overlap >= 0.5 || tokens.length === 1;
        if (confident) {
          matches.push({ input, match: best.item.original, score: 1 - confidence });
          continue;
        }
      }

      matches.push({ input, match: "unknown", score: 1, suggestions });
    }
    return matches;
  }
}

export const itemMatcher = new ItemMatcher();
