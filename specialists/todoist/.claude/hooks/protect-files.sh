#!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == "$HOME/.braska/projects/"*"/todos/"* ]]; then
  exit 0  # allowed
fi

echo "BLOCKED: Todoist can only edit files inside ~/.braska/projects/*/todos/" >&2
exit 2  # reject
