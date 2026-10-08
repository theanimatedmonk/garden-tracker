"""Minimal Supabase client over its REST APIs (PostgREST for tables, Storage for clips).

Uses the project's secret (service-role) key, so it must only ever run on the backend.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)

TIMEOUT_S = 15
PAGE_SIZE = 1000


class SupabaseError(RuntimeError):
    pass


class SupabaseClient:
    def __init__(self, url: str, secret_key: str, bucket: str) -> None:
        self.url = url.rstrip("/")
        self.bucket = bucket
        self._session = requests.Session()
        # New-style secret keys (sb_secret_…) go only in `apikey`; Supabase's gateway turns them into a
        # short-lived JWT. Legacy service_role keys are JWTs (eyJ…) and are also sent as the bearer token.
        self._session.headers["apikey"] = secret_key
        if secret_key.startswith("eyJ"):
            self._session.headers["Authorization"] = f"Bearer {secret_key}"

    # ---------- tables (PostgREST) ----------

    def _rest(self, method: str, table: str, *, params: dict[str, str] | None = None, **kwargs: Any) -> requests.Response:
        res = self._session.request(method, f"{self.url}/rest/v1/{table}", params=params, timeout=TIMEOUT_S, **kwargs)
        if res.status_code >= 400:
            raise SupabaseError(f"{method} {table}: {res.status_code} {res.text[:300]}")
        return res

    def select(self, table: str, params: dict[str, str], *, limit: int | None = None) -> list[dict[str, Any]]:
        """All matching rows (or the first `limit`), paging through PostgREST's row cap."""
        rows: list[dict[str, Any]] = []
        while limit is None or len(rows) < limit:
            size = PAGE_SIZE if limit is None else min(PAGE_SIZE, limit - len(rows))
            start = len(rows)
            res = self._rest("GET", table, params=params, headers={"Range": f"{start}-{start + size - 1}"})
            page = res.json()
            rows.extend(page)
            if len(page) < size:
                break
        return rows

    def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], *, upsert: bool = False) -> None:
        prefer = "return=minimal"
        if upsert:
            prefer += ",resolution=merge-duplicates"
        self._rest("POST", table, json=rows, headers={"Prefer": prefer})

    def update(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> None:
        self._rest("PATCH", table, params=filters, json=values, headers={"Prefer": "return=minimal"})

    def delete(self, table: str, filters: dict[str, str]) -> list[dict[str, Any]]:
        """Delete matching rows and return them."""
        return self._rest("DELETE", table, params=filters, headers={"Prefer": "return=representation"}).json()

    # ---------- storage ----------

    def _object_url(self, key: str) -> str:
        return f"{self.url}/storage/v1/object/{self.bucket}/{quote(key)}"

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        res = self._session.post(
            self._object_url(key),
            data=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
            timeout=TIMEOUT_S,
        )
        if res.status_code >= 400:
            raise SupabaseError(f"upload {key}: {res.status_code} {res.text[:300]}")

    def signed_url(self, key: str, expires_in: int = 3600) -> str:
        res = self._session.post(
            f"{self.url}/storage/v1/object/sign/{self.bucket}/{quote(key)}",
            json={"expiresIn": expires_in},
            timeout=TIMEOUT_S,
        )
        if res.status_code >= 400:
            raise SupabaseError(f"sign {key}: {res.status_code} {res.text[:300]}")
        return f"{self.url}/storage/v1{res.json()['signedURL']}"

    def remove_objects(self, keys: list[str]) -> None:
        if not keys:
            return
        res = self._session.delete(
            f"{self.url}/storage/v1/object/{self.bucket}", json={"prefixes": keys}, timeout=TIMEOUT_S
        )
        if res.status_code >= 400:
            raise SupabaseError(f"remove objects: {res.status_code} {res.text[:300]}")


def in_list(values: list[str]) -> str:
    """PostgREST `in.(...)` filter value, quoting each item."""
    quoted = ",".join('"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"' for v in values)
    return f"in.({quoted})"
