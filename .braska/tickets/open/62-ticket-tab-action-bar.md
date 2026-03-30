# Ticket Tab Action Bar

## Priority: Medium

## Description
When working on a ticket (i.e. when a ticket is open in a tab), the bottom of the terminal should display action options such as "Mark as Done" and "Cancel". This gives the user quick access to change the ticket's status without needing to navigate away or use separate commands.

## Tasks
- Add an action bar component at the bottom of the terminal when a ticket tab is active
- Include a "Mark as Done" button that moves the ticket from `open/` to `done/`
- Include a "Cancel" button that moves the ticket from `open/` to `cancelled/`
- Ensure the action bar only appears for ticket tabs, not other tab types
