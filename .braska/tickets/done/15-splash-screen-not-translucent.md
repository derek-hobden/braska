# Splash screen should not be translucent

## Priority: Low

## Description

The splash screen currently uses a fully translucent/transparent window so the desktop shows through the glassmorphism card. It should use an opaque background instead while retaining the glassmorphism aesthetic (frosted glass feel, color orbs, light refraction sweep, spinning icon ring, and loading bar).

## Tasks

- Remove the transparent window background so the desktop is not visible behind the splash
- Use a solid dark background (matching the app theme) as the base layer
- Keep all glassmorphism effects (backdrop-filter blur, drifting orbs, diagonal refraction sweep, conic-gradient ring, loading bar) so the splash still feels polished
