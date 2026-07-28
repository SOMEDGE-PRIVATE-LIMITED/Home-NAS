# Requirements Document

## Introduction

A DLNA media server application that runs on a Mac mini used as a home NAS (Network Attached Storage). The server exposes locally stored media files — videos, music, and photos — to DLNA-compatible client devices on the local network, with a primary target client of a Samsung Tizen TV. The server implements the UPnP AV (Audio/Video) profile as required by the DLNA standard, enabling the TV to browse and stream content without any additional client-side software.

## Glossary

- **DLNA_Server**: The media server application running on the macOS Mac mini that implements the DLNA/UPnP AV server role (also known as a Digital Media Server, DMS).
- **UPnP**: Universal Plug and Play — the underlying network protocol stack that DLNA is built on.
- **UPnP_AV**: The UPnP Audio/Video profile that defines ContentDirectory and ConnectionManager services used by DLNA.
- **ContentDirectory**: The UPnP AV service that exposes a browsable hierarchy of media objects to clients.
- **ConnectionManager**: The UPnP AV service that advertises supported media formats and transfer protocols.
- **SSDP**: Simple Service Discovery Protocol — the UPnP mechanism used for device discovery on the local network.
- **Samsung_TV**: The Samsung Tizen TV acting as the DLNA Digital Media Player (DMP) client.
- **Media_Library**: The set of directories on the Mac mini that the DLNA_Server scans and exposes to clients.
- **Media_Item**: A single video, audio, or image file exposed through the ContentDirectory.
- **Container**: A ContentDirectory folder node that groups Media_Items or other Containers.
- **Metadata**: Structured information about a Media_Item, including title, duration, MIME type, resolution, and file size.
- **PIN**: A predefined alphanumeric password stored in the server configuration file, used to authenticate client devices before they are granted access to the DLNA_Server.
- **Registered_Device**: A DLNA client device that has previously authenticated with the correct PIN and whose identity has been recorded by the DLNA_Server.

---

## Requirements

### Requirement 1: UPnP Device Advertisement and Discovery

**User Story:** As a Samsung TV user, I want the DLNA server to be automatically discoverable on my home network, so that I can find and connect to it from the TV's media player without manual configuration.

#### Acceptance Criteria

1. WHEN the DLNA_Server starts, THE DLNA_Server SHALL broadcast SSDP `ssdp:alive` announcements on the local network multicast address (239.255.255.255:1900) advertising itself as a `urn:schemas-upnp-org:device:MediaServer:1` device.
2. WHEN the DLNA_Server shuts down, THE DLNA_Server SHALL broadcast SSDP `ssdp:byebye` messages to notify clients that the server is no longer available.
3. WHEN an SSDP `M-SEARCH` request is received on the local network, THE DLNA_Server SHALL respond with a unicast SSDP response within 5 seconds containing the server's location URL, device type, and unique device name (UDN).
4. THE DLNA_Server SHALL expose a UPnP device description XML document at a stable HTTP URL that conforms to the UPnP Device Architecture 1.1 specification.
5. THE DLNA_Server SHALL include a unique and persistent UDN (Universally Unique Device Name) in its device description so that clients can identify it across restarts.

---

### Requirement 2: ContentDirectory Service

**User Story:** As a Samsung TV user, I want to browse and search my media library through the TV's interface, so that I can navigate folders, find the content I want to watch, listen to, or view, and search for specific items by name.

#### Acceptance Criteria

1. THE DLNA_Server SHALL implement a UPnP ContentDirectory:1 service that responds to `Browse` SOAP actions.
2. WHEN a `Browse` action with `BrowseFlag=BrowseDirectChildren` is received for a Container, THE ContentDirectory SHALL return the direct children of that Container as DIDL-Lite XML.
3. WHEN a `Browse` action with `BrowseFlag=BrowseMetadata` is received for a Media_Item, THE ContentDirectory SHALL return the Metadata for that Media_Item as DIDL-Lite XML.
4. THE ContentDirectory SHALL expose the Media_Library as a navigable Container hierarchy that mirrors the directory structure on disk.
5. WHEN a `Browse` action is received with `StartingIndex` and `RequestedCount` parameters, THE ContentDirectory SHALL return a paginated subset of results with accurate `TotalMatches` and `NumberReturned` values.
6. THE ContentDirectory SHALL include the following Metadata fields for each Media_Item: title, MIME type, file size, and resource URL.
7. WHEN a video Media_Item is browsed, THE ContentDirectory SHALL include duration and resolution in the Metadata where that information can be extracted from the file.
8. WHEN an audio Media_Item is browsed, THE ContentDirectory SHALL include duration, bitrate, and sample rate in the Metadata where that information can be extracted from the file.
9. THE DLNA_Server SHALL implement the UPnP ContentDirectory `Search` SOAP action.
10. WHEN a `Search` action is received with a `SearchCriteria` string, THE ContentDirectory SHALL return all Media_Items whose title contains the search term using a case-insensitive match, formatted as DIDL-Lite XML.
11. WHEN a `Search` action is received with `StartingIndex` and `RequestedCount` parameters, THE ContentDirectory SHALL return a paginated subset of results with accurate `TotalMatches` and `NumberReturned` values.
12. WHEN a `Search` action is received with an unsupported `SearchCriteria` expression, THE ContentDirectory SHALL return a `720 Cannot Process The Request` UPnP error response.

---

### Requirement 3: ConnectionManager Service

**User Story:** As a DLNA client device, I want to know which media formats the server supports, so that I can request content in a compatible format.

#### Acceptance Criteria

1. THE DLNA_Server SHALL implement a UPnP ConnectionManager:1 service.
2. WHEN a `GetProtocolInfo` SOAP action is received, THE ConnectionManager SHALL return the list of supported source protocols and MIME types in the `SourceProtocolInfo` field.
3. THE ConnectionManager SHALL advertise support for at minimum the following MIME types: `video/mp4`, `video/x-matroska`, `audio/mpeg`, `audio/flac`, `audio/aac`, `image/jpeg`, and `image/png`.
4. THE DLNA_Server SHALL serve all Media_Items as-is in their original format without transcoding or format conversion.

---

### Requirement 4: Media File Streaming

**User Story:** As a Samsung TV user, I want to stream media files from the Mac mini directly on my TV, so that I can watch videos, listen to music, and view photos without copying files to another device.

#### Acceptance Criteria

1. WHEN the Samsung_TV issues an HTTP GET request to a Media_Item resource URL, THE DLNA_Server SHALL respond with the file content using the correct `Content-Type` header.
2. WHEN the Samsung_TV issues an HTTP GET request with a `Range` header for a Media_Item, THE DLNA_Server SHALL respond with HTTP 206 Partial Content and serve the requested byte range to support seeking.
3. WHEN streaming a Media_Item, THE DLNA_Server SHALL include the `transferMode.dlna.org` and `contentFeatures.dlna.org` HTTP headers as required by the DLNA specification for proper playback on the Samsung_TV.
4. THE DLNA_Server SHALL support simultaneous streaming to at least 2 clients without interrupting active streams.
5. IF a requested Media_Item file does not exist on disk, THEN THE DLNA_Server SHALL respond with HTTP 404 and log the missing file path.

---

### Requirement 5: Media Library Configuration

**User Story:** As a NAS administrator, I want to configure which directories on the Mac mini are shared, so that I can control what content is accessible to TV clients.

#### Acceptance Criteria

1. THE DLNA_Server SHALL read its Media_Library root directories from a configuration file at a well-known path on startup.
2. WHEN the configuration file specifies multiple root directories, THE DLNA_Server SHALL expose all of them as top-level Containers in the ContentDirectory.
3. WHEN the configuration file is absent or malformed, THE DLNA_Server SHALL log a descriptive error message and exit with a non-zero status code.
4. THE DLNA_Server SHALL support configuring the server's display name as it appears to DLNA clients via the configuration file.
5. THE DLNA_Server SHALL support configuring the HTTP port used for UPnP and streaming via the configuration file, with a default value of 8200.

---

### Requirement 6: Media Library Scanning

**User Story:** As a NAS administrator, I want the server to automatically detect new or changed media files, so that newly added content becomes available to the TV without restarting the server.

#### Acceptance Criteria

1. WHEN the DLNA_Server starts, THE DLNA_Server SHALL perform a full scan of all configured Media_Library directories to build the ContentDirectory index.
2. WHEN a file is added to a monitored Media_Library directory, THE DLNA_Server SHALL detect the change and add the new Media_Item to the ContentDirectory index within 30 seconds.
3. WHEN a file is removed from a monitored Media_Library directory, THE DLNA_Server SHALL detect the change and remove the corresponding Media_Item from the ContentDirectory index within 30 seconds.
4. WHEN a file in a monitored Media_Library directory is modified, THE DLNA_Server SHALL update the corresponding Media_Item Metadata in the ContentDirectory index within 30 seconds.
5. THE DLNA_Server SHALL index files with the following extensions: `.mp4`, `.mkv`, `.avi`, `.mov`, `.mp3`, `.flac`, `.aac`, `.m4a`, `.jpg`, `.jpeg`, `.png`.

---

### Requirement 7: Samsung Tizen TV Compatibility

**User Story:** As a Samsung TV user, I want the server to be compatible with my Samsung Tizen TV's DLNA client, so that I can browse and play content reliably without errors or unsupported format warnings.

#### Acceptance Criteria

1. THE DLNA_Server SHALL include a `friendlyName` in its device description that is visible and selectable in the Samsung_TV's media source list.
2. THE DLNA_Server SHALL include the `X_DLNADOC` device capability header with value `DMS-1.50` in SSDP responses to identify itself as a DLNA-compliant media server.
3. WHEN generating DIDL-Lite XML for video Media_Items, THE DLNA_Server SHALL include `dlna:profileID` attributes using standard DLNA media profile names (e.g., `AVC_MP4_BL_L3_SD_AAC`, `MATROSKA`) where applicable.
4. WHEN the Samsung_TV sends a `Browse` request with `Filter` set to `*`, THE ContentDirectory SHALL return all available Metadata fields for the requested items.
5. WHEN the Samsung_TV sends a `Browse` request with a specific `Filter` value, THE ContentDirectory SHALL return only the requested Metadata fields.

---

### Requirement 8: Logging and Observability

**User Story:** As a NAS administrator, I want the server to produce structured logs, so that I can diagnose playback issues and monitor server health.

#### Acceptance Criteria

1. THE DLNA_Server SHALL write structured log entries to stdout in a consistent format that includes timestamp, log level, and message.
2. WHEN an HTTP request is received, THE DLNA_Server SHALL log the request method, URL path, client IP address, and HTTP response status code.
3. WHEN a SOAP action is received, THE DLNA_Server SHALL log the action name, service type, and response status.
4. WHEN an error occurs during file scanning, streaming, or request handling, THE DLNA_Server SHALL log the error with sufficient context to identify the affected file or request.
5. THE DLNA_Server SHALL support a configurable log level (DEBUG, INFO, WARN, ERROR) settable via the configuration file.

---

### Requirement 9: macOS Service Integration

**User Story:** As a NAS administrator, I want the DLNA server to run automatically as a background service on the Mac mini, so that it is always available without requiring manual startup after reboots.

#### Acceptance Criteria

1. THE DLNA_Server SHALL provide a launchd property list (`.plist`) file for registration as a macOS LaunchDaemon.
2. WHEN registered as a LaunchDaemon, THE DLNA_Server SHALL start automatically on system boot without requiring a user session.
3. WHEN the DLNA_Server process exits unexpectedly, the launchd configuration SHALL restart the process automatically.
4. THE DLNA_Server SHALL handle SIGTERM gracefully by completing in-flight requests, broadcasting SSDP `ssdp:byebye`, and exiting cleanly within 10 seconds.

---

### Requirement 10: Device Authentication

**User Story:** As a NAS administrator, I want to require client devices to authenticate with a PIN before accessing the media library, so that only trusted devices on my home network can browse and stream content.

#### Acceptance Criteria

1. THE DLNA_Server SHALL read a PIN from the configuration file on startup and require all client devices to provide it before accessing ContentDirectory or streaming resources.
2. WHEN a client device provides the correct PIN, THE DLNA_Server SHALL record the device's IP address as a Registered_Device and grant access to all DLNA services for subsequent requests from that device.
3. WHILE a client device is a Registered_Device, THE DLNA_Server SHALL respond to its Browse, Search, and streaming requests without requiring the PIN to be provided again.
4. WHEN a request is received from a device that is not a Registered_Device, THE DLNA_Server SHALL respond with HTTP 401 Unauthorized.
5. THE DLNA_Server SHALL persist the list of Registered_Devices to disk so that previously authenticated devices remain registered across server restarts.
6. WHEN the PIN value in the configuration file is absent or empty, THE DLNA_Server SHALL start without authentication and grant all devices unrestricted access.
