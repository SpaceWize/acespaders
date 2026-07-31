/* ==========================================================================
   ACE SPADERS — site behaviour

   One file, several small independent modules. Every module looks for its
   own hooks in the DOM and exits quietly if they are not on the page, so
   the same script can be loaded by all six pages without branching.
   Nothing here is required for the site to be readable — CSS carries the
   layout and JS only adds motion and progressive enhancement.
   ========================================================================== */

(function () {
  "use strict";

  var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------------------
     Header
     Adds .is-stuck once the page has scrolled past the hero's first screen-
     worth, which fades in the blurred bar background.
     ---------------------------------------------------------------------- */

  function initHeader() {
    var header = document.querySelector("[data-header]");
    if (!header) return;

    var THRESHOLD = 24;
    var ticking = false;

    function update() {
      header.classList.toggle("is-stuck", window.scrollY > THRESHOLD);
      ticking = false;
    }

    // rAF-throttled: scroll fires far more often than we need to repaint.
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(update);
      },
      { passive: true }
    );

    update();
  }

  /* ------------------------------------------------------------------------
     Navigation
     Toggles the full-screen sheet on small screens. aria-expanded on the
     button is the source of truth; the class on the list follows it.
     ---------------------------------------------------------------------- */

  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var list = document.querySelector("[data-nav-list]");
    if (!toggle || !list) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      list.classList.toggle("is-open", open);
      document.body.classList.toggle("is-menu-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Following a link should always leave the menu closed behind you.
    list.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Resizing up to desktop leaves the sheet hidden by CSS but the body
    // still locked, so reset the state at the breakpoint.
    var desktop = window.matchMedia("(min-width: 56.0625rem)");
    desktop.addEventListener("change", function (event) {
      if (event.matches) setOpen(false);
    });

    setOpen(false);
  }

  /* ------------------------------------------------------------------------
     Scroll reveal
     Elements marked [data-reveal] fade and rise as they enter the viewport.
     A container marked [data-reveal-group] staggers its own [data-reveal]
     children by setting the --d delay custom property.
     ---------------------------------------------------------------------- */

  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    // No IntersectionObserver, or motion is not wanted: show everything now.
    if (!("IntersectionObserver" in window) || REDUCED_MOTION.matches) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var STAGGER_MS = 90;
    var STAGGER_MAX = 5; // cap so long lists don't trail far behind the fold

    document.querySelectorAll("[data-reveal-group]").forEach(function (group) {
      group.querySelectorAll("[data-reveal]").forEach(function (child, index) {
        child.style.setProperty("--d", Math.min(index, STAGGER_MAX) * STAGGER_MS + "ms");
      });
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target); // reveal once, never re-hide
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     Scroll spy
     The home page is a single document, so the Home / About / Contact links
     are in-page anchors. This marks whichever section is currently on screen
     with aria-current="page", which the nav underline already styles.

     Only runs on pages that actually have anchor links in the nav, so the
     two path pages are unaffected.
     ---------------------------------------------------------------------- */

  function initScrollSpy() {
    var links = Array.prototype.slice
      .call(document.querySelectorAll('[data-nav-list] a[href^="#"]'))
      .filter(function (link) {
        return link.getAttribute("href").length > 1;
      });

    if (!links.length || !("IntersectionObserver" in window)) return;

    // Pair each link with its section, dropping any that point nowhere.
    var pairs = links
      .map(function (link) {
        var section = document.querySelector(link.getAttribute("href"));
        return section ? { link: link, section: section } : null;
      })
      .filter(Boolean);

    if (!pairs.length) return;

    var visible = [];

    function setCurrent(section) {
      pairs.forEach(function (pair) {
        if (pair.section === section) {
          pair.link.setAttribute("aria-current", "page");
        } else {
          pair.link.removeAttribute("aria-current");
        }
      });
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var i = visible.indexOf(entry.target);
          if (entry.isIntersecting && i === -1) visible.push(entry.target);
          else if (!entry.isIntersecting && i !== -1) visible.splice(i, 1);
        });

        if (!visible.length) return;

        // Several sections can be on screen at once; the current one is
        // whichever sits highest in document order.
        var top = visible.reduce(function (best, node) {
          return node.offsetTop < best.offsetTop ? node : best;
        });

        setCurrent(top);
      },
      // Bias the band toward the upper-middle of the viewport so the link
      // flips over at roughly the moment the section reads as "here".
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    pairs.forEach(function (pair) {
      observer.observe(pair.section);
    });
  }

  /* ------------------------------------------------------------------------
     Cursor tracking
     Writes two custom properties on the hero — --mx and --my, each running
     -1 to 1 from the centre of the element. All the actual movement is done
     in CSS off those values, so this function knows nothing about which
     pieces move or how far.

     Skipped entirely on coarse pointers (phones, tablets) where there is no
     cursor to follow, and when reduced motion is requested.
     ---------------------------------------------------------------------- */

  function initCursor() {
    var stage = document.querySelector("[data-cursor-stage]");
    if (!stage) return;

    if (REDUCED_MOTION.matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    var pending = false;
    var mx = 0;
    var my = 0;

    function paint() {
      stage.style.setProperty("--mx", mx.toFixed(4));
      stage.style.setProperty("--my", my.toFixed(4));
      pending = false;
    }

    // pointermove fires far more often than the screen refreshes, so the
    // write is deferred to the next frame.
    function schedule() {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(paint);
    }

    stage.addEventListener(
      "pointermove",
      function (event) {
        var box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return;

        // Normalise to -1..1, then clamp: a pointer can sit slightly
        // outside the box during fast movement.
        mx = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - 0.5) * 2));
        my = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - 0.5) * 2));
        schedule();
      },
      { passive: true }
    );

    // Ease back to centre when the pointer leaves, rather than sticking at
    // whatever the last position was.
    stage.addEventListener("pointerleave", function () {
      mx = 0;
      my = 0;
      schedule();
    });
  }

  /* ------------------------------------------------------------------------
     Contact form
     The form posts to whatever action the markup declares. Until an endpoint
     is wired up it has no action, and we compose a mailto: instead so the
     page is useful from day one. Validation is left to the browser.
     ---------------------------------------------------------------------- */

  function initContactForm() {
    var form = document.querySelector("[data-contact-form]");
    if (!form) return;

    // A real endpoint is configured — let the browser submit normally.
    if (form.getAttribute("action")) return;

    var mailto = form.getAttribute("data-mailto");
    if (!mailto) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      // Serialise every field generically, so adding or removing inputs in the
      // markup needs no change here. Checkbox groups share a name and are
      // collected into one comma-separated line.
      var groups = [];
      var byName = {};

      new FormData(form).forEach(function (value, key) {
        value = String(value).trim();
        if (!value) return;
        if (!(key in byName)) {
          byName[key] = [];
          groups.push(key);
        }
        byName[key].push(value);
      });

      var body = groups
        .map(function (key) {
          var vals = byName[key];
          return vals.length > 1
            ? key + ":\n  - " + vals.join("\n  - ")
            : key + ": " + vals[0];
        })
        .join("\n\n");

      var name = (byName["First & Last Name"] || byName.name || [""])[0];
      var subject = "Enquiry — " + (name || "Ace Spaders");

      var href =
        "mailto:" + mailto +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);

      // mailto: URLs get truncated by some clients past a couple of thousand
      // characters. This form can exceed that, so fall back to a plain
      // subject-only mail and put the details on the clipboard instead.
      if (href.length > 1900 && navigator.clipboard) {
        navigator.clipboard.writeText(body).then(
          function () {
            window.alert(
              "Your answers have been copied to the clipboard — please paste " +
              "them into the email that opens."
            );
            window.location.href =
              "mailto:" + mailto + "?subject=" + encodeURIComponent(subject);
          },
          function () {
            window.location.href = href;
          }
        );
        return;
      }

      window.location.href = href;
    });
  }

  /* ------------------------------------------------------------------------
     Scroll hero
     The hero video never plays. How far you have scrolled through the (tall)
     #home section is mapped onto the video's currentTime, so the shot
     advances with the wheel and runs backwards when you scroll back up.

     Three things make this smooth, and it is worth knowing why, because
     dropping any one of them brings the stutter back:

     1. THE ENCODE. Both hero files are all-intra — every frame is a
        keyframe. Seeking a normally-encoded video means decoding forward
        from the last keyframe, which for a 5-second clip with one keyframe
        means decoding the whole clip on every seek. That is not something
        JavaScript can paper over. See the README for the ffmpeg command.

     2. NO WORK IN THE SCROLL HANDLER. The scroll listener only sets a flag.
        All the reading and seeking happens in one requestAnimationFrame
        loop, at most once per displayed frame, and layout values are
        measured on resize rather than per frame.

     3. THE LOOP SLEEPS. It runs only while the hero is on screen, and stops
        again once the video has caught up with the scroll position.
     ---------------------------------------------------------------------- */

  function initScrollHero() {
    var video = document.querySelector("[data-hero-video]");
    var section = document.getElementById("home");
    if (!video || !section) return;

    // Reduced motion: CSS has already collapsed the section to one screen.
    // Leave the poster in place and never fetch several megabytes of video.
    if (REDUCED_MOTION.matches) return;

    // How hard the video chases the scroll position each frame. Lower is
    // smoother and laggier; 1 would track the wheel exactly, jitter included.
    var EASE = 0.16;
    // Stop the loop once we are within this fraction of the scrub of target.
    var SETTLED = 0.0008;
    // Do not issue a seek for a move smaller than half a frame — the browser
    // would decode the same picture again.
    var MIN_SEEK = 1 / 48;
    // Give up waiting for a fully buffered file after this long and scrub
    // anyway, rather than leaving the hero frozen on a flaky connection.
    var BUFFER_TIMEOUT = 8000;

    var duration = 0;
    var target = 0; // 0..1, where the scroll position says we should be
    var eased = 0; // 0..1, where we actually are
    var sectionTop = 0;
    var scrollable = 0;
    var running = false;
    var onScreen = false;
    var ready = false;

    /* -- measurement ------------------------------------------------------
       Layout reads are expensive and only change on resize, so they happen
       here and never inside the loop. */
    function measure() {
      var rect = section.getBoundingClientRect();
      sectionTop = rect.top + window.scrollY;
      scrollable = section.offsetHeight - window.innerHeight;
    }

    function readScroll() {
      if (scrollable <= 0) return 0;
      var p = (window.scrollY - sectionTop) / scrollable;
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    /* -- the loop -------------------------------------------------------- */
    function tick() {
      target = readScroll();
      eased += (target - eased) * EASE;

      var settled = Math.abs(target - eased) < SETTLED;
      if (settled) eased = target;

      if (ready && duration) {
        var t = eased * duration;
        // Never seek to the very end: some browsers clamp to duration and
        // fire `ended`, which drops the last frame.
        if (t > duration - 0.001) t = duration - 0.001;

        // Assigning currentTime while a seek is already in flight is not a
        // queue — the browser abandons the old target for the new one, which
        // is exactly right here: we always want the newest scroll position,
        // never a backlog of stale ones. Deliberately NOT gated on `seeked`;
        // waiting for each seek to retire makes the video crawl behind a
        // fast flick. currentTime already reports a pending seek's target,
        // so this comparison will not re-issue the same seek twice.
        if (Math.abs(video.currentTime - t) > MIN_SEEK) video.currentTime = t;
      }

      // Sleep once we have caught up. A scroll event wakes us again.
      if (settled) {
        running = false;
        return;
      }
      window.requestAnimationFrame(tick);
    }

    function wake() {
      if (running || !onScreen) return;
      running = true;
      window.requestAnimationFrame(tick);
    }

    /* -- readiness --------------------------------------------------------
       Scrubbing a partly-downloaded video makes every seek a range request,
       which is precisely the stutter this is meant to avoid. So hold on the
       poster until the whole clip is buffered, then fade the video in. */
    function checkBuffered() {
      if (ready || !duration) return;
      var b = video.buffered;
      if (!b.length) return;
      if (b.end(b.length - 1) < duration - 0.25) return;
      enable();
    }

    function enable() {
      if (ready) return;
      ready = true;
      video.classList.add("is-ready");
      wake();
    }

    video.addEventListener("progress", checkBuffered);
    video.addEventListener("canplaythrough", checkBuffered);
    window.setTimeout(enable, BUFFER_TIMEOUT);

    video.addEventListener("loadedmetadata", function () {
      duration = video.duration || 0;
      measure();
      eased = target = readScroll();
      checkBuffered();
    });

    // Belt and braces: a muted autoplay-less video should never play, but a
    // stray play() from anywhere would fight the scrubber.
    video.addEventListener("play", function () {
      video.pause();
    });

    /* -- wiring ---------------------------------------------------------- */
    window.addEventListener("scroll", wake, { passive: true });

    // Debounced, because a resize fires continuously and each measure()
    // forces layout.
    var resizeTimer = 0;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          measure();
          wake();
        }, 150);
      },
      { passive: true }
    );

    // Only run the loop while the hero is actually on screen.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          onScreen = entries[0].isIntersecting;
          if (onScreen) wake();
        },
        { threshold: 0 }
      ).observe(section);
    } else {
      onScreen = true;
    }

    /* -- load ------------------------------------------------------------
       The source is set from JS rather than in the markup so that visitors
       who never get the scrub — reduced motion, no JavaScript — are not made
       to download it. The poster carries the hero for them. */
    var small = window.matchMedia("(max-width: 56rem)").matches;
    var src = (small && video.getAttribute("data-src-small")) || video.getAttribute("data-src");
    if (src) video.src = src;

    measure();
  }

  /* ------------------------------------------------------------------------
     Footer year
     ---------------------------------------------------------------------- */

  function initYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ---------------------------------------------------------------------- */

  function init() {
    initHeader();
    initNav();
    initScrollSpy();
    initReveal();
    initCursor();
    initContactForm();
    initScrollHero();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
