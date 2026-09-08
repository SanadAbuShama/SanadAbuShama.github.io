# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted evenly:
- Recruiters and hiring managers screening candidates for full-time frontend/fullstack roles — fast scanners, comparing candidates, need credibility signals quickly.
- Freelance/contract clients deciding whether to hire Sanad directly for project work — more deliberate readers, evaluating range and reliability.

## Product Purpose

A personal portfolio for Sanad Abu Shama that gets him hired — either into a full-time role or a freelance/contract engagement — by demonstrating real, production-grade full-stack work.

## Positioning

Full-stack range, not just frontend polish: the differentiator is evidence of working across the whole system — shared charting libraries, a node-based workflow-automation builder (CoreAds), API-client generation over a monorepo, third-party platform integration depth (VTEX) — backed by quantified ownership (leading contributor, high commit/ticket share) rather than generic skill claims.

## Operating Context

- Single static page (`index.html`) plus one separate, self-contained case-study page (`hunted/`) that links back to it. The Hunted page and its assets are out of scope for this redesign — do not touch.
- Deployed via GitHub Pages on the custom domain `abushamasanad.com` (see `CNAME`).
- No build tooling — plain HTML/CSS/JS (`assets/css/nocturne.css`, `assets/js/portfolio.js`).
- An existing design-handoff reference documents the current "Nocturne" dark visual system (`design_handoff_portfolio/`) — evidence of the incumbent world, not a constraint on the redesign.
- Source résumé provided by the user at `C:\Users\Sanad\Downloads\Sanad_Abu_Shama_Resume.pdf` (2026), to be added to the repo and referenced from the page.

## Capabilities and Constraints

- **Hunted case study is untouched**: the `hunted/` directory (page + assets) and the "Selected Work" link pointing to it must keep working exactly as-is.
- **Selected Work copy is verbatim**: the three project descriptions (Coretava Loyalty Station, Coretava Admin Dashboard, Hunted) and their screenshots/slideshow behavior stay as written — this redesign is UI/layout, not a copy rewrite, for that section specifically.
- **Scope is primarily visual/layout**, with two explicit content additions sourced from the résumé:
  1. A new Experience section surfacing Coretava-role facts and metrics (see Evidence on Hand).
  2. A "download résumé" affordance linking to the résumé file.
- About/Skills copy may be enriched with résumé facts (additional skills, sharper full-stack framing) but should stay accurate to the résumé — no invented claims.
- Employment status must be corrected: Sanad left Coretava (role ended May 2026) and is currently available/job-searching. Update any "currently at Coretava" framing (including the `worksFor` structured-data claim) to past-role phrasing and reflect active availability.

## Brand Commitments

- Name: Sanad Abu Shama (alternates: Sanad AbuShama, Sanad Abu-Shama, سند أبو شامة).
- Contact: abushamasanad@gmail.com · github.com/SanadAbuShama · linkedin.com/in/sanad-abu-shama.
- Location: Salfit, Palestine.
- Education: Bachelor of Mechanical Engineering, Birzeit University (2015–2020); Full-Stack Developer Certificate, Coding Dojo – AXSOS Academy (2022).

## Evidence on Hand

Résumé (`Sanad_Abu_Shama_Resume.pdf`), role: Front-End Developer, Coretava (formerly Gamiphy), June 2022 – May 2026:
- Designed/built the dashboard's shared Recharts-based charting library (bar, pie, needle-gauge, dual-axis line) and the original 8-chart analytics module, later reused platform-wide.
- Built CoreAds: a visual, node-based workflow builder in React for AI-driven marketing automation (branching logic, audience targeting, WhatsApp triggers) — the platform's flagship orchestration feature.
- Maintained/extended an embeddable loyalty widget (loyalty-station, 29% of all commits) across a 3+ year VTEX eCommerce integration, including a React-runtime-isolation (IIFE) fix for host-page conflicts.
- Migrated the dashboard's legacy component library to MUI v7 / modular React, cutting code duplication 20% and design-to-dev handoff time 30%.
- Delivered i18n across 4 markets (Arabic, English, Spanish, Portuguese), authoring 45% of commits to the shared i18n package, enabling a dedicated LatAm product line.
- 750+ tickets shipped, 3,476 commits, 1,160+ reviewed PRs over 4 years; leading contributor (37%+ of commits) to the core dashboard app.
- Full skill set per résumé: HTML5, CSS3, JavaScript, TypeScript, React.js, React Router, MUI, Mobx, i18next, Nx/pnpm monorepos, OpenAPI Codegen, Responsive Design, Component-Driven Development, Git, REST API integration.
- Languages: fluent Arabic, proficient English.

Existing project screenshots live in `images/work/`. No testimonials, press, or client logos exist — do not fabricate any.

## Product Principles

1. Full-stack range over frontend-only framing — every section should carry evidence of depth beyond visual UI: systems, data, workflow, scale.
2. Evidence-led credibility — lead with real, quantified production impact (commit/ticket share, ownership percentages, measurable outcomes) over generic skill claims.
3. Content stability, visual reinvention — Selected Work copy and the Hunted case study are fixed points; layout, hierarchy, and visual identity are fully open to reinvention.
4. Serve two readers at once — a fast-scanning recruiter and a more deliberate freelance client should each find what they need without friction.
