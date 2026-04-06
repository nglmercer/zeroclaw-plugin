import type { ZeroClawMessage } from "./types.js";

/**
 * Client for ZeroClaw WebSocket communication.
 */
export class ZeroClawWS {
  private baseUrl: string;
  private token: string;
  private sessionId: string;
  private ws: WebSocket | null = null;

  // Optional hooks for consumers to override
  public onChunk?: (content: string) => void;
  public onDone?: (fullResponse: string) => void;
  public onError?: (message: string) => void;
  public onSessionStart?: (sessionId: string, resumed?: boolean) => void;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl
      .replace("http://", "ws://")
      .replace("https://", "wss://");
    this.token = token;
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  public connect(): void {
    const params = new URLSearchParams();
    params.set("token", this.token);
    params.set("session_id", this.sessionId);

    const url = `${this.baseUrl}/ws/chat?${params.toString()}`;

    console.log("[ws] Connecting to:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[ws] Connected");
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: ZeroClawMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error("[ws] Failed to parse message:", err);
      }
    };

    this.ws.onerror = (error: Event) => {
      console.error("[ws] Error:", error);
    };

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`[ws] Closed: ${event.reason} (${event.code})`);
    };
  }

  public sendMessage(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[ws] Not connected.");
      return;
    }
    this.ws.send(JSON.stringify({ type: "message", content }));
  }

  public disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(msg: ZeroClawMessage): void {
    switch (msg.type) {
      case "chunk":
        console.log("[ws] Chunk:", msg.content);
        this.onChunk?.(msg.content);
        break;
      case "done":
        console.log("[ws] Done:", msg.full_response);
        this.onDone?.(msg.full_response);
        break;
      case "error":
        console.error("[ws] Error:", msg.message);
        this.onError?.(msg.message);
        break;
      case "session_start":
        console.log("[ws] Session started:", msg.session_id);
        this.onSessionStart?.(msg.session_id, msg.resumed);
        break;
    }
  }
}
