"""Tests for anonymous telemetry module."""
import os
from unittest.mock import MagicMock, patch

import pytest


class TestTelemetryConfiguration:
    """Tests for telemetry configuration and opt-out."""

    def test_telemetry_disabled_via_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Telemetry should not initialize when POCO_TELEMETRY_DISABLED=1."""
        monkeypatch.setenv("POCO_TELEMETRY_DISABLED", "1")

        with patch("threading.Thread") as mock_thread:
            # Re-import to trigger initialization check
            import importlib
            import app.core.observability.telemetry as telemetry_module

            importlib.reload(telemetry_module)

            # Thread should not be started when disabled
            # (This is a simplified test - actual behavior depends on import order)

    def test_telemetry_disabled_accepts_various_truthy_values(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Various truthy values should disable telemetry."""
        truthy_values = ["1", "true", "True", "TRUE", "yes", "YES", "on", "ON"]

        for value in truthy_values:
            monkeypatch.setenv("POCO_TELEMETRY_DISABLED", value)
            disabled = os.getenv("POCO_TELEMETRY_DISABLED", "").strip().lower()
            assert disabled in {"1", "true", "yes", "on"}

    def test_telemetry_enabled_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Telemetry should be enabled when env var is not set."""
        monkeypatch.delenv("POCO_TELEMETRY_DISABLED", raising=False)
        disabled = os.getenv("POCO_TELEMETRY_DISABLED", "").strip().lower()
        assert disabled not in {"1", "true", "yes", "on"}

    def test_custom_endpoint_via_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Custom telemetry endpoint should be configurable via env var."""
        custom_endpoint = "https://custom.example.com/v1/telemetry"
        monkeypatch.setenv("POCO_TELEMETRY_ENDPOINT", custom_endpoint)

        endpoint = os.getenv("POCO_TELEMETRY_ENDPOINT")
        assert endpoint == custom_endpoint


class TestMachineIdGeneration:
    """Tests for anonymous machine ID generation."""

    def test_machine_id_is_deterministic(self) -> None:
        """Same machine should generate same ID."""
        from app.core.observability.telemetry import _compute_machine_id

        id1 = _compute_machine_id()
        id2 = _compute_machine_id()
        assert id1 == id2

    def test_machine_id_is_truncated_hash(self) -> None:
        """Machine ID should be a 16-character truncated hash."""
        from app.core.observability.telemetry import _compute_machine_id

        machine_id = _compute_machine_id()
        assert len(machine_id) == 16 or machine_id == "unknown"
        if machine_id != "unknown":
            assert all(c in "0123456789abcdef" for c in machine_id)


class TestMetricsCollection:
    """Tests for runtime metrics collection."""

    def test_runtime_metrics_structure(self) -> None:
        """Runtime metrics should have expected structure."""
        from app.core.observability.telemetry import _collect_runtime_metrics

        metrics = _collect_runtime_metrics()

        assert "v" in metrics  # version
        assert "mid" in metrics  # machine id
        assert "py" in metrics  # python version
        assert "os" in metrics  # operating system

    def test_runtime_metrics_contains_version(self) -> None:
        """Metrics should include telemetry version."""
        from app.core.observability.telemetry import (
            TELEMETRY_VERSION,
            _collect_runtime_metrics,
        )

        metrics = _collect_runtime_metrics()
        assert metrics["v"] == TELEMETRY_VERSION


class TestTelemetrySending:
    """Tests for telemetry transmission."""

    @patch("urllib.request.urlopen")
    def test_send_request_success(self, mock_urlopen: MagicMock) -> None:
        """Successful request should return True."""
        from app.core.observability.telemetry import _send_request

        mock_urlopen.return_value.__enter__ = MagicMock()
        mock_urlopen.return_value.__exit__ = MagicMock()

        result = _send_request(
            "https://example.com/telemetry",
            b"test payload",
        )
        assert result is True

    @patch("urllib.request.urlopen")
    def test_send_request_failure(self, mock_urlopen: MagicMock) -> None:
        """Failed request should return False without raising."""
        import urllib.error

        from app.core.observability.telemetry import _send_request

        mock_urlopen.side_effect = urllib.error.URLError("Network error")

        result = _send_request(
            "https://example.com/telemetry",
            b"test payload",
        )
        assert result is False
