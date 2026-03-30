# Only Track Notifications for Specialist Tabs

## Priority: Medium

## Description
Currently, notifications are tracked for all tab types. They should only be tracked for tabs that have a specialist assigned. Terminal tabs and browser tabs should not generate or display notifications.

## Tasks
- Identify where tab notifications are triggered and tracked
- Add a check to only track notifications for tabs with an associated specialist
- Ensure terminal tabs do not generate notifications
- Ensure browser tabs do not generate notifications
- Verify that specialist tabs still receive notifications as expected
