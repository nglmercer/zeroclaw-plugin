// ─── ZeroClaw message types ───────────────────────────────────────────────────

export interface BaseMessage {
  type: string;
}

export interface ChunkMessage extends BaseMessage {
  type: "chunk";
  content: string;
}

export interface DoneMessage extends BaseMessage {
  type: "done";
  full_response: string;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  message: string;
}

export interface SessionStartMessage extends BaseMessage {
  type: "session_start";
  session_id: string;
  resumed?: boolean;
  message_count?: number;
  name?: string;
}

export type ZeroClawMessage =
  | ChunkMessage
  | DoneMessage
  | ErrorMessage
  | SessionStartMessage;
