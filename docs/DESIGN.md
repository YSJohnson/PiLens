# PiLens v2 design specification

The source of truth for the redesigned workspace is
[`pilens-v2-concept.png`](./design/pilens-v2-concept.png). The visual direction
was calibrated against the live OpenChamber desktop application, then adapted to Pi's
session, tool, file-change, and provider data model.

## Product structure

- Task sidebar: Pi identity, new task, session utilities, history grouped by recency,
  project switcher, and settings.
- Conversation canvas: compact title bar, readable 790 px transcript, inline tool
  ledgers, file-change summary, and a floating composer.
- Session inspector: context usage, cost, project metadata, model/provider state,
  changes, and project files in a floating right-side card.
- Work rail: stable shortcuts for context, Git changes, files, and future tools.
- Settings: large two-column desktop dialog with General, Appearance, and Providers &
  Models sections.

## Design tokens

- Canvas: `#141414`; sidebar: `#1d1d1d`; raised surface: `#272727`.
- Primary text: `#e7e7e7`; secondary text: `#9b9b9b`; border: `#303030`.
- Navigation/selection: cyan `#43b8e8`; execution/success: green `#48c979`;
  quota/warning: amber `#e3bd52`.
- UI type: Geist Sans; code and numeric telemetry: JetBrains Mono.
- Default type: 15 px controls and 16 px conversation body. Large mode uses 16 px
  controls and 17 px body text.
- Radius scale: 6, 8, 10, 12 px. Shadows are reserved for floating surfaces.

## Component rules

- Use neutral charcoal surfaces; avoid purple accents and decorative gradients.
- Keep the conversation visually quiet: assistant content sits on the canvas and tool
  activity expands inline instead of becoming a card grid.
- The composer is a floating, strongly raised surface centered under the transcript.
- The model picker is a searchable command surface with recent models, connection and
  favorites filters, provider groups, context length, reasoning capability, connection
  status, and keyboard navigation.
- Every visible control is functional or explicitly disabled and labelled as upcoming.
- Active states use a low-opacity cyan tint; green is reserved for executable actions
  and successful runtime state.

## Responsive behavior

- Below 1320 px the inspector becomes a floating overlay opened from the work rail or
  title bar.
- Below 900 px the task sidebar becomes an overlay and the work rail remains available.
- Below 700 px nonessential title-bar and work-rail controls are removed; model and
  composer surfaces fit the viewport without horizontal overflow.
