"""Local environment loading for the Python agent layer.

The Node backend loads the shared gitignored `.env` with `node --env-file`
(`npm run start:sandbox`). The Python side had no equivalent, so `OPENAI_API_KEY`
would silently stay unset and every run would take the deterministic path while
looking like it had a key configured — a confusing failure right before a demo.

Deliberately stdlib-only and deliberately dumb:

* **An existing environment variable always wins.** An explicit `export` in the
  shell must beat a stale line in a file nobody remembered editing.
* **Values are never printed, echoed or logged.** Only variable *names* ever
  appear in output, and only when something is missing.
* A missing file is normal, not an error — the zero-config fixture path must
  keep working on a fresh clone.
"""

import os
from pathlib import Path
from typing import Optional

# agents/humsafar/config.py -> agents/ -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_PATH = REPO_ROOT / ".env"

# Names the agent layer reads. Used only to report what is missing — never to
# print a value.
AGENT_ENV_NAMES = (
    "OPENAI_API_KEY",
    "HUMSAFAR_SPECIALIST_MODEL",
    "HUMSAFAR_REASONING_MODEL",
    "HUMSAFAR_AGENT_TIMEOUT",
    "HUMSAFAR_BACKEND_URL",
    "INTERNAL_API_TOKEN",
)


def load_env(path: Optional[Path] = None, override: bool = False) -> list[str]:
    """Load `KEY=value` lines into os.environ. Returns the names that were set.

    Supports the subset of dotenv syntax that actually appears in this repo:
    comments, blank lines, `export ` prefixes, and single- or double-quoted
    values. Anything malformed is skipped rather than raising — a typo in a
    config file should not crash an agent run.
    """
    env_path = Path(path) if path is not None else DEFAULT_ENV_PATH
    if not env_path.is_file():
        return []

    applied: list[str] = []
    try:
        raw = env_path.read_text(encoding="utf-8")
    except OSError:
        return []

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export ") :].lstrip()

        name, _, value = stripped.partition("=")
        name = name.strip()
        if not name:
            continue

        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        if not override and name in os.environ:
            continue
        if value == "":
            continue

        os.environ[name] = value
        applied.append(name)

    return applied


def describe_env() -> str:
    """A one-line, value-free summary of what the agent layer can see."""
    present = [name for name in AGENT_ENV_NAMES if os.environ.get(name)]
    missing = [name for name in AGENT_ENV_NAMES if not os.environ.get(name)]
    return f"set: {', '.join(present) or 'none'} | unset: {', '.join(missing) or 'none'}"
