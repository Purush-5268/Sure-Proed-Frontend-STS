from django.conf import settings
from .base import AIProvider

DEFAULT_BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "huggingface": "https://api-inference.huggingface.co/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4/",
    "openai": "https://api.openai.com/v1",
}


def _instantiate_provider(provider_type: str, api_key: str, model_name: str, base_url: str, is_verifier: bool = False) -> AIProvider:
    provider_type = (provider_type or "").lower().strip()
    
    # Smart Auto-Detection based on API key prefix if not explicitly set correctly
    if api_key.startswith("gsk_"):
        provider_type = "groq"
    elif api_key.startswith("AQ.") or api_key.startswith("AIzaSy"):
        provider_type = "gemini"
    elif not provider_type:
        provider_type = "gemini"

    if provider_type == "gemini":
        from .gemini_provider import GeminiProvider
        default_model = "gemini-3.5-flash" if is_verifier else "gemini-3.5-flash-lite"
        resolved_model = model_name
        if not resolved_model or "/" in resolved_model or resolved_model.startswith("gpt") or resolved_model in ["gemini-1.5-flash", "gemini-3.6-flash"]:
            resolved_model = default_model
        return GeminiProvider(api_key=api_key, model_name=resolved_model)
    elif provider_type in ["deepseek", "glm", "openai", "groq", "huggingface"]:
        from .openai_compatible_provider import OpenAICompatibleProvider
        resolved_base_url = base_url or DEFAULT_BASE_URLS.get(provider_type, "")
        resolved_model = model_name
        if not resolved_model:
            if provider_type == "groq":
                resolved_model = "qwen/qwen3.8-27b" if is_verifier else "openai/gpt-oss-120b"
            elif provider_type == "huggingface":
                resolved_model = "meta-llama/Llama-3.3-70B-Instruct"
            elif provider_type == "deepseek":
                resolved_model = "deepseek-chat"
            else:
                resolved_model = "gpt-4o-mini"
        return OpenAICompatibleProvider(api_key=api_key, model_name=resolved_model, base_url=resolved_base_url)
    else:
        raise ValueError(f"Unsupported AI Provider: {provider_type}")


def get_generator_provider() -> AIProvider:
    return _instantiate_provider(
        provider_type=getattr(settings, "AI_GENERATOR_PROVIDER", "gemini"),
        api_key=getattr(settings, "AI_GENERATOR_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", ""),
        model_name=getattr(settings, "AI_GENERATOR_MODEL", ""),
        base_url=getattr(settings, "AI_GENERATOR_BASE_URL", ""),
        is_verifier=False,
    )


def get_verifier_provider() -> AIProvider:
    return _instantiate_provider(
        provider_type=getattr(settings, "AI_VERIFIER_PROVIDER", "gemini"),
        api_key=getattr(settings, "AI_VERIFIER_API_KEY", "") or getattr(settings, "GEMINI_API_KEY", ""),
        model_name=getattr(settings, "AI_VERIFIER_MODEL", ""),
        base_url=getattr(settings, "AI_VERIFIER_BASE_URL", ""),
        is_verifier=True,
    )
