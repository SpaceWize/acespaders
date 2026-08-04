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
    var items = document.querySelectorAll("[data-work]");
    if (!items.length) return;

    // No pointer to approach, or reduced motion asked for: leave the posters
    // showing with their captions, and never fetch the clips.
    if (
      REDUCED_MOTION.matches ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      Array.prototype.forEach.call(items, function (el) {
        el.classList.add("is-static");
      });
      return;
    }

    var MARGIN = 120;      // how far outside the border the clip starts
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
        t.target = progressFor(t);
        t.eased += (t.target - t.eased) * EASE;

        var settled = Math.abs(t.target - t.eased) < SETTLED;
        if (settled) t.eased = t.target;
        else busy = true;

        t.el.classList.toggle("is-near", t.target > 0);

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

  function init() {
    initHeader();
    initNav();
    initScrollSpy();
    initReveal();
    initCursor();
    initContactForm();
    initScrollHero();
    initWork();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
