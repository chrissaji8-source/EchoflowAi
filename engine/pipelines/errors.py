"""Safe, user-facing errors raised by chat and speech providers."""


class PipelineError(RuntimeError):
    """Provider failure with a message suitable for display in the dashboard."""
