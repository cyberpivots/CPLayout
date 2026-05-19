# UI/UX Screen Spec

## Screen List

1. Project list
2. Project setup
3. Map workspace
4. Survey capture
5. Receiver connection
6. Boundary editor
7. Obstacle/exclusion editor
8. Pivot layout editor
9. Machine configuration
10. Scenario comparison
11. Export/report
12. Settings/licenses

## Map Tool Modes

- Pan/inspect
- Capture point
- Draw boundary
- Edit vertices
- Mark obstacle
- Place pivot
- Measure
- Simulate sweep
- Review conflicts

Each mode needs an unmistakable active state, a cancel action, undo/redo, and protection against accidental destructive edits.

## Survey Capture UI

Show:

- Current coordinates.
- Fix type.
- Satellites.
- HDOP/VDOP/PDOP.
- Correction age.
- Estimated accuracy.
- Receiver/transport state.
- Capture eligibility for the selected role.

## Pivot Layout UI

- Large controls for full circle versus partial circle.
- Numeric inputs for span lengths, overhang, end gun, clearances, start/stop angles.
- Visual tower markers and dry-corner layer.
- Conflict list tied to map selection.

## Outdoor Usability

- High contrast.
- Large touch targets.
- No tiny required controls.
- Minimal reliance on color alone.
- Clear offline state.
- Battery-aware logging.
- Glove-friendly primary actions.
