import fs from 'fs';
import path from 'path';

export interface StorageFileMeta {
  size: number;
  contentType: string;
}

export class StorageService {
  private static localBaseDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || './storage/audio');

  /**
   * Ensure local storage directory exists
   */
  public static init() {
    if (!fs.existsSync(this.localBaseDir)) {
      fs.mkdirSync(this.localBaseDir, { recursive: true });
    }
  }

  /**
   * Resolves absolute file path for a local storage key, preventing path traversal attacks
   */
  public static resolveLocalPath(storageKey: string): string {
    this.init();
    const cleanKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.resolve(this.localBaseDir, cleanKey);

    // Validate that resolved path stays strictly inside localBaseDir
    if (!fullPath.startsWith(this.localBaseDir)) {
      throw new Error('Access denied: Invalid storage path traversal attempt');
    }

    return fullPath;
  }

  /**
   * Checks if local file exists and returns size
   */
  public static getLocalFileMeta(storageKey: string): { exists: boolean; size: number } {
    try {
      const fullPath = this.resolveLocalPath(storageKey);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        return { exists: true, size: stats.size };
      }
    } catch {
      // Path traversal or invalid key
    }
    return { exists: false, size: 0 };
  }

  /**
   * Creates a readable stream for a slice of bytes (HTTP Range request)
   */
  public static createLocalReadStream(storageKey: string, start?: number, end?: number): fs.ReadStream {
    const fullPath = this.resolveLocalPath(storageKey);
    const options: { start?: number; end?: number } = {};
    if (start !== undefined) options.start = start;
    if (end !== undefined) options.end = end;
    return fs.createReadStream(fullPath, options);
  }

  /**
   * Saves uploaded buffer to local storage
   */
  public static async saveLocalFile(filename: string, buffer: Buffer): Promise<string> {
    this.init();
    const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueKey = `${Date.now()}-${sanitized}`;
    const targetPath = path.resolve(this.localBaseDir, uniqueKey);

    await fs.promises.writeFile(targetPath, buffer);
    return uniqueKey;
  }
}
