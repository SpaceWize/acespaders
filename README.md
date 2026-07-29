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
assets/css/pages.css        Hero, paths, masthead, services, gallery, lightbox
assets/js/main.js           Header, nav, scroll-spy, reveals, lightbox, form
assets/img/                 Photographs (currently empty — see below)

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

### The animated hero

The home page opens on a two-panel hero rebuilt from the original. Six things
move:

| Piece | How it works |
|---|---|
| **Water** | `.water` — a blurred multi-stop gradient drifting sideways while its hue rotates, blended `color-dodge` over the photo. Opacity is deliberately low (0.24); above ~0.25 `color-dodge` blows out a real photograph instead of shimmering on it. |
| **Moon** | `.moon__disc` spins on a 48s loop. The whole moon is a link to `#paths`. |
| **Miner** | `.moon__miner` bobs; `.moon__pickaxe` is a **separate layer** that swings from the handle, so it needs its own image. Both share a 1.1s cycle — the miner dips as the axe comes down. |
| **ACE / SPADERS** | Drifts toward the cursor. SPADERS also tilts toward it, which gives the pair parallax rather than moving as one rigid block. |
| **Let's Talk / In The Truck** | Shifts toward the cursor. "In The Truck" carries a sheen — a narrow highlight sweeping across a mostly-red gradient, clipped to the glyphs. |
| **Start Here** | Pulses on a 2.4s loop; the pulse pauses on hover. |

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

### Photographs the hero needs

All the slots are built and correctly sized; each is a one-line swap. Drop an
`<img>` into the slot and delete its `data-placeholder` attribute.

| File | Where | Notes |
|---|---|---|
| `assets/img/hero-truck.jpg` | left panel | the truck / water shot |
| `assets/img/hero-city.jpg` | right panel | the city-at-night shot |
| `assets/img/moon.png` | `.moon__disc` | square, transparent edges; it rotates, so anything off-centre will wobble |
| `assets/img/miner.png` | `.moon__miner` | transparent PNG, **without** the pickaxe |
| `assets/img/pickaxe.png` | `.moon__pickaxe` | transparent PNG, separate so it can swing |
| `assets/img/path-cybertruck.jpg` | paths | square |
| `assets/img/path-advisor.jpg` | paths | square |

The miner and pickaxe being separate files is what makes the swing possible.
If you only have them as one combined image, put it in `miner.png`, leave
`pickaxe.png` out, and the miner will bob without swinging — still animated,
just less specific.

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

Remove `data-placeholder` when you do. `data-full` is optional — it is what
the lightbox loads; without it the lightbox reuses the tile image. The
`data-caption` on the parent button is the text shown under the lightbox.

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
- **Accessibility.** Skip link, visible keyboard focus ring throughout, the
  mobile menu tracks `aria-expanded` and closes on Escape, and the lightbox is
  a native `<dialog>` so focus trapping and Escape come from the browser.

## Checking changes locally

```bash
python3 -m http.server 8000
# then open http://127.0.0.1:8000
```

Worth checking after any change: the page at 390px, 834px and 1440px wide; that
the body never scrolls sideways; the mobile menu opens, closes and traps
scroll; the nav underline follows the section as you scroll; and that the site
still reads correctly with JavaScript disabled.
