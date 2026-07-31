# Ace Spaders — acespaders.com

Static rebuild of the Ace Spaders site. No build step, no dependencies, no
framework — plain HTML, CSS and one JavaScript file. Open `index.html` in a
browser and it works.

## Structure

One scrolling main page, plus two standalone pages for the two paths.

```
index.html              Single page: #home, #about, #services, paths, #contact
ace-advisor.html        Path 1 — "Let's Talk", the retained advisory
cybertruck.html         Path 2 — "In The Truck", on-location work
404.html                Not-found page

about.html              ┐
contact.html            ├ Redirect stubs for the old Wix URLs, which are
products-services.html  ┘ already indexed. They bounce to the matching anchor.

assets/css/tokens.css       Colour, type scale, spacing, motion — all values
assets/css/base.css         Reset, element defaults, grain overlay, focus
assets/css/layout.css       Shell, header, nav, grids, footer
assets/css/components.css   Buttons, cards, steps, quote, form, callout…
assets/css/pages.css        Hero, paths, masthead, services, gallery
assets/js/main.js           Header, nav, scroll-spy, reveals, scroll hero, form
assets/img/                 Photographs, and the hero poster frame
assets/video/               hero.mp4 + hero-720.mp4 — the scroll-scrubbed hero

CNAME, .nojekyll, robots.txt, sitemap.xml   GitHub Pages + SEO plumbing
```

**The stylesheets must be linked in that order** — `tokens.css` defines the
custom properties every other file reads. Every page links all five.

## Making changes

### Colour, type, spacing, motion

All of it lives in `assets/css/tokens.css`, and nothing else hard-codes a
value. Change the brand amber in one place and every button, rule, eyebrow and
hover state follows:

```css
--gold-500: #f9a700;   /* the brand amber */
--ink-900:  #080808;   /* page black */
```

The type scale is fluid: each step is a `clamp()` interpolating between a
360px and a 1440px viewport, so text resizes continuously rather than jumping
at breakpoints. Change `--step-4` and every `h2` on the site moves with it.

### The header and footer are duplicated

There is no build step, so the header and footer markup is copied into each
page. **Edit one, edit all three** (`index.html`, `ace-advisor.html`,
`cybertruck.html`) — plus `404.html`, which carries a cut-down header.

The nav differs slightly per page: on `index.html` the Home/About/Contact links
are bare anchors (`#about`); on the two path pages they are prefixed
(`index.html#about`) so they still resolve.

### The scroll-scrubbed hero

The home page opens on a video that never plays. `#home` is three viewports
tall and the panel inside it is `position: sticky`, so scrolling through the
extra height scrubs the shot instead of moving the panel: the truck advances
as you scroll down and reverses as you scroll back up.

| Piece | How it works |
|---|---|
| **The video** | `assets/video/hero.mp4`, with `hero-720.mp4` served below 56rem. `main.js` maps scroll progress through `#home` onto `video.currentTime`. |
| **Scrub length** | The `height` on `.js .hero-split` — 300vh. Raise it to slow the scrub, lower it to speed it up. No JS change needed; the script reads the height. |
| **ACE / SPADERS** | Drifts toward the cursor. SPADERS also tilts toward it, which gives the pair parallax rather than moving as one rigid block. |
| **Let's Talk / In The Truck** | Shifts toward the cursor. "In The Truck" carries a sheen — a narrow highlight sweeping across a mostly-red gradient, clipped to the glyphs. |
| **Start Here** | Pulses on a 2.4s loop; the pulse pauses on hover. |

#### Replacing the hero video — read this first

**The encode matters more than the code.** A normal mp4 has one keyframe every
few seconds; seeking to an arbitrary time means decoding forward from the last
one, so scrubbing a normally-encoded clip stutters no matter how good the
JavaScript is. The hero files are encoded **all-intra** — every frame is a
keyframe — which makes any seek a single-frame decode. Files get roughly 2–3×
larger, and that is the trade that buys a smooth scrub.

To re-encode a new clip the same way:

```bash
ffmpeg -i source.mp4 -an \
  -vf "scale=1920:1080:flags=lanczos" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 28 \
  -g 1 -keyint_min 1 \
  -x264-params "keyint=1:min-keyint=1:scenecut=0:ref=1:bframes=0" \
  -movflags +faststart \
  assets/video/hero.mp4
```

Then the small-screen version (`scale=1280:720`, `-crf 30`, same flags) as
`hero-720.mp4`, and a poster from the first frame:

```bash
ffmpeg -i source.mp4 -frames:v 1 -vf "scale=1600:900:flags=lanczos" \
  -q:v 6 assets/img/hero-poster.jpg
```

Sanity check afterwards: `ffprobe -show_frames source.mp4 | grep -c key_frame=1`
should equal the total frame count. Keep the clip short — five seconds is
plenty, because it is stretched across two viewports of scrolling.

**Keep the poster in step with the video.** It is what shows before the video
has downloaded, with JavaScript off, and for visitors who ask for reduced
motion — in those last two cases the video is never fetched at all, so the
poster is the entire hero.

#### If the hero scroll ever feels rough again

Three things were measured as the actual causes, in order of impact. Frame
times below are from a scripted scroll through the hero:

| Cause | Fix | Effect |
|---|---|---|
| `mix-blend-mode: overlay` on the fixed grain layer (`body::after`) | removed; grain is now a plain low-opacity layer | 33ms → 16.7ms median |
| `backdrop-filter: blur()` on the stuck header | replaced with opacity + gradient | 50ms → 16.8ms p95 |
| A video that is not all-intra | re-encode as above | the scrub does not track at all |

A fixed, full-viewport layer that *blends* or *filters* has to be recomposited
on every frame the content beneath it changes — and beneath it is a video
changing every frame. Both effects are cheap on a static page and expensive
here. If you reintroduce either, measure the hero scroll before shipping it.

**How the cursor tracking works.** `main.js` writes two custom properties on
the hero — `--mx` and `--my`, each running −1 to 1 from the centre. Every
moving piece reads those in CSS. The script knows nothing about which
elements move or how far, so to retune the amount of movement you edit CSS,
not JavaScript:

```css
.hero-mark { transform: translate3d(calc(var(--mx) * 14px), calc(var(--my) * 10px), 0); }
.hero-mark__spaders { transform: rotate(calc(var(--mx) * 3.2deg)) ... }
```

Tracking is skipped entirely on touch screens (no cursor to follow) and when
reduced motion is requested. In both cases the properties stay at 0 and
everything simply sits still — the layout is identical either way.

### Photographs still needed

The slots are built and correctly sized; each is a one-line swap. Drop an
`<img>` into the slot and delete its `data-placeholder` attribute.

| File | Where | Notes |
|---|---|---|
| `assets/img/path-cybertruck.jpg` | paths | square |
| `assets/img/path-advisor.jpg` | paths | square |

### Adding the Cybertruck photograph

The slot is already built in `cybertruck.html`, sized to the original
photograph's 2500×1330 so nothing reflows when the image lands. The source on
the current Wix site is:

```
https://static.wixstatic.com/media/07899d_33eaf975bfa94217abb7ad60eec2c945~mv2.jpg
```

Download it, save it as `assets/img/cybertruck.jpg`, then in `cybertruck.html`
delete the `data-placeholder` attribute on `<figure class="feature">` and
uncomment the `<img>` directly beneath it.

Host the file yourself rather than hotlinking the Wix CDN — hotlinking would
keep the new site dependent on the Wix account staying open.

### Adding gallery photographs

In `cybertruck.html`, replace a placeholder tile:

```html
<span class="gallery__media">
  <img src="assets/img/truck-01.jpg" alt="Describe the scene"
       data-full="assets/img/truck-01-large.jpg" loading="lazy"
       width="1200" height="900">
  <span class="gallery__caption">Caption</span>
</span>
```

Remove `data-placeholder` when you do.

### Adding photographs to the two path cards

Drop an `<img>` inside `<span class="path__media">` on `index.html`. The scrim
and hover zoom already account for it.

### Wiring up the contact form

Right now the form has no `action`, so `main.js` composes a `mailto:` to
`info@acespaders.com` on submit. That works everywhere but depends on the
visitor having a mail client.

To use a real endpoint, add an `action` to the `<form>` in `index.html`:

```html
<form class="form" action="https://formspree.io/f/XXXXXXX" method="POST" ...>
```

The script checks for `action` and steps aside automatically — no JS change
needed. (GitHub Pages has no server side, so form handling needs a third party
such as Formspree, Basin or Web3Forms.)

## Deploying to GitHub Pages

1. Push this branch, then in the repo go to **Settings → Pages** and set the
   source to this branch, folder `/ (root)`.
2. Set the custom domain to `www.acespaders.com`. The `CNAME` file already in
   the repo declares it; `.nojekyll` stops GitHub running the files through
   Jekyll.
3. Tick **Enforce HTTPS** once the certificate provisions (a few minutes).

### Moving the domain off Wix

Wix is a closed platform — this site cannot be uploaded into it. Wix's custom
code features (Velo, HTML embed elements) only inject fragments into a
Wix-rendered page, so the switch is a DNS change, not a migration.

At whoever holds the domain (registrar, or Wix if the domain was bought
through them):

| Record | Host  | Value |
|--------|-------|-------|
| CNAME  | `www` | `spacewize.github.io` |
| A      | `@`   | `185.199.108.153` |
| A      | `@`   | `185.199.109.153` |
| A      | `@`   | `185.199.110.153` |
| A      | `@`   | `185.199.111.153` |

The four A records point the bare `acespaders.com` at GitHub so it redirects to
`www`. Remove the existing Wix records for `@` and `www` at the same time.

Propagation is usually minutes but can take up to 48 hours. **Keep the Wix
plan active until the new site is confirmed live**, then cancel it. If the
domain was registered *through* Wix, either transfer it out or repoint the DNS
from Wix's domain dashboard — cancelling the plan outright while the domain
lives there can take the domain down with it.

Nothing on this site handles passwords, accounts or payments, so there is no
sensitive data to migrate.

## Notes

- **Fonts.** Montserrat (Black for display) and Inter, from Google Fonts. The
  live Wix site also uses a face called `midnight-terror`, which is licensed
  through Wix and cannot be served from a static host; Montserrat Black carries
  the display voice instead, and the roughness comes from texture rather than
  the letterforms. If that face matters, it can be licensed separately and
  dropped in via `@font-face` — change `--font-display` in `tokens.css`.
- **JavaScript is optional.** Every reveal animation is gated behind a `.js`
  class set before first paint. With scripting off the page renders fully
  visible and every link still works.
- **Reduced motion** is honoured — animations and reveals switch off for
  visitors who ask for that at the OS level.
- **Accessibility.** Skip link, visible keyboard focus ring throughout, and
  the mobile menu tracks `aria-expanded` and closes on Escape. The hero video
  is `aria-hidden` and not focusable — it is decoration, and the `<h1>` behind
  it carries the page's name for screen readers.

## Checking changes locally

```bash
python3 -m http.server 8000
# then open http://127.0.0.1:8000
```

Worth checking after any change: the page at 390px, 834px and 1440px wide; that
the body never scrolls sideways; the mobile menu opens, closes and traps
scroll; the nav underline follows the section as you scroll; and that the site
still reads correctly with JavaScript disabled.
