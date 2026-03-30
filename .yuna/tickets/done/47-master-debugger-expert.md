# Master Debugger Expert

## Priority: Medium

## Description
Added a built-in "debugger" system expert that provides systematic debugging methodology. Auto-created on startup alongside ticketmaster. Follows a 6-step process: Reproduce, Gather Context, Isolate, Identify Root Cause, Fix, Verify. Includes common bug pattern checklist and working principles.

Also restructured how system experts are accessed: removed dedicated launchpad cards and tab-type-picker entries for ticketmaster and debugger. Both now appear in the regular expert picker list. Legacy `issue-creator` filtered out.

## Tasks
- Create debugger expert in `ensureSystemExperts()` with comprehensive `claude.md`
- Remove ticketmaster and debugger launchpad cards
- Remove tab-type-picker entries and click handlers
- Show system experts in the expert picker list
- Filter legacy `issue-creator` from expert picker
- Update project.md
