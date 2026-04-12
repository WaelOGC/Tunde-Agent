"""Parse Veo long-operation JSON for video download URIs."""

from __future__ import annotations

from tunde_agent.services.gemini_veo_video import _extract_video_uri_from_operation


def test_extract_uri_from_generated_samples() -> None:
    body = {
        "done": True,
        "response": {
            "generateVideoResponse": {
                "generatedSamples": [
                    {
                        "video": {
                            "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media"
                        }
                    }
                ]
            }
        },
    }
    assert _extract_video_uri_from_operation(body) == (
        "https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media"
    )


def test_extract_uri_from_generated_videos() -> None:
    body = {
        "done": True,
        "response": {
            "generateVideoResponse": {
                "generatedVideos": [{"video": {"uri": "https://example.com/v.mp4"}}],
            }
        },
    }
    assert _extract_video_uri_from_operation(body) == "https://example.com/v.mp4"
