import json
import hashlib
import math
import re
import time
from typing import List, Optional
import requests
from django.conf import settings
from django.core.cache import cache

from .base import (
    AIProvider,
    AIProviderRateLimitError,
    QuestionSchema,
    VerificationSchema,
)


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model_name: str = "gemini-3.6-flash"):
        self.api_key = api_key
        # Clean model name (remove 'models/' prefix if present)
        self.model_name = model_name.replace("models/", "") if model_name else "gemini-3.6-flash"

    def _call_gemini_rest(self, prompt: str, temperature: float = 0.7) -> str:
        """Direct REST call to Gemini API using requests."""
        self._wait_for_rate_limit_slot()
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model_name}:generateContent"
        )
        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }
        resp = requests.post(
            url,
            json=payload,
            headers={"x-goog-api-key": self.api_key},
            timeout=30,
        )
        try:
            resp.raise_for_status()
        except requests.HTTPError as exc:
            status_code = getattr(resp, "status_code", "unknown")
            try:
                error = (resp.json() or {}).get("error", {})
                provider_status = error.get("status") or "HTTP_ERROR"
                provider_message = error.get("message") or "Gemini rejected the request."
            except (TypeError, ValueError):
                provider_status = "HTTP_ERROR"
                provider_message = "Gemini rejected the request."
            if status_code == 429:
                retry_after = self._retry_after_seconds(resp, provider_message)
                raise AIProviderRateLimitError(
                    f"Gemini API HTTP 429 [{provider_status}]: {provider_message}",
                    retry_after_seconds=retry_after,
                ) from exc
            raise RuntimeError(
                f"Gemini API HTTP {status_code} [{provider_status}]: {provider_message}"
            ) from exc
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"No response generated from Gemini API: {data}")
        text = candidates[0]["content"]["parts"][0]["text"]
        return text

    def _wait_for_rate_limit_slot(self):
        interval = float(
            getattr(settings, "AI_GEMINI_MIN_REQUEST_INTERVAL_SECONDS", 3.2) or 0
        )
        if interval <= 0:
            return
        identity = hashlib.sha256(
            f"{self.api_key}:{self.model_name}".encode("utf-8")
        ).hexdigest()[:24]
        cache_key = f"ai-gemini-throttle:{identity}"
        timeout = max(1, math.ceil(interval))
        deadline = time.monotonic() + 90
        while True:
            try:
                if cache.add(cache_key, "1", timeout=timeout):
                    return
            except Exception:
                # A cache outage must not make AI generation impossible.
                return
            if time.monotonic() >= deadline:
                return
            time.sleep(min(0.25, interval))

    @staticmethod
    def _retry_after_seconds(response, provider_message):
        header = response.headers.get("Retry-After") if response.headers else None
        try:
            if header:
                return min(300, max(1, math.ceil(float(header))))
        except (TypeError, ValueError):
            pass
        match = re.search(r"retry in\s+([0-9.]+)s", provider_message, re.IGNORECASE)
        if match:
            return min(300, max(1, math.ceil(float(match.group(1)))))
        return 60

    def _clean_json_text(self, text: str) -> str:
        """Strip markdown code block tags if present."""
        clean = text.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```(?:json)?\s*", "", clean)
            clean = re.sub(r"\s*```$", "", clean)
        return clean.strip()

    def generate_question(self, topic: str, difficulty: str, context: Optional[str] = None) -> QuestionSchema:
        prompt = (
            f"You are an expert technical examiner. Generate exactly 1 {difficulty.lower()} difficulty "
            f"multiple choice question about '{topic}'.\n"
            f"Return a strict JSON object with this exact schema:\n"
            f'{{\n'
            f'  "question": "The question text",\n'
            f'  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],\n'
            f'  "correct_answer": "Option A text",\n'
            f'  "explanation": "Why this answer is correct",\n'
            f'  "topic": "{topic}"\n'
            f'}}\n'
            f"Requirements:\n"
            f"1. Exactly 4 distinct options in the options array.\n"
            f"2. correct_answer MUST exactly match one of the 4 strings in options.\n"
            f"3. Clear, unambiguous phrasing appropriate for technical assessment."
        )
        if context:
            prompt += f"\nAdditional Context: {context}"

        raw_text = self._call_gemini_rest(prompt, temperature=0.7)
        cleaned = self._clean_json_text(raw_text)
        return QuestionSchema.model_validate_json(cleaned)

    def verify_question(self, question_text: str, options: List[str]) -> VerificationSchema:
        options_formatted = "\n".join([f"{chr(65+i)}. {opt}" for i, opt in enumerate(options)])
        prompt = (
            f"Verify this multiple choice question:\n\n"
            f"Question: {question_text}\n\n"
            f"Options:\n{options_formatted}\n\n"
            f"Return a strict JSON object with this exact schema:\n"
            f'{{\n'
            f'  "correct_answer": "Exact text of the correct option from the options list",\n'
            f'  "explanation": "Detailed explanation of why this option is objectively correct",\n'
            f'  "confidence": 0.95\n'
            f'}}\n'
            f"Requirements: correct_answer MUST match one of the exact option strings provided."
        )

        raw_text = self._call_gemini_rest(prompt, temperature=0.2)
        cleaned = self._clean_json_text(raw_text)
        return VerificationSchema.model_validate_json(cleaned)
