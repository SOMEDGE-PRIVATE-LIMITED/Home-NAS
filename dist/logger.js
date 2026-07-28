"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
// Map uppercase config log levels to the lowercase names pino expects
const levelMap = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
};
/**
 * Creates a pino logger configured with:
 * - ISO timestamps (pino.stdTimeFunctions.isoTime)
 * - Structured JSON output written to stdout (fd 1)
 * - Log level mapped from the ServerConfig uppercase convention to pino's lowercase convention
 *
 * Requirements: 8.1, 8.5
 */
function createLogger(level) {
    return (0, pino_1.default)({
        level: levelMap[level],
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
    }, pino_1.default.destination(1) // stdout
    );
}
//# sourceMappingURL=logger.js.map