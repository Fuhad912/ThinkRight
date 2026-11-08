# ThinkRight Design Rules (anti-slop)

Use this file as the single source of truth for UI work. Give it to Antigravity/Codex at the start of every UI task.

Goal: ThinkRight should look like a product with a point of view, not a template. The rules below are based on a review of common AI-design tells, how Netflix and Apple structure their interfaces, and an audit of the current ThinkRight CSS.

---

## 1. Containers: boxes are the exception

Default is **unboxed**. An element may have a border, background fill, or radius only if it is one of:

1. **A repeatable item in a collection** (subject tile, lesson row, tutor card, cohort card)
2. **An interactive control** (button, input, test answer option, tag)
3. **A floating layer** (modal, dropdown, toast)

These are **never boxed**: page intros, section headings, stats and scores, explanatory text, results summaries, single paragraphs.

Group things using, in this order:
1. Whitespace (bigger gap between groups, smaller gap within)
2. Type size and weight
3. Hairline dividers between list items
4. A flat tinted background band for a whole section
5. Alignment to a consistent left edge

Test before adding a box: "If I remove this border and background, does the content stop making sense?" If not, remove it.

## 2. Radius scale (only these four)

| Token | Value | Use for |
|---|---|---|
| `--radius-none` | 0 | page sections, full-width bands |
| `--radius-control` | 6px | buttons, inputs, tags, answer options |
| `--radius-container` | 12px | modals, subject/lesson tiles |
| `--radius-pill` | 999px | status chips and avatars only |

Radius tells the user what a thing is. If everything is rounded the same, it tells them nothing. No other radius values anywhere.

## 3. Shadows and gradients

- **Shadows:** floating layers only (modals, dropdowns, toasts). One token: `--shadow-float: 0 8px 24px rgb(0 0 0 / 0.12)`. No shadows on cards, panels, or buttons. Separate regular content with spacing, a border, or a flat fill.
- **Gradients:** none as decoration. No gradient buttons, no gradient headlines, no gradient hero backgrounds. A gradient is allowed only when it carries data (for example a heatmap or progress scale).
- **No** glassmorphism, glow, or neon effects.

## 4. Color

- One accent color, a small set of neutrals, plus success / warning / error. Nothing else.
- Define every color once as a CSS variable in a single tokens file. Components never use raw hex values.
- Avoid the default AI palette: blue-to-purple gradients, indigo/violet as the accent.
- **Open decision:** `style.css` sets the accent to `#007bff` and `premium-ui.css` overrides it with `#1d4ed8` (dark mode `#3b82f6`). Pick one, delete the other, and confirm the final brand blue before the logo is made.
- Check contrast (WCAG AA) in light and dark mode before shipping a color pair.

## 5. Typography

- Move off Inter as the default font.
- Recommended direction (not yet locked): a distinctive heading font (Space Grotesk) paired with a highly legible body font (Manrope or Plus Jakarta Sans). Confirm the final pair, then set both once as variables.
- Use one clear type scale (for example 12 / 14 / 16 / 20 / 28 / 40). No in-between sizes.
- Body text lines stay under about 75 characters.
- Do not use all caps for labels or add small "eyebrow" labels above every heading.
- Do not highlight a single word in a headline with a different color or italic.

## 6. Layout and hierarchy

- **Hero = real content, not a slogan.** For a logged-in student: projected score, trend, and a "Continue" action (last test or next lesson). For a logged-out visitor: one concrete claim with real numbers.
- **No three-identical-cards rows.** Avoid rows of icon + heading + two lines. Use a list, a table, or content with different weights.
- **Break up the subject grid.** Group subjects by what the student is preparing for. Rank weakest-first for returning users.
- Do not number things (01 / 02 / 03) unless the content is truly a sequence.
- Keep navigation small. Every label must say what the page is (rename "Insider" if it does not).
- Interactive targets are at least 44x44px.

## 7. Copy

- Be specific. Replace "Practice smarter for every subject." with something that carries a real fact, such as "14 subjects. Timed 30-question tests. A projected JAMB score after every test."
- Banned openers: "Empower," "Unlock," "Transform," "Supercharge."
- At least one concrete number per marketing section.
- Buttons say what happens ("Start test," "Submit answers"), never "Submit" or "Click here."
- Use the same name for an action everywhere (the button says "Publish," the confirmation says "Published").
- Sentence case everywhere.

## 8. Motion

- No fade-and-slide on every section and no bounce on every hover.
- Motion is allowed when it answers a user action (opening, expanding, confirming) or draws attention to one important thing.
- Respect `prefers-reduced-motion`.

## 9. States (design these, they are not optional)

- **Empty:** says what goes here and gives one action to fill it (for example "No tests yet. Start your first test").
- **Loading:** skeleton or progress that matches the final layout.
- **Error:** says what went wrong and how to fix it. No apologies, no vague text.
- **Focus:** every interactive element has a visible keyboard focus state.

## 10. Consistency

- One component vocabulary: default tile, inset tile, flat row. Do not invent a new style per page.
- All spacing uses one scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64).
- CSS lives in one tokens file plus component files. No second file overriding the first.

---

## ThinkRight audit baseline (before changes)

Measured from the current CSS, so progress can be checked:

| Item | Current |
|---|---|
| Distinct hex colors | 110 |
| Radius vocabularies | about 8 (999px used 38 times) |
| Gradients | about 40 |
| Box shadows | about 100 |
| Default font | Inter |
| Homepage subject tiles | 15 identical |
| Competing accent definitions | 2 (`#007bff`, `#1d4ed8`) |

Targets: colors down to a defined palette (under 20 tokens), radius to 4 values, shadows to 1 token on floating layers only, gradients to about 0.

## Start here

1. Create the single tokens file (colors, radius, shadow, spacing, type scale).
2. Fix the **homepage** and the **test results modal** first. They have the most boxed content.
3. Then the dashboard, then the test page, then the new cohort pages (build these to the rules from day one).

## Prompt for Antigravity

> Follow the ThinkRight design rules in this file. Containers are the exception: only repeatable collection items, interactive controls, and floating layers may have a border, fill, or radius. Page intros, headings, stats, scores, and summaries are unboxed and separated with spacing, type hierarchy, and hairline dividers. Use only radii 0, 6px, 12px, and 999px (pills and avatars only). Remove box-shadow from everything except floating layers. No gradients as decoration. Use one accent color and tokens defined once in `:root`; no raw hex values in components. Do not use three identical icon cards, all-caps eyebrow labels, or numbered markers unless the content is a sequence. Design empty, loading, error, and focus states. Write specific copy, not slogans.

## Sources

- AI Slop Fonts and Gradients: The Tells That Give Away AI Design (925studios.co)
- AI Design Slop: Why AI-Generated UI Looks Generic, and the Fix (smoothui.dev)
- How to fix the AI-generated look in your frontend (dev.to/alanwest)
- Apple Design System Breakdown (superdesign.dev)
- Netflix Design: A Deep Dive into UX Strategy (createbytes.com)
- Direct audit of the ThinkRight CSS files
