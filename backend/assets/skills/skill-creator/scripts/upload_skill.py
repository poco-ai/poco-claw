#!/usr/bin/env python3
"""Submit a generated skill folder for review."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _load_task_context() -> dict[str, str]:
    workspace_path = Path(os.environ.get("WORKSPACE_PATH", "/workspace"))
    context_path = workspace_path / ".poco-task-context.json"
    if not context_path.exists():
        raise RuntimeError(f"Task context file not found: {context_path}")

    payload = json.loads(context_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Task context file is invalid")

    session_id = str(payload.get("session_id", "")).strip()
    callback_base_url = str(payload.get("callback_base_url", "")).strip()
    callback_token = str(payload.get("callback_token", "")).strip()
    if not session_id or not callback_base_url or not callback_token:
        raise RuntimeError("Task context is missing required fields")

    return {
        "session_id": session_id,
        "callback_base_url": callback_base_url.rstrip("/"),
        "callback_token": callback_token,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Submit a workspace skill folder for review",
    )
    parser.add_argument(
        "--folder",
        required=True,
        help="Skill folder path relative to the workspace",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Optional skill name override",
    )
    args = parser.parse_args()

    try:
        context = _load_task_context()
        request = urllib.request.Request(
            f"{context['callback_base_url']}/api/v1/skills/submit",
            data=json.dumps(
                {
                    "session_id": context["session_id"],
                    "folder_path": args.folder,
                    "skill_name": args.name,
                }
            ).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {context['callback_token']}",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Failed to submit skill for review: HTTP {exc.code} {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Failed to submit skill for review: {exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Failed to submit skill for review: {exc}", file=sys.stderr)
        return 1

    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    pending_id = data.get("pending_id")
    status = data.get("status")
    if pending_id:
        print(
            "Skill submitted for review successfully. "
            f"pending_id={pending_id} status={status or 'pending'}"
        )
    else:
        print("Skill submitted for review successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
