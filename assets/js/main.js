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
  var FINE_POINTER = window.matchMedia("(hover: hover) and (pointer: fine)");

  // Cursor-driven effects need a cursor to be driven by, and none of them
  // should run against an explicit request for less motion.
  function pointerEffectsWanted() {
    return !REDUCED_MOTION.matches && FINE_POINTER.matches;
  }

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
    var stages = document.querySelectorAll("[data-cursor-stage]");
    if (!stages.length) return;

    if (REDUCED_MOTION.matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    Array.prototype.forEach.call(stages, trackStage);
  }

  // One independent tracker per stage — the hero on the home page, the
  // locality note under the contact form. Each writes --mx / --my on itself
  // and knows nothing about what reads them; the movement is all in CSS.
  function trackStage(stage) {
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

    var handoff = document.querySelector("[data-form-handoff]");
    var textEl = handoff && handoff.querySelector("[data-handoff-text]");
    var copyBtn = handoff && handoff.querySelector("[data-handoff-copy]");
    var mailLink = handoff && handoff.querySelector("[data-handoff-mail]");
    var gmailLink = handoff && handoff.querySelector("[data-handoff-gmail]");
    var outlookLink = handoff && handoff.querySelector("[data-handoff-outlook]");
    var truncNote = handoff && handoff.querySelector("[data-handoff-trunc]");

    // Browsers and these two services both stop honouring very long URLs.
    // Past this the compose window opens empty and the copy button is the
    // route — which the panel says, rather than silently truncating.
    var URL_LIMIT = 7000;

    /* -- validation feedback ----------------------------------------------
       The browser's own bubble is not enough on a form this long. It shows
       one message at a time, vanishes after a few seconds, and the jump to a
       field a thousand pixels up reads as "nothing happened" — which is
       exactly how a submit gets abandoned. So: mark every missing field, and
       say plainly which ones they are. */

    var errorBox = form.querySelector("[data-form-errors]");

    /* Take validation off the browser — but only now that JS is running.
       This is the bug that made a blocked submit look like nothing happening:
       with native validation on, clicking submit on an invalid form makes the
       browser show its own bubble and NEVER fire the submit event, so none of
       the code below ever ran. Setting novalidate here (rather than in the
       markup) means a visitor without JavaScript still gets native validation,
       since for them the browser is the only thing checking. */
    form.setAttribute("novalidate", "novalidate");

    function labelFor(el) {
      var wrap = el.closest(".field, .fieldset");
      if (!wrap) return el.name || "a field";
      var label = wrap.querySelector(".field__label, .fieldset__legend");
      // Strip the leading * the copy uses to mark required fields.
      return label ? label.textContent.trim().replace(/^\*/, "") : el.name;
    }

    function clearErrors() {
      Array.prototype.forEach.call(form.querySelectorAll(".is-invalid"), function (el) {
        el.classList.remove("is-invalid");
      });
      if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = "";
      }
    }

    function showErrors() {
      clearErrors();

      var missing = [];
      var first = null;
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.willValidate || el.checkValidity()) return;
        var wrap = el.closest(".field, .fieldset");
        if (wrap) wrap.classList.add("is-invalid");
        var name = labelFor(el);
        if (missing.indexOf(name) === -1) missing.push(name);
        if (!first) first = wrap || el;
      });

      if (errorBox && missing.length) {
        errorBox.textContent =
          (missing.length === 1 ? "One answer is missing: " : "Some answers are missing: ") +
          missing.join(" • ");
        errorBox.hidden = false;
      }

      if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    // Clear a field's mark as soon as it is filled in, so the page stops
    // shouting the moment the visitor fixes it.
    form.addEventListener("input", function (event) {
      var wrap = event.target.closest && event.target.closest(".field, .fieldset");
      if (wrap && wrap.classList.contains("is-invalid") && event.target.checkValidity()) {
        wrap.classList.remove("is-invalid");
      }
    });
    form.addEventListener("change", function (event) {
      var wrap = event.target.closest && event.target.closest(".field, .fieldset");
      if (wrap && wrap.classList.contains("is-invalid") && event.target.checkValidity()) {
        wrap.classList.remove("is-invalid");
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        showErrors();
        return;
      }
      clearErrors();

      // Serialise every field generically, so adding or removing inputs in the
      // markup needs no change here. Checkbox groups share a name, so their
      // values collect under one key.
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

      /* Two renderings of the same answers.

         `body` is plain text and is what the compose links carry — mailto:
         and Gmail's body parameter accept nothing else, so the structure has
         to come from bullets, indentation and blank lines rather than markup.

         `html` is the same thing with real headings, lists and an indented
         block for free text. It goes on the clipboard alongside the plain
         text, so pasting into Gmail — a rich text editor — gives the
         formatted version. */

      /* How a field is rendered follows what kind of input it is, not how
         long the answer happens to be — so "Cybertruck Services" bullets even
         when only one box is ticked, and the notes fields sit in their own
         block even when the answer is short. Length alone made a one-choice
         group look like a plain sentence and buried short notes mid-line. */
      var kindOf = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || kindOf[el.name]) return;
        if (el.type === "checkbox") kindOf[el.name] = "list";
        else if (el.tagName === "TEXTAREA" || el.hasAttribute("data-longform")) kindOf[el.name] = "block";
      });

      function esc(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      var textParts = [];
      var htmlParts = [];

      groups.forEach(function (key) {
        var vals = byName[key];
        var kind = kindOf[key];

        if (kind === "list" || vals.length > 1) {
          // Chosen options: one bullet each, however many were ticked.
          textParts.push(key + ":\n" + vals.map(function (v) { return "  • " + v; }).join("\n"));
          htmlParts.push(
            "<p style=\"margin:0 0 4px\"><strong>" + esc(key) + ":</strong></p>" +
            "<ul style=\"margin:0 0 14px;padding-left:22px\">" +
            vals.map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") +
            "</ul>"
          );
          return;
        }

        var val = vals[0];

        if (kind === "block") {
          // Their own words: set apart so it reads as prose rather than
          // running on from the label.
          var indented = val.split("\n").map(function (line) { return "    " + line; }).join("\n");
          textParts.push(key + ":\n" + indented);
          htmlParts.push(
            "<p style=\"margin:0 0 4px\"><strong>" + esc(key) + ":</strong></p>" +
            '<div style="margin:0 0 14px 22px;padding-left:12px;border-left:3px solid #d9d9d9;color:#444">' +
            esc(val).replace(/\n/g, "<br>") + "</div>"
          );
          return;
        }

        // A single fact: keep it on the label's line.
        textParts.push(key + ": " + val);
        htmlParts.push(
          "<p style=\"margin:0 0 10px\"><strong>" + esc(key) + ":</strong> " + esc(val) + "</p>"
        );
      });

      var body = textParts.join("\n\n");
      var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' +
        htmlParts.join("") +
        "</div>";

      var name = (byName["First & Last Name"] || byName.name || [""])[0];
      var subject = "Enquiry — " + (name || "Ace Spaders");

      var encSubject = encodeURIComponent(subject);
      var encBody = encodeURIComponent(body);

      // Three routes to the same message. Gmail and Outlook are ordinary web
      // pages, so they work for people who have no mail application at all —
      // which mailto: cannot serve, and which is most people reading mail in
      // a browser tab.
      var gmail =
        "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(mailto) +
        "&su=" + encSubject + "&body=" + encBody;
      var outlook =
        "https://outlook.live.com/mail/0/deeplink/compose?to=" + encodeURIComponent(mailto) +
        "&subject=" + encSubject + "&body=" + encBody;
      var mailFull = "mailto:" + mailto + "?subject=" + encSubject + "&body=" + encBody;

      // The three have very different ceilings, so they are judged separately.
      // mailto: is the tight one — desktop clients start truncating around a
      // couple of thousand characters — while Gmail and Outlook are ordinary
      // URLs and carry far more. Applying the mailto limit to all three (as
      // this did at first) would strip the answers out of the Gmail link for
      // no reason, which is the route most people here actually take.
      var mailLong = mailFull.length > 1900;
      var webLong = Math.max(gmail.length, outlook.length) > URL_LIMIT;

      var mailHref = mailLong ? "mailto:" + mailto + "?subject=" + encSubject : mailFull;
      var gmailHref = webLong
        ? "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(mailto) + "&su=" + encSubject
        : gmail;
      var outlookHref = webLong
        ? "https://outlook.live.com/mail/0/deeplink/compose?to=" + encodeURIComponent(mailto) + "&subject=" + encSubject
        : outlook;

      // Only warn when something really will arrive empty.
      var tooLong = mailLong || webLong;

      // The panel is shown and nothing is auto-opened. Firing a mailto: at a
      // machine with no mail client does nothing visible, which is exactly
      // what made a successful submit look like a failure; and opening a tab
      // unasked would be worse. The visitor picks the route they actually use.
      if (handoff) {
        if (textEl) textEl.value = body;
        if (copyBtn) copyBtn.setAttribute("data-html", html);
        if (mailLink) mailLink.href = mailHref;
        if (gmailLink) gmailLink.href = gmailHref;
        if (outlookLink) outlookLink.href = outlookHref;
        if (truncNote) truncNote.hidden = !tooLong;
        handoff.hidden = false;
        handoff.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });

    /* -- copy button ------------------------------------------------------
       Copies the message in two flavours at once: text/html and text/plain.
       Gmail's compose window is a rich text editor, so pasting there picks up
       the HTML and the enquiry arrives with bold labels, real bullets and the
       free writing set off in its own block — the formatting a compose URL
       cannot carry. Anywhere that only understands plain text gets the plain
       text, so nothing is lost either way. */

    if (copyBtn && textEl) {
      copyBtn.addEventListener("click", function () {
        function done(state) {
          var label = copyBtn.querySelector("span") || copyBtn;
          label.textContent =
            state === "rich" ? "Copied — paste into your email" :
            state === "plain" ? "Copied" :
            "Press Ctrl/Cmd + C";
          window.setTimeout(function () {
            label.textContent = "Copy the message";
          }, 3200);
        }

        // Select it either way: if the clipboard API is refused, that leaves
        // the text ready for a manual copy rather than leaving them stuck.
        textEl.focus();
        textEl.select();

        var richHtml = copyBtn.getAttribute("data-html") || "";

        // ClipboardItem is what allows both flavours on the clipboard at once.
        if (richHtml && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
          try {
            var item = new window.ClipboardItem({
              "text/html": new Blob([richHtml], { type: "text/html" }),
              "text/plain": new Blob([textEl.value], { type: "text/plain" })
            });
            navigator.clipboard.write([item]).then(
              function () { done("rich"); },
              function () { plainCopy(); }
            );
            return;
          } catch (err) {
            // Older browsers throw on the ClipboardItem constructor.
            plainCopy();
            return;
          }
        }
        plainCopy();

        function plainCopy() {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textEl.value).then(
              function () { done("plain"); },
              function () { done(false); }
            );
            return;
          }
          done(false);
        }
      });
    }
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

      // Publish progress for CSS. The lettering slides left across the scrub
      // by reading this; nothing here knows that, so retuning the movement —
      // or removing it — is a CSS-only change.
      section.style.setProperty("--hero-progress", eased.toFixed(4));

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

  /* ------------------------------------------------------------------------
     Work tiles
     Each tile holds a short clip that never plays. Its position in the clip
     is set from how close the cursor is — the same idea as the hero, with
     distance standing in for scroll:

       70px outside the tile's border ... first frame
       the tile's centre ............... last frame
       between ........................ proportional

     Because it is a position rather than a playback, moving away runs it
     backwards exactly, and it never has to be stopped, restarted or
     reversed.

     The 70px is measured along the line from the tile's centre through the
     cursor, so it means the same thing whichever side you approach from — a
     wide tile does not trigger early at its long edges.
     ---------------------------------------------------------------------- */

  function initWork() {
    var group = document.querySelector("[data-work-group]");
    var items = document.querySelectorAll("[data-work]");
    if (!group || !items.length) return;

    var MARGIN = 70;      // how far outside the border the clip starts
    var EASE = 0.18;      // how hard the clip chases the cursor
    var SETTLED = 0.001;  // close enough to stop the loop
    var MIN_SEEK = 1 / 48;

    var tiles = Array.prototype.map.call(items, function (el) {
      return {
        el: el,
        video: el.querySelector("[data-work-video]"),
        target: 0,
        eased: 0,
        ready: false,
        duration: 0
      };
    });

    var count = tiles.length;
    var active = 0;

    /* -- carousel ---------------------------------------------------------
       One tile centred at full size, the rest tucked behind it at either
       side. Rotating only re-assigns those roles; the movement itself is the
       CSS transition on .work__item, so position, scale, blur and opacity
       all travel together on one curve.

       This runs whatever the pointer is. Rotating is a deliberate act — a
       tap works as well as a click — so unlike the cursor scrub below it is
       not gated behind a fine pointer. */

    group.classList.add("work--carousel");

    // The stage is absolutely positioned, so it has no height of its own.
    // Measured from the frame and the tallest caption rather than from the
    // tiles: the tiles are given this height, so reading it back off them
    // would only ever return what was set last time. The tallest caption
    // wins so the section does not resize as a longer one rotates in.
    function measure() {
      var frame = tiles[0].el.querySelector(".work__frame");
      var frameH = frame ? frame.offsetHeight : 0;
      if (!frameH) return;

      var capH = 0;
      for (var i = 0; i < count; i++) {
        var cap = tiles[i].el.querySelector(".work__caption");
        if (cap && cap.offsetHeight > capH) capH = cap.offsetHeight;
      }

      group.style.setProperty("--stage-h", frameH + capH - 2 + "px");
      group.style.setProperty("--lift", capH / 2 + "px");
    }

    function apply() {
      for (var i = 0; i < count; i++) {
        var step = (i - active + count) % count;
        var el = tiles[i].el;
        var isCenter = step === 0;
        var isRight = step === 1;
        var isLeft = !isRight && step === count - 1;

        el.classList.toggle("is-center", isCenter);
        el.classList.toggle("is-side", !isCenter);
        el.classList.toggle("is-right", isRight);
        el.classList.toggle("is-left", isLeft);
        // Any fourth or later tile waits behind the centre rather than
        // stacking on a side that is already occupied.
        el.classList.toggle("is-back", !isCenter && !isRight && !isLeft);

        // A tile behind another is decoration, not a target.
        el.setAttribute("aria-hidden", isCenter ? "false" : "true");
      }
      if (countEl) {
        countEl.innerHTML = "<b>" + (active + 1) + "</b> / " + count;
      }
      wake();
    }

    function go(delta) {
      active = (active + delta + count) % count;
      apply();
    }

    /* -- controls ---------------------------------------------------------
       Written from JS so a visitor without it is never shown arrows that
       cannot move anything. */

    var nav = document.querySelector("[data-work-nav]");
    var countEl = null;

    if (nav) {
      nav.innerHTML =
        '<button class="work__arrow" type="button" data-work-prev aria-label="Previous piece of work">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8"/></svg></button>' +
        '<p class="work__count" data-work-count aria-live="polite"></p>' +
        '<button class="work__arrow" type="button" data-work-next aria-label="Next piece of work">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8"/></svg></button>';
      nav.hidden = false;
      countEl = nav.querySelector("[data-work-count]");

      nav.querySelector("[data-work-prev]").addEventListener("click", function () {
        go(-1);
      });
      nav.querySelector("[data-work-next]").addEventListener("click", function () {
        go(1);
      });

      // Arrow keys work once either button has been used, which is the point
      // at which someone is driving the carousel rather than reading past it.
      nav.addEventListener("keydown", function (event) {
        if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      });
    }

    // Drag or swipe across the stage. The threshold keeps a click from
    // registering as a flick.
    var dragX = null;
    var swiped = false;

    group.addEventListener("pointerdown", function (event) {
      dragX = event.clientX;
      swiped = false;
    }, { passive: true });

    group.addEventListener("pointerup", function (event) {
      if (dragX === null) return;
      var dx = event.clientX - dragX;
      dragX = null;
      if (Math.abs(dx) > 40) {
        // A swipe that began on a side tile would otherwise rotate once for
        // the swipe and again for the click it turns into.
        swiped = true;
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    // Clicking a tile at either side brings it to the centre.
    tiles.forEach(function (tile, i) {
      tile.el.addEventListener("click", function () {
        if (swiped || i === active) return;
        active = i;
        apply();
      });
    });

    apply();
    measure();
    window.addEventListener("resize", measure, { passive: true });
    // Web fonts land after first paint and change the caption's height.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure);
    }

    /* -- cursor scrub ------------------------------------------------------
       Only the centred tile scrubs. The others are scaled down and blurred,
       so seeking them every frame would buy nothing visible. */

    var scrub =
      !REDUCED_MOTION.matches &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    var px = -99999;
    var py = -99999;
    var running = false;

    /* -- how far through the clip this tile should be --------------------- */
    function progressFor(tile) {
      var r = tile.el.getBoundingClientRect();
      if (!r.width || !r.height) return 0;

      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var vx = px - cx;
      var vy = py - cy;
      var dist = Math.sqrt(vx * vx + vy * vy);
      if (dist === 0) return 1;

      // Where the line from the centre through the cursor crosses the border.
      var hw = r.width / 2;
      var hh = r.height / 2;
      var tx = vx === 0 ? Infinity : (hw * dist) / Math.abs(vx);
      var ty = vy === 0 ? Infinity : (hh * dist) / Math.abs(vy);
      var border = Math.min(tx, ty);

      var outer = border + MARGIN;
      var p = 1 - dist / outer;
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    function tick() {
      var busy = false;

      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        // A tile at either side is scaled down and blurred; scrubbing it
        // would cost a seek a frame and show nothing. Off-centre tiles run
        // back to their first frame instead.
        t.target = i === active ? progressFor(t) : 0;
        t.eased += (t.target - t.eased) * EASE;

        var settled = Math.abs(t.target - t.eased) < SETTLED;
        if (settled) t.eased = t.target;
        else busy = true;

        t.el.classList.toggle("is-near", i === active && t.target > 0);

        if (t.ready && t.duration) {
          var time = t.eased * t.duration;
          if (time > t.duration - 0.001) time = t.duration - 0.001;
          // Assigning currentTime mid-seek redirects it rather than queueing,
          // which is what keeps a fast sweep across the row from backing up.
          if (Math.abs(t.video.currentTime - time) > MIN_SEEK) {
            t.video.currentTime = time;
          }
        }
      }

      if (!busy) {
        running = false;
        return;
      }
      window.requestAnimationFrame(tick);
    }

    function wake() {
      if (running) return;
      running = true;
      window.requestAnimationFrame(tick);
    }

    // No pointer to approach with, or reduced motion asked for: the carousel
    // above still rotates, but nothing scrubs and no clip is fetched. Marking
    // the videos ready lets their posters show — without it the frames sit
    // empty waiting for a scrub that will never come.
    if (!scrub) {
      tiles.forEach(function (t) {
        if (t.video) t.video.classList.add("is-ready");
      });
      return;
    }

    window.addEventListener(
      "pointermove",
      function (event) {
        px = event.clientX;
        py = event.clientY;
        wake();
      },
      { passive: true }
    );

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });

    document.addEventListener("pointerleave", function () {
      px = -99999;
      py = -99999;
      wake();
    });

    /* -- loading ----------------------------------------------------------
       Three clips is a megabyte and a half, and the section is well below
       the fold, so nothing is fetched until it is nearly in view. Scrubbing
       then waits for the clip to be buffered end to end: seeking through a
       half-downloaded file turns every frame into a range request, which is
       the stutter this is meant to avoid. */

    function load(tile) {
      var v = tile.video;
      if (!v || v.getAttribute("src")) return;

      v.addEventListener("loadedmetadata", function () {
        tile.duration = v.duration || 0;
      });

      function check() {
        if (tile.ready || !tile.duration) return;
        var b = v.buffered;
        if (!b.length || b.end(b.length - 1) < tile.duration - 0.25) return;
        tile.ready = true;
        v.classList.add("is-ready");
        wake();
      }

      v.addEventListener("progress", check);
      v.addEventListener("canplaythrough", check);
      // A clip that never reports itself fully buffered would otherwise stay
      // on its poster for good.
      window.setTimeout(function () {
        if (!tile.ready && tile.duration) {
          tile.ready = true;
          v.classList.add("is-ready");
          wake();
        }
      }, 9000);

      // Nothing should ever play it.
      v.addEventListener("play", function () { v.pause(); });

      v.preload = "auto";
      v.src = v.getAttribute("data-src");
    }

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var tile = tiles.filter(function (t) { return t.el === entry.target; })[0];
            if (tile) load(tile);
            io.unobserve(entry.target);
          });
        },
        { rootMargin: "300px 0px" }
      );
      tiles.forEach(function (t) { io.observe(t.el); });
    } else {
      tiles.forEach(load);
    }
  }

  /* ------------------------------------------------------------------------
     Magnetic elements
     Buttons and marks lean toward the cursor once it is within reach, then
     spring back when it leaves.

     The spring is a velocity integration rather than a lerp: a lerp only ever
     approaches its target, so the element would glide back and stop dead. A
     little stored velocity carries it just past centre and settles, which is
     the part that reads as physical.
     ---------------------------------------------------------------------- */

  function initMagnetic() {
    if (!pointerEffectsWanted()) return;

    var SELECTOR = ".btn, .pulse-btn, .work__arrow, .wordmark";
    var els = document.querySelectorAll(SELECTOR);
    if (!els.length) return;

    var REACH = 90;        // how far outside the element it starts pulling
    var PULL = 0.32;       // fraction of the gap the element closes
    var STIFFNESS = 0.14;
    var DAMPING = 0.74;    // under 1, so it overshoots slightly and settles
    var SETTLED = 0.01;

    var nodes = Array.prototype.map.call(els, function (el) {
      el.classList.add("is-magnetic");
      return { el: el, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    });

    var px = -99999;
    var py = -99999;
    var running = false;

    function retarget(n) {
      var r = n.el.getBoundingClientRect();
      if (!r.width) { n.tx = 0; n.ty = 0; return; }

      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;

      // Reach is measured from the element's edge, not its centre, so a wide
      // button does not start pulling from further away than a small one.
      var gapX = Math.max(Math.abs(px - cx) - r.width / 2, 0);
      var gapY = Math.max(Math.abs(py - cy) - r.height / 2, 0);

      if (Math.sqrt(gapX * gapX + gapY * gapY) > REACH) {
        n.tx = 0;
        n.ty = 0;
        return;
      }

      n.tx = (px - cx) * PULL;
      n.ty = (py - cy) * PULL;
    }

    function tick() {
      var busy = false;

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        retarget(n);

        n.vx = (n.vx + (n.tx - n.x) * STIFFNESS) * DAMPING;
        n.vy = (n.vy + (n.ty - n.y) * STIFFNESS) * DAMPING;
        n.x += n.vx;
        n.y += n.vy;

        var still =
          Math.abs(n.vx) < SETTLED && Math.abs(n.vy) < SETTLED &&
          Math.abs(n.tx - n.x) < SETTLED && Math.abs(n.ty - n.y) < SETTLED;

        if (still) {
          n.x = n.tx;
          n.y = n.ty;
          n.vx = 0;
          n.vy = 0;
        } else {
          busy = true;
        }

        n.el.style.setProperty("--mx", n.x.toFixed(2) + "px");
        n.el.style.setProperty("--my", n.y.toFixed(2) + "px");
      }

      if (!busy) {
        running = false;
        return;
      }
      window.requestAnimationFrame(tick);
    }

    function wake() {
      if (running) return;
      running = true;
      window.requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", function (event) {
      px = event.clientX;
      py = event.clientY;
      wake();
    }, { passive: true });

    // Scrolling moves elements under a stationary cursor, so the pull has to
    // be recomputed even though the pointer has not moved.
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });

    document.addEventListener("pointerleave", function () {
      px = -99999;
      py = -99999;
      wake();
    });
  }

  /* ------------------------------------------------------------------------
     Spotlight text
     Lays a bright duplicate of the text over the original and masks it to a
     disc under the cursor.

     The duplicate is a clone rather than attr(content) because the text has
     markup inside it — the tagline's <strong> and <em> would be lost by an
     attribute round-trip. Cloning keeps the line breaking identical too,
     which is what makes the two copies sit exactly on top of each other.
     ---------------------------------------------------------------------- */

  function initSpotlight() {
    if (!pointerEffectsWanted()) return;

    var targets = document.querySelectorAll("[data-spotlight]");
    if (!targets.length) return;

    var PAD = 60;   // how far outside the text the disc still reaches
    var items = [];

    Array.prototype.forEach.call(targets, function (el) {
      var lit = document.createElement("span");
      lit.className = "spotlight__lit";
      lit.setAttribute("aria-hidden", "true");
      lit.innerHTML = el.innerHTML;
      el.appendChild(lit);
      items.push({ el: el, lit: lit });
    });

    var ticking = false;
    var px = 0;
    var py = 0;

    function update() {
      ticking = false;

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = it.el.getBoundingClientRect();

        if (
          px < r.left - PAD || px > r.right + PAD ||
          py < r.top - PAD || py > r.bottom + PAD
        ) {
          it.lit.style.setProperty("--spot-x", "-9999px");
          it.lit.style.setProperty("--spot-y", "-9999px");
          continue;
        }

        it.lit.style.setProperty("--spot-x", (px - r.left).toFixed(1) + "px");
        it.lit.style.setProperty("--spot-y", (py - r.top).toFixed(1) + "px");
      }
    }

    function wake() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("pointermove", function (event) {
      px = event.clientX;
      py = event.clientY;
      wake();
    }, { passive: true });

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
  }

  /* ------------------------------------------------------------------------
     Tilt
     The centred work tile's frame tips toward the cursor.

     Only the frame is tilted, not the whole tile: the tile is already
     carrying the carousel's 650ms transition, and a tilt sharing it would
     trail half a second behind the pointer.
     ---------------------------------------------------------------------- */

  function initTilt() {
    if (!pointerEffectsWanted()) return;
    if (!document.querySelector("[data-work]")) return;

    var MAX = 7;      // degrees at the very corner
    var REACH = 40;   // keeps the tilt alive just outside the frame
    var current = null;
    var ticking = false;
    var px = 0;
    var py = 0;

    function clear(frame) {
      if (!frame) return;
      frame.style.setProperty("--tilt-x", "0deg");
      frame.style.setProperty("--tilt-y", "0deg");
    }

    function update() {
      ticking = false;

      var item = document.querySelector("[data-work].is-center");
      var frame = item && item.querySelector(".work__frame");

      // The centred tile changes as the carousel rotates; the one being left
      // behind has to be levelled or it keeps the last angle it was given.
      if (frame !== current) {
        clear(current);
        current = frame;
      }
      if (!frame) return;

      var r = frame.getBoundingClientRect();
      if (!r.width) return;

      if (
        px < r.left - REACH || px > r.right + REACH ||
        py < r.top - REACH || py > r.bottom + REACH
      ) {
        clear(frame);
        return;
      }

      // -1..1 from the frame's centre, clamped so the corners are the limit.
      var nx = (px - (r.left + r.width / 2)) / (r.width / 2);
      var ny = (py - (r.top + r.height / 2)) / (r.height / 2);
      nx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
      ny = ny < -1 ? -1 : ny > 1 ? 1 : ny;

      // Y drives rotateX inverted: cursor above the middle should tip the top
      // of the frame away, not toward.
      frame.style.setProperty("--tilt-x", (-ny * MAX).toFixed(2) + "deg");
      frame.style.setProperty("--tilt-y", (nx * MAX).toFixed(2) + "deg");
    }

    function wake() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener("pointermove", function (event) {
      px = event.clientX;
      py = event.clientY;
      wake();
    }, { passive: true });

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
  }

  /* ------------------------------------------------------------------------
     Figures
     Each number scrambles through digits before settling on its value, once,
     as it scrolls into view.

     The scramble is drawn at the target's digit count from the first frame,
     so the line never changes width as it runs; the CSS asks for tabular
     figures so it does not change width between digits either.
     ---------------------------------------------------------------------- */

  function initFigures() {
    var nums = document.querySelectorAll("[data-count-to]");
    if (!nums.length) return;

    // The final value is already in the markup, so with no IntersectionObserver
    // and under reduced motion the right number is simply there.
    if (REDUCED_MOTION.matches || !("IntersectionObserver" in window)) return;

    var DURATION = 1100;
    var SETTLE = 0.55;   // fraction of the run spent scrambling

    function run(el) {
      var target = parseInt(el.getAttribute("data-count-to"), 10) || 0;
      var digits = String(target).length;
      var start = 0;

      // Every frame is drawn at the target's digit count, so counting up to 20
      // reads 07, 15, 20 rather than 7, 15, 20 — which would step the number's
      // width mid-run and shove a centred figure sideways.
      function pad(value) {
        var out = String(value);
        while (out.length < digits) out = "0" + out;
        return out;
      }

      function frame(now) {
        if (!start) start = now;
        var p = (now - start) / DURATION;
        if (p >= 1) {
          el.textContent = String(target);
          return;
        }

        if (p < SETTLE) {
          var out = "";
          for (var i = 0; i < digits; i++) {
            out += Math.floor(Math.random() * 10);
          }
          el.textContent = out;
        } else {
          // Past the scramble, count the rest of the way up so it lands on
          // the number rather than snapping to it.
          var k = (p - SETTLE) / (1 - SETTLE);
          var eased = 1 - Math.pow(1 - k, 3);
          el.textContent = pad(Math.round(target * eased));
        }
        window.requestAnimationFrame(frame);
      }

      window.requestAnimationFrame(frame);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        run(entry.target);
      });
    }, { threshold: 0.6 });

    Array.prototype.forEach.call(nums, function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     Ticker
     A strip that drifts on its own and is pushed along by the scroll, blurring
     in proportion to how fast it is moving.

     The list is duplicated until the track is comfortably wider than the
     viewport, then the offset wraps at one list's width. Because every copy is
     identical, wrapping lands on a pixel that looks the same as the one it
     left, so the loop has no seam.
     ---------------------------------------------------------------------- */

  function initTicker() {
    var ticker = document.querySelector("[data-ticker]");
    if (!ticker) return;

    var track = ticker.querySelector("[data-ticker-track]");
    var list = ticker.querySelector("[data-ticker-list]");
    if (!track || !list) return;

    var DRIFT = 0.35;        // px per frame with the page still
    var SCROLL_PUSH = 0.55;  // px of travel per px of scroll
    var BLUR_PER_PX = 0.42;
    var MAX_BLUR = 7;
    var FRICTION = 0.86;     // how fast the scroll's push bleeds away

    var span = 0;
    var offset = 0;
    var push = 0;
    var lastScroll = window.scrollY;
    var visible = false;
    var running = false;

    function fill() {
      // Reset to one list before measuring, so a resize does not keep adding
      // copies on top of the copies made last time.
      while (list.nextSibling) track.removeChild(list.nextSibling);
      span = list.getBoundingClientRect().width;
      if (!span) return;

      var needed = Math.ceil(window.innerWidth / span) + 1;
      for (var i = 0; i < needed; i++) {
        var copy = list.cloneNode(true);
        copy.removeAttribute("data-ticker-list");
        track.appendChild(copy);
      }
    }

    function tick() {
      if (!visible || !span) {
        running = false;
        return;
      }

      offset += DRIFT + push;
      push *= FRICTION;
      if (Math.abs(push) < 0.01) push = 0;

      // Wrap in both directions: a fast scroll up can drive the offset
      // negative before the drift has caught up.
      offset %= span;
      if (offset < 0) offset += span;

      var blur = Math.min(Math.abs(DRIFT + push) * BLUR_PER_PX, MAX_BLUR);

      track.style.transform = "translate3d(" + (-offset).toFixed(2) + "px, 0, 0)";
      track.style.filter = blur > 0.15 ? "blur(" + blur.toFixed(2) + "px)" : "";

      window.requestAnimationFrame(tick);
    }

    function wake() {
      if (running || !visible) return;
      running = true;
      window.requestAnimationFrame(tick);
    }

    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      push += (y - lastScroll) * SCROLL_PUSH;
      lastScroll = y;
      wake();
    }, { passive: true });

    window.addEventListener("resize", function () {
      fill();
      wake();
    }, { passive: true });

    fill();

    // Off-screen the loop is pure waste — it is a fixed-cost repaint of a
    // blurred, full-width strip nobody can see.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        wake();
      }, { rootMargin: "100px 0px" }).observe(ticker);
    } else {
      visible = true;
      wake();
    }

    if (REDUCED_MOTION.matches) {
      visible = false;
      track.style.transform = "";
      track.style.filter = "";
    }
  }

  function init() {
    initHeader();
    initNav();
    initScrollSpy();
    initReveal();
    initCursor();
    initContactForm();
    initScrollHero();
    initWork();
    initMagnetic();
    initSpotlight();
    initTilt();
    initFigures();
    initTicker();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
