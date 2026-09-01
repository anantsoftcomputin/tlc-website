# TLC Holidays Web Brand Guide

## Source

The website palette is derived from the supplied production logo at `public/images/logo.png`. Pixel analysis identifies the dominant logo red as `#E31E24`, supported by white.

The previous website confirms the TLC Travels/Holidays identity and the “Travel Living Comfort” logo wording, but its legacy template styling is not carried into the new design.

## Core palette

| Token | Hex | Purpose |
|---|---|---|
| TLC Red | `#E31E24` | Primary brand recognition, main CTAs, selected controls, key icons |
| TLC Dark Red | `#A31319` | Hover states, smaller accents, active emphasis |
| TLC Wine | `#4A1619` | Premium dark sections, dark buttons, forms, planner panels |
| TLC Deep Wine | `#2A0B0D` | Footer, overlays, strongest contrast surfaces |
| TLC Blush | `#F8E9E9` | Soft section backgrounds and supporting panels |
| TLC Ivory | `#FFF9F5` | Primary page background; warmer and less clinical than pure white |
| Warm Charcoal | `#27191B` | Main text and high-readability interface copy |
| Muted Rose Grey | `#786B6D` | Secondary descriptions and supporting labels |
| Soft Border | `#E3D5D5` | Dividers, fields, cards, and low-emphasis structure |
| White | `#FFFFFF` | Logo details and text on red/wine surfaces |

## Usage principles

1. TLC Red is an accent, not a page background default. Use it for the most important action in a section.
2. Deep wine replaces black or unrelated green on large dark surfaces. It feels connected to the logo while keeping the experience refined.
3. Ivory is the primary canvas. Blush separates sections without creating harsh blocks.
4. Body copy uses warm charcoal; muted text is reserved for supporting information.
5. White text may be used on TLC Red, Wine, and Deep Wine. Small dark text should not be placed directly on TLC Red.
6. Destination photography remains natural. Do not apply strong red filters to travel images.
7. The original logo file must not be recoloured, stretched, redrawn, or cropped into a different mark.

## Logo treatment

- Use the supplied aspect ratio.
- Maintain clear space around the capsule edge.
- Use the unchanged logo on ivory or white backgrounds.
- On deep-wine surfaces, place the logo on a compact white holding shape for clarity.
- Do not place the red logo directly over busy travel photography.
- Use meaningful alternative text: “TLC — Travel Living Comfort”.

## Interaction states

- Primary button: TLC Red with white text
- Primary hover: TLC Dark Red with white text
- Secondary dark button: TLC Wine with white text
- Secondary hover: TLC Deep Wine with white text
- Selected controls: pale blush background, TLC Red border/check
- Keyboard focus: visible TLC Red outline with sufficient offset

## CSS token source

The implementation tokens are defined at the top of `src/app/globals.css`. Existing semantic names remain aliased to the TLC palette so all customer journeys, forms, cards, planner steps, and admin-ready components inherit the brand consistently.
