import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type { Logger } from '../logger.js';

const DEFAULT_FILE_PATH = path.join(
  os.homedir(),
  '.config',
  'dlna-media-server',
  'devices.json'
);

/**
 * The shape of the persistence file.
 * Defined in design section 3.6.
 */
interface DevicesFile {
  registeredIps: string[];
}

/**
 * Persists authenticated IP addresses to disk and provides fast in-memory lookup.
 *
 * Persistence file: ~/.config/dlna-media-server/devices.json
 * Format: { "registeredIps": ["192.168.1.50", "192.168.1.75"] }
 *
 * Design section 2.12.
 * Requirements: 10.2, 10.3, 10.5
 */
export class DeviceRegistry {
  /**
   * The set of currently registered IP addresses.
   * `readonly` prevents external reassignment of the reference; the Set itself
   * is mutated by `registerDevice`.
   */
  readonly registeredIps: Set<string>;

  private readonly filePath: string;
  private readonly logger: Logger | null;

  constructor(options?: { filePath?: string; logger?: Logger }) {
    this.registeredIps = new Set<string>();
    this.filePath = options?.filePath ?? DEFAULT_FILE_PATH;
    this.logger = options?.logger ?? null;
  }

  /**
   * Loads registered IPs from the persistence file into memory.
   * Called once at application startup.
   *
   * - If the file does not exist (ENOENT): initialises an empty Set — no error.
   * - If the file contains malformed JSON: logs a warning and starts with an
   *   empty registry rather than aborting.
   *
   * Requirements: 10.5
   */
  load(): void {
    let raw: string;

    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // First run — no persistence file yet. Start empty.
        return;
      }
      this.logger?.warn(
        { err, filePath: this.filePath },
        'DeviceRegistry: failed to read devices file; starting with empty registry'
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger?.warn(
        { filePath: this.filePath },
        'DeviceRegistry: devices file contains malformed JSON; starting with empty registry'
      );
      return;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as DevicesFile).registeredIps)
    ) {
      this.logger?.warn(
        { filePath: this.filePath },
        'DeviceRegistry: devices file has unexpected structure; starting with empty registry'
      );
      return;
    }

    const { registeredIps } = parsed as DevicesFile;
    for (const ip of registeredIps) {
      if (typeof ip === 'string') {
        this.registeredIps.add(ip);
      }
    }
  }

  /**
   * Returns `true` when the given IP address is in the registered set.
   *
   * Requirements: 10.3
   */
  isRegistered(ip: string): boolean {
    return this.registeredIps.has(ip);
  }

  /**
   * Adds an IP address to the registered set and immediately persists the
   * updated registry to disk.
   *
   * Requirements: 10.2
   */
  registerDevice(ip: string): void {
    this.registeredIps.add(ip);
    this.persist();
  }

  /**
   * Writes the current registry to disk as pretty-printed JSON.
   * Creates the directory if it does not already exist.
   *
   * Format: { "registeredIps": [...] }
   *
   * Requirements: 10.5
   */
  persist(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const data: DevicesFile = {
      registeredIps: [...this.registeredIps],
    };

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
}
