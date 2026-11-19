import type { StreamFrame } from "./types";
import { signStreamUpgrade } from "./signing";
import { getSession } from "./session-holder";

export type FrameHandler = (frame: StreamFrame) => void;

// Invoked every time the socket (re)opens. The server keeps per-socket state
// (which runs this client subscribes to), so consumers must re-establish that
// state after every reconnect.
export type OpenListener = () => void;

// Upper bound for messages queued while the socket is not open. The queue only
// carries small subscribe/unsubscribe control messages, so the bound exists to
// fence pathological growth, not to shape normal traffic.
const MAX_QUEUED_MESSAGES = 256;

export class StreamClient {
  private socket: WebSocket | null = null;
  private handler: FrameHandler | null = null;
  private readonly openListeners: OpenListener[] = [];
  private queuedMessages: string[] = [];
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly url = "/api/stream") {}

  public connect(handler: FrameHandler): void {
    this.handler = handler;
    this.shouldReconnect = true;
    this.open();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.queuedMessages = [];
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket !== null) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
  }

  // Sends a message immediately when the socket is open. While a connection is
  // being established (or a reconnect is pending) the message is queued and
  // flushed on open, so a subscribe racing the handshake is not silently lost.
  public send(message: string): boolean {
    if (this.socket !== null && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
      return true;
    }
    if (this.shouldReconnect) {
      this.queuedMessages.push(message);
      if (this.queuedMessages.length > MAX_QUEUED_MESSAGES) {
        this.queuedMessages.shift();
      }
    }
    return false;
  }

  public onOpen(listener: OpenListener): void {
    this.openListeners.push(listener);
  }

  private async open(): Promise<void> {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${protocol}//${window.location.host}${this.url}`;
    let fullUrl = base;
    if (getSession() !== null) {
      try {
        const params = await signStreamUpgrade();
        const search = new URLSearchParams(params);
        fullUrl = `${base}?${search.toString()}`;
      } catch {
        fullUrl = base;
      }
    }
    this.socket = new WebSocket(fullUrl);

    this.socket.onopen = () => {
      this.reconnectDelay = 1000;
      this.flushQueuedMessages();
      for (const listener of this.openListeners) {
        listener();
      }
    };

    this.socket.onmessage = (event: MessageEvent) => {
      if (this.handler !== null) {
        const frame = JSON.parse(event.data as string) as StreamFrame;
        this.handler(frame);
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      if (this.socket !== null) {
        this.socket.close();
      }
    };
  }

  private flushQueuedMessages(): void {
    if (this.socket === null) {
      this.queuedMessages = [];
      return;
    }
    for (const message of this.queuedMessages) {
      this.socket.send(message);
    }
    this.queuedMessages = [];
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      void this.open();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}
