import type { Logger } from '../logger.js';
/**
 * Configuration for the SSDPServer.
 *
 * Requirements: 1.1, 1.2, 1.3, 7.2
 */
export interface SSDPConfig {
    /** UDP port to bind to — always 1900 for SSDP. */
    port: number;
    /** HTTP URL of the device description document, e.g. http://host:port/device.xml */
    location: string;
    /** UUID value without the "uuid:" prefix (the UDN). */
    udn: string;
    /** Friendly server name included in the SERVER header. */
    serverName: string;
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
export declare class SSDPServer {
    private readonly config;
    private readonly logger;
    private socket;
    private aliveInterval;
    constructor(config: SSDPConfig, logger: Logger);
    /**
     * Creates the UDP socket, binds to port 1900, joins multicast groups,
     * sends initial ssdp:alive messages, and sets up the periodic alive timer.
     */
    start(): Promise<void>;
    /**
     * Sends ssdp:alive NOTIFY messages for all five USN variants via multicast.
     */
    sendAlive(): void;
    /**
     * Sends ssdp:byebye NOTIFY messages for all five USN variants via multicast.
     */
    sendByebye(): void;
    /**
     * Clears the alive interval, sends byebye messages, and closes the socket.
     */
    stop(): Promise<void>;
    /**
     * Handles an incoming UDP message. Parses M-SEARCH requests and sends
     * unicast responses after a random delay bounded by min(MX, 5) seconds.
     */
    private handleMessage;
}
//# sourceMappingURL=SSDPServer.d.ts.map