# Claude Meta Expert

## Priority: Medium

## Description
Create a "Claude" expert that serves as a meta-utility for managing and improving The Agency itself. This expert helps users create and refine the building blocks that other experts use.

### Skills

**Skill Creator**
- Helps the user write well-structured skill files (`.md` files in `~/.the-agency/skills/`)
- Understands the skill file format and best practices
- Can scaffold a new skill from a description of what it should do

**CLAUDE.md Assessor**
- Reviews an expert's `claude.md` instructions for clarity, completeness, and effectiveness
- Identifies gaps, contradictions, or overly vague instructions
- Suggests improvements and rewrites
- Can compare against known good patterns (e.g. the ticketmaster's restriction pattern)

### Future skill ideas
This expert is a natural home for any future meta-tooling skills, such as:
- Hook builder — help write hook scripts for experts
- Expert scaffolder — set up a new expert with full directory structure
- MCP config helper — configure MCP servers for experts

## Tasks
- Create the expert directory at `~/.the-agency/experts/claude/`
- Write `claude.md` with instructions for the meta-utility role
- Create the Skill Creator skill file
- Create the CLAUDE.md Assessor skill file
- Attach both skills to the expert
- Test skill creation workflow end-to-end
- Test CLAUDE.md assessment workflow end-to-end
