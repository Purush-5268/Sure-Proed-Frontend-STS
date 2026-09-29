from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel, Field


class AIProviderRateLimitError(RuntimeError):
    def __init__(self, message, retry_after_seconds=60):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class QuestionSchema(BaseModel):
    question: str = Field(description="The clear, unambiguous text of the question.")
    options: List[str] = Field(description="Exactly 4 distinct options.", min_length=4, max_length=4)
    correct_answer: str = Field(description="The exact text of the correct option. Must perfectly match one of the options.")
    explanation: str = Field(description="A detailed explanation of why the correct answer is right and others are wrong.")
    topic: str = Field(description="The specific topic or sub-topic this question addresses.")


class VerificationSchema(BaseModel):
    correct_answer: str = Field(description="The exact text of the correct option from the given list.")
    explanation: str = Field(description="Why this option is correct based on the question.")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0", ge=0.0, le=1.0)


class AIProvider(ABC):
    """
    Abstract base class for all AI providers (Gemini, DeepSeek, GLM, etc.)
    """

    @abstractmethod
    def generate_question(self, topic: str, difficulty: str, context: Optional[str] = None) -> QuestionSchema:
        """
        Generate a single question according to the QuestionSchema.
        """
        pass

    @abstractmethod
    def verify_question(self, question_text: str, options: List[str]) -> VerificationSchema:
        """
        Given a question and its options, independently determine the correct answer.
        """
        pass
