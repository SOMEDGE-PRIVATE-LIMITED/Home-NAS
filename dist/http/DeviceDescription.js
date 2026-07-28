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
exports.loadOrCreateUdn = loadOrCreateUdn;
exports.registerDeviceDescription = registerDeviceDescription;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const uuid_1 = require("uuid");
// ──────────────────────────────────────────────────────────────────────────────
// UDN persistence helpers
// ──────────────────────────────────────────────────────────────────────────────
function resolveUdnFilePath() {
    const dlnaConfig = process.env.DLNA_CONFIG;
    if (dlnaConfig) {
        return path.join(path.dirname(dlnaConfig), 'udn.txt');
    }
    return path.join(os.homedir(), '.config', 'dlna-media-server', 'udn.txt');
}
/**
 * Loads the persistent UDN from disk. If not found, generates a new UUID v4,
 * writes it, and returns it.
 *
 * Requirements: 1.5
 */
function loadOrCreateUdn() {
    const udnFile = resolveUdnFilePath();
    try {
        const existing = fs.readFileSync(udnFile, 'utf-8').trim();
        if (existing.length > 0) {
            return existing;
        }
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            process.stderr.write(`[dlna-media-server] Warning: could not read UDN file at ${udnFile}: ${err.message}\n`);
        }
    }
    const newUdn = (0, uuid_1.v4)();
    try {
        fs.mkdirSync(path.dirname(udnFile), { recursive: true });
        fs.writeFileSync(udnFile, newUdn, 'utf-8');
    }
    catch (err) {
        process.stderr.write(`[dlna-media-server] Warning: could not persist UDN to ${udnFile}: ${err.message}\n`);
    }
    return newUdn;
}
// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function xmlEscape(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
// ──────────────────────────────────────────────────────────────────────────────
// Device description XML
// ──────────────────────────────────────────────────────────────────────────────
function buildDeviceDescriptionXml(config, udn, baseUrl) {
    const friendlyName = xmlEscape(config.friendlyName);
    return (`<?xml version="1.0"?>\n` +
        `<root xmlns="urn:schemas-upnp-org:device-1-0">\n` +
        `  <specVersion><major>1</major><minor>0</minor></specVersion>\n` +
        `  <URLBase>${xmlEscape(baseUrl)}</URLBase>\n` +
        `  <device>\n` +
        `    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>\n` +
        `    <friendlyName>${friendlyName}</friendlyName>\n` +
        `    <manufacturer>DLNA Media Server</manufacturer>\n` +
        `    <modelName>DLNA Media Server</modelName>\n` +
        `    <modelNumber>1.0</modelNumber>\n` +
        `    <UDN>uuid:${xmlEscape(udn)}</UDN>\n` +
        `    <dlna:X_DLNADOC xmlns:dlna="urn:schemas-dlna-org:device-1-0">DMS-1.50</dlna:X_DLNADOC>\n` +
        `    <serviceList>\n` +
        `      <service>\n` +
        `        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>\n` +
        `        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>\n` +
        `        <SCPDURL>/cd/scpd.xml</SCPDURL>\n` +
        `        <controlURL>/cd/control</controlURL>\n` +
        `        <eventSubURL>/cd/event</eventSubURL>\n` +
        `      </service>\n` +
        `      <service>\n` +
        `        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>\n` +
        `        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>\n` +
        `        <SCPDURL>/cm/scpd.xml</SCPDURL>\n` +
        `        <controlURL>/cm/control</controlURL>\n` +
        `        <eventSubURL>/cm/event</eventSubURL>\n` +
        `      </service>\n` +
        `    </serviceList>\n` +
        `    <presentationURL>/</presentationURL>\n` +
        `  </device>\n` +
        `</root>\n`);
}
// ──────────────────────────────────────────────────────────────────────────────
// Static SCPD XML documents
// ──────────────────────────────────────────────────────────────────────────────
const CONTENT_DIRECTORY_SCPD_XML = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action>
      <name>Browse</name>
      <argumentList>
        <argument><name>ObjectID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable></argument>
        <argument><name>BrowseFlag</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_BrowseFlag</relatedStateVariable></argument>
        <argument><name>Filter</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable></argument>
        <argument><name>StartingIndex</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable></argument>
        <argument><name>RequestedCount</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>SortCriteria</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable></argument>
        <argument><name>Result</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable></argument>
        <argument><name>NumberReturned</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>TotalMatches</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>UpdateID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable></argument>
      </argumentList>
    </action>
    <action>
      <name>Search</name>
      <argumentList>
        <argument><name>ContainerID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable></argument>
        <argument><name>SearchCriteria</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SearchCriteria</relatedStateVariable></argument>
        <argument><name>Filter</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable></argument>
        <argument><name>StartingIndex</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable></argument>
        <argument><name>RequestedCount</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>SortCriteria</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable></argument>
        <argument><name>Result</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable></argument>
        <argument><name>NumberReturned</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>TotalMatches</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable></argument>
        <argument><name>UpdateID</name><direction>out</direction><relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable></argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ObjectID</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Result</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_BrowseFlag</name><dataType>string</dataType><allowedValueList><allowedValue>BrowseMetadata</allowedValue><allowedValue>BrowseDirectChildren</allowedValue></allowedValueList></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Filter</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_SortCriteria</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Index</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Count</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_UpdateID</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_SearchCriteria</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="yes"><name>SystemUpdateID</name><dataType>ui4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>SearchCapabilities</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>SortCapabilities</name><dataType>string</dataType></stateVariable>
  </serviceStateTable>
</scpd>
`;
const CONNECTION_MANAGER_SCPD_XML = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action>
      <name>GetProtocolInfo</name>
      <argumentList>
        <argument><name>Source</name><direction>out</direction><relatedStateVariable>SourceProtocolInfo</relatedStateVariable></argument>
        <argument><name>Sink</name><direction>out</direction><relatedStateVariable>SinkProtocolInfo</relatedStateVariable></argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="yes"><name>SourceProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="yes"><name>SinkProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="yes"><name>CurrentConnectionIDs</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionStatus</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionManager</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_Direction</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ProtocolInfo</name><dataType>string</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_ConnectionID</name><dataType>i4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_AVTransportID</name><dataType>i4</dataType></stateVariable>
    <stateVariable sendEvents="no"><name>A_ARG_TYPE_RcsID</name><dataType>i4</dataType></stateVariable>
  </serviceStateTable>
</scpd>
`;
// ──────────────────────────────────────────────────────────────────────────────
// Route registration
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Registers GET /device.xml, GET /cd/scpd.xml, GET /cm/scpd.xml.
 *
 * Requirements: 1.4, 1.5, 7.1, 7.2
 */
function registerDeviceDescription(fastify, config, baseUrl) {
    const udn = loadOrCreateUdn();
    const deviceXml = buildDeviceDescriptionXml(config, udn, baseUrl);
    fastify.get('/device.xml', async (_request, reply) => {
        return reply
            .status(200)
            .header('Content-Type', 'text/xml; charset="utf-8"')
            .header('X-DLNADOC', 'DMS-1.50')
            .send(deviceXml);
    });
    fastify.get('/cd/scpd.xml', async (_request, reply) => {
        return reply
            .status(200)
            .header('Content-Type', 'text/xml; charset="utf-8"')
            .send(CONTENT_DIRECTORY_SCPD_XML);
    });
    fastify.get('/cm/scpd.xml', async (_request, reply) => {
        return reply
            .status(200)
            .header('Content-Type', 'text/xml; charset="utf-8"')
            .send(CONNECTION_MANAGER_SCPD_XML);
    });
}
//# sourceMappingURL=DeviceDescription.js.map