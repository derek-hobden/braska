# Specialist Display Names and Icons

## Priority: Medium

## Description
Currently specialists are shown in the menu using their raw directory/config names, which aren't user-friendly. Add support for nicer display names and icons for each specialist in the menu.

Specialists should be able to define a human-readable display name and an icon (e.g. emoji or icon identifier) in their configuration. The menu should render these instead of the raw specialist name.

## Tasks
- Add `displayName` and `icon` fields to the specialist configuration schema
- Update the specialist menu renderer to show the display name and icon
- Add default display names and icons for built-in specialists
- Fall back to the existing raw name if no display name is configured
