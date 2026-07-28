# Implementation Plan: DLNA Media Server

## Overview

Implement a DLNA/UPnP AV media server in Node.js 20 LTS with TypeScript 5.x that runs as a macOS LaunchDaemon. The implementation proceeds bottom-up: project scaffolding → core data/config layer → media library → SSDP/HTTP services → streaming → auth → macOS integration. Each task builds on the previous and ends with all components wired together.

## Tasks

- [x] 1. Project scaffolding and tooling setup
  - Initialise `package.json` with all pinned runtime dependencies: `fastify@4`, `chokidar@3.6.0`, `fast-xml-parser@4.4.1`, `uuid@9.0.1`, `fluent-ffmpeg@2.1.3`, `pino@9.3.2`
  - Add dev dependencies: `typescript@5`, `@types/node`, `@types/fluent-ffmpeg`, `ts-node`, `jest@29`, `@jest/globals`, `ts-jest`, `fast-check`, `@types/jest`
  - Create `tsconfig.json` targeting ES2022, `moduleResolution: node16`, `outDir: dist`, `strict: true`
  - Create `jest.config.ts` with `ts-jest` preset, `testEnvironment: node`, and globals for `fast-check` seed
  - Create source directory structure: `src/`, `src/config/`, `src/ssdp/`, `src/http/`, `src/media/`, `src/auth/`, `src/services/`
  - Add `build`, `start`, `test`, and `dev` scripts to `package.json`
  - _Requirements: 9.1_

- [x] 2. ConfigLoader
  - [x] 2.1 Implement `ConfigLoader` in `src/config/ConfigLoader.ts`
    - Define `ServerConfig` interface with all fields: `friendlyName`, `port`, `mediaDirectories`, `pin`, `logLevel`, `watchMode`, `scanIntervalSeconds`, `ffprobeConcurrency`
    - Read config from `~/.config/dlna-media-server/config.json` (overridable via `DLNA_CONFIG` env var)
    - Parse and validate JSON against the schema: `mediaDirectories` required, numeric ranges for `port`, enum check for `logLevel`, enum check for `watchMode` (`"fsevents"` | `"interval"` | `"manual"`), integer range for `scanIntervalSeconds` (min: 60), integer range for `ffprobeConcurrency` (min: 1, max: 16)
    - Apply defaults: `friendlyName = "DLNA Media Server"`, `port = 8200`, `pin = ""`, `logLevel = "INFO"`, `watchMode = "fsevents"`, `scanIntervalSeconds = 300`, `ffprobeConcurrency = 4`
    - Log descriptive error and `process.exit(1)` on missing file, malformed JSON, or schema validation failure
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 6.6, 6.7, 6.9, 10.6_

  - [ ]* 2.2 Write unit tests for ConfigLoader
    - Test valid config parsing with all fields present
    - Test default value application for omitted optional fields
    - Test exit-1 behaviour on missing file, malformed JSON, and schema violations
    - _Requirements: 5.1, 5.3_

- [x] 3. Structured logging setup
  - [x] 3.1 Create `src/logger.ts` wrapping `pino@9.3.2`
    - Export a factory function `createLogger(level: ServerConfig['logLevel']): Logger`
    - Configure pino with ISO timestamp and structured JSON output to stdout
    - _Requirements: 8.1, 8.5_

  - [ ]* 3.2 Write property test for log level filtering
    - **Property 14: Log Level Filtering Suppresses Below-Threshold Messages**
    - **Validates: Requirements 8.5**

- [x] 4. MediaIndex
  - [x] 4.1 Implement `MediaIndex` in `src/media/MediaIndex.ts`
    - Define `MediaItem` and `Container` interfaces as specified in the design (section 3.1, 3.2)
    - Implement dual `Map` structure: `items: Map<string, MediaItem | Container>` and `pathToId: Map<string, string>`
    - Implement `sha1(absoluteFilePath)` truncated to 16 hex chars for stable, path-derived object IDs (use Node.js `crypto.createHash`)
    - Implement `getById`, `getChildren`, `upsert`, `remove`, `search`, `getAllItems` methods
    - Root container always has `id = "0"`, `parentId = "-1"`
    - `search(term)` performs case-insensitive substring match on `title`
    - _Requirements: 2.1, 2.4, 2.10_

  - [ ]* 4.2 Write unit tests for MediaIndex
    - Test stable ID generation: same path → same ID across calls
    - Test `getChildren` returns only direct children
    - Test `upsert` and `remove` update both internal maps
    - Test `search` returns all matching items and no false positives
    - _Requirements: 2.4, 2.10_

  - [ ]* 4.3 Write property test for object ID stability
    - For any absolute file path string, verify `sha1(path).slice(0, 16)` always produces the same result (idempotent)
    - _Requirements: 1.5_

  - [ ]* 4.4 Write property test for search correctness
    - **Property 6: Search Returns Exactly the Set of Matching Items**
    - **Validates: Requirements 2.10**

  - [ ]* 4.5 Write property test for extension filtering
    - **Property 11: Only Files with Supported Extensions Are Indexed**
    - **Validates: Requirements 6.5**

- [x] 5. MediaScanner
  - [x] 5.1 Implement `MediaScanner` in `src/media/MediaScanner.ts`
    - Recursively walk directories using `fs.readdir` with `{ withFileTypes: true }` and `recursive: true`
    - Filter files by supported extensions: `.mp4`, `.mkv`, `.avi`, `.mov`, `.mp3`, `.flac`, `.aac`, `.m4a`, `.jpg`, `.jpeg`, `.png`
    - Implement MIME type map as defined in design section 2.9
    - Implement DLNA profile map as defined in design section 3.4
    - Invoke `ffprobe` via `fluent-ffmpeg` to extract `duration`, `width`, `height`, `videoCodec`, `audioBitrate`, `audioSampleRate`
    - Rate-limit concurrent `ffprobe` calls to a maximum of 4 using a semaphore/queue
    - Log a warning and continue (without metadata) when `ffprobe` is not installed
    - Skip non-existent configured directories with a warning log
    - _Requirements: 6.1, 6.5, 2.7, 2.8_

  - [ ]* 5.2 Write unit tests for MediaScanner
    - Test extension filtering: accepted extensions indexed, others skipped
    - Test MIME type map: each supported extension maps to the correct MIME type
    - Test DLNA profile map: each extension maps to the correct profile string
    - Test graceful handling when `ffprobe` returns null/errors
    - _Requirements: 6.5, 2.7, 2.8_

- [ ] 6. FilesystemWatcher
  - [ ] 6.1 Update `FilesystemWatcher` in `src/media/FilesystemWatcher.ts` to be conditionally activated
    - Wrap `chokidar@3.6.0` with `usePolling: false` and `awaitWriteFinish: { stabilityThreshold: 2000 }` — unchanged
    - Emit `add` → call `index.upsert`, `change` → call `index.upsert` (re-probe), `unlink` → call `index.remove` — unchanged
    - Expose `start(dirs: string[])` and `stop()` methods — unchanged
    - No changes to `FilesystemWatcher` itself; activation is controlled by `MediaLibrary` based on `watchMode`
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

- [ ] 7. MediaLibrary
  - [ ] 7.1 Update `MediaLibrary` in `src/media/MediaLibrary.ts` to support `watchMode`
    - Accept `config: ServerConfig` (or the relevant subset) in the constructor
    - `startWatching()` dispatches on `config.watchMode`:
      - `"fsevents"`: start `FilesystemWatcher` on all configured directories (existing behaviour)
      - `"interval"`: start a `setInterval` that scans each directory **sequentially** (one `scanner.scanDirectory(dir)` at a time, awaited in order) to stagger disk I/O; period = `config.scanIntervalSeconds * 1000` ms; log scan start/complete with timestamp and item delta
      - `"manual"`: no-op — do not start watcher or timer
    - `stopWatching()`: stop the active watcher or clear the interval timer, whichever is running
    - Add `async refresh(): Promise<void>` that runs a full sequential re-scan of all directories (same staggered approach as `"interval"` mode); used by `POST /library/refresh`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8_

  - [ ]* 7.2 Write property test for container hierarchy
    - **Property 4: Container Hierarchy Mirrors Filesystem Directory Structure**
    - **Validates: Requirements 2.4**

  - [ ]* 7.3 Write property test for multiple root directories
    - **Property 10: Multiple Root Directories Become Top-Level Containers**
    - **Validates: Requirements 5.2**

  - [ ]* 7.4 Write property test for watchMode activation behaviour
    - **Property 18: watchMode Controls Whether Automatic Re-Scan Occurs**
    - **Validates: Requirements 6.6, 6.7, 6.8**

- [x] 8. Checkpoint — media layer
  - Ensure all tests in tasks 2–7 pass
  - Verify `MediaIndex.search` and `getChildren` behave correctly with a synthetic index fixture
  - Ask the user if questions arise.

- [x] 9. DeviceRegistry
  - [x] 9.1 Implement `DeviceRegistry` in `src/auth/DeviceRegistry.ts`
    - Persist registered IPs to `~/.config/dlna-media-server/devices.json` as `{ "registeredIps": [...] }`
    - Implement `load()` (called at startup), `registerDevice(ip)`, `isRegistered(ip)`, and `persist()`
    - `load()` is a no-op if the file does not exist (empty registry on first run)
    - _Requirements: 10.2, 10.3, 10.5_

  - [ ]* 9.2 Write unit tests for DeviceRegistry
    - Test load from missing file produces empty registry
    - Test `registerDevice` adds to `registeredIps` set
    - Test `persist` + `load` round-trip restores the same set
    - _Requirements: 10.5_

  - [ ]* 9.3 Write property test for DeviceRegistry serialisation round-trip
    - **Property 17: DeviceRegistry Serialisation Round-Trip Preserves Registered IP Set**
    - **Validates: Requirements 10.5**

- [x] 10. HTTP server setup (Fastify)
  - [x] 10.1 Create `src/http/server.ts` that builds and returns a Fastify instance
    - Configure `Fastify({ logger: false })` (pino logger passed separately)
    - Register `content-type-parser` for `text/xml` and `application/soap+xml` SOAP bodies
    - Expose `start(port: number)` and `stop()` methods wrapping `fastify.listen` and `fastify.close`
    - Export route registration functions to be called during wiring
    - _Requirements: 5.5_

  - [x] 10.2 Implement `AuthMiddleware` in `src/auth/AuthMiddleware.ts`
    - Register an `onRequest` Fastify hook on all routes except `POST /pin` and `GET /device.xml`
    - Normalise IPv4-mapped IPv6 addresses (strip `::ffff:` prefix)
    - If `config.pin` is empty string → always pass through
    - If IP is in `DeviceRegistry.registeredIps` → pass through
    - Otherwise → reply with HTTP 401 and `WWW-Authenticate: PIN` header
    - _Requirements: 10.1, 10.4, 10.6_

  - [ ]* 10.3 Write property test for unregistered device 401 enforcement
    - **Property 15: Unregistered Device Receives 401 on All Protected Routes**
    - **Validates: Requirements 10.1, 10.4**

  - [x] 10.4 Implement `PINHandler` in `src/auth/PINHandler.ts`
    - Register `POST /pin` route on the Fastify instance
    - Parse JSON body `{ "pin": string }`
    - If PIN matches config → `DeviceRegistry.registerDevice(clientIp)`, return HTTP 200
    - Otherwise → log failed attempt with client IP, return HTTP 403
    - _Requirements: 10.2_

  - [ ]* 10.5 Write unit tests for PINHandler
    - Test correct PIN returns 200 and registers the IP
    - Test wrong PIN returns 403 and does not register
    - _Requirements: 10.2_

  - [ ]* 10.6 Write property test for PIN registration granting access
    - **Property 16: PIN Registration Grants Persistent Subsequent Access**
    - **Validates: Requirements 10.2, 10.3**

- [x] 11. ContentDirectoryService
  - [x] 11.1 Implement SOAP parsing helper in `src/services/soapParser.ts`
    - Use `fast-xml-parser@4.4.1` to parse SOAP envelope XML
    - Extract action name from `SOAPAction` header or envelope body
    - Extract arguments map from the action element
    - Return HTTP 400 + UPnP error 402 on malformed XML
    - _Requirements: 2.1_

  - [ ]* 11.2 Write unit tests for SOAP parsing
    - Test correct extraction of action name and arguments from valid SOAP envelopes
    - Test error response on malformed XML bodies
    - _Requirements: 2.1_

  - [x] 11.3 Implement DIDL-Lite serialiser in `src/services/didlSerializer.ts`
    - Serialise `MediaItem` and `Container` objects to DIDL-Lite XML string
    - Always include mandatory fields: `@id`, `@parentID`, `@restricted`, `upnp:class`, `dc:title`, `res` with `protocolInfo` and `@size`
    - Conditionally include `res@duration` and `res@resolution` only when non-null
    - Conditionally include `res@bitrate` and `res@sampleFrequency` only when audio item with non-null values
    - Conditionally include `dlna:profileID` attribute only when `dlnaProfile` is non-null
    - Implement `Filter` support: when Filter ≠ `*`, omit optional fields not listed in the comma-separated filter string; always include mandatory fields
    - _Requirements: 2.2, 2.3, 2.6, 2.7, 2.8, 7.3, 7.4, 7.5_

  - [ ]* 11.4 Write unit tests for DIDL-Lite serialiser
    - Test all required fields are always present
    - Test optional metadata fields are conditionally included/excluded
    - Test Filter `*` returns all fields
    - Test specific Filter values return only requested fields plus mandatory fields
    - _Requirements: 2.3, 2.6, 7.4, 7.5_

  - [ ]* 11.5 Write property test for DIDL-Lite serialisation completeness
    - **Property 3: DIDL-Lite Serialisation Includes All Required and Applicable Fields**
    - **Validates: Requirements 2.3, 2.6, 2.7, 2.8, 7.3**

  - [ ]* 11.6 Write property test for DIDL-Lite filter field selection
    - **Property 12: DIDL-Lite Filter Field Selection Is Respected**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 11.7 Implement `ContentDirectoryService` in `src/services/ContentDirectoryService.ts`
    - Handle `Browse` action: parse `ObjectID`, `BrowseFlag`, `Filter`, `StartingIndex`, `RequestedCount`
    - `BrowseDirectChildren`: fetch direct children from `MediaIndex`, apply pagination, serialise to DIDL-Lite
    - `BrowseMetadata`: fetch single item by ID, serialise to DIDL-Lite
    - Handle `Search` action: parse `ContainerID`, `SearchCriteria`, `Filter`, `StartingIndex`, `RequestedCount`
    - Match `SearchCriteria` against pattern `dc:title contains "<term>"` (case-insensitive); return UPnP error 720 for unsupported patterns
    - Apply pagination and wrap results in SOAP response envelope
    - Register `POST /cd/control` route on Fastify instance
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.9, 2.10, 2.11, 2.12_

  - [ ]* 11.8 Write unit tests for ContentDirectoryService
    - Test `BrowseDirectChildren` returns correct children for a known container
    - Test `BrowseMetadata` returns correct single item
    - Test pagination: `TotalMatches`, `NumberReturned`, correct slice
    - Test `Search` with matching and non-matching terms
    - Test unsupported `SearchCriteria` returns UPnP error 720
    - _Requirements: 2.2, 2.3, 2.5, 2.10, 2.12_

  - [ ]* 11.9 Write property test for BrowseDirectChildren result set
    - **Property 2: Browse Direct Children Returns Exactly the Direct Children**
    - **Validates: Requirements 2.2**

  - [ ]* 11.10 Write property test for pagination invariants
    - **Property 5: Pagination Invariants Hold for Browse and Search**
    - **Validates: Requirements 2.5, 2.11**

  - [ ]* 11.11 Write property test for unsupported SearchCriteria
    - **Property 7: Unsupported SearchCriteria Returns UPnP Error 720**
    - **Validates: Requirements 2.12**

- [x] 12. ConnectionManagerService
  - [x] 12.1 Implement `ConnectionManagerService` in `src/services/ConnectionManagerService.ts`
    - Handle `GetProtocolInfo` SOAP action
    - Return static `SourceProtocolInfo` list for all supported MIME types: `video/mp4`, `video/x-matroska`, `video/avi`, `video/quicktime`, `audio/mpeg`, `audio/flac`, `audio/aac`, `audio/mp4`, `image/jpeg`, `image/png`
    - Wrap response in SOAP envelope
    - Register `POST /cm/control` route on Fastify instance
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 12.2 Write unit tests for ConnectionManagerService
    - Test `GetProtocolInfo` returns all required MIME types in `SourceProtocolInfo`
    - _Requirements: 3.2, 3.3_

- [ ] 12.5 Library refresh endpoint
  - [ ] 12.5.1 Implement `POST /library/refresh` route in `src/http/LibraryRefreshHandler.ts`
    - Register `POST /library/refresh` on the Fastify instance (protected by `AuthMiddleware`)
    - Call `mediaLibrary.refresh()` and await completion
    - Return HTTP 200 with JSON body `{ "itemCount": <number> }` on success
    - Return HTTP 503 with `{ "error": "Scan already in progress" }` if a scan is already running (guard with a boolean flag)
    - Log scan start, completion, and item count delta at INFO level
    - _Requirements: 6.8_

  - [ ]* 12.5.2 Write unit tests for LibraryRefreshHandler
    - Test 200 response with correct `itemCount` after successful refresh
    - Test 503 when a scan is already running
    - _Requirements: 6.8_

- [x] 13. DeviceDescription endpoints
  - [x] 13.1 Implement `DeviceDescription` in `src/http/DeviceDescription.ts`
    - Register `GET /device.xml` route that serves the UPnP device description XML
    - Include `friendlyName` from config, persistent UDN (generated once with `uuid@9.0.1` and stored in config dir), `manufacturer`, `modelName`
    - Include `serviceList` with ContentDirectory:1 and ConnectionManager:1 service entries
    - Include `X_DLNADOC: DMS-1.50` in the response (also served as a device capability element)
    - Register `GET /cd/scpd.xml` and `GET /cm/scpd.xml` routes that serve static SCPD XML documents
    - _Requirements: 1.4, 1.5, 7.1, 7.2_

  - [ ]* 13.2 Write unit tests for DeviceDescription
    - Test `/device.xml` contains required UPnP fields: `friendlyName`, `UDN`, service URLs
    - Test UDN is stable across multiple calls (generated once)
    - _Requirements: 1.4, 1.5_

- [x] 14. MediaStreamer
  - [x] 14.1 Implement range header parser in `src/http/rangeParser.ts`
    - Parse `Range: bytes=start-end`, `bytes=start-`, `bytes=-suffix` forms
    - Return `{ start: number, end: number }` or `null` if header absent
    - Clamp range values to actual file size
    - _Requirements: 4.2_

  - [ ]* 14.2 Write unit tests for range header parsing
    - Test `bytes=0-499`, `bytes=500-`, `bytes=-100`, absent header, malformed values
    - _Requirements: 4.2_

  - [x] 14.3 Implement `MediaStreamer` in `src/http/MediaStreamer.ts`
    - Register `GET /stream/:itemId` and `HEAD /stream/:itemId` routes on Fastify instance
    - Look up `itemId` in `MediaIndex`; return HTTP 404 if not found; log warn with file path
    - For `HEAD` requests: return headers only with correct `Content-Length`
    - Parse `Range` header; open `fs.createReadStream(filePath, { start, end })` for range requests
    - Set response headers: `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`
    - Set DLNA headers: `transferMode.dlna.org` (`Streaming` for video/audio, `Interactive` for images), `contentFeatures.dlna.org` with `DLNA.ORG_PN=<profile>;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000`
    - Return HTTP 206 with `Content-Range` header for range requests, HTTP 200 for full requests
    - Catch read errors during streaming, abort response, and log error
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 7.3_

  - [ ]* 14.4 Write unit tests for MediaStreamer
    - Test 200 response with correct Content-Type for known item
    - Test 206 response with correct Content-Range for range request
    - Test 404 for unknown itemId
    - Test HEAD returns headers without body
    - _Requirements: 4.1, 4.2, 4.5_

  - [ ]* 14.5 Write property test for streaming response headers
    - **Property 8: Streaming Response Contains Correct Content-Type and DLNA Headers**
    - **Validates: Requirements 4.1, 4.3, 7.x**

  - [ ]* 14.6 Write property test for byte-range requests
    - **Property 9: Byte-Range Requests Return HTTP 206 with Correct Range**
    - **Validates: Requirements 4.2**

- [x] 15. Checkpoint — HTTP services
  - Ensure all tests in tasks 9–14 pass
  - Ask the user if questions arise.

- [x] 16. SSDPServer
  - [x] 16.1 Implement `SSDPServer` in `src/ssdp/SSDPServer.ts`
    - Create UDP socket via `dgram.createSocket('udp4')` with `reuseAddr: true`; bind to port 1900; join multicast group `239.255.255.250` on all interfaces
    - Send five `ssdp:alive` NOTIFY messages at startup (one per USN variant: `upnp:rootdevice`, bare UUID, `MediaServer:1`, `ContentDirectory:1`, `ConnectionManager:1`)
    - Repeat `ssdp:alive` every 1800 seconds (`setInterval`)
    - Respond to `M-SEARCH` requests within a random delay of `0..min(MX, 5)` seconds with a unicast HTTP/1.1 200 OK containing `LOCATION`, `ST`, `USN`, `X-DLNADOC: DMS-1.50`, `SERVER`, and `CACHE-CONTROL: max-age=3600`
    - Send five `ssdp:byebye` NOTIFY messages on `stop()`
    - Implement `SSDPConfig` interface with `port`, `location`, `udn`, `serverName`
    - _Requirements: 1.1, 1.2, 1.3, 7.2_

  - [ ]* 16.2 Write unit tests for SSDPServer
    - Test `sendAlive` produces correctly formatted NOTIFY messages for all five USN variants
    - Test `M-SEARCH` response contains required fields: `LOCATION`, `ST`, `USN`, `X-DLNADOC`
    - Test delay is capped at 5 seconds regardless of `MX` value
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 16.3 Write property test for M-SEARCH response fields
    - **Property 1: SSDP M-SEARCH Response Contains Required Fields**
    - **Validates: Requirements 1.3, 7.2**

- [x] 17. Request logging middleware
  - [x] 17.1 Implement HTTP request logging in `src/http/requestLogger.ts`
    - Register a Fastify `onResponse` hook that logs `method`, `url`, `remoteAddress`, `statusCode`, `responseTime`
    - Register a Fastify `onSend` hook (or wrapper in ContentDirectory/ConnectionManager) that logs `soapAction`, `serviceType`, `responseStatus` for SOAP routes
    - _Requirements: 8.2, 8.3_

  - [ ]* 17.2 Write property test for structured log fields
    - **Property 13: Log Entries Contain All Required Structured Fields**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 18. Main entry point and graceful shutdown
  - [x] 18.1 Create `src/index.ts` as the application entry point
    - Instantiate and wire all components: `ConfigLoader` → `pino logger` → `DeviceRegistry` → `MediaIndex` → `MediaLibrary` → `ContentDirectoryService` → `ConnectionManagerService` → `DeviceDescription` → `MediaStreamer` → `PINHandler` → `AuthMiddleware` → `SSDPServer`
    - Start HTTP server, then run `MediaLibrary.initialScan()`, then `MediaLibrary.startWatching()`, then `SSDPServer.start()`
    - Log startup completion with bound address and port
    - Register `process.on('SIGTERM', handler)` implementing the shutdown sequence from design section 7.2:
      1. Stop accepting new connections (`httpServer.stop()`)
      2. Drain active streams (max 10s via counter + Promise)
      3. Send `ssdp:byebye` (`ssdpServer.sendByebye()`)
      4. Close SSDP socket (`ssdpServer.stop()`)
      5. Persist device registry (`deviceRegistry.persist()`)
      6. `process.exit(0)`
    - _Requirements: 9.4, 4.4, 8.4_

- [x] 19. macOS launchd integration
  - [x] 19.1 Create `deploy/com.dlna-media-server.plist` with the launchd configuration from design section 7.1
    - Include `RunAtLoad: true`, `KeepAlive: true`, `ThrottleInterval: 10`, `ProcessType: Background`, `UserName: _dlna`
    - Set `StandardOutPath` and `StandardErrorPath` to `/var/log/dlna-media-server/`
    - Set `DLNA_CONFIG` env var pointing to `/etc/dlna-media-server/config.json`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 19.2 Create `install.sh` installation script
    - Create `_dlna` system user via `dscl`
    - Copy built application to `/opt/dlna-media-server/`
    - Create `/etc/dlna-media-server/config.json` with defaults if absent
    - Create `/var/log/dlna-media-server/` directory
    - Copy plist to `/Library/LaunchDaemons/` and run `launchctl load`
    - Resolve Node.js path at install time (Homebrew path detection)
    - _Requirements: 9.1, 9.2_

- [ ] 20. Integration tests
  - [ ]* 20.1 Write integration test for device description endpoint
    - Start server on random port with in-memory config fixture
    - GET `/device.xml`, assert valid XML with `friendlyName`, `UDN`, service entries
    - _Requirements: 1.4, 1.5_

  - [ ]* 20.2 Write integration test for Browse root
    - POST Browse SOAP action for `ObjectID="0"` with `BrowseDirectChildren`
    - Assert valid DIDL-Lite response containing the configured root containers
    - _Requirements: 2.2, 5.2_

  - [ ]* 20.3 Write integration test for media streaming
    - GET `/stream/:id` for a known item in a temporary test directory
    - Assert HTTP 200 with correct `Content-Type` and body bytes
    - Assert HTTP 206 with `Content-Range` when `Range` header is provided
    - _Requirements: 4.1, 4.2_

  - [ ]* 20.4 Write integration test for PIN authentication flow
    - With PIN configured, send Browse request without registration → assert 401
    - POST correct PIN to `/pin` → assert 200
    - Send Browse request again → assert 200 with DIDL-Lite response
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 20.5 Write integration test for SSDP M-SEARCH response
    - Send a UDP M-SEARCH to the bound SSDP socket
    - Assert a unicast response arrives within 5 seconds containing `LOCATION`, `ST`, `USN`
    - _Requirements: 1.3_

- [x] 21. Final checkpoint — full integration
  - Ensure all unit and integration tests pass (`npm test`)
  - Verify `npm run build` compiles without TypeScript errors
  - Ask the user if questions arise.

## Notes

- Sub-tasks marked with `*` are optional and can be skipped for a faster initial implementation. All property-based and unit test tasks fall in this category.
- Each task references specific requirements for traceability.
- Checkpoints in tasks 8, 15, and 21 ensure incremental validation at meaningful milestones.
- Property tests use `fast-check` configured for a minimum of 100 iterations per property. Tag each property test with `// Feature: dlna-media-server, Property N: <property_text>`.
- The `_dlna` system user created in task 19 requires macOS administrator privileges to install.
- `ffprobe` must be installed separately (via `brew install ffmpeg`) and is not bundled with the application.
