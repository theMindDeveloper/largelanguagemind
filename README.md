# Large Language Mind

A process-driven research journal tracing how my understanding of intelligence, cognition and machine learning emerges: from intuition, cross-domain connections and reasoning, to formal concepts.

Entries document the **development of ideas**: first intuitions, informal reasoning, analogies, confusions, revisions, and only later the connections to established theory. The journal sits between intuition and academia. It is not a tutorial and not a paper; it is a record of reasoning under uncertainty.

**Website:** [theminddev.com/largelanguagemind](https://theminddev.com/largelanguagemind/) (short link: [theminddev.com/llm](https://theminddev.com/llm))

> © theMindDeveloper. All rights reserved. Nothing in this repository may be copied, reused or adapted. See [LICENSE](LICENSE).

---

## Technical guide

The site is a plain [Jekyll](https://jekyllrb.com/) site built and hosted by **GitHub Pages**. There is no server, database or build step to run yourself: push to `main` and GitHub rebuilds the site in about a minute.

All figures (the neurons, brain plates, page background, hero animation and logo) are drawn in the visitor's browser by `assets/js/neural-engine.js`. There are no image files to make for a new note.

### Repository layout

```
_config.yml                 site settings, URL, and the three Atlas lenses
index.md                    home page (uses layout: home)
notes/*.md                  one file per note  <- the only place you write
_layouts/default.html       page shell: fonts, favicon, theme, scripts
_layouts/home.html          hero, Atlas, Notes list
_layouts/note.html          article page: header, contents, specimen neuron
_includes/notes-sorted.html collects every note, newest first
_includes/note-row.html     one row in the Notes list
_includes/lens.html         one Atlas column
_includes/footer.html       footer
_includes/mathjax.html      LaTeX support for notes
assets/css/journal.css      design tokens and all styles
assets/js/neural-engine.js  figure generator (do not edit)
assets/js/field-worker.js   draws the page background off the main thread
assets/js/journal.js        mounts figures, theme toggle, contents, filters
assets/brand/               logo PNGs, favicon, logo-export.html
```

---

## Adding a new note

1. Create a Markdown file in `notes/`, for example `notes/2026-10-12-predictive-coding.md`. The file name becomes the URL (`/notes/2026-10-12-predictive-coding.html`), so use lowercase words and hyphens and don't rename it later.
2. Start the file with this front matter, then write the note below it:

```yaml
---
layout: note
title: "Predictive Coding: The Brain as a Guessing Machine"
headline: "Predictive Coding"          # optional: shorter title on the article page
numeral: III                           # next roman numeral (I, II, III, IV ...)
date: 2026-10-12
last_update: 2026-10-12                # change this when you revise the note
summary: "One or two sentences shown in the Notes list on the home page."
standfirst: "One italic sentence under the title on the article page. *Markdown* works."
topics: [predictive coding, free energy, perception]   # first three show as "filed under"
neuron:
  type: stellate                       # pyramidal | purkinje | stellate | bipolar
  seed: 53                             # any whole number; gives the note its own cell
lenses:                                # any subset of brain / learning / machine
  brain: "Cortex as a hierarchy of predictions"
  learning: "Errors that travel up, guesses that travel down"
---
```

3. Commit and push to `main`. That is everything. The note then:
   - appears at the top of **Notes** on the home page, with its own generated neuron;
   - is filed in the **Atlas** under every lens it lists (the latest three show per lens);
   - can be found with the lens filters;
   - gets its article page with a specimen neuron, contents sidebar and reading progress bar;
   - moves the "not written yet" placeholder to the next numeral.

### Front matter reference

| Field | Required | What it does |
|---|---|---|
| `layout` | yes | Always `note`. |
| `title` | yes | Full title, used in the Notes list, browser tab and link previews. Put it in quotes. |
| `headline` | no | Shorter title for the article page. Falls back to `title`. |
| `numeral` | yes | Roman numeral shown as "Plate III", "III." and "cell no. III". Use the next one in order. |
| `date` | yes | `YYYY-MM-DD`. Sets the order, newest first. **A note without a date is not listed.** |
| `last_update` | no | `YYYY-MM-DD`. If it differs from `date`, the note shows "revised …". |
| `summary` | yes | Short text in the Notes list and in link previews. |
| `standfirst` | no | Italic intro under the article title. |
| `topics` | no | List. The first three show as "filed under"; all show at the end of the note. |
| `neuron.type` | no | `pyramidal`, `purkinje`, `stellate` or `bipolar`. Default `pyramidal`. |
| `neuron.seed` | no | Any whole number. Same seed and type always give the same cell; pick one no other note uses. |
| `lenses` | no | One line per lens: `brain`, `learning`, `machine`. The text is what shows in the Atlas. Leave a lens out to keep the note out of it. |
| `math` | no | Set to `false` to skip loading MathJax on a note without formulas. |

Seeds in use: 11 (Plate I), 29 (Plate II). 47 is the "not written yet" ghost cell, and 3 and 17 draw the page backgrounds; avoid those.

### Writing the body

Write normal Markdown. The note layout styles it automatically.

- **Sections**: use `##` for sections and `###` for sub-sections (`####` below that). Every `##` heading becomes an entry in the contents sidebar. A leading number like `## 2. Rosenblatt's Mark I` or `## 2) Bias in biology` is split off and shown in the accent colour. Don't start the body with a `#` title; the layout already prints it.
- **Blank lines**: leave an empty line between blocks (paragraphs, lists, headings, images, tables). Without one, Markdown glues them together: a sentence typed directly under a list becomes part of the last bullet.
- **Horizontal rules**: always leave an empty line above `---`. Directly under a line of text, Markdown turns `---` into a heading instead.
- **Pull quotes**: any `>` blockquote becomes a large italic quote. To add the small handwritten label above it, put an attribute line right after it:

  ```markdown
  > If neurons are just circuits, why do we simulate them in software?
  {: data-label="the question"}
  ```

- **Figures**: put an image on its own line and an italic caption on the next line. It becomes a numbered plate (fig. 1, fig. 2 …), with any leading "Figure:" removed from the caption:

  ```markdown
  ![Perceptron Manual 1960](https://example.com/perceptron.jpg)
  *Figure: An illustration from the 1960 Perceptron Manual.*
  ```

  For images you own, put them in `assets/images/` and link them as `{{ site.baseurl }}/assets/images/name.jpg`.
- **Term and description rows**: use a definition list:

  ```markdown
  Prior acceptance
  : holding a belief without re-deriving its justification every time

  Selective attention
  : overweighting certain evidence types based on pre-existing filters
  ```

- **Tables**: normal Markdown tables. Wide tables scroll sideways on phones.
- **Math**: `$...$` inline and `$$...$$` for display formulas (MathJax).

### Checking a note before publishing (optional)

GitHub Pages builds everything for you, so this step is optional.

The simplest check needs nothing installed. Push the note to any branch other than `main`; the **Build check** workflow (`.github/workflows/build-check.yml`) builds the site with the same Jekyll that GitHub Pages uses and reports any error under the **Actions** tab. The built site can be downloaded there as the `site` artifact. Merge into `main` when it passes.

To preview locally you need Ruby and the `github-pages` gem, or Docker:

```bash
docker run --rm -it -p 4000:4000 -v "$PWD":/srv/jekyll -w /srv/jekyll ruby:3.3 bash -c "gem install github-pages webrick && jekyll serve --host 0.0.0.0 --baseurl /largelanguagemind"
```

Then open `http://localhost:4000/largelanguagemind/`.

If a pushed note doesn't appear, check the build under the repository's **Actions** tab. The usual causes are a missing `date`, a front matter line without a closing quote, or a tab character in the front matter.

---

## Configuration

### Atlas lenses

The three lenses live in `_config.yml`:

```yaml
lenses:
  - { key: brain,    letter: a, title: Brain,    plate: cortex,     seed: 7,  sub: "..." }
  - { key: learning, letter: b, title: Learning, plate: tracts,     seed: 11, sub: "..." }
  - { key: machine,  letter: c, title: Machine,  plate: connectome, seed: 5,  sub: "..." }
```

`key` is the name notes use under `lenses:`. `plate` is the drawing (`cortex`, `tracts` or `connectome`), and `seed` varies it.

### Domain

The site is served at `https://theminddev.com/largelanguagemind`. The domain itself belongs to the separate repository `theMindDeveloper/theminddeveloper.github.io`. That repository also redirects `theminddev.com` and `theminddev.com/llm` here. This is why `_config.yml` has `url: "https://theminddev.com"` and `baseurl: "/largelanguagemind"`. If the repository is ever renamed, `baseurl` must change to match.

### Brand assets

`assets/brand/` holds the exported logo PNGs (favicon, apple-touch-icon, social preview). To re-export them, open `assets/brand/logo-export.html` in a browser from a local copy of the repository and click each button. It is not published on the site.

### Design system

Colours, type, spacing and motion follow the design hand-off. The tokens are CSS custom properties at the top of `assets/css/journal.css`, in two sets: paper (default) and night (`lights off`). The visitor's choice is stored in `localStorage` under `llm-theme`. Visitors whose system asks for reduced motion get a hero that grows once and then stays still.

---

## License

Copyright © 2025–2026 theMindDeveloper. **All rights reserved.** This is a personal brand: no part of this repository, including the notes, design, code, figures, name and logo, may be copied, reused, modified, redistributed or used to train AI systems without written permission. See [LICENSE](LICENSE) for the full terms.

Contact: theminddevlab@gmail.com
