import fs from "fs-extra";
import { dirname } from "path";

const { ensureDir, readJson, writeJson } = fs;

export class JsonStore<T> {
  constructor(private readonly filePath: string, private readonly defaultValue: T) {}

  private async ensureFile(): Promise<void> {
    await ensureDir(dirname(this.filePath));
  }

  async read(): Promise<T> {
    await this.ensureFile();
    try {
  return (await readJson(this.filePath)) as T;
    } catch {
      return this.defaultValue;
    }
  }

  async write(data: T): Promise<void> {
    await this.ensureFile();
    await writeJson(this.filePath, data, { spaces: 2 });
  }

  async update(mutator: (data: T) => void | Promise<void>): Promise<T> {
    const current = await this.read();
    await mutator(current);
    await this.write(current);
    return current;
  }
}
