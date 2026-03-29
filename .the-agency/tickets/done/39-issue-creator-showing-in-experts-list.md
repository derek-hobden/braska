# Issue Creator Showing in Experts List

## Priority: Medium

## Description
The issue creator (Ticketmaster) is appearing in the list of experts when it should not be. The Ticketmaster is a utility role for managing tickets, not an expert that users should be selecting or interacting with through the experts list. It should be filtered out or excluded from the experts display.

## Tasks
- Identify where the experts list is populated in the UI
- Determine how experts are registered/configured
- Add filtering logic to exclude the issue creator (Ticketmaster) from the experts list
- Verify the Ticketmaster still functions correctly after being hidden from the list
