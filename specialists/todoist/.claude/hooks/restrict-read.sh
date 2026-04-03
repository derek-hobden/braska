#!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == "$HOME/.braska/projects/"*"/todo/"* ]]; then
  exit 0  # allowed
fi

echo "BLOCKED: Todoist can only read files inside ~/.braska/projects/*/todo/. Your job is to create todos, not investigate code." >&2
exit 2  # reject
