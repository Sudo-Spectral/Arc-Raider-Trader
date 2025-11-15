import { FileHandle, mkdir, open, stat, unlink } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");
const lockDir = join(rootDir, "data", "locks");
const STALE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export class InteractionLock {
  constructor(private handle: FileHandle, private readonly lockPath: string) {}

  async release(): Promise<void> {
    await this.handle.close().catch(() => undefined);
    await unlink(this.lockPath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    });
  }
}

export async function acquireInteractionLock(interactionId: string): Promise<InteractionLock | null> {
  await mkdir(lockDir, { recursive: true });
  const lockPath = join(lockDir, `${interactionId}.lock`);
  return attemptAcquire(lockPath, true);
}

async function attemptAcquire(lockPath: string, allowStaleCleanup: boolean): Promise<InteractionLock | null> {
  try {
    const handle = await open(lockPath, "wx");
    return new InteractionLock(handle, lockPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      throw err;
    }

    if (!allowStaleCleanup) {
      return null;
    }

    const stats = await stat(lockPath).catch(() => null);
    if (!stats) {
      // File disappeared between open attempts; try once more without cleanup flag.
      return attemptAcquire(lockPath, false);
    }

    const age = Date.now() - stats.mtimeMs;
    if (age > STALE_LOCK_MS) {
      await unlink(lockPath).catch(() => undefined);
      return attemptAcquire(lockPath, false);
    }

    return null;
  }
}
