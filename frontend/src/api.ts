// API configuration — never put GEMINI_API_KEY here, only the backend URL

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

export const API_BASE = DEFAULT_API_BASE;

export interface AgentRequest {
  conversation_id: string;
  today: string;
  turns: string[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentMetrics {
  turns: number;
  tokens: number;
  latency_ms: number;
}

export type TerminalState =
  | "booked"
  | "rescheduled"
  | "cancelled"
  | "escalated"
  | "refused"
  | "abandoned";

export type EscalationReason =
  | "clinical_urgent"
  | "medical_advice"
  | "not_authorised"
  | "ambiguous_patient"
  | "out_of_scope"
  | null;

export interface AgentResponse {
  conversation_id: string;
  tool_calls: ToolCall[];
  terminal_state: TerminalState;
  escalation_reason: EscalationReason;
  patient_id: string | null;
  appointment_id: string | null;
  reply: string;
  metrics: AgentMetrics;
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const url = `${API_BASE}/agent/run`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return response.json();
}
