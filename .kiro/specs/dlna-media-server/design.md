# Design Document: DLNA Media Server

## Overview

The DLNA Media Server is a Node.js (TypeScript) application that runs as a macOS LaunchDaemon on a Mac mini home NAS. It exposes locally stored media files to DLNA-compatible client devices — primarily a Samsung Tizen TV — over the local network using the UPnP AV (Audio/Video) protocol stack.

### Language and Runtime Choice: Node.js (TypeScript)

**Chosen stack:** Node.js 20 LTS with TypeScript 5.x.

**Rationale:**

| Criterion | Node.js | Go | Python |
|---|---|---|---|
| HTTP + UDP in stdlib | ✓ (http, dgram) | ✓ (net/http, net) | ✓ (http.server, socket) |
| macOS FSEvents support | ✓ native (chokidar / fsevents) | Polling only (fsnotify) | Polling by default |
| XML generation | Inline template strings | text/template | lxml / ElementTree |
| Async I/O for streaming | ✓ event-loop native | goroutines | asyncio |
| Deployment simplicity on macOS | npm install, no compile | Single binary (good) | Virtualenv/dependency mgmt |
| Community DLNA/UPnP references | Many examples | Limited | Dated |

Go would produce a single self-contained binary (a real deployment advantage), but `fsnotify` on macOS falls back to kqueue which is less efficient than FSEvents for large directory trees. Python's asyncio model can handle this workload but the DLNA ecosystem is much more actively explored in Node.js, and TypeScript gives us the type-safety we want for the complex XML/SOAP data model.

Node.js wins because:
1. `chokidar` uses native Darwin FSEvents for efficient recursive watching with no polling.
2. Node.js streams are a natural fit for HTTP byte-range serving (pipe a `fs.createReadStream` with `start`/`end` options directly into the response).
3. The `dgram` module handles UDP multicast natively for SSDP.
4. No compilation step required for deployment; `node` is available on macOS via Homebrew or the official installer.
5. TypeScript gives strong typing for the UPnP SOAP/XML data model.

**Key dependencies (pinned):**
- `chokidar@3.6.0` — filesystem watcher using FSEvents on macOS
- `fast-xml-parser@4.4.1` — XML parsing for SOAP request bodies
- `uuid@9.0.1` — UDN generation
- `fluent-ffmpeg@2.1.3` + system `ffprobe` — media metadata extraction
- `pino@9.3.2` — structured JSON logging

No existing UPnP framework is used. The UPnP/SSDP/SOAP layers are implemented from scratch to maintain full control over protocol details required for Samsung Tizen TV compatibility. The implementation surface is small enough (two services: ContentDirectory and ConnectionManager) that a framework would add more complexity than it removes.

---

## Architecture

The server is structured as a set of cooperating modules with clear boundaries:

```
┌─────────────────────────────────────────────────────────────────┐
│                        DLNA Media Server                        │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────────────────────────┐   │
│  │ SSDPServer   │   │          HTTP Server (Fastify)        │   │
│  │  (UDP/1900)  │   │                                       │   │
│  │              │   │  /device.xml   → DeviceDescription    │   │
│  │ • alive      │   │  /cd/control   → ContentDirectory     │   │
│  │ • byebye     │   │  /cm/control   → ConnectionManager    │   │
│  │ • M-SEARCH   │   │  /cd/scpd.xml  → SCPD (CDS)          │   │
│  │   response   │   │  /cm/scpd.xml  → SCPD (CMS)          │   │
│  └──────┬───────┘   │  /stream/:id   → MediaStreamer        │   │
│         │           │  /pin          → PINHandler           │   │
│         │           └──────────────────────────────────────┘   │
│         │                           │                           │
│         └──────────┬────────────────┘                           │
│                    │                                            │
│            ┌───────▼────────┐                                   │
│            │  AuthMiddleware │  (device registry, PIN check)    │
│            └───────┬────────┘                                   │
│                    │                                            │
│    ┌───────────────┼───────────────┐                            │
│    │               │               │                            │
│  ┌─▼──────────┐ ┌──▼──────────┐ ┌─▼──────────────┐            │
│  │ContentDir  │ │ Connection  │ │  MediaStreamer  │            │
│  │ Service    │ │  Manager    │ │                │            │
│  │            │ │  Service    │ │ Range/byte     │            │
│  │ Browse     │ └─────────────┘ │ serving        │            │
│  │ Search     │                 └────────────────┘            │
│  └─────┬──────┘                                               │
│        │                                                       │
│  ┌─────▼──────────────────┐                                    │
│  │     MediaLibrary        │                                    │
│  │                         │                                    │
│  │ ┌─────────────────────┐ │                                    │
│  │ │    MediaScanner     │ │  (startup full scan)               │
│  │ └─────────────────────┘ │                                    │
│  │ ┌─────────────────────┐ │                                    │
│  │ │   FilesystemWatcher │ │  (chokidar / FSEvents)             │
│  │ └─────────────────────┘ │                                    │
│  │ ┌─────────────────────┐ │                                    │
│  │ │    MediaIndex       │ │  (in-memory Map + persistence)     │
│  │ └─────────────────────┘ │                                    │
│  └─────────────────────────┘                                    │
│                                                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐ │
│  │   DeviceRegistry    │  │        ConfigLoader              │ │
│  │  (PIN auth, persist)│  │   (config.json validation)       │ │
│  └─────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Process and Thread Model

Node.js runs single-threaded. All I/O (UDP, HTTP, filesystem) is non-blocking. `ffprobe` calls are spawned as child processes and their results awaited asynchronously. The media index is held entirely in memory (a `Map<string, MediaItem>`) and persisted to disk only for startup warm-up — it is always rebuilt from disk on startup to stay consistent.

There is no worker-thread parallelism. The event loop handles concurrent streaming naturally because `fs.createReadStream` is async. Per requirement 4.4, at least two simultaneous streams are supported with no additional architecture — the HTTP server handles N concurrent connections by default.

---

## Components and Interfaces

### 2.1 ConfigLoader

Reads and validates `config.json` at the path `~/.config/dlna-media-server/config.json` (overridable via `DLNA_CONFIG` environment variable).

```typescript
interface ServerConfig {
  friendlyName: string;          // Display name shown to DLNA clients
  port: number;                  // HTTP port, default 8200
  mediaDirectories: string[];    // Absolute paths to media root directories
  pin: string;                   // Authentication PIN; empty string = no auth
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}
```

On malformed or missing config, the process logs a descriptive error and exits with code 1.

### 2.2 SSDPServer

Implemented using Node.js `dgram` (UDP sockets). Joins the SSDP multicast group `239.255.255.250:1900` on all network interfaces.

**Responsibilities:**
- Send `ssdp:alive` NOTIFY messages at startup (and every 1800s / half of `max-age=3600`)
- Send `ssdp:byebye` NOTIFY messages on SIGTERM
- Respond to `M-SEARCH` unicast replies within the requested `MX` delay (capped at 5 seconds)
- Advertise four USN (Unique Service Name) variants as required by UPnP 1.1:
  - `uuid:<udn>::upnp:rootdevice`
  - `uuid:<udn>`
  - `uuid:<udn>::urn:schemas-upnp-org:device:MediaServer:1`
  - `uuid:<udn>::urn:schemas-upnp-org:service:ContentDirectory:1`
  - `uuid:<udn>::urn:schemas-upnp-org:service:ConnectionManager:1`

**Interface:**
```typescript
class SSDPServer {
  constructor(config: SSDPConfig);
  start(): Promise<void>;
  sendAlive(): void;
  sendByebye(): void;
  stop(): Promise<void>;
}
```

### 2.3 HTTP Server (Fastify)

Fastify 4.x is chosen over the bare `http` module for its plugin architecture and built-in schema validation. It listens on `0.0.0.0:<port>`.

Routes:
| Method | Path | Handler |
|---|---|---|
| GET | `/device.xml` | Device description XML |
| POST | `/cd/control` | ContentDirectory SOAP actions |
| GET | `/cd/scpd.xml` | ContentDirectory service description |
| POST | `/cm/control` | ConnectionManager SOAP actions |
| GET | `/cm/scpd.xml` | ConnectionManager service description |
| GET/HEAD | `/stream/:itemId` | Media file streaming |
| POST | `/pin` | PIN authentication endpoint |

### 2.4 AuthMiddleware

A Fastify `onRequest` hook that runs on all routes except `/pin` and `/device.xml`.

Logic:
1. Extract client IP from `request.socket.remoteAddress` (normalised for IPv4-mapped IPv6).
2. If PIN is empty in config → pass through unconditionally.
3. If client IP is in `DeviceRegistry.registeredIps` → pass through.
4. Otherwise → return HTTP 401 with `WWW-Authenticate: PIN` header.

### 2.5 ContentDirectoryService

Handles `Browse` and `Search` SOAP actions against the `MediaIndex`.

**Browse logic:**
- Parse SOAP envelope to extract `ObjectID`, `BrowseFlag`, `Filter`, `StartingIndex`, `RequestedCount`
- If `BrowseFlag=BrowseDirectChildren`: fetch all direct children of container `ObjectID` from the index, apply pagination
- If `BrowseFlag=BrowseMetadata`: fetch the single item/container by `ObjectID`
- Serialise results to DIDL-Lite XML
- Wrap in SOAP response envelope

**Search logic:**
- Parse `ContainerID`, `SearchCriteria`, `Filter`, `StartingIndex`, `RequestedCount`
- Only supported criteria pattern: `dc:title contains "<term>"` (case-insensitive substring match)
- Unsupported pattern → UPnP error 720
- Apply pagination and return DIDL-Lite XML

```typescript
class ContentDirectoryService {
  constructor(index: MediaIndex);
  handleSoapAction(action: string, body: string): Promise<string>;  // returns XML string
  private handleBrowse(args: BrowseArgs): BrowseResult;
  private handleSearch(args: SearchArgs): SearchResult;
  private serialiseToDIDL(items: Array<MediaItem | Container>, filter: string): string;
}
```

### 2.6 ConnectionManagerService

Handles `GetProtocolInfo` SOAP action only. Returns a static list of supported MIME types:

```
video/mp4, video/x-matroska, video/avi, video/quicktime,
audio/mpeg, audio/flac, audio/aac, audio/mp4,
image/jpeg, image/png
```

### 2.7 MediaStreamer

Handles `GET` and `HEAD` requests for `/stream/:itemId`.

**Range handling:**
1. Look up `itemId` in `MediaIndex` — 404 if not found.
2. Parse `Range: bytes=start-end` header if present.
3. Open `fs.createReadStream(filePath, { start, end })`.
4. Set response headers:
   - `Content-Type: <mimeType>`
   - `Content-Length: <byteLength>`
   - `Accept-Ranges: bytes`
   - `transferMode.dlna.org: Streaming` (for video/audio) or `Interactive` (for images)
   - `contentFeatures.dlna.org: DLNA.ORG_PN=<profile>;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000`
5. For range requests: status 206, `Content-Range: bytes start-end/total`
6. Pipe the read stream to the response.

`DLNA.ORG_OP=01` means byte-seek (Range header) is supported but time-seek is not.

### 2.8 MediaLibrary

Coordinates the MediaScanner and FilesystemWatcher and owns the MediaIndex.

```typescript
class MediaLibrary {
  constructor(dirs: string[], index: MediaIndex);
  async initialScan(): Promise<void>;
  startWatching(): void;
  stopWatching(): void;
}
```

### 2.9 MediaScanner

Recursively walks configured directories, identifies media files by extension, and calls `ffprobe` to extract metadata.

**Supported extensions:** `.mp4`, `.mkv`, `.avi`, `.mov`, `.mp3`, `.flac`, `.aac`, `.m4a`, `.jpg`, `.jpeg`, `.png`

**MIME type map:**
```
.mp4  → video/mp4
.mkv  → video/x-matroska
.avi  → video/avi
.mov  → video/quicktime
.mp3  → audio/mpeg
.flac → audio/flac
.aac  → audio/aac
.m4a  → audio/mp4
.jpg  → image/jpeg
.jpeg → image/jpeg
.png  → image/png
```

For non-image files, `ffprobe` is invoked to extract duration, video resolution, audio bitrate, and sample rate. `ffprobe` calls are rate-limited to a concurrency of 4 to avoid hammering the Mac mini during initial scan of large libraries.

```typescript
class MediaScanner {
  async scanDirectory(dir: string): Promise<void>;
  async probeFile(filePath: string): Promise<ProbeResult | null>;
}
```

### 2.10 FilesystemWatcher

Wraps `chokidar` configured with `usePolling: false` (FSEvents) and `awaitWriteFinish: { stabilityThreshold: 2000 }` (waits for writes to complete before indexing a file).

Events mapped to MediaLibrary actions:
- `add` → `MediaIndex.upsert(filePath)`
- `change` → `MediaIndex.upsert(filePath)` (re-probe metadata)
- `unlink` → `MediaIndex.remove(filePath)`

### 2.11 MediaIndex

In-memory store for the full media tree. Backed by two `Map` instances:

```typescript
class MediaIndex {
  // Map from objectId → MediaItem or Container
  private items: Map<string, MediaItem | Container>;
  // Map from filePath → objectId (for watcher events)
  private pathToId: Map<string, string>;

  getById(id: string): MediaItem | Container | undefined;
  getChildren(parentId: string): Array<MediaItem | Container>;
  upsert(filePath: string, metadata: FileMetadata): void;
  remove(filePath: string): void;
  search(term: string): MediaItem[];
  getAllItems(): MediaItem[];
}
```

Object IDs are stable, path-derived strings: `sha1(absoluteFilePath)` truncated to 16 hex chars. This ensures IDs survive server restarts without a separate persistence mechanism.

### 2.12 DeviceRegistry

Persists authenticated IP addresses to `~/.config/dlna-media-server/devices.json`.

```typescript
class DeviceRegistry {
  readonly registeredIps: Set<string>;
  registerDevice(ip: string): void;       // adds to set, persists
  isRegistered(ip: string): boolean;
  load(): void;                           // called at startup
}
```

### 2.13 PINHandler

POST `/pin` — accepts a JSON body `{ "pin": "1234" }`.
- If PIN matches config → call `DeviceRegistry.registerDevice(clientIp)`, return 200.
- Otherwise → return 403.
- No rate-limiting is specified in requirements, but the handler logs failed attempts.

---

## Data Models

### 3.1 MediaItem

```typescript
interface MediaItem {
  id: string;                 // sha1-derived object ID
  parentId: string;           // parent container ID
  type: 'item';
  title: string;              // filename without extension
  filePath: string;           // absolute path on disk
  mimeType: string;
  fileSize: number;           // bytes
  resourceUrl: string;        // http://host:port/stream/<id>

  // Video metadata (optional)
  duration?: string;          // "HH:MM:SS.mmm" (DIDL-Lite format)
  resolution?: string;        // "WxH"
  videoCodec?: string;

  // Audio metadata (optional)
  bitrate?: number;           // bits/second
  sampleRate?: number;        // Hz

  // DLNA profile
  dlnaProfile?: string;       // e.g. "AVC_MP4_BL_L3_SD_AAC", "MP3", "JPEG_LRG"
}
```

### 3.2 Container

```typescript
interface Container {
  id: string;
  parentId: string;
  type: 'container';
  title: string;
  childCount: number;
}
```

The root object always has `id = "0"` and `parentId = "-1"` per UPnP ContentDirectory convention.

### 3.3 FileMetadata (ffprobe output shape)

```typescript
interface FileMetadata {
  duration?: number;       // seconds (float)
  width?: number;
  height?: number;
  videoCodec?: string;
  audioBitrate?: number;
  audioSampleRate?: number;
}
```

### 3.4 DLNA Profile Mapping

| Extension | DLNA Profile |
|---|---|
| `.mp4` (H.264) | `AVC_MP4_BL_L3_SD_AAC` |
| `.mkv` | `MATROSKA` |
| `.avi` | `AVI` |
| `.mov` | `QT` |
| `.mp3` | `MP3` |
| `.flac` | `FLAC` |
| `.aac` | `AAC_ADTS` |
| `.m4a` | `AAC_ISO` |
| `.jpg` / `.jpeg` | `JPEG_LRG` |
| `.png` | `PNG_LRG` |

### 3.5 ServerConfig (config.json schema)

```json
{
  "$schema": "...",
  "type": "object",
  "required": ["mediaDirectories"],
  "properties": {
    "friendlyName": { "type": "string", "default": "DLNA Media Server" },
    "port": { "type": "integer", "minimum": 1024, "maximum": 65535, "default": 8200 },
    "mediaDirectories": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "pin": { "type": "string", "default": "" },
    "logLevel": {
      "type": "string",
      "enum": ["DEBUG", "INFO", "WARN", "ERROR"],
      "default": "INFO"
    }
  }
}
```

### 3.6 devices.json (device registry persistence)

```json
{
  "registeredIps": ["192.168.1.50", "192.168.1.75"]
}
```

---

## Configuration File Format

The configuration file lives at `~/.config/dlna-media-server/config.json`. Example:

```json
{
  "friendlyName": "Mac Mini NAS",
  "port": 8200,
  "mediaDirectories": [
    "/Volumes/Media/Movies",
    "/Volumes/Media/Music",
    "/Volumes/Media/Photos"
  ],
  "pin": "4821",
  "logLevel": "INFO"
}
```

The `DLNA_CONFIG` environment variable overrides the default path, enabling the launchd plist to specify an alternate location for the daemon user's config.

---

## Sequence Diagrams

### 5.1 Device Discovery (SSDP)

```
Samsung TV                     DLNA Server (SSDP:1900)
    |                                  |
    |   (boot) NOTIFY ssdp:alive ──────►
    |                                  |  [server already running, sends periodic alive]
    |── M-SEARCH * HTTP/1.1 ──────────►|  [TV scanning for devices]
    |   ST: ssdp:all                   |
    |   MX: 3                          |
    |                                  |  [server waits random 0..MX seconds]
    |◄── HTTP/1.1 200 OK ──────────────|
    |    ST: urn:...MediaServer:1      |
    |    LOCATION: http://x.x.x.x:8200/device.xml
    |    USN: uuid:<udn>::...          |
    |                                  |
    |── GET /device.xml ──────────────►|  [TV fetches device description]
    |◄── 200 OK + device XML ──────────|
```

### 5.2 PIN Authentication

```
Samsung TV (not registered)      DLNA Server
    |                                  |
    |── POST /cd/control (Browse) ────►|
    |◄── 401 Unauthorized ─────────────|
    |                                  |
    |  [TV prompts user for PIN]       |
    |                                  |
    |── POST /pin  { "pin": "4821" } ─►|
    |                                  |  DeviceRegistry.register(ip)
    |◄── 200 OK ───────────────────────|
    |                                  |
    |── POST /cd/control (Browse) ────►|  [now passes auth]
    |◄── 200 OK + DIDL-Lite ───────────|
```

**Note on DLNA PIN UX:** Standard DLNA does not define a PIN handshake at the protocol level. The TV will receive a 401 on its first Browse attempt. The TV must then navigate to the server's PIN endpoint out-of-band. In practice, the administrator sets up the device once via a browser or `curl` call to `POST /pin`. An optional lightweight HTML page at `/` can provide a PIN entry form for initial setup.

### 5.3 Browse and Stream

```
Samsung TV                          DLNA Server
    |                                    |
    |── POST /cd/control ───────────────►|  Browse(ObjectID="0", BrowseDirectChildren)
    |◄── 200 OK + DIDL-Lite (containers)─|
    |                                    |
    |── POST /cd/control ───────────────►|  Browse(ObjectID="abc1", BrowseDirectChildren)
    |◄── 200 OK + DIDL-Lite (items) ─────|
    |                                    |
    |── GET /stream/item123 ────────────►|  [initial play]
    |   Range: bytes=0-                  |
    |◄── 206 Partial Content ────────────|
    |   Content-Type: video/mp4          |
    |   Content-Range: bytes 0-X/total   |
    |   transferMode.dlna.org: Streaming |
    |   [body: file bytes] ──────────────►
    |                                    |
    |── GET /stream/item123 ────────────►|  [seek to 00:10:00]
    |   Range: bytes=40000000-           |
    |◄── 206 Partial Content ────────────|
```

### 5.4 File System Change → Index Update

```
Disk                MediaLibrary              ContentDirectory
  |                      |                          |
  |  [new file added]    |                          |
  |── chokidar 'add' ───►|                          |
  |                 FilesystemWatcher               |
  |                      |── probe(filePath) ──────►ffprobe
  |                      |◄── FileMetadata ─────────|
  |                      |── MediaIndex.upsert() ──►|
  |                      |                   [updated in-memory index]
  |                      |                          |
  |  (within 30 seconds) [next Browse returns new item]
```

### 5.5 Graceful Shutdown (SIGTERM)

```
launchd                DLNA Server
    |                      |
    |── SIGTERM ───────────►|
    |                       |  1. stop accepting new connections
    |                       |  2. wait for in-flight streams to drain (max 10s)
    |                       |  3. send ssdp:byebye (UDP multicast)
    |                       |  4. close HTTP server
    |                       |  5. persist DeviceRegistry
    |                       |  6. process.exit(0)
```

---

## Error Handling

### HTTP Errors

| Condition | Response |
|---|---|
| Unregistered device (PIN enabled) | HTTP 401 |
| Wrong PIN submitted | HTTP 403 |
| Media file not found on disk | HTTP 404; log `WARN` with file path |
| Malformed SOAP body | HTTP 400 + UPnP error 402 (Invalid Args) |
| Unsupported SearchCriteria | HTTP 200 + UPnP error 720 in SOAP response body |
| Internal server error | HTTP 500; log `ERROR` with stack trace |

UPnP errors are returned as HTTP 200 with a SOAP fault envelope containing the UPnP error code and description, per UPnP Device Architecture 1.1 §3.

### Startup Errors

| Condition | Behaviour |
|---|---|
| Config file missing | Log descriptive error, exit 1 |
| Config file malformed JSON | Log parse error with line/column, exit 1 |
| Config file fails schema validation | Log validation errors, exit 1 |
| `mediaDirectories` contains non-existent path | Log warning, skip that directory, continue |
| `ffprobe` not installed | Log warning; serve files without metadata; duration/resolution fields omitted |
| UDP port 1900 bind fails | Log error (another SSDP server may be running), exit 1 |
| HTTP port bind fails | Log error (port in use), exit 1 |

### Streaming Errors

- Read errors during streaming (e.g., file deleted mid-stream) are caught, the response is aborted, and the error is logged.
- The client will experience a connection drop, which is the correct behaviour for a missing file mid-stream.

---

## Testing Strategy

### Unit Tests (Jest)

Unit tests cover pure logic with no I/O:

- **DIDL-Lite serialisation**: given a `MediaItem` or `Container`, assert the produced XML string contains correct elements and attributes.
- **SOAP parsing**: given raw SOAP XML strings, assert correct action name and argument extraction.
- **Search filtering**: given an in-memory index and a search term, assert correct item set returned.
- **Pagination logic**: given a result set of N items with `StartingIndex` and `RequestedCount`, assert correct slice and `TotalMatches`.
- **Config validation**: given valid and invalid config JSON, assert correct parsing or error messages.
- **Object ID generation**: given a file path, assert the derived ID is stable (same path → same ID).
- **MIME type detection**: given a set of file extensions, assert correct MIME type assignments.
- **DLNA profile mapping**: given file extension + codec info, assert correct `dlnaProfile` string.
- **Range header parsing**: given `Range: bytes=X-Y`, `bytes=X-`, `bytes=-Y`, assert correct `{start, end}` extraction.

### Integration Tests

Integration tests start a real server on a random port and exercise the full request/response cycle:

- **SSDP M-SEARCH response**: send a UDP M-SEARCH, assert a unicast response arrives within 5 seconds.
- **Device description**: GET `/device.xml`, assert valid XML with required UPnP fields.
- **Browse root**: POST a Browse SOAP action for ObjectID=0, assert valid DIDL-Lite response.
- **Stream full file**: GET `/stream/:id`, assert 200 with correct Content-Type.
- **Stream with range**: GET `/stream/:id` with Range header, assert 206 and correct Content-Range.
- **401 enforcement**: request without registered IP when PIN is set, assert 401.
- **PIN registration flow**: POST `/pin` with correct PIN, then browse, assert 200.

### Property-Based Tests

See Correctness Properties section below. Property tests use `fast-check` configured for 100 iterations minimum per property.


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Property-based tests are written using `fast-check` (JavaScript) configured to run a minimum of 100 iterations per property. Each property test is tagged with a comment referencing the design property it verifies.

Tag format: `// Feature: dlna-media-server, Property N: <property_text>`

---

### Property 1: SSDP M-SEARCH Response Contains Required Fields

*For any* ST (search target) value that matches a service the server advertises, the generated unicast M-SEARCH response must include the server's LOCATION URL, the correct ST echoed back, a USN containing the server's UDN, and the `X-DLNADOC: DMS-1.50` header.

**Validates: Requirements 1.3, 7.2**

---

### Property 2: Browse Direct Children Returns Exactly the Direct Children

*For any* container ID in the media index with any number of children (including zero), a `Browse(BrowseDirectChildren)` action against that container must return a result set whose items are exactly the direct children of that container — no more and no fewer — formatted as valid DIDL-Lite XML.

**Validates: Requirements 2.2**

---

### Property 3: DIDL-Lite Serialisation Includes All Required and Applicable Fields

*For any* `MediaItem` with any combination of fields (title, mimeType, fileSize, resourceUrl, and optionally duration, resolution, bitrate, sampleRate, dlnaProfile), the DIDL-Lite XML produced by the serialiser must:
- Always contain `dc:title`, `upnp:class`, `res` with `protocolInfo`, `@size`, and `@id` attributes
- Contain `res@duration` and `res@resolution` if and only if the item has non-null `duration` and `resolution`
- Contain `res@bitrate` and `res@sampleFrequency` if and only if the item is an audio item with non-null `bitrate` and `sampleRate`
- Contain a `dlna:profileID` attribute on the `res` element if and only if `dlnaProfile` is non-null

**Validates: Requirements 2.3, 2.6, 2.7, 2.8, 7.3**

---

### Property 4: Container Hierarchy Mirrors Filesystem Directory Structure

*For any* set of absolute file paths under a set of configured root directories, the container tree built by the `MediaIndex` must reflect the filesystem directory hierarchy: if directory `A` is an ancestor of file `B` on disk, then the container for `A` must be an ancestor of the `MediaItem` for `B` in the `ContentDirectory` tree.

**Validates: Requirements 2.4**

---

### Property 5: Pagination Invariants Hold for Browse and Search

*For any* ordered result set of `N` items, and any `StartingIndex` `S` and `RequestedCount` `R` (including edge values where S ≥ N or R = 0):
- `TotalMatches` equals `N`
- `NumberReturned` equals `min(R, max(0, N - S))`
- The returned items are exactly the slice `items[S .. S + NumberReturned]`

This property holds identically for both `Browse` and `Search` actions.

**Validates: Requirements 2.5, 2.11**

---

### Property 6: Search Returns Exactly the Set of Matching Items

*For any* media index containing any set of `MediaItem` records with any titles, and any search term `T`, a `Search` action with `dc:title contains "T"` must return:
- All items whose title contains `T` (case-insensitive) — no eligible item is omitted
- No items whose title does not contain `T` — no false positives

**Validates: Requirements 2.10**

---

### Property 7: Unsupported SearchCriteria Returns UPnP Error 720

*For any* `SearchCriteria` string that does not match the pattern `dc:title contains "<term>"` (i.e., any arbitrary string that is not a supported criteria expression), the `Search` action must return a SOAP fault response containing UPnP error code `720` (`Cannot Process The Request`).

**Validates: Requirements 2.12**

---

### Property 8: Streaming Response Contains Correct Content-Type and DLNA Headers

*For any* `MediaItem` in the index, an HTTP GET request to `/stream/:id` must return a response where:
- `Content-Type` exactly matches the item's `mimeType`
- `transferMode.dlna.org` is present and equals `Streaming` (for video/audio) or `Interactive` (for images)
- `contentFeatures.dlna.org` is present and contains `DLNA.ORG_OP=01`
- `Accept-Ranges` equals `bytes`

**Validates: Requirements 4.1, 4.3, 7.x**

---

### Property 9: Byte-Range Requests Return HTTP 206 with Correct Range

*For any* `MediaItem` of size `S` bytes, and any valid byte range `[start, end]` where `0 ≤ start ≤ end < S`, an HTTP GET request with `Range: bytes=start-end` must:
- Return HTTP status `206 Partial Content`
- Include `Content-Range: bytes start-end/S`
- Return exactly `end - start + 1` bytes in the body
- Return bytes that are identical to the corresponding slice of the file on disk

**Validates: Requirements 4.2**

---

### Property 10: Multiple Root Directories Become Top-Level Containers

*For any* list of `N ≥ 1` configured media root directories, a `Browse(ObjectID="0", BrowseDirectChildren)` action must return exactly `N` top-level containers, one per configured directory, each with `parentId = "0"`.

**Validates: Requirements 5.2**

---

### Property 11: Only Files with Supported Extensions Are Indexed

*For any* filename (with any extension), the extension-filtering function must accept it if and only if the lowercase extension is one of: `.mp4`, `.mkv`, `.avi`, `.mov`, `.mp3`, `.flac`, `.aac`, `.m4a`, `.jpg`, `.jpeg`, `.png`. Files with any other extension (including no extension, double extensions, or mixed-case variants outside the set) must be rejected.

**Validates: Requirements 6.5**

---

### Property 12: DIDL-Lite Filter Field Selection Is Respected

*For any* `MediaItem` and any `Filter` string containing a comma-separated list of property names (as specified in the UPnP ContentDirectory spec), the DIDL-Lite output must contain only the requested fields. Mandatory fields (`@id`, `@parentID`, `@restricted`, `upnp:class`) are always present regardless of filter. Optional fields not listed in the filter must be absent from the output.

**Validates: Requirements 7.4, 7.5**

---

### Property 13: Log Entries Contain All Required Structured Fields

*For any* log event (HTTP request log or SOAP action log) with any combination of method, URL path, client IP, response status, action name, and service type, the structured JSON log entry produced by the logger must contain all fields applicable to that event type:
- HTTP requests: `timestamp`, `level`, `method`, `url`, `remoteAddress`, `statusCode`
- SOAP actions: `timestamp`, `level`, `soapAction`, `serviceType`, `responseStatus`

**Validates: Requirements 8.1, 8.2, 8.3**

---

### Property 14: Log Level Filtering Suppresses Below-Threshold Messages

*For any* configured log level `L` ∈ {DEBUG, INFO, WARN, ERROR} and any log message emitted at a level strictly below `L`, that message must not appear in the log output. Messages at level `L` or above must always appear.

**Validates: Requirements 8.5**

---

### Property 15: Unregistered Device Receives 401 on All Protected Routes

*For any* client IP address that is not in the `DeviceRegistry` and any protected route (ContentDirectory, ConnectionManager, streaming), when a PIN is configured, the server must respond with HTTP `401 Unauthorized`. The route path and request method do not affect this: any unregistered IP is always rejected.

**Validates: Requirements 10.1, 10.4**

---

### Property 16: PIN Registration Grants Persistent Subsequent Access

*For any* client IP address `addr` and the correct PIN value: after `addr` successfully POSTs the correct PIN to `/pin`, all subsequent requests from `addr` to any protected route must succeed (not return 401), and `addr` must appear in `DeviceRegistry.registeredIps`.

**Validates: Requirements 10.2, 10.3**

---

### Property 17: DeviceRegistry Serialisation Round-Trip Preserves Registered IP Set

*For any* set of IP address strings (valid or arbitrary strings that were registered), serialising the `DeviceRegistry` to its JSON format (`devices.json`) and then deserialising it must produce a registry whose `registeredIps` set is identical to the original — no IPs added, removed, or mutated.

**Validates: Requirements 10.5**

---

## macOS launchd Integration

### Service Configuration

The server ships a `com.dlna-media-server.plist` file that must be placed in `/Library/LaunchDaemons/` and loaded with `launchctl load`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dlna-media-server</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/dlna-media-server/dist/index.js</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>DLNA_CONFIG</key>
    <string>/etc/dlna-media-server/config.json</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>

  <key>StandardOutPath</key>
  <string>/var/log/dlna-media-server/stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/var/log/dlna-media-server/stderr.log</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ProcessType</key>
  <string>Background</string>

  <key>UserName</key>
  <string>_dlna</string>
</dict>
</plist>
```

**Key design decisions:**

- `RunAtLoad: true` — starts the service on system boot and on `launchctl load`, satisfying requirement 9.2.
- `KeepAlive: true` — launchd automatically restarts the process if it exits for any reason, satisfying requirement 9.3.
- `ThrottleInterval: 10` — prevents a crash-loop from restarting more than once every 10 seconds.
- `UserName: _dlna` — runs the daemon as a dedicated unprivileged system user created during installation, following the principle of least privilege.
- `ProcessType: Background` — signals to macOS that this is a long-running background service, allowing appropriate CPU scheduling.

Note: The Node.js path `/usr/local/bin/node` corresponds to Homebrew's installation path. An install script will resolve this path at install time.

### SIGTERM Handling

The server registers a `process.on('SIGTERM', handler)` in the main entry point:

```typescript
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  httpServer.stop();                    // stop accepting new connections
  await drainActiveStreams(10_000);     // wait up to 10s for streams to finish
  ssdpServer.sendByebye();              // multicast byebye
  await ssdpServer.stop();
  deviceRegistry.persist();            // flush device list to disk
  logger.info('Shutdown complete');
  process.exit(0);
});
```

`drainActiveStreams` tracks the count of active streaming responses using a counter. It returns a Promise that resolves when the counter reaches zero, or rejects after the 10-second timeout (after which in-flight connections are forcibly closed).

### Installation Steps

A shell script `install.sh` handles:
1. Creating the `_dlna` system user (`dscl`)
2. Installing the built application to `/opt/dlna-media-server/`
3. Creating `/etc/dlna-media-server/config.json` if absent (with defaults)
4. Creating `/var/log/dlna-media-server/`
5. Copying the plist to `/Library/LaunchDaemons/`
6. Running `launchctl load /Library/LaunchDaemons/com.dlna-media-server.plist`
