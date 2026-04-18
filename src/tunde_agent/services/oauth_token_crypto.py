"""AES-GCM encryption for OAuth tokens at rest (key from ``TUNDE_ENCRYPTION_KEY``)."""

from __future__ import annotations

import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _derive_key(secret: str) -> bytes:
    if not secret.strip():
        msg = "TUNDE_ENCRYPTION_KEY is not set; cannot encrypt OAuth tokens."
        raise ValueError(msg)
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_token(plaintext: str, secret: str) -> bytes:
    """Return ``nonce (12) || ciphertext`` suitable for ``encrypted_data.encrypted_value``."""
    key = _derive_key(secret)
    aes = AESGCM(key)
    nonce = os.urandom(12)
    return nonce + aes.encrypt(nonce, plaintext.encode("utf-8"), None)


def decrypt_token(blob: bytes, secret: str) -> str:
    key = _derive_key(secret)
    aes = AESGCM(key)
    nonce, ct = blob[:12], blob[12:]
    return aes.decrypt(nonce, ct, None).decode("utf-8")
