"""Browser automation exceptions."""


class CaptchaHandoffRequired(Exception):
    """CAPTCHA present after one stub attempt; operator must solve manually (see captcha_handling_policy.md)."""

    def __init__(self, url: str, kind: str | None = None) -> None:
        self.url = url
        self.kind = kind
        super().__init__(url)
