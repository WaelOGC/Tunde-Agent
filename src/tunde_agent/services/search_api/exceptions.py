"""Search API provider errors (rotation triggers)."""


class SearchProviderError(Exception):
    """Recoverable provider failure; router may try the next backend."""

    def __init__(self, message: str, *, status_code: int | None = None, provider: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


class SearchProviderRateLimited(SearchProviderError):
    """429 / 403 / quota — rotate to the next provider."""
