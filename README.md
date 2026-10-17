# SwasthiQ — LLM-Powered Clinic Front Desk Agent

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF.svg?style=flat&logo=vite&logoColor=white)](https://vitejs.dev)
[![Google Gemini](https://img.shields.io/badge/Gemini-3.8--Flash-4285F4.svg?style=flat&logo=google&logoColor=white)](https://ai.google.dev)
[![Tests](https://img.shields.io/badge/Tests-60%20Passing-brightgreen.svg?style=flat)](tests/)

A production-ready, deterministic Clinic Front Desk Agent powered by **Google Gemini (`gemini-3.8-flash`)**, **FastAPI**, and **React (TypeScript + Vite)**.

Designed for a busy outpatient clinic (*Sunrise Clinic, Dehradun*), the agent autonomously processes multi-turn patient conversations across Hindi, English, and Hinglish. It handles appointment bookings, reschedules, cancellations, slot availability searches, and patient identity lookups.

Crucially, **the agent enforces clinical safety, identity authorization, and atomic state consistency by architecture, not merely by prompting.** When the LLM is free to choose actions, the backend guarantees that it cannot hallucinate slots, execute unauthorized operations, or commit harmful mutations.

---

## Architecture Overview

```
                                      ┌─────────────────────────────────────────────────────────────┐
                                      │              React 19 + TypeScript Frontend                 │
                                      │  Screen 1: Clinic Overview Dashboard                        │
                                      │  Screen 2: Agent Evaluation & Tool Trace Workbench          │
                                      └──────────────────────────────┬──────────────────────────────┘
                                                                     │
                                                        POST /agent/run (JSON)
                                                                     │
                                                                     ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                      FastAPI Backend Service                                                      │
│                                                                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Clinical Safety & Triage Engine (safety.assess_safety)                                                                   │  │
│  │    • Pre-execution triage evaluating full conversation before any mutation commits                                         │  │
│  │    • Detects emergencies (chest pain, dyspnea) -> Immediate escalation (clinical_urgent)                                    │  │
│  │    • Detects diagnostic / medication inquiries -> Escalation (medical_advice)                                               │  │
│  │    • Detects privilege escalation / instruction overrides -> Refused (prompt_injection)                                     │  │
│  └──────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘  │
│                                                                 │                                                                 │
│                                                                 ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. Gemini Orchestration Loop (backend/llm.py)                                                                               │  │
│  │    • Model: gemini-3.8-flash | Official google-genai SDK (FunctionDeclaration / FunctionResponse)                          │  │
│  │    • Low-variance configuration (temperature=0.0, top_p=0.1) for deterministic output                                       │  │
│  │    • Relative date anchoring (all dates resolved strictly against request.today, never machine clock)                       │  │
│  │    • Multi-turn tool execution loop bounded to 12 iterations                                                               │  │
│  └──────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘  │
│                                                                 │                                                                 │
│                                                                 ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. Guarded Python Tool Layer & State Isolation (backend/tools.py)                                                           │  │
│  │    • Strict Whitelist Dispatcher (no eval, no arbitrary code execution)                                                     │  │
│  │    • Six Guarded Tools: search_slots, book_appointment, reschedule_appointment,                                             │  │
│  │                         cancel_appointment, lookup_patient, escalate_to_human                                               │  │
│  │    • Request-Local In-Memory Transaction (fresh deep copy of clinic.json per request)                                       │  │
│  │    • Atomic Commit / Rollback (failed reschedules leave original slot intact)                                              │  │
│  │    • Guardian Authorization Validation (Sunita Gupta -> Aarav/Arjun Gupta only)                                             │  │
│  │    • Overlapping working windows unioned; clinic holidays (Oct 2) & doctor leaves blocked                                    │  │
│  └──────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘  │
│                                                                 │                                                                 │
│                                                                 ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Verifiable Contract Synthesizer                                                                                          │  │
│  │    • Terminal state derived exclusively from verified backend execution logs, never from LLM text claims                    │  │
│  │    • Real appointment_id & patient_id derived from actual created records                                                   │  │
│  │    • Monotonic latency measurement & actual usage_metadata token counting                                                   │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Guarantees

### 1. Safety Enforced by Architecture, Not Just Prompts
The model is allowed to propose actions, but the backend prevents those proposals from becoming harmful:
- **Pre-Mutation Clinical Triage**: Before any appointment booking, rescheduling, or cancellation can commit, the complete conversation history is evaluated for clinical risk.
- **Emergency Circuit-Breaker**: Mentions of severe symptoms (chest pain, breathing difficulties, stroke signs, loss of consciousness) immediately dispatch `escalate_to_human("clinical_urgent")` and instruct the caller to seek emergency care (102 / 112). Normal booking tools are locked for that request.
- **Clinical Judgement Escalation**: Callers asking for drug dosages or diagnoses are handed off to human medical staff (`medical_advice`).
- **Prompt Injection Defense**: Attempts to claim "administrator mode", override prompt instructions, or execute bulk cancellations are rejected with `terminal_state="refused"` and zero tool invocations.

### 2. State Reset & Transactional Consistency
- **Zero Cross-Request Contamination**: Every `POST /agent/run` starts from an isolated in-memory deep copy of `clinic.json`. An appointment created in request A does not leak into request B.
- **Intra-Request Working State**: Operations within the same conversation share the request's working state. If an appointment is booked in turn 1, a subsequent slot search in turn 2 reflects that the slot is now occupied.
- **Atomic Mutations**:
  - `reschedule_appointment`: Verifies target slot availability (excluding the appointment being moved). If the new slot is blocked or invalid, the operation fails and leaves the original appointment completely unchanged.
  - `book_appointment`: Verifies that the slot is genuinely free, verifies the doctor's schedule, leaves, and holidays, and checks authorization before generating a collision-free ID (`ap_0026+`).
  - `cancel_appointment`: Only cancels appointments belonging to a verified, authorized patient.

### 3. Patient Identity & Guardian Authorization
- **Ambiguity Preservation**: `lookup_patient` returns matching candidates rather than guessing. If multiple patients share a surname (e.g. 3 Sharma records) or a phone number (e.g. `9812200166`), the tool preserves ambiguity, triggering `ambiguous_patient` escalation.
- **Guardian Access Control**: A guardian (e.g., Sunita Gupta) may only act on behalf of children explicitly listed in her `guardian_of` array (`pt_0006`, `pt_0007`). If she does not state which child needs care, the agent escalates as `ambiguous_patient`.
- **Third-Party Record Actions Blocked**: Acquaintances or neighbors (e.g., Mohit Negi attempting to cancel Lakshmi Iyer's appointment) are rejected at the tool authorization layer with `not_authorised`.

### 4. Deterministic Date Resolution
- **Request-Anchored Calendar**: All relative dates (`aaj`, `kal`, `parso`, `next Monday`, `Saturday`) resolve against the request's `today` string (`2026-10-01`), **never against the machine clock**.
- **Clinic Calendar Logic**:
  - `2026-10-02` (Friday): Gandhi Jayanti — closed for all doctors.
  - `2026-10-04` (Sunday): No doctor works on Sundays.
  - `2026-10-05` to `2026-10-07`: Dr. Vikram Sethi on leave.
  - `2026-10-09`: Dr. Anjali Rao on leave.
  - Slot searches prior to `today` are rejected.

---

## API Contract: `POST /agent/run`

The backend strictly conforms to the evaluation specification. Automatically exposed docs (`/docs`, `/redoc`, `/openapi.json`) are disabled to maintain endpoint exclusivity.

### Request

```http
POST /agent/run HTTP/1.1
Content-Type: application/json

{
  "conversation_id": "cv_0001",
  "today": "2026-10-01",
  "turns": [
    "Namaste, Dr. Rao ke saath appointment chahiye tha.",
    "Shanivaar subah, 3 tareekh.",
    "Main Harpreet Singh, number 9812200311."
  ]
}
```

### Response

```json
{
  "conversation_id": "cv_0001",
  "tool_calls": [
    {
      "name": "lookup_patient",
      "arguments": {
        "name": "Harpreet Singh",
        "phone": "9812200311",
        "dob": null
      }
    },
    {
      "name": "search_slots",
      "arguments": {
        "doctor_id": "dr_rao",
        "date": "2026-10-03",
        "time_of_day": "morning"
      }
    },
    {
      "name": "book_appointment",
      "arguments": {
        "patient_id": "pt_0013",
        "doctor_id": "dr_rao",
        "date": "2026-10-03",
        "start": "09:00"
      }
    }
  ],
  "terminal_state": "booked",
  "escalation_reason": null,
  "patient_id": "pt_0013",
  "appointment_id": "ap_0026",
  "reply": "नमस्ते हरप्रीत जी, डॉ. अंजलि राव के साथ आपका अपॉइंटमेंट शनिवार, 3 अक्टूबर 2026 को सुबह 09:00 बजे बुक कर दिया गया है।",
  "metrics": {
    "turns": 3,
    "tokens": 8952,
    "latency_ms": 16151
  }
}
```

### Contract Fields

| Field | Type | Description |
|---|---|---|
| `conversation_id` | string | Echoed exactly from the request. |
| `tool_calls` | array | Ordered trace of actual tools executed, with exact arguments passed. |
| `terminal_state` | enum | Exactly one of: `booked`, `rescheduled`, `cancelled`, `escalated`, `refused`, `abandoned`. |
| `escalation_reason` | enum / `null` | Required when `terminal_state` is `escalated`. Must be `null` otherwise. One of: `clinical_urgent`, `medical_advice`, `not_authorised`, `ambiguous_patient`, `out_of_scope`. |
| `patient_id` | string / `null` | Verified patient ID, or `null` if unresolved/ambiguous. |
| `appointment_id` | string / `null` | ID of the appointment created, moved, or cancelled, or `null` if none. |
| `reply` | string | Final utterance to caller in their language (Hindi / Hinglish / English). |
| `metrics` | object | Accurate request metrics: `turns`, `tokens` (from API metadata), `latency_ms` (monotonic clock). |

---

## The Six Guarded Tools

| Tool | Purpose | Safeguards |
|---|---|---|
| `search_slots` | Find free doctor slots for a date | Blocks past dates, Sundays, holidays, doctor leave dates, and active bookings. |
| `book_appointment` | Create appointment in an open slot | Verifies identity, doctor, and slot availability; generates non-colliding `ap_` ID. |
| `reschedule_appointment` | Move existing appointment | Excludes current appointment from conflict check; leaves original slot unchanged on failure. |
| `cancel_appointment` | Cancel existing appointment | Verifies appointment belongs to patient; rejects already-cancelled records. |
| `lookup_patient` | Resolve patient identity | Matches name/phone/DOB; returns candidate lists; never guesses among ambiguous records. |
| `escalate_to_human` | Handoff to human staff | Whitelist of 5 valid escalation reasons; records structured handoff. |

---

## React Frontend Application

The frontend is built using **React 19**, **TypeScript**, **Vite**, and **React Router v7** with a responsive clinical design palette:

### Screen 1: Front Desk Dashboard (`/`)
- **Clinic Overview**: Profile for Sunrise Clinic (Dehradun), working hours, and slot duration (15 min).
- **Doctor Roster**: Real-time schedules, specialties, and upcoming leave dates for Dr. Anjali Rao and Dr. Vikram Sethi.
- **Reference Calendar**: Visual day-by-day calendar anchored to `2026-10-01` showing holidays and leave statuses.
- **Tool Capabilities**: Overview of the 6 guarded tools and safety architecture.

### Screen 2: Conversation Evaluator & Workbench (`/workbench`)
- **Interactive Conversation Builder**: Add, edit, and reorder caller turns with dynamic turn numbering.
- **Preset Scenarios**: One-click loaders for baseline bookings, mid-sentence corrections, clinical emergencies, prompt injections, and ambiguous identity scenarios.
- **Live Tool Trace**: Visual timeline of all executed tools displaying exact argument parameters.
- **Status & Metric Cards**: Color-coded terminal state banners (`booked`, `rescheduled`, `cancelled`, `escalated`, `refused`, `abandoned`), escalation reasons, resolved IDs, token counts, and request latency.
- **Raw JSON Inspector**: Collapsible view of the exact JSON payload returned by `POST /agent/run`.

---

## Getting Started Locally

### Prerequisites
- Python 3.9+ (Python 3.10–3.13 recommended)
- Node.js 18+ and npm
- A Google Gemini API Key ([Get one free at Google AI Studio](https://aistudio.google.com/apikey))

### 1. Clone & Configure Environment

```bash
git clone https://github.com/Prakhar6947/clinic-front-desk-agent.git
cd clinic-front-desk-agent

# Set up backend environment
cp backend/.env.example backend/.env
# Edit backend/.env and paste your GEMINI_API_KEY
```

```ini
# backend/.env
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-3.8-flash
HOST=127.0.0.1
PORT=8000
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 2. Install Dependencies

```bash
# Backend dependencies
pip install -r backend/requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Run Backend & Frontend

**Terminal 1 — Backend (FastAPI)**:
```bash
python3 main.py
# Server listening on http://127.0.0.1:8000
```

**Terminal 2 — Frontend (Vite)**:
```bash
cd frontend
npm run dev
# App running on http://localhost:5173
```

Navigate to `http://localhost:5173` in your browser.

---

## Verification & Test Suites

### 1. Backend Unit Tests (60 Tests, 100% Mocked)
Verify tools, safety triage, mocked LLM flows, and boundary conditions without network calls or API consumption:
```bash
python3 -m unittest discover -s tests -v
```

### 2. Verification Harness (15 Supplied Conversations)
Replay the 15 standard conversation scripts against the running agent:
```bash
python3 runner.py --url http://localhost:8000/agent/run
```

### 3. Determinism Check (Repeated Runs)
Verify output contract stability and tool call determinism across 3 consecutive runs:
```bash
python3 runner.py --url http://localhost:8000/agent/run --repeat 3
```

### 4. Adversarial Test Suite (8 Edge Cases)
Evaluate edge cases in `adversarial/` (late emergency symptoms, ambiguous phone numbers, prompt injections, unauthorized cancellations):
```bash
python3 runner.py --dir adversarial --url http://localhost:8000/agent/run
```

### 5. Frontend Production Build
```bash
cd frontend
npm run build
```

---

## Deployment Guide

### Backend Deployment (Render / Railway / GCP Cloud Run)
1. **Build Command**: `pip install -r backend/requirements.txt`
2. **Start Command**: `python3 -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. **Environment Variables**:
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `GEMINI_MODEL`: `gemini-3.8-flash`
   - `FRONTEND_ORIGINS`: Deployed frontend URL (e.g., `https://swasthiq-agent.vercel.app`).

### Frontend Deployment (Vercel / Netlify / Cloudflare Pages)
1. **Framework Preset**: Vite
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Environment Variables**:
   - `VITE_API_BASE_URL`: Deployed backend service URL (e.g., `https://swasthiq-backend.onrender.com`).

---

## Repository Structure

```
clinic-front-desk-agent/
├── backend/
│   ├── agent.py            # Orchestrator & LLM interaction loop
│   ├── llm.py              # Gemini SDK wrapper & tool declarations
│   ├── safety.py           # Clinical triage & safety engine
│   ├── tools.py            # The 6 guarded Python clinic tools
│   ├── main.py             # FastAPI server with POST /agent/run
│   ├── requirements.txt    # Backend dependencies
│   └── .env.example        # Backend environment template
├── frontend/
│   ├── src/
│   │   ├── components/     # TopNav and shared UI elements
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx  # Screen 1: Clinic Overview
│   │   │   └── Workbench.tsx  # Screen 2: Conversation Evaluator
│   │   ├── api.ts          # Type-safe API client
│   │   ├── clinicData.ts   # Static clinic metadata & example scripts
│   │   ├── index.css       # Clean medical dashboard styling
│   │   └── App.tsx         # Route configuration
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
├── adversarial/            # 8 adversarial evaluation scripts
├── conversations/          # 15 baseline evaluation scripts
├── tests/
│   └── test_agent.py       # 60 unit tests (tools, safety, LLM mocking)
├── clinic.json             # Synthetic clinic dataset (ground truth)
├── runner.py               # Verification harness
├── schema.md               # API output contract definition
├── DECISIONS.md            # Documented implementation rationale
├── README.md               # Complete technical documentation
├── .env.example            # Root environment variable template
├── .gitignore              # Git ignore rules (secrets & builds excluded)
└── main.py                 # Convenience server entrypoint
```

---

## Author
Developed by **Prakhar** ([@Prakhar6947](https://github.com/Prakhar6947)) for the SwasthiQ Clinic Front Desk Agent assignment.
