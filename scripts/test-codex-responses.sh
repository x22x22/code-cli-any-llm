#!/usr/bin/env bash
set -euo pipefail

# Replace with your actual API key before running:
API_KEY="YOUR_API_KEY"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/../docs/research/gpt-5-codex-instructions.txt"

if [[ ! -f "${PROMPT_FILE}" ]]; then
  echo "Prompt file not found: ${PROMPT_FILE}" >&2
  exit 1
fi

PAYLOAD=$(PROMPT_FILE="${PROMPT_FILE}" python3 <<'PY'
import json
import os
from pathlib import Path

prompt_path = Path(os.environ["PROMPT_FILE"])
instructions = prompt_path.read_text()

shell_tool = {
    "type": "function",
    "name": "shell",
    "description": "Runs a shell command and returns its output",
    "strict": False,
    "parameters": {
        "type": "object",
        "properties": {
            "command": {
                "type": "array",
                "items": {"type": "string"},
                "description": "The command to execute"
            },
            "workdir": {
                "type": "string",
                "description": "Working directory"
            },
            "timeout_ms": {
                "type": "number",
                "description": "Timeout in milliseconds"
            }
        },
        "additionalProperties": False
    }
}

apply_patch_tool = {
    "type": "function",
    "name": "apply_patch",
    "description": "Safely apply a patch to files in the workspace",
    "strict": False,
    "parameters": {
        "type": "object",
        "properties": {
            "patch": {
                "type": "string",
                "description": "Unified diff patch to apply"
            }
        },
        "required": ["patch"],
        "additionalProperties": False
    }
}

update_plan_tool = {
    "type": "function",
    "name": "update_plan",
    "description": "Update the shared plan shown to the user",
    "strict": False,
    "parameters": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "step": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": ["pending", "in_progress", "completed"]
                        }
                    },
                    "required": ["step", "status"]
                },
                "description": "Plan steps to record"
            },
            "explanation": {
                "type": "string",
                "description": "Optional explanation shown alongside the plan update"
            }
        },
        "required": ["items"],
        "additionalProperties": False
    }
}

payload = {
    "model": "gpt-5-codex",
    "instructions": instructions,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": "你好，请介绍一下你自己。"}
            ]
        }
    ],
    "tools": [shell_tool, apply_patch_tool, update_plan_tool],
    "tool_choice": "auto",
    "parallel_tool_calls": False,
    "reasoning": None,
    "store": False,
    "stream": True,
    "include": [],
    "prompt_cache_key": "e1b6c8b0-1234-5678-90ab-fb5f1eedc001"
}

print(json.dumps(payload))
PY
)

curl --location --request POST 'https://us2.ctok.ai/openai/v1/responses' \
  --header "Authorization: Bearer ${API_KEY}" \
  --header 'Content-Type: application/json' \
  --header 'Accept: text/event-stream' \
  --no-buffer \
  --data "${PAYLOAD}"