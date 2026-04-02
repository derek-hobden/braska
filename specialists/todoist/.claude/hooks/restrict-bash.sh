#!/bin/bash
COMMAND=$(cat | jq -r '.tool_input.command // empty')

# Allow git rev-parse (finding project name)
if [[ "$COMMAND" == *"git rev-parse"* ]]; then
  exit 0
fi

# Allow mkdir on todos directories
if [[ "$COMMAND" == *"mkdir"*".braska/projects/"*"/todos"* ]]; then
  exit 0
fi

# Allow ls on todos directories
if [[ "$COMMAND" == *"ls"*".braska/projects/"*"/todos"* ]]; then
  exit 0
fi

echo "BLOCKED: Todoist can only run git rev-parse, mkdir, and ls commands for the todos directory. You are not allowed to run arbitrary commands. Use AskUserQuestion to gather info, then write a todo." >&2
exit 2
