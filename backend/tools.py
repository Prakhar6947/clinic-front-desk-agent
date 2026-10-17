"""Request-local clinic tools used by the front-desk agent.

These are the six permitted tools. Each one:
- Validates its inputs before mutating state.
- Records itself in self.calls for the response contract.
- Operates exclusively on a per-request deep copy of clinic.json.
- Never mutates the original dataset.
"""

from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher
import re


def minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def clock(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", value.lower()).strip()


class ClinicTools:
    """Tools deliberately keep all mutations inside one request's copied data."""

    def __init__(self, data: dict, earliest_date: str | None = None):
        self.data = data
        self.earliest_date = earliest_date
        self.calls: list[dict] = []

    def _record(self, name: str, arguments: dict) -> None:
        self.calls.append({"name": name, "arguments": arguments})

    def doctor(self, doctor_id: str) -> dict | None:
        return next((item for item in self.data["doctors"] if item["id"] == doctor_id), None)

    def patient(self, patient_id: str) -> dict | None:
        return next((item for item in self.data["patients"] if item["id"] == patient_id), None)

    def lookup_patient(self, name: str | None = None, phone: str | None = None,
                       dob: str | None = None) -> dict:
        arguments = {"name": name, "phone": phone, "dob": dob}
        self._record("lookup_patient", arguments)
        candidates = self.data["patients"]
        if phone:
            candidates = [p for p in candidates if p["phone"] == phone]
        if dob:
            candidates = [p for p in candidates if p["dob"] == dob]
        if name:
            wanted = norm(name)
            words = set(wanted.split())
            exact = [
                p for p in candidates
                if wanted in norm(p["name"]) or words.issubset(set(norm(p["name"]).split()))
            ]
            # Accept common spelling variants, but return every plausible record so
            # the conversation layer can preserve ambiguity instead of guessing.
            candidates = exact or [
                p for p in candidates
                if SequenceMatcher(None, wanted.replace(" ", ""),
                                   norm(p["name"]).replace(" ", "")).ratio() >= 0.80
            ]
        return {"candidates": [
            {"id": p["id"], "name": p["name"], "phone": p["phone"],
             "dob": p["dob"], "guardian_of": p["guardian_of"]}
            for p in candidates
        ]}

    def _candidate_slots(self, doctor_id: str, date: str,
                         ignore_appointment_id: str | None = None) -> list[str]:
        doctor = self.doctor(doctor_id)
        if (not doctor or (self.earliest_date and date < self.earliest_date)
                or date in self.data["holidays"] or date in doctor["leave_dates"]):
            return []
        try:
            weekday = datetime.strptime(date, "%Y-%m-%d").strftime("%a")
        except ValueError:
            return []
        duration = self.data["clinic"]["slot_minutes"]
        starts: set[int] = set()
        for window in doctor["windows"]:
            if window["day"] != weekday:
                continue
            start, end = minutes(window["start"]), minutes(window["end"])
            for value in range(start, end - duration + 1, duration):
                starts.add(value)

        available = []
        for start in sorted(starts):
            end = start + duration
            occupied = any(
                appointment["id"] != ignore_appointment_id
                and appointment["doctor_id"] == doctor_id
                and appointment["date"] == date
                and appointment["status"] == "booked"
                and start < minutes(appointment["end"])
                and end > minutes(appointment["start"])
                for appointment in self.data["appointments"]
            )
            if not occupied:
                available.append(clock(start))
        return available

    def search_slots(self, doctor_id: str, date: str, time_of_day: str | None = None) -> dict:
        arguments = {"doctor_id": doctor_id, "date": date, "time_of_day": time_of_day}
        self._record("search_slots", arguments)
        slots = self._candidate_slots(doctor_id, date)
        if time_of_day == "morning":
            slots = [slot for slot in slots if minutes(slot) < 12 * 60]
        elif time_of_day == "afternoon":
            slots = [slot for slot in slots if 12 * 60 <= minutes(slot) < 17 * 60]
        elif time_of_day == "evening":
            slots = [slot for slot in slots if minutes(slot) >= 17 * 60]
        return {"slots": slots}

    def book_appointment(self, patient_id: str | None, doctor_id: str | None,
                         date: str | None, start: str | None) -> dict:
        arguments = {"patient_id": patient_id, "doctor_id": doctor_id, "date": date, "start": start}
        self._record("book_appointment", arguments)
        if not patient_id or not doctor_id or not date or not start:
            return {"ok": False, "error": "missing_required_information"}
        if not self.patient(patient_id) or not self.doctor(doctor_id):
            return {"ok": False, "error": "unknown_patient_or_doctor"}
        if start not in self._candidate_slots(doctor_id, date):
            return {"ok": False, "error": "slot_unavailable"}
        duration = self.data["clinic"]["slot_minutes"]
        highest = max((int(a["id"].split("_")[1]) for a in self.data["appointments"]), default=0)
        appointment = {
            "id": f"ap_{highest + 1:04d}", "patient_id": patient_id,
            "doctor_id": doctor_id, "date": date, "start": start,
            "end": clock(minutes(start) + duration), "status": "booked",
        }
        self.data["appointments"].append(appointment)
        return {"ok": True, "appointment": appointment}

    def reschedule_appointment(self, appointment_id: str | None, patient_id: str | None,
                               date: str | None, start: str | None) -> dict:
        arguments = {"appointment_id": appointment_id, "patient_id": patient_id,
                     "date": date, "start": start}
        self._record("reschedule_appointment", arguments)
        appointment = next((a for a in self.data["appointments"] if a["id"] == appointment_id), None)
        if not appointment or not patient_id or appointment["patient_id"] != patient_id:
            return {"ok": False, "error": "appointment_not_found"}
        if appointment["status"] != "booked" or not date or not start:
            return {"ok": False, "error": "invalid_appointment_or_destination"}
        if start not in self._candidate_slots(appointment["doctor_id"], date, appointment["id"]):
            return {"ok": False, "error": "slot_unavailable"}
        duration = self.data["clinic"]["slot_minutes"]
        appointment.update({"date": date, "start": start, "end": clock(minutes(start) + duration)})
        return {"ok": True, "appointment": appointment}

    def cancel_appointment(self, appointment_id: str | None, patient_id: str | None) -> dict:
        arguments = {"appointment_id": appointment_id, "patient_id": patient_id}
        self._record("cancel_appointment", arguments)
        appointment = next((a for a in self.data["appointments"] if a["id"] == appointment_id), None)
        if not appointment or not patient_id or appointment["patient_id"] != patient_id:
            return {"ok": False, "error": "appointment_not_found"}
        if appointment["status"] != "booked":
            return {"ok": False, "error": "already_cancelled"}
        appointment["status"] = "cancelled"
        return {"ok": True, "appointment": appointment}

    def escalate_to_human(self, reason: str, summary: str) -> dict:
        arguments = {"reason": reason, "summary": summary}
        self._record("escalate_to_human", arguments)
        return {"ok": True, "handoff": "queued", "reason": reason}

    def dispatch(self, name: str, arguments: dict) -> dict:
        """Strict whitelist dispatcher — never executes arbitrary code."""
        ALLOWED = {
            "search_slots", "book_appointment", "reschedule_appointment",
            "cancel_appointment", "lookup_patient", "escalate_to_human",
        }
        if name not in ALLOWED:
            raise ValueError(f"Unknown tool: {name!r}")
        if name == "search_slots":
            return self.search_slots(
                doctor_id=arguments.get("doctor_id", ""),
                date=arguments.get("date", ""),
                time_of_day=arguments.get("time_of_day"),
            )
        if name == "book_appointment":
            return self.book_appointment(
                patient_id=arguments.get("patient_id"),
                doctor_id=arguments.get("doctor_id"),
                date=arguments.get("date"),
                start=arguments.get("start"),
            )
        if name == "reschedule_appointment":
            return self.reschedule_appointment(
                appointment_id=arguments.get("appointment_id"),
                patient_id=arguments.get("patient_id"),
                date=arguments.get("date"),
                start=arguments.get("start"),
            )
        if name == "cancel_appointment":
            return self.cancel_appointment(
                appointment_id=arguments.get("appointment_id"),
                patient_id=arguments.get("patient_id"),
            )
        if name == "lookup_patient":
            return self.lookup_patient(
                name=arguments.get("name"),
                phone=arguments.get("phone"),
                dob=arguments.get("dob"),
            )
        if name == "escalate_to_human":
            return self.escalate_to_human(
                reason=arguments.get("reason", "out_of_scope"),
                summary=arguments.get("summary", ""),
            )
        raise ValueError(f"Unhandled tool: {name!r}")  # Should not reach here
