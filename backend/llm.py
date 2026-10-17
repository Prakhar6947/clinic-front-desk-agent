"""Gemini LLM wrapper for the Clinic Front Desk Agent.

Handles API configuration, the tool schemas, and the function-calling loop.
Never exposes the API key or takes arbitrary function names from the model.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

# google-genai is the current official SDK
try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

# ---------------------------------------------------------------------------
# Tool schemas exposed to the LLM
# ---------------------------------------------------------------------------

TOOL_DECLARATIONS = [
    {
        "name": "search_slots",
        "description": (
            "Return available appointment slots for a doctor on a specific date. "
            "Always call this before book_appointment to confirm slot availability. "
            "Never claim a slot is available without calling this first."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "doctor_id": {
                    "type": "string",
                    "description": "Doctor ID from clinic data (e.g., 'dr_rao', 'dr_sethi')",
                },
                "date": {
                    "type": "string",
                    "description": "Date in YYYY-MM-DD format",
                },
                "time_of_day": {
                    "type": "string",
                    "enum": ["morning", "afternoon", "evening"],
                    "description": "Optional filter for time of day preference",
                },
            },
            "required": ["doctor_id", "date"],
        },
    },
    {
        "name": "book_appointment",
        "description": (
            "Create a new appointment. Requires a uniquely resolved patient_id, "
            "a valid doctor, a future date, and a slot confirmed available by search_slots. "
            "The tool validates availability again and rejects double-bookings."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "patient_id": {
                    "type": "string",
                    "description": "Patient ID from lookup_patient result",
                },
                "doctor_id": {
                    "type": "string",
                    "description": "Doctor ID (e.g., 'dr_rao', 'dr_sethi')",
                },
                "date": {
                    "type": "string",
                    "description": "Appointment date in YYYY-MM-DD format",
                },
                "start": {
                    "type": "string",
                    "description": "Start time in HH:MM format (24-hour), must be in search_slots result",
                },
            },
            "required": ["patient_id", "doctor_id", "date", "start"],
        },
    },
    {
        "name": "reschedule_appointment",
        "description": (
            "Move an existing booked appointment to a new slot. "
            "The original appointment remains unchanged if the new slot is unavailable."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {
                    "type": "string",
                    "description": "ID of the existing appointment to reschedule",
                },
                "patient_id": {
                    "type": "string",
                    "description": "Patient ID for authorization check",
                },
                "date": {
                    "type": "string",
                    "description": "New date in YYYY-MM-DD format",
                },
                "start": {
                    "type": "string",
                    "description": "New start time in HH:MM format (24-hour)",
                },
            },
            "required": ["appointment_id", "patient_id", "date", "start"],
        },
    },
    {
        "name": "cancel_appointment",
        "description": (
            "Cancel an existing booked appointment. Only works for appointments "
            "belonging to the identified patient. Does not cancel already-cancelled appointments."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "appointment_id": {
                    "type": "string",
                    "description": "ID of the appointment to cancel",
                },
                "patient_id": {
                    "type": "string",
                    "description": "Patient ID for authorization check",
                },
            },
            "required": ["appointment_id", "patient_id"],
        },
    },
    {
        "name": "lookup_patient",
        "description": (
            "Search for patient records by name, phone number, or date of birth. "
            "Returns all matching candidates — never guesses. "
            "If multiple candidates are returned, the patient is ambiguous. "
            "A phone number shared by multiple patients does not resolve ambiguity alone."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Patient name or partial name to search for",
                },
                "phone": {
                    "type": "string",
                    "description": "10-digit phone number (without country code)",
                },
                "dob": {
                    "type": "string",
                    "description": "Date of birth in YYYY-MM-DD format",
                },
            },
        },
    },
    {
        "name": "escalate_to_human",
        "description": (
            "Hand the conversation off to a human agent. Use for: "
            "'clinical_urgent' (potential medical emergency), "
            "'medical_advice' (caller asks for clinical judgement/diagnosis/treatment), "
            "'not_authorised' (caller attempting to act on another patient's record without authorization), "
            "'ambiguous_patient' (identity cannot be resolved from conversation), "
            "'out_of_scope' (legitimate request outside appointment administration). "
            "Once called, do not proceed with booking/rescheduling/cancellation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "enum": [
                        "clinical_urgent",
                        "medical_advice",
                        "not_authorised",
                        "ambiguous_patient",
                        "out_of_scope",
                    ],
                    "description": "Reason for escalation",
                },
                "summary": {
                    "type": "string",
                    "description": "Brief summary of what the caller needs",
                },
            },
            "required": ["reason", "summary"],
        },
    },
]


def _build_client() -> Any:
    """Build the Gemini client from environment variables. Raises if key is missing."""
    if not GENAI_AVAILABLE:
        raise RuntimeError(
            "google-genai package not installed. Run: pip install google-genai"
        )
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it before starting the backend."
        )
    return genai.Client(api_key=api_key)


def get_model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")


class GeminiAgent:
    """Stateless wrapper around the Gemini function-calling API."""

    MAX_TOOL_CALLS = 12  # Safety bound — prevents infinite loops

    def __init__(self) -> None:
        self._client: Any = None  # Lazy-initialized

    def _client_instance(self) -> Any:
        if self._client is None:
            self._client = _build_client()
        return self._client

    def run(
        self,
        system_prompt: str,
        conversation_history: list[dict],
        tool_dispatcher,  # callable(name, args) -> dict
    ) -> tuple[str, int]:
        """
        Run the function-calling loop until the model returns text or the
        safety bound is reached.

        Returns (final_text_reply, total_tokens).
        """
        client = self._client_instance()
        model_name = get_model_name()

        # Build tool config for the SDK
        tools = [
            genai_types.Tool(
                function_declarations=[
                    genai_types.FunctionDeclaration(**decl)
                    for decl in TOOL_DECLARATIONS
                ]
            )
        ]

        generation_config = genai_types.GenerateContentConfig(
            temperature=0.0,
            top_p=0.1,
            max_output_tokens=2048,
            system_instruction=system_prompt,
            tools=tools,
            tool_config=genai_types.ToolConfig(
                function_calling_config=genai_types.FunctionCallingConfig(
                    mode="AUTO",
                )
            ),
        )

        # Convert conversation history to SDK format
        contents = _build_contents(conversation_history)

        total_tokens = 0
        call_count = 0

        while call_count < self.MAX_TOOL_CALLS:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=generation_config,
            )

            # Accumulate token usage
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                meta = response.usage_metadata
                total_tokens += getattr(meta, "total_token_count", 0)

            # Check for a text response
            candidate = response.candidates[0] if response.candidates else None
            if candidate is None:
                return "I'm sorry, I couldn't process that request.", total_tokens

            # Extract function calls
            fc_parts = [
                part for part in (candidate.content.parts or [])
                if hasattr(part, "function_call") and part.function_call
            ]
            text_parts = [
                part for part in (candidate.content.parts or [])
                if hasattr(part, "text") and part.text
            ]

            if not fc_parts:
                # Model returned a final text response
                final_text = " ".join(p.text for p in text_parts).strip()
                return final_text or "Request processed.", total_tokens

            # Process function calls
            call_count += len(fc_parts)
            function_responses = []

            for part in fc_parts:
                fc = part.function_call
                tool_name = fc.name
                tool_args = dict(fc.args) if fc.args else {}

                try:
                    result = tool_dispatcher(tool_name, tool_args)
                except ValueError as exc:
                    result = {"ok": False, "error": str(exc)}

                function_responses.append(
                    genai_types.Part(
                        function_response=genai_types.FunctionResponse(
                            name=tool_name,
                            response={"result": result},
                        )
                    )
                )

            # Add the model's response and tool results to history
            contents.append(candidate.content)
            contents.append(
                genai_types.Content(
                    role="user",
                    parts=function_responses,
                )
            )

        # Safety bound reached
        return "I've processed your request but reached the maximum operation limit.", total_tokens


def _build_contents(conversation_history: list[dict]) -> list:
    """Convert our conversation history format to SDK Content objects."""
    contents = []
    for message in conversation_history:
        role = message["role"]
        text = message.get("text", "")
        if role == "user":
            contents.append(
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=text)],
                )
            )
        elif role == "model":
            contents.append(
                genai_types.Content(
                    role="model",
                    parts=[genai_types.Part(text=text)],
                )
            )
    return contents
