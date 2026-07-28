"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceRegistry = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const DEFAULT_FILE_PATH = path.join(os.homedir(), '.config', 'dlna-media-server', 'devices.json');
/**
 * Persists authenticated IP addresses to disk and provides fast in-memory lookup.
 *
 * Persistence file: ~/.config/dlna-media-server/devices.json
 * Format: { "registeredIps": ["192.168.1.50", "192.168.1.75"] }
 *
 * Design section 2.12.
 * Requirements: 10.2, 10.3, 10.5
 */
class DeviceRegistry {
    /**
     * The set of currently registered IP addresses.
     * `readonly` prevents external reassignment of the reference; the Set itself
     * is mutated by `registerDevice`.
     */
    registeredIps;
    filePath;
    logger;
    constructor(options) {
        this.registeredIps = new Set();
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
    load() {
        let raw;
        try {
            raw = fs.readFileSync(this.filePath, 'utf-8');
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                // First run — no persistence file yet. Start empty.
                return;
            }
            this.logger?.warn({ err, filePath: this.filePath }, 'DeviceRegistry: failed to read devices file; starting with empty registry');
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            this.logger?.warn({ filePath: this.filePath }, 'DeviceRegistry: devices file contains malformed JSON; starting with empty registry');
            return;
        }
        if (typeof parsed !== 'object' ||
            parsed === null ||
            !Array.isArray(parsed.registeredIps)) {
            this.logger?.warn({ filePath: this.filePath }, 'DeviceRegistry: devices file has unexpected structure; starting with empty registry');
            return;
        }
        const { registeredIps } = parsed;
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
    isRegistered(ip) {
        return this.registeredIps.has(ip);
    }
    /**
     * Adds an IP address to the registered set and immediately persists the
     * updated registry to disk.
     *
     * Requirements: 10.2
     */
    registerDevice(ip) {
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
    persist() {
        const dir = path.dirname(this.filePath);
        fs.mkdirSync(dir, { recursive: true });
        const data = {
            registeredIps: [...this.registeredIps],
        };
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    }
}
exports.DeviceRegistry = DeviceRegistry;
//# sourceMappingURL=DeviceRegistry.js.map