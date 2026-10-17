import { CLINIC, DOCTORS, HOLIDAYS, TOOLS } from "../clinicData";
import { Link } from "react-router-dom";

const CALENDAR_WEEK = [
  { date: "2026-10-01", day: "Thu", note: "Reference date (today)" },
  { date: "2026-10-02", day: "Fri", note: "Clinic holiday — closed" },
  { date: "2026-10-03", day: "Sat", note: "" },
  { date: "2026-10-04", day: "Sun", note: "No doctor works Sunday" },
  { date: "2026-10-05", day: "Mon", note: "Dr. Sethi on leave" },
  { date: "2026-10-06", day: "Tue", note: "Dr. Sethi on leave" },
  { date: "2026-10-07", day: "Wed", note: "Dr. Sethi on leave" },
  { date: "2026-10-08", day: "Thu", note: "" },
  { date: "2026-10-09", day: "Fri", note: "Dr. Rao on leave" },
  { date: "2026-10-10", day: "Sat", note: "" },
];

export function Dashboard() {
  const totalAppts = 25; // from clinic.json
  const totalPatients = 40;

  return (
    <div className="page-content">
      {/* Hero */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-text">
          <h1>Sunrise Clinic — Front Desk Agent</h1>
          <p>
            An LLM-powered appointment management agent. Handles bookings, rescheduling,
            cancellations, and safety escalations in English, Hindi, and Hinglish.
            Uses Gemini with verified tool-calling — every action is backed by a real tool result.
          </p>
        </div>
        <Link to="/workbench" className="hero-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Open Agent Workbench
        </Link>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <p className="stat-label">Doctors</p>
          <p className="stat-value">{DOCTORS.length}</p>
          <p className="stat-sub">GP & Paediatrics</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Patients</p>
          <p className="stat-value">{totalPatients}</p>
          <p className="stat-sub">In dataset</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Existing Appointments</p>
          <p className="stat-value">{totalAppts}</p>
          <p className="stat-sub">Reset per request</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Slot Duration</p>
          <p className="stat-value">{CLINIC.slotMinutes}m</p>
          <p className="stat-sub">Per appointment</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Tools Available</p>
          <p className="stat-value">{TOOLS.length}</p>
          <p className="stat-sub">Whitelisted only</p>
        </div>
      </div>

      {/* Doctors + Calendar */}
      <div className="two-col">
        {/* Doctors */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span>🏥</span> Doctors
            </h2>
            <p className="card-subtitle">Reference date: {CLINIC.referenceDate}</p>
          </div>
          <div className="card-body">
            {DOCTORS.map((doc) => (
              <div key={doc.id} className="doctor-row">
                <div className="doctor-avatar">{doc.emoji}</div>
                <div className="doctor-info">
                  <p className="doctor-name">{doc.name}</p>
                  <p className="doctor-spec">{doc.speciality}</p>
                  <div className="schedule-grid" style={{ marginTop: "6px" }}>
                    {doc.workingDays.map((d) => (
                      <span key={d} className="schedule-chip schedule-chip-day">{d}</span>
                    ))}
                    {doc.leaveDates.map((d) => (
                      <span key={d} className="schedule-chip schedule-chip-leave">Leave {d}</span>
                    ))}
                  </div>
                </div>
                <span className="badge badge-green">Active</span>
              </div>
            ))}

            <div style={{ marginTop: "16px" }}>
              <p className="card-subtitle" style={{ marginBottom: "8px" }}>
                🚫 Clinic Holidays
              </p>
              {HOLIDAYS.map((h) => (
                <span key={h} className="badge badge-red" style={{ marginRight: "6px" }}>
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Reference Calendar */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <span>📆</span> Reference Week
            </h2>
            <p className="card-subtitle">Dates relative to today = 2026-10-01</p>
          </div>
          <div className="card-body">
            <div className="notice notice-info" style={{ marginBottom: "14px" }}>
              <span>ℹ️</span>
              The agent uses <strong>today</strong> from each request, never the system clock.
              All relative dates (kal, parso, Saturday) are resolved against this value.
            </div>
            {CALENDAR_WEEK.map((row) => {
              const isHoliday = HOLIDAYS.includes(row.date);
              const isSunday = row.day === "Sun";
              let rowBadge = null;
              if (isHoliday) rowBadge = <span className="badge badge-red">Holiday</span>;
              else if (isSunday) rowBadge = <span className="badge badge-gray">Closed</span>;
              else if (row.note.includes("on leave")) rowBadge = <span className="badge badge-yellow">Part leave</span>;
              else rowBadge = <span className="badge badge-green">Open</span>;

              return (
                <div key={row.date} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "13px", width: "90px", color: "var(--text-mid)" }}>
                    {row.date}
                  </span>
                  <span style={{ width: "36px", fontWeight: 600, color: "var(--text-dark)" }}>{row.day}</span>
                  {rowBadge}
                  {row.note && <span style={{ fontSize: "12px", color: "var(--text-mid)", flex: 1 }}>{row.note}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Supported Tools */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">
          <h2 className="card-title"><span>🛠️</span> Agent Tools</h2>
          <p className="card-subtitle">
            All six tools are whitelisted — the agent cannot execute arbitrary code.
          </p>
        </div>
        <div className="card-body">
          <div className="tools-list">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="tool-item">
                <span className="tool-icon">{tool.icon}</span>
                <div>
                  <div className="tool-name">{tool.name}</div>
                  <div className="tool-desc">{tool.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture note */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><span>🏗️</span> Architecture</h2>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            {[
              {
                icon: "🤖",
                title: "Gemini Function Calling",
                desc: "The LLM selects tools and interprets Hindi/Hinglish/English. It does not execute code — only proposes structured tool calls.",
              },
              {
                icon: "🛡️",
                title: "Backend-Enforced Safety",
                desc: "Clinical triage runs before mutations. Urgent symptoms, medical advice, and injections are handled architecturally — not just by prompt.",
              },
              {
                icon: "🔄",
                title: "State Isolation",
                desc: "Every POST /agent/run starts from a fresh copy of clinic.json. No cross-request state leakage. Concurrent requests are safe.",
              },
            ].map((item) => (
              <div key={item.title} style={{ padding: "14px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px" }}>{item.title}</div>
                <div style={{ fontSize: "13px", color: "var(--text-mid)" }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
