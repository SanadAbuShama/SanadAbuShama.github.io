# Handoff: Personal Portfolio (Sanad Abu Shama)

## Overview
A single-page personal portfolio for a Full-Stack Developer: hero intro, about, skills, three project case studies (each with an image slideshow), and a contact section. Dark, quiet aesthetic in the "Nocturne" style.

## About the Design Files
The bundled file (`Portfolio.dc.html`) is a **design reference built in HTML** (a Claude-authored prototype format — ignore the `<x-dc>`/`support.js`/`DCLogic` scaffolding, that's tooling-specific, not something to port). It renders correctly if opened in a browser but is not meant to be copied as production code. Your task is to **recreate this design in the existing GitHub Pages codebase**, using whatever stack that repo already uses (plain HTML/CSS/JS, React, a static site generator, etc.). If the repo has an established component/CSS structure, follow it rather than introducing new patterns.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final. Recreate pixel-close using the tokens below.

## Screens / Views
One page, five stacked sections plus a nav bar.

### Nav bar
- Sticky-feel top bar (not actually `position: sticky` in the prototype — add if desired), flex row, space-between, wraps on narrow widths.
- Left: brand text "Sanad Abu Shama" (nav-brand style: medium weight, ~15px).
- Right: text links "About", "Work", "Skills" (anchor to section ids) + a "Contact" outlined-accent button (anchor to #contact).
- Padding: 20px vertical, clamp(20px, 5vw, 72px) horizontal.

### Hero
- Small uppercase accent "kicker" label "Full-Stack Developer" with a short solid 44px accent dash hanging to its left (only visible ≥1280px — dash clips/hides below that).
- Large two-line heading: line 1 "Sanad Abu Shama" in main text color, line 2 "builds interfaces that scale." in accent-300 tint. Font-size clamp(44px, 6.4vw, 80px), line-height 1.08, letter-spacing -0.015em, heading font/weight.
- Body paragraph below (max 58ch, 17px/28px line-height, ~85% opacity text color): "Four years building React applications, component systems and eCommerce experiences that hold up in production — from loyalty platforms to job-search tools used every day."
- Two buttons: "View work" (primary/outlined-accent) → #work, "Get in touch" (ghost) → #contact.
- Section padding: 96px top, 64px bottom.
- Full-bleed page background: two radial gradients (a large accent-tinted glow top-right, a dark falloff bottom-left) composited over the base dark ground color, fixed to the page not the viewport.

### Divider
- A thin 1px horizontal rule between every section that fades to transparent over 48px at each end (not a hard-edged line).

### About (`#about`)
- Two-column layout: portrait image (square, rounded 8px corners, max-width 280px, wrapped so dark photo backgrounds blend into the page background — i.e. `mix-blend-mode: lighten`) + bio text.
- Small accent kicker "ABOUT" above the bio.
- Bio text (verbatim, 17px/28px, max 62ch): "Full-Stack Developer with 4+ years of experience building scalable React applications, reusable UI systems, and responsive eCommerce solutions. Experienced in API integrations, internationalization (i18n), and performance optimization, with a strong focus on delivering intuitive and high-performing user experiences."
- Columns collapse to a single stacked column below ~500px combined width (auto-fit grid, no media query needed).

### Skills (`#skills`)
- Kicker "SKILLS".
- Flex-wrap row of outlined pill tags (8px+ gap), one per skill: HTML5, CSS3, JavaScript, TypeScript, React.js, React Router, Material-UI (MUI), Mobx, Responsive Design, Component-Driven Development, i18n, Git, REST API integration.

### Selected Work (`#work`)
Kicker "SELECTED WORK". Three project rows, each a two-column layout (image column left ~≥280px, text column right, auto-fit so it stacks on narrow screens), rows separated by generous vertical padding (56px between, last one tighter).

Each image column contains:
- A slideshow: 4:3 image box (rounded 8px, overflow hidden, `.lighten` blend wrapper) showing one of N slides at a time (only the active slide is visible — the rest are `display:none`, absolutely positioned to overlap).
- Round prev/next arrow buttons (32px circle, 1px divider-color border, translucent dark fill) vertically centered on the left/right edges of the image.
- A row of small dot indicators (8px circles) centered at the bottom of the image; active dot is filled with the accent color, inactive dots are a muted neutral. Clicking a dot jumps to that slide; clicking an arrow advances/retreats by one (wrapping around).
- Below the image, one caption line per slide (only the active slide's caption shows), italic, muted (~55% opacity text), 13.5px. Caption text is optional per-slide — placeholder default is "Add a caption (optional)"; leave blank if unused.

Project 1 — **Coretava Loyalty Station** (4 slides)
- Number "01", title, role tag "Full-Stack Developer" (small accent-tinted pill).
- Description (verbatim): "A white-label loyalty platform that helps businesses create, manage, and optimize customer reward programs. The platform provides tools for configuring loyalty campaigns, managing rewards, monitoring customer engagement through analytics, and customizing the customer-facing experience to match each brand's identity. It enables merchants to strengthen customer retention by delivering personalized rewards and tracking loyalty performance."

Project 2 — **Coretava Admin Dashboard** (3 slides)
- Number "02", role tag "Full-Stack Developer".
- Description (verbatim): "A centralized management interface that allows merchants to oversee and control their platform operations. The dashboard provides tools for managing users, configuring settings, monitoring performance through analytics, and managing loyalty programs, rewards, and customer engagement features. Designed with flexibility and scalability in mind, it supports white-label customization and gives businesses full control over their digital experience."

Project 3 — **Hunted** (4 slides)
- Number "03", role tag "Fullstack Developer".
- Description (verbatim): "Hunted is an AI-powered job search management platform designed to help job seekers organize their applications, track progress, and prepare more effectively for interviews. The platform provides a centralized dashboard for managing opportunities, monitoring application stages, and leveraging AI tools to improve the job hunting process."

### Contact (`#contact`)
- Heading "Let's work together" (28px, heading font).
- Sub line: "Open to frontend and fullstack roles. Reach out by email or find me on GitHub and LinkedIn."
- Three buttons: primary "you@example.com" (mailto:), ghost "GitHub", ghost "LinkedIn" — **all three are placeholders**, replace with the real email address, GitHub URL, and LinkedIn URL before shipping.

### Footer
- Small muted line: "© 2026 Sanad Abu Shama."

## Interactions & Behavior
- Smooth-scroll anchor navigation from the nav bar and hero/CTA links to their section ids.
- Each project's slideshow is independent local state (current slide index, 0-based). Next/prev wrap around (modulo slide count). Clicking a dot sets the index directly.
- No page transitions, no scroll animations — this is a static, content-first page.
- Responsive: nav wraps at narrow widths; the About and Work two-column rows use an auto-fit grid (`repeat(auto-fit, minmax(..., 1fr))`) that collapses to one column instead of a fixed breakpoint — replicate with equivalent CSS Grid or a standard mobile breakpoint (~640–768px) if your codebase prefers explicit breakpoints.

## State Management
- `activeSlide` per project (3 independent integers, e.g. `{ project1: 0, project2: 0, project3: 0 }`).
- No async data fetching — all content is static copy defined above.

## Design Tokens
Full token sheet is in `styles-reference.css` (design-system source of truth). Key values:
- Background: near-black blue-grey, `#161826` (`--color-bg`)
- Text: `#e9e9ed` (`--color-text`)
- Accent: a blurple, `#9184d9` (`--color-accent`), with a 100–900 tonal ramp — use step 300 (`--color-accent-300`) for accent-colored body/paragraph-size text (the raw accent doesn't meet body-text contrast), darker steps (700–900) for tinted fills/borders.
- Neutral ramp: `--color-neutral-100`…`--color-neutral-900` for muted text, borders, dividers (`--color-divider`).
- Font: Inter for both headings and body (`--font-heading` / `--font-body`), heading weight is medium (~500), never bolder.
- Radius: 8px standard (`--radius-md`).
- Spacing scale: compact/dense, see `--space-1`…`--space-8` in the reference sheet.
- Buttons are **outlined**, never solid-filled (1px accent border, transparent fill) — this applies to primary buttons too.
- Rules/dividers: 1px, fade to transparent over 48px at each end, not a hard-stopped line.
- Photographs: wrap in a `mix-blend-mode: lighten` container so dark image backgrounds disappear into the page background.

## Assets
- Portrait photo (About section) — currently an empty placeholder slot in the prototype, needs a real photo.
- Project screenshots — 4 + 3 + 4 = 11 empty placeholder slots across the three project slideshows, need real product screenshots.
- No icons or illustrations used.

## Files
- `Portfolio.dc.html` — the full design prototype (view source for exact markup/inline styles).
- `styles-reference.css` — the design-system token sheet (colors, type, spacing, component classes like `.btn`, `.tag`, `.nav`, `.lighten`) that the prototype's classes (`btn-primary`, `btn-ghost`, `tag-outline`, `tag-accent`, `nav`, `nav-brand`, `rule`, `lighten`) come from.
