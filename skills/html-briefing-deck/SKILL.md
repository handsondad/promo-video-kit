---
name: html-briefing-deck
description: Build a polished, self-contained HTML slide deck (1600×900, dark tech style, keyboard/wheel navigation, reveal animations) for any business, product, project or technical briefing, then verify every slide by screenshot and automated layout checks. Use when the user asks for a 汇报材料 / PPT / 演示文稿 / 幻灯片 / briefing / pitch deck / product introduction / 方案汇报 in HTML, or wants to revise slides of such a deck.
---

# HTML Briefing Deck

Produces one standalone `.html` file with no build step and no external assets. It opens in any browser and presents like a PPT: ←/→ turn pages, F goes full screen, `#N` deep-links to a slide, and the wheel and swipe also work.

## Files

- `assets/template.html`: the starting skeleton. It holds the theme variables, the navigation script, a line-icon sprite and ready layouts: cover, pain cards, KPI numbers with sources, timeline, layered architecture, four-square cards, table/case with "预期 → 实际" highlight, and references. Placeholders look like `{{…}}`.
- `scripts/check.mjs`: screenshots every slide and reports bottom/right overflow, horizontal scroll, dashed/dotted lines, vertical-text wrapping and body text (`p`, `li`, `td`) under 15px. The exit code is 1 when issues are found.

## Workflow

1. **Storyline first.** Agree on the arc, then write the slide list (one title and one key message per slide) before writing any HTML. A typical arc: background and pain → industry trend and evidence → what we built → how it works (abstraction / architecture) → worked example → strengths and characteristics → access / rollout / roadmap → references. Adapt the arc to the topic.
2. **Gather substance.** Read the user's documents and repository, and use web search for industry facts, figures, papers and dates. Every external number needs a source on the references slide. Label demo or simulated data clearly.
3. **Build** by copying `assets/template.html` to the target path, then:
   - Duplicate or delete `<section class="slide">` blocks as needed. Each slide ends with a `.brand` div and a `.page` div holding its page number, as in the template.
   - Add entrance animation in reading order with `class="rv" style="--d:k"`.
   - Add icons with `<svg><use href="#i-xxx"/></svg>`, adding `<symbol>` entries as needed.
   - Change the accent palette in `:root` if the organisation has brand colours.
4. **Verify** with `node <skill>/scripts/check.mjs <deck.html> [outDir]` (`<skill>` is this skill's folder). Set `SLIDES=3,7` to check only some slides. **Open the PNGs** of new or changed slides and look at them; the script catches layout bugs, not ugliness. Each run writes new file names (`s03-<run>.png`) and prints them; open those paths, because a viewer may show a cached older picture under an old name. Fix the issues and re-run.
5. **Report** the file path, the slide count and the page numbers that changed.

## Design rules (learned from real feedback, so follow them strictly)

- **Concrete beats generic.** Use real figures, named examples, before → after values and named sources. An empty, slogan-only deck gets rejected. Each slide states one message in its title and backs it with evidence.
- **No dashed or dotted lines**: no `border-style: dashed|dotted` and no SVG `stroke-dasharray`.
- **Architecture uses layered colour bands, not boxes with connector lines.** Name the interface between layers with one short text line (`.iface`).
- **Card groups are uniform**: same size, same internal layout, same heading style (a 1×4 or 2×2 grid). Short card titles use `white-space: nowrap` so they never wrap vertically.
- **No internal jargon** the audience doesn't know: phase numbers, code names, file paths, ticket ids. Say it in business language.
- **Highlight the turning point of a story**: `<s>预期 A</s> → <span class="up">实际 B</span>`, plus a coloured tag naming who benefits.
- **Draw existing capabilities as solid.** If something is future work, say so in the text rather than using a "ghost" style.
- **Avoid CSS class-name collisions** when adding components. Prefix new classes uniquely; a reused generic name can silently restyle another slide.
- **Keep the visual identity**: dark background, glass cards, cyan/blue/violet accents, bold headings of at most 2 lines, body text of at least 15px, and content clear of the 70px bottom margin.
- **If the user says a restyle looks worse, revert at once** to the previous version instead of iterating further. Back up before big restyles.
- **To keep a slide and also offer a new version**, insert the new one next to it instead of replacing it.

## Tooling

`check.mjs` needs `playwright-core`. It looks in `PLAYWRIGHT_CORE` (a package directory), then this skill's `node_modules` (run `npm install` here once), then the shared promo tools (`~/.promo-tools`, from product-promo-video's `setup.mjs`), then the current directory. It uses an installed browser (`PW_CHANNEL`: `msedge` by default on Windows, `chrome` elsewhere, or `chromium`), so no browser download is needed.
