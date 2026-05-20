## Purpose
Shell scripts used by the Todoist agent to enforce safety constraints during its sessions — limiting which bash commands, file reads, and file writes the agent may perform.

## Contents
- `protect-files.sh` — blocks writes to files outside the `.the-agency/` todo/ticket directories
- `restrict-bash.sh` — restricts the bash commands the Todoist agent may run
- `restrict-read.sh` — restricts which paths the Todoist agent may read
