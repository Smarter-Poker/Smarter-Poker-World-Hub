export declare class RefusedWebSocket {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
    readonly readyState: 3;
    readonly url: string;
    readonly protocol: string;
    readonly extensions: string;
    readonly bufferedAmount: number;
    binaryType: string;
    timeout: number;
    onopen: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onmessage: ((event: unknown) => void) | null;
    onclose: ((event: unknown) => void) | null;
    constructor(url: string | URL, error?: unknown);
    addEventListener(type: string, listener: (event: unknown) => void): void;
    removeEventListener(type: string, listener: (event: unknown) => void): void;
    dispatchEvent(event: { type: string }): boolean;
    send(): void;
    close(): void;
}

export interface ResilientTransportOptions {
    NativeSocket?: typeof WebSocket;
    onRefused?: (error: Error) => void;
    warn?: (...args: unknown[]) => void;
}

export declare function createResilientWebSocketTransport(
    options?: ResilientTransportOptions
): typeof WebSocket;

export declare function hardenSupabaseRealtime<T>(
    client: T,
    options?: Pick<ResilientTransportOptions, 'onRefused' | 'warn'>
): T;

export declare function createHardenedSupabaseClient<TClient>(
    createClientFn: (url: string, key: string, options?: any) => TClient,
    url: string,
    key: string,
    options?: Record<string, any>,
    guardOpts?: ResilientTransportOptions
): TClient;
