import os
from decouple import config

def setup_telemetry():
    """
    Initializes OpenTelemetry tracing and exports to SigNoz.
    Only runs if OTEL_EXPORTER_OTLP_ENDPOINT is set in .env
    """
    otel_endpoint = config("OTEL_EXPORTER_OTLP_ENDPOINT", default="")
    if not otel_endpoint:
        return

    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    
    # Auto-instrumentation packages
    from opentelemetry.instrumentation.django import DjangoInstrumentor
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.instrumentation.logging import LoggingInstrumentor

    service_name = config("OTEL_SERVICE_NAME", default="suretrust-backend")

    resource = Resource.create(attributes={
        "service.name": service_name
    })

    provider = TracerProvider(resource=resource)
    
    # SigNoz Cloud usually requires grpc secure, but local is insecure.
    # If using cloud, it's https. If local, it's http.
    insecure = not otel_endpoint.startswith("https")
    
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=otel_endpoint, insecure=insecure))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    # Instrument Django & DB
    DjangoInstrumentor().instrument()
    PsycopgInstrumentor().instrument()
    LoggingInstrumentor().instrument(set_logging_format=True)
