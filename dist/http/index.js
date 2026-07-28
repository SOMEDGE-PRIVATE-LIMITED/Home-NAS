"use strict";
// HTTP server module — implemented in Task 10: HTTP server setup (Fastify)
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLibraryRefreshHandler = exports.registerRequestLogger = exports.parseRangeHeader = exports.registerMediaStreamer = exports.loadOrCreateUdn = exports.registerDeviceDescription = exports.stopHttpServer = exports.startHttpServer = exports.createHttpServer = void 0;
var server_js_1 = require("./server.js");
Object.defineProperty(exports, "createHttpServer", { enumerable: true, get: function () { return server_js_1.createHttpServer; } });
Object.defineProperty(exports, "startHttpServer", { enumerable: true, get: function () { return server_js_1.startHttpServer; } });
Object.defineProperty(exports, "stopHttpServer", { enumerable: true, get: function () { return server_js_1.stopHttpServer; } });
var DeviceDescription_js_1 = require("./DeviceDescription.js");
Object.defineProperty(exports, "registerDeviceDescription", { enumerable: true, get: function () { return DeviceDescription_js_1.registerDeviceDescription; } });
Object.defineProperty(exports, "loadOrCreateUdn", { enumerable: true, get: function () { return DeviceDescription_js_1.loadOrCreateUdn; } });
var MediaStreamer_js_1 = require("./MediaStreamer.js");
Object.defineProperty(exports, "registerMediaStreamer", { enumerable: true, get: function () { return MediaStreamer_js_1.registerMediaStreamer; } });
var rangeParser_js_1 = require("./rangeParser.js");
Object.defineProperty(exports, "parseRangeHeader", { enumerable: true, get: function () { return rangeParser_js_1.parseRangeHeader; } });
var requestLogger_js_1 = require("./requestLogger.js");
Object.defineProperty(exports, "registerRequestLogger", { enumerable: true, get: function () { return requestLogger_js_1.registerRequestLogger; } });
var LibraryRefreshHandler_js_1 = require("./LibraryRefreshHandler.js");
Object.defineProperty(exports, "registerLibraryRefreshHandler", { enumerable: true, get: function () { return LibraryRefreshHandler_js_1.registerLibraryRefreshHandler; } });
//# sourceMappingURL=index.js.map