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
exports.SSDPServer = void 0;
const dgram = __importStar(require("dgram"));
const os = __importStar(require("os"));
const MULTICAST_ADDR = '239.255.255.250';
const SERVER_HEADER = 'Node.js/20 UPnP/1.1 DLNAMediaServer/1.0';
/**
 * Returns the five (usn, st) pairs that this server advertises per UPnP 1.1.
 */
function buildUsnPairs(udn) {
    return [
        {
            usn: `uuid:${udn}::upnp:rootdevice`,
            st: 'upnp:rootdevice',
        },
        {
            usn: `uuid:${udn}`,
            st: `uuid:${udn}`,
        },
        {
            usn: `uuid:${udn}::urn:schemas-upnp-org:device:MediaServer:1`,
            st: 'urn:schemas-upnp-org:device:MediaServer:1',
        },
        {
            usn: `uuid:${udn}::urn:schemas-upnp-org:service:ContentDirectory:1`,
            st: 'urn:schemas-upnp-org:service:ContentDirectory:1',
        },
        {
            usn: `uuid:${udn}::urn:schemas-upnp-org:service:ConnectionManager:1`,
            st: 'urn:schemas-upnp-org:service:ConnectionManager:1',
        },
    ];
}
/**
 * Builds a NOTIFY ssdp:alive message for a single USN/ST pair.
 */
function buildAliveMessage(location, usn, st) {
    const msg = 'NOTIFY * HTTP/1.1\r\n' +
        `HOST: ${MULTICAST_ADDR}:1900\r\n` +
        'CACHE-CONTROL: max-age=3600\r\n' +
        `LOCATION: ${location}\r\n` +
        `NT: ${st}\r\n` +
        'NTS: ssdp:alive\r\n' +
        `SERVER: ${SERVER_HEADER}\r\n` +
        `USN: ${usn}\r\n` +
        'X-DLNADOC: DMS-1.50\r\n' +
        '\r\n';
    return Buffer.from(msg, 'utf8');
}
/**
 * Builds a NOTIFY ssdp:byebye message for a single USN/ST pair.
 */
function buildByebyeMessage(usn, st) {
    const msg = 'NOTIFY * HTTP/1.1\r\n' +
        `HOST: ${MULTICAST_ADDR}:1900\r\n` +
        `NT: ${st}\r\n` +
        'NTS: ssdp:byebye\r\n' +
        `USN: ${usn}\r\n` +
        '\r\n';
    return Buffer.from(msg, 'utf8');
}
/**
 * Builds a unicast M-SEARCH 200 OK response for a single USN/ST pair.
 */
function buildMSearchResponse(location, usn, st) {
    const date = new Date().toUTCString();
    const msg = 'HTTP/1.1 200 OK\r\n' +
        'CACHE-CONTROL: max-age=3600\r\n' +
        `DATE: ${date}\r\n` +
        'EXT:\r\n' +
        `LOCATION: ${location}\r\n` +
        `SERVER: ${SERVER_HEADER}\r\n` +
        `ST: ${st}\r\n` +
        `USN: ${usn}\r\n` +
        'X-DLNADOC: DMS-1.50\r\n' +
        '\r\n';
    return Buffer.from(msg, 'utf8');
}
/**
 * Parse raw SSDP UDP message and extract ST and MX header values.
 */
function parseMSearch(raw) {
    // Only handle M-SEARCH
    if (!raw.startsWith('M-SEARCH')) {
        return null;
    }
    let st = '';
    let mx = 3; // default
    for (const line of raw.split('\r\n')) {
        const colon = line.indexOf(':');
        if (colon === -1)
            continue;
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (name === 'st') {
            st = value;
        }
        else if (name === 'mx') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
                mx = parsed;
            }
        }
    }
    if (!st)
        return null;
    return { st, mx };
}
/**
 * Returns all network interface IPv4 addresses (excluding loopback).
 * Used to join the multicast group on every active interface.
 */
function getLocalIPv4Addresses() {
    const ifaces = os.networkInterfaces();
    const addresses = [];
    for (const ifaceList of Object.values(ifaces)) {
        if (!ifaceList)
            continue;
        for (const iface of ifaceList) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}
/**
 * SSDPServer implements UPnP 1.1 SSDP advertisement and discovery for the
 * DLNA Media Server.
 *
 * Responsibilities:
 * - Joins multicast group 239.255.255.250:1900 on all local interfaces
 * - Sends ssdp:alive NOTIFY for all five USN variants at startup and every 1800s
 * - Responds to M-SEARCH requests (ST: ssdp:all or matching service types)
 *   after a random delay of 0..min(MX, 5) seconds
 * - Sends ssdp:byebye for all five USN variants on stop()
 *
 * Requirements: 1.1, 1.2, 1.3, 7.2
 */
class SSDPServer {
    config;
    logger;
    socket = null;
    aliveInterval = null;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    /**
     * Creates the UDP socket, binds to port 1900, joins multicast groups,
     * sends initial ssdp:alive messages, and sets up the periodic alive timer.
     */
    async start() {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            this.socket = socket;
            socket.on('error', (err) => {
                this.logger.error({ err }, 'SSDP socket error');
                // Only reject if we haven't started yet (bind hasn't completed)
                if (!this.aliveInterval) {
                    reject(err);
                }
            });
            socket.on('message', (msg, rinfo) => {
                this.handleMessage(msg, rinfo);
            });
            socket.bind(this.config.port, '0.0.0.0', () => {
                socket.setMulticastTTL(4);
                socket.setMulticastLoopback(true);
                // Join multicast group on all IPv4 interfaces
                const localAddresses = getLocalIPv4Addresses();
                if (localAddresses.length > 0) {
                    for (const addr of localAddresses) {
                        try {
                            socket.addMembership(MULTICAST_ADDR, addr);
                            this.logger.debug({ interface: addr }, 'SSDP joined multicast group on interface');
                        }
                        catch (err) {
                            this.logger.warn({ err, interface: addr }, 'SSDP failed to join multicast group on interface');
                        }
                    }
                }
                else {
                    // Fallback: join without specifying interface (OS default)
                    try {
                        socket.addMembership(MULTICAST_ADDR);
                    }
                    catch (err) {
                        this.logger.warn({ err }, 'SSDP failed to join multicast group');
                    }
                }
                this.logger.info({ port: this.config.port }, 'SSDP server started, bound to port 1900');
                // Send initial alive notifications
                this.sendAlive();
                // Repeat alive every 1800 seconds (half of max-age=3600)
                this.aliveInterval = setInterval(() => {
                    this.sendAlive();
                }, 1800_000);
                resolve();
            });
        });
    }
    /**
     * Sends ssdp:alive NOTIFY messages for all five USN variants via multicast.
     */
    sendAlive() {
        const socket = this.socket;
        if (!socket)
            return;
        const pairs = buildUsnPairs(this.config.udn);
        for (const { usn, st } of pairs) {
            const msg = buildAliveMessage(this.config.location, usn, st);
            socket.send(msg, 0, msg.length, 1900, MULTICAST_ADDR, (err) => {
                if (err) {
                    this.logger.warn({ err, usn }, 'SSDP failed to send alive message');
                }
                else {
                    this.logger.debug({ usn, st }, 'SSDP sent ssdp:alive');
                }
            });
        }
    }
    /**
     * Sends ssdp:byebye NOTIFY messages for all five USN variants via multicast.
     */
    sendByebye() {
        const socket = this.socket;
        if (!socket)
            return;
        const pairs = buildUsnPairs(this.config.udn);
        for (const { usn, st } of pairs) {
            const msg = buildByebyeMessage(usn, st);
            socket.send(msg, 0, msg.length, 1900, MULTICAST_ADDR, (err) => {
                if (err) {
                    this.logger.warn({ err, usn }, 'SSDP failed to send byebye message');
                }
                else {
                    this.logger.debug({ usn, st }, 'SSDP sent ssdp:byebye');
                }
            });
        }
    }
    /**
     * Clears the alive interval, sends byebye messages, and closes the socket.
     */
    async stop() {
        if (this.aliveInterval !== null) {
            clearInterval(this.aliveInterval);
            this.aliveInterval = null;
        }
        this.sendByebye();
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve();
                return;
            }
            this.socket.close(() => {
                this.socket = null;
                this.logger.info('SSDP server stopped');
                resolve();
            });
        });
    }
    /**
     * Handles an incoming UDP message. Parses M-SEARCH requests and sends
     * unicast responses after a random delay bounded by min(MX, 5) seconds.
     */
    handleMessage(msg, rinfo) {
        const raw = msg.toString('utf8');
        const parsed = parseMSearch(raw);
        if (!parsed)
            return;
        const { st, mx } = parsed;
        this.logger.debug({ from: `${rinfo.address}:${rinfo.port}`, st, mx }, 'SSDP received M-SEARCH');
        const pairs = buildUsnPairs(this.config.udn);
        const matchingPairs = st === 'ssdp:all'
            ? pairs
            : pairs.filter((p) => p.st === st);
        for (const { usn, st: matchedSt } of matchingPairs) {
            const delayMs = Math.random() * Math.min(Number(mx), 5) * 1000;
            setTimeout(() => {
                const socket = this.socket;
                if (!socket)
                    return;
                const response = buildMSearchResponse(this.config.location, usn, matchedSt);
                socket.send(response, 0, response.length, rinfo.port, rinfo.address, (err) => {
                    if (err) {
                        this.logger.warn({ err, to: `${rinfo.address}:${rinfo.port}`, usn }, 'SSDP failed to send M-SEARCH response');
                    }
                    else {
                        this.logger.debug({ to: `${rinfo.address}:${rinfo.port}`, usn, st: matchedSt }, 'SSDP sent M-SEARCH response');
                    }
                });
            }, delayMs);
        }
    }
}
exports.SSDPServer = SSDPServer;
//# sourceMappingURL=SSDPServer.js.map