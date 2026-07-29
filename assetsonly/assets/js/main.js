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
     Gallery lightbox
     Uses a native <dialog>, which gives us Escape-to-close, focus trapping
     and background inertness for free. Arrow keys step through the set.
     ---------------------------------------------------------------------- */

  function initLightbox() {
    var dialog = document.querySelector("[data-lightbox]");
    var triggers = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox-open]"));
    if (!dialog || !triggers.length || typeof dialog.showModal !== "function") return;

    var media = dialog.querySelector("[data-lightbox-media]");
    var caption = dialog.querySelector("[data-lightbox-caption]");
    var counter = dialog.querySelector("[data-lightbox-counter]");
    var closeBtn = dialog.querySelector("[data-lightbox-close]");
    var index = 0;

    function show(next) {
      // Wrap around at both ends.
      index = (next + triggers.length) % triggers.length;

      var trigger = triggers[index];
      var img = trigger.querySelector("img");
      var text = trigger.getAttribute("data-caption") || "";

      media.innerHTML = "";

      if (img) {
        var full = document.createElement("img");
        full.src = img.getAttribute("data-full") || img.currentSrc || img.src;
        full.alt = img.alt || text;
        media.appendChild(full);
        media.removeAttribute("data-placeholder");
      } else {
        // No image supplied yet — fall back to the spade placeholder.
        media.setAttribute("data-placeholder", "");
      }

      caption.textContent = text;
      counter.textContent = index + 1 + " / " + triggers.length;
    }

    triggers.forEach(function (trigger, i) {
      trigger.addEventListener("click", function () {
        show(i);
        dialog.showModal();
      });
    });

    dialog.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        show(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(index - 1);
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        dialog.close();
      });
    }

    // Clicking the backdrop closes. The backdrop is the dialog element
    // itself, so ignore clicks that landed on any child.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    // Return focus to the tile that opened the dialog.
    dialog.addEventListener("close", function () {
      var trigger = triggers[index];
      if (trigger) trigger.focus();
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

      var data = new FormData(form);
      var name = (data.get("name") || "").toString().trim();
      var subject = "Enquiry — " + (name || "Ace Spaders");

      var body = [
        "Name: " + (data.get("name") || ""),
        "Email: " + (data.get("email") || ""),
        "Organisation: " + (data.get("organisation") || ""),
        "Engagement: " + (data.get("engagement") || ""),
        "",
        (data.get("message") || "").toString()
      ].join("\n");

      window.location.href =
        "mailto:" + mailto +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);
    });
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
    initLightbox();
    initContactForm();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
