import { useState } from "react";
import { runAgent } from "../api";
import type { AgentResponse, AgentRequest } from "../api";
import { EXAMPLE_CONVERSATIONS } from "../clinicData";

type LoadingState = "idle" | "loading" | "success" | "error";

const STATE_STYLES: Record<string, string> = {
  booked: "state-booked",
  rescheduled: "state-rescheduled",
  cancelled: "state-cancelled",
  escalated: "state-escalated",
  refused: "state-refused",
  abandoned: "state-abandoned",
};

const STATE_ICONS: Record<string, string> = {
  booked: "✅",
  rescheduled: "🔄",
  cancelled: "❌",
  escalated: "🚨",
  refused: "🚫",
  abandoned: "💬",
};

const ESCALATION_LABELS: Record<string, string> = {
  clinical_urgent: "Clinical Emergency",
  medical_advice: "Medical Advice Request",
  not_authorised: "Not Authorised",
  ambiguous_patient: "Ambiguous Patient",
  out_of_scope: "Out of Scope",
};

function ToolCallDisplay({ calls }: { calls: AgentResponse["tool_calls"] }) {
  if (calls.length === 0) {
    return (
      <div className="notice notice-info" style={{ fontSize: "13px" }}>
        No tools were called in this conversation.
      </div>
    );
  }

  return (
    <div>
      {calls.map((call, idx) => (
        <div key={idx} className="tool-call-row">
          <div className="tool-call-header">
            <span style={{ color: "var(--text-mid)", fontSize: "11px" }}>#{idx + 1}</span>
            <span>{call.name}</span>
          </div>
          <div className="tool-call-body">
            {Object.entries(call.arguments).map(([k, v]) => (
              <span key={k} style={{ marginRight: "16px" }}>
                <span style={{ color: "var(--text-mid)" }}>{k}:</span>{" "}
                <span style={{ color: "var(--text-dark)" }}>
                  {v === null ? "null" : String(v)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultPanel({ result }: { result: AgentResponse }) {
  const [showJson, setShowJson] = useState(false);
  const stateClass = STATE_STYLES[result.terminal_state] || "state-abandoned";

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span>📊</span> Agent Response
        </h2>
        <p className="card-subtitle">conversation_id: {result.conversation_id}</p>
      </div>
      <div className="card-body">
        {/* Terminal State */}
        <div className={`state-banner ${stateClass}`}>
          <span style={{ fontSize: "20px" }}>{STATE_ICONS[result.terminal_state]}</span>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {result.terminal_state.charAt(0).toUpperCase() + result.terminal_state.slice(1)}
            </div>
            {result.escalation_reason && (
              <div style={{ fontSize: "13px", marginTop: "2px", opacity: 0.85 }}>
                Reason: {ESCALATION_LABELS[result.escalation_reason] || result.escalation_reason}
              </div>
            )}
          </div>
        </div>

        {/* Reply */}
        <div className="result-section">
          <p className="result-title">🗣️ Agent Reply</p>
          <div className="reply-box">{result.reply}</div>
        </div>

        {/* IDs */}
        <div className="result-section">
          <p className="result-title">🔑 Resolved IDs</p>
          <div className="key-value-row">
            <div className="kv-item">
              <span className="kv-key">patient_id</span>
              <span className="kv-val">{result.patient_id ?? "null"}</span>
            </div>
            <div className="kv-item">
              <span className="kv-key">appointment_id</span>
              <span className="kv-val">{result.appointment_id ?? "null"}</span>
            </div>
          </div>
        </div>

        {/* Tool Calls */}
        <div className="result-section">
          <p className="result-title">
            🛠️ Tool Calls ({result.tool_calls.length})
          </p>
          <ToolCallDisplay calls={result.tool_calls} />
        </div>

        {/* Metrics */}
        <div className="result-section">
          <p className="result-title">📈 Metrics</p>
          <div className="metrics-row">
            <div className="metric-item">
              <div className="metric-num">{result.metrics.turns}</div>
              <div className="metric-lbl">Turns</div>
            </div>
            <div className="metric-item">
              <div className="metric-num">{result.metrics.tokens.toLocaleString()}</div>
              <div className="metric-lbl">Tokens</div>
            </div>
            <div className="metric-item">
              <div className="metric-num">{result.metrics.latency_ms.toLocaleString()}</div>
              <div className="metric-lbl">Latency (ms)</div>
            </div>
          </div>
        </div>

        {/* Raw JSON */}
        <button className="json-toggle" onClick={() => setShowJson((s) => !s)}>
          {showJson ? "▲" : "▶"} Raw JSON Response
        </button>
        {showJson && (
          <pre className="json-block">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export function Workbench() {
  const [conversationId, setConversationId] = useState("cv_0001");
  const [today, setToday] = useState("2026-10-01");
  const [turns, setTurns] = useState<string[]>([
    "Namaste, Dr. Rao ke saath appointment chahiye tha.",
    "Shanivaar subah, 3 tareekh.",
    "Main Harpreet Singh, number 9812200311.",
  ]);
  const [status, setStatus] = useState<LoadingState>("idle");
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showExamples, setShowExamples] = useState(false);

  const loadExample = (ex: typeof EXAMPLE_CONVERSATIONS[0]) => {
    setConversationId(ex.id);
    setToday("2026-10-01");
    setTurns([...ex.turns]);
    setResult(null);
    setStatus("idle");
    setShowExamples(false);
  };

  const addTurn = () => setTurns((t) => [...t, ""]);
  const removeTurn = (idx: number) => setTurns((t) => t.filter((_, i) => i !== idx));
  const updateTurn = (idx: number, val: string) =>
    setTurns((t) => t.map((s, i) => (i === idx ? val : s)));

  const handleRun = async () => {
    const validTurns = turns.filter((t) => t.trim());
    if (!conversationId.trim()) {
      setErrorMsg("Conversation ID is required.");
      setStatus("error");
      return;
    }
    if (validTurns.length === 0) {
      setErrorMsg("At least one non-empty turn is required.");
      setStatus("error");
      return;
    }

    const req: AgentRequest = {
      conversation_id: conversationId.trim(),
      today: today,
      turns: validTurns,
    };

    setStatus("loading");
    setErrorMsg("");
    setResult(null);

    try {
      const res = await runAgent(req);
      setResult(res);
      setStatus("success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "20px", fontWeight: 700 }}>
          🔬 Agent Evaluation Workbench
        </h1>
        <p style={{ margin: 0, color: "var(--text-mid)", fontSize: "14px" }}>
          Construct a conversation, run it against the agent, and inspect the complete tool trace.
          The API key is never sent from this page — it lives only in the backend.
        </p>
      </div>

      <div className="workbench-layout">
        {/* Left: Input */}
        <div>
          {/* Examples */}
          <div className="card" style={{ marginBottom: "16px" }}>
            <div className="card-header">
              <h2 className="card-title">
                <span>📋</span> Example Conversations
              </h2>
            </div>
            <div className="card-body">
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: "12px" }}
                onClick={() => setShowExamples((s) => !s)}
              >
                {showExamples ? "Hide Examples" : "Show Examples"}
              </button>
              {showExamples && (
                <div className="examples-grid">
                  {EXAMPLE_CONVERSATIONS.map((ex) => (
                    <button
                      key={ex.id}
                      className="example-chip"
                      onClick={() => loadExample(ex)}
                    >
                      <strong>{ex.id} — {ex.label}</strong>
                      <span>{ex.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Config */}
          <div className="card" style={{ marginBottom: "16px" }}>
            <div className="card-header">
              <h2 className="card-title"><span>⚙️</span> Request Parameters</h2>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label" htmlFor="conv-id">Conversation ID</label>
                <input
                  id="conv-id"
                  className="form-input"
                  value={conversationId}
                  onChange={(e) => setConversationId(e.target.value)}
                  placeholder="e.g. cv_0001"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="today">
                  Today (Reference Date)
                </label>
                <input
                  id="today"
                  type="date"
                  className="form-input"
                  value={today}
                  onChange={(e) => setToday(e.target.value)}
                />
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-mid)" }}>
                  All relative dates (kal, parso, Saturday) resolve against this value.
                </p>
              </div>
            </div>
          </div>

          {/* Turns */}
          <div className="card" style={{ marginBottom: "16px" }}>
            <div className="card-header">
              <h2 className="card-title"><span>💬</span> Caller Turns</h2>
              <p className="card-subtitle">
                Turns are fixed — the caller will not respond to agent questions.
              </p>
            </div>
            <div className="card-body">
              <div className="turns-list">
                {turns.map((turn, idx) => (
                  <div key={idx} className="turn-row">
                    <div className="turn-number">{idx + 1}</div>
                    <textarea
                      className="turn-textarea"
                      value={turn}
                      onChange={(e) => updateTurn(idx, e.target.value)}
                      placeholder={`Turn ${idx + 1}...`}
                      aria-label={`Caller turn ${idx + 1}`}
                    />
                    {turns.length > 1 && (
                      <button
                        className="btn-icon"
                        onClick={() => removeTurn(idx)}
                        aria-label="Remove turn"
                        title="Remove turn"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="btn-row" style={{ marginTop: "14px" }}>
                <button className="btn btn-secondary btn-sm" onClick={addTurn}>
                  + Add Turn
                </button>
              </div>
            </div>
          </div>

          {/* Run */}
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px" }}
            onClick={handleRun}
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="spinner" />
                Running Agent…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run Agent
              </>
            )}
          </button>

          {status === "error" && (
            <div className="notice notice-error" style={{ marginTop: "12px" }}>
              <span>⚠️</span>
              <div>
                <strong>Error</strong>
                <div style={{ marginTop: "4px" }}>{errorMsg}</div>
                {errorMsg.includes("503") || errorMsg.includes("API") ? (
                  <div style={{ marginTop: "6px", fontSize: "12px" }}>
                    Check that GEMINI_API_KEY is set in backend/.env and the backend is running.
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Right: Result */}
        <div>
          {status === "idle" && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">🤖</div>
                <h3>Ready to Run</h3>
                <p>
                  Build a conversation on the left and click <strong>Run Agent</strong> to see
                  the complete tool-calling trace, terminal state, and reply.
                </p>
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="card">
              <div className="loading-overlay">
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
                <p style={{ fontWeight: 600 }}>Agent is processing…</p>
                <p style={{ fontSize: "13px", color: "var(--text-mid)" }}>
                  Running safety triage → LLM function-calling loop → extracting outcome
                </p>
              </div>
            </div>
          )}

          {status === "success" && result && (
            <ResultPanel result={result} />
          )}
        </div>
      </div>
    </div>
  );
}
