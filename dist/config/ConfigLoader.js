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
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Defaults per design section 3.5
const DEFAULTS = {
    friendlyName: 'DLNA Media Server',
    port: 8200,
    pin: '',
    logLevel: 'INFO',
};
const VALID_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'dlna-media-server', 'config.json');
/**
 * Resolves the config file path.
 * Uses the DLNA_CONFIG environment variable when set, otherwise falls back
 * to the default path: ~/.config/dlna-media-server/config.json
 */
function resolveConfigPath() {
    return process.env.DLNA_CONFIG ?? DEFAULT_CONFIG_PATH;
}
/**
 * Validates the parsed config object and applies defaults for optional fields.
 * Returns a fully-populated ServerConfig on success.
 * Logs a descriptive error and exits with code 1 on schema violations.
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 10.6
 */
function validateAndApplyDefaults(raw) {
    const errors = [];
    // --- Required: mediaDirectories ---
    if (!Object.prototype.hasOwnProperty.call(raw, 'mediaDirectories')) {
        errors.push('Missing required field: "mediaDirectories"');
    }
    else if (!Array.isArray(raw.mediaDirectories)) {
        errors.push('"mediaDirectories" must be an array of strings');
    }
    else {
        const dirs = raw.mediaDirectories;
        if (dirs.length < 1) {
            errors.push('"mediaDirectories" must contain at least one entry (minItems: 1)');
        }
        else {
            dirs.forEach((d, i) => {
                if (typeof d !== 'string') {
                    errors.push(`"mediaDirectories[${i}]" must be a string, got ${typeof d}`);
                }
            });
        }
    }
    // --- Optional: port (integer, 1024–65535) ---
    if (Object.prototype.hasOwnProperty.call(raw, 'port')) {
        const port = raw.port;
        if (typeof port !== 'number' || !Number.isInteger(port)) {
            errors.push('"port" must be an integer');
        }
        else if (port < 1024 || port > 65535) {
            errors.push(`"port" must be between 1024 and 65535 (got ${port})`);
        }
    }
    // --- Optional: friendlyName (string) ---
    if (Object.prototype.hasOwnProperty.call(raw, 'friendlyName')) {
        if (typeof raw.friendlyName !== 'string') {
            errors.push('"friendlyName" must be a string');
        }
    }
    // --- Optional: pin (string) ---
    if (Object.prototype.hasOwnProperty.call(raw, 'pin')) {
        if (typeof raw.pin !== 'string') {
            errors.push('"pin" must be a string');
        }
    }
    // --- Optional: logLevel (enum) ---
    if (Object.prototype.hasOwnProperty.call(raw, 'logLevel')) {
        if (typeof raw.logLevel !== 'string' || !VALID_LOG_LEVELS.includes(raw.logLevel)) {
            errors.push(`"logLevel" must be one of ${VALID_LOG_LEVELS.join(', ')} (got "${raw.logLevel}")`);
        }
    }
    if (errors.length > 0) {
        process.stderr.write(`[dlna-media-server] Config validation failed:\n` +
            errors.map((e) => `  - ${e}`).join('\n') +
            '\n');
        process.exit(1);
    }
    // Build the validated config with defaults applied
    const config = {
        friendlyName: typeof raw.friendlyName === 'string' ? raw.friendlyName : DEFAULTS.friendlyName,
        port: typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : DEFAULTS.port,
        mediaDirectories: raw.mediaDirectories,
        pin: typeof raw.pin === 'string' ? raw.pin : DEFAULTS.pin,
        logLevel: VALID_LOG_LEVELS.includes(raw.logLevel)
            ? raw.logLevel
            : DEFAULTS.logLevel,
    };
    return config;
}
/**
 * Loads, parses, and validates the server configuration.
 *
 * Config file path resolution order:
 *   1. DLNA_CONFIG environment variable (if set)
 *   2. ~/.config/dlna-media-server/config.json
 *
 * On any error (missing file, malformed JSON, schema violation) a descriptive
 * message is written to stderr and the process exits with code 1.
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 10.6
 */
function loadConfig() {
    const configPath = resolveConfigPath();
    // --- Read file ---
    let rawContent;
    try {
        rawContent = fs.readFileSync(configPath, 'utf-8');
    }
    catch (err) {
        const message = err instanceof Error && err.code === 'ENOENT'
            ? `Config file not found: ${configPath}`
            : `Failed to read config file at ${configPath}: ${err instanceof Error ? err.message : String(err)}`;
        process.stderr.write(`[dlna-media-server] ${message}\n`);
        process.exit(1);
    }
    // --- Parse JSON ---
    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    }
    catch (err) {
        const detail = err instanceof SyntaxError ? err.message : String(err);
        process.stderr.write(`[dlna-media-server] Failed to parse config file at ${configPath}: ${detail}\n`);
        process.exit(1);
    }
    // --- Ensure root is an object ---
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        process.stderr.write(`[dlna-media-server] Config file must contain a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}\n`);
        process.exit(1);
    }
    return validateAndApplyDefaults(parsed);
}
//# sourceMappingURL=ConfigLoader.js.map