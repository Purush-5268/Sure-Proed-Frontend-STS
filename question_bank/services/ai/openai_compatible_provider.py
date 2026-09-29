from typing import List, Optional
import json
import time
from openai import OpenAI

from .base import AIProvider, QuestionSchema, VerificationSchema


class OpenAICompatibleProvider(AIProvider):
    def __init__(self, api_key: str, model_name: str, base_url: Optional[str] = None):
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url if base_url else None,
            max_retries=3,
        )
        self.model_name = model_name

    def generate_question(self, topic: str, difficulty: str, context: Optional[str] = None) -> QuestionSchema:
        time.sleep(0.35)
        prompt = (
            f"Generate a {difficulty.lower()} difficulty multiple choice question with 4 options about {topic}.\n"
            "Ensure exactly one option is unambiguously correct and provide a clear explanation."
        )
        if context:
            prompt += f"\nContext/Constraints: {context}"

        response = self.client.beta.chat.completions.parse(
            model=self.model_name,
            messages=[
                {"role": "system", "content": "You are an expert technical assessment question generator."},
                {"role": "user", "content": prompt}
            ],
            response_format=QuestionSchema,
            temperature=0.8,
        )
        return response.choices[0].message.parsed

    def verify_question(self, question_text: str, options: List[str]) -> VerificationSchema:
        time.sleep(0.25)
        options_formatted = "\n".join([f"{chr(65+i)}) {opt}" for i, opt in enumerate(options)])
        prompt = (
            f"Question: {question_text}\n\n"
            f"Options:\n{options_formatted}\n\n"
            "Carefully analyze and identify the single correct option. Return the exact matching option string, a step-by-step explanation, and your confidence score."
        )
        response = self.client.beta.chat.completions.parse(
            model=self.model_name,
            messages=[
                {"role": "system", "content": "You are an expert independent technical validator."},
                {"role": "user", "content": prompt}
            ],
            response_format=VerificationSchema,
            temperature=0.2,
        )
        return response.choices[0].message.parsed
