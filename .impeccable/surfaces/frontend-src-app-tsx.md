---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: []
---

# Surface brief — YimmTool (whole site)

Mode: Operate (tool pages) with a Read-style contents page at /:lang.

Audience / job: people pasting data (secrets, JSON, JWT, URLs) and wanting a result in seconds; they must trust that data stays in the browser.
Constraints: five languages (zh-TW default, en, zh-CN, es, ja), day/night themes, keyboard-first, no ads or modals, server-side tools clearly labelled.

## Direction contract
THESIS: A tool site that reads like a well-set technical daily: rules, type and white space do the work, never cards or gloss. Refuses the tool-farm default (ad slots, gradient cards, fake buttons).
OWN-WORLD: Warm newsprint (#f1ede4) and ink (#1b1a17) with one vermilion (#b02a1b); night edition on #15171b. Source Serif 4 + Noto Serif CJK for voice, system sans for controls, JetBrains Mono for data. Square corners, 1px rules, double-rule masthead, flat.
STORY: A visitor sees a numbered contents list, picks a tool, pastes data and reads the result in a large mono readout; they come away believing the page did one thing precisely and kept their data local.
FIRST VIEWPORT: Double-ruled masthead with wordmark, tagline and language/theme controls; 252px contents column on the left (search, five groups, 14 numbered entries); main column with a 3rem headline, one-line lede and the grouped contents list with local/server tags.
FORM: Newspaper contents page + index sidebar (user-chosen "01 報紙編輯" from ten full-site comps; pinned by the user, so no dice roll). Seed key: user-pinned.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
