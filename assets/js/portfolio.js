/* Project slideshows: one independent 0-based index per [data-slideshow].
   Prev/next wrap around; a dot jumps straight to its slide. Slides advance on
   their own every 5s, but only in the one slideshow most in view — three
   carousels rotating at once competes with reading the descriptions.
   Clicking a screenshot opens it full-size in a lightbox. */
(function () {
  'use strict';

  var AUTOPLAY_MS = 5000;
  var MIN_VISIBLE = 0.25; /* below this a slideshow is never the elected one */

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function pageHidden() { return document.visibilityState === 'hidden'; }

  /* One record per slideshow; `elected` is granted to at most one at a time. */
  var shows = [];

  function elect() {
    var best = null;
    for (var i = 0; i < shows.length; i++) {
      if (shows[i].ratio < MIN_VISIBLE) continue;
      if (!best || shows[i].ratio > best.ratio) best = shows[i];
    }
    for (var j = 0; j < shows.length; j++) {
      shows[j].elected = shows[j] === best;
      shows[j].resync();
    }
  }

  /* A fine threshold list keeps `ratio` current as the page scrolls, so the
     election follows the reader rather than snapping at one cutoff. */
  var thresholds = [];
  for (var t = 0; t <= 10; t++) thresholds.push(t / 10);

  var observer = window.IntersectionObserver
    ? new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var show = entries[i].target.showRecord;
          if (show) show.ratio = entries[i].isIntersecting ? entries[i].intersectionRatio : 0;
        }
        elect();
      }, { threshold: thresholds })
    : null;

  document.addEventListener('visibilitychange', elect);
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', elect);

  /* — lightbox —
     One dialog shared by every slideshow. While open it drives the underlying
     carousel too, so closing leaves that project on whichever slide you were
     last looking at. */
  var lightbox = (function () {
    var el = document.getElementById('lightbox');
    if (!el || !el.showModal) return null; /* no <dialog> support: images stay inline */

    var img = el.querySelector('[data-lightbox-img]');
    var caption = el.querySelector('[data-lightbox-caption]');
    var prevBtn = el.querySelector('[data-lightbox-prev]');
    var nextBtn = el.querySelector('[data-lightbox-next]');
    var current = null;
    var opener = null;

    function paint() {
      var source = current.slides[current.index].querySelector('img');
      if (!source) return;
      img.src = source.currentSrc || source.src;
      img.alt = source.alt || '';
      var text = current.captions[current.index];
      caption.textContent = text ? text.textContent.trim() : '';
      var many = current.count > 1;
      prevBtn.hidden = !many;
      nextBtn.hidden = !many;
    }

    function step(dir) {
      current.index = (current.index + dir + current.count) % current.count;
      current.go(current.index, dir); /* keep the page carousel in step */
      paint();
    }

    function open(show, index) {
      current = { slides: show.slides, captions: show.captions, count: show.count,
                  go: show.go, index: index };
      opener = document.activeElement;
      show.lock(true); /* the carousel underneath shouldn't advance while open */
      current.owner = show;
      paint();
      lockScroll(true);
      el.showModal();
    }

    /* <dialog> traps focus but not scrolling. Padding the gap the scrollbar
       leaves behind keeps the page from shifting sideways as it locks. */
    function lockScroll(on) {
      var root = document.documentElement;
      if (on) {
        var gap = window.innerWidth - root.clientWidth;
        if (gap > 0) document.body.style.paddingRight = gap + 'px';
        root.classList.add('scroll-locked');
        document.body.classList.add('scroll-locked');
      } else {
        root.classList.remove('scroll-locked');
        document.body.classList.remove('scroll-locked');
        document.body.style.paddingRight = '';
      }
    }

    /* Click away to dismiss: anything that isn't the image itself or one of the
       controls counts as outside — the dialog fills the viewport, so most
       "backdrop" clicks actually land on it or on the stage around the image. */
    el.addEventListener('click', function (e) {
      if (e.target === img) return;
      if (e.target.closest && e.target.closest('button')) return;
      el.close();
    });
    el.querySelector('[data-lightbox-close]').addEventListener('click', function () { el.close(); });
    prevBtn.addEventListener('click', function () { step(-1); });
    nextBtn.addEventListener('click', function () { step(1); });

    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    el.addEventListener('close', function () {
      lockScroll(false);
      if (current && current.owner) current.owner.lock(false);
      if (opener && opener.focus) opener.focus();
      current = null;
      opener = null;
      img.removeAttribute('src');
    });

    return { open: open };
  })();

  function initSlideshow(root) {
    var slides = root.querySelectorAll('[data-slide]');
    var dots = root.querySelectorAll('[data-dot]');
    var captions = root.querySelectorAll('[data-caption]');
    var count = slides.length;
    if (!count) return;

    var active = 0;
    var leaving = null;

    function toggle(el, on) {
      if (on) el.setAttribute('data-active', '');
      else el.removeAttribute('data-active');
    }

    /* Dots and captions switch instantly; only the images slide. */
    function renderChrome() {
      for (var i = 0; i < count; i++) {
        if (dots[i]) {
          toggle(dots[i], i === active);
          dots[i].setAttribute('aria-current', i === active ? 'true' : 'false');
        }
        if (captions[i]) toggle(captions[i], i === active);
      }
    }

    /* Park a slide off-stage without animating it there, cancelling any exit
       it was still in the middle of. */
    function reset(el, offset) {
      if (el.exitHandler) {
        el.removeEventListener('transitionend', el.exitHandler);
        el.exitHandler = null;
      }
      el.removeAttribute('data-leaving');
      place(el, offset + '%', false);
      void el.offsetWidth; /* flush, or the jump and the animation coalesce */
    }

    /* `x` is any CSS length: '0', '100%', '-40px', 'calc(100% + -40px)'.
       Drag frames call this continuously, so it stays free of forced layout —
       callers that jump and animate within one frame flush it themselves. */
    function place(el, x, animate) {
      el.style.transition = animate ? '' : 'none';
      el.style.transform = 'translateX(' + x + ')';
    }

    /* Hand a slide off to its exit animation and hide it once it lands. */
    function exit(outgoing, dir) {
      outgoing.removeAttribute('data-active');
      outgoing.removeAttribute('data-dragging');
      outgoing.setAttribute('data-leaving', '');
      place(outgoing, (-dir * 100) + '%', true);
      leaving = outgoing;

      outgoing.exitHandler = function (e) {
        if (e.propertyName !== 'transform') return;
        outgoing.removeEventListener('transitionend', outgoing.exitHandler);
        outgoing.exitHandler = null;
        if (leaving === outgoing) leaving = null;
        outgoing.removeAttribute('data-leaving');
      };
      outgoing.addEventListener('transitionend', outgoing.exitHandler);
    }

    function go(i, dir) {
      var target = (i + count) % count;
      if (target === active) return;
      if (dir === undefined) dir = target > active ? 1 : -1;

      var outgoing = slides[active];
      var incoming = slides[target];

      /* An interrupted transition leaves a stale exiting slide behind. */
      if (leaving && leaving !== outgoing) reset(leaving, 100);

      reset(incoming, dir * 100);
      incoming.style.transition = '';
      toggle(incoming, true);
      incoming.style.transform = 'translateX(0)';

      exit(outgoing, dir);

      active = target;
      renderChrome();
    }

    /* — autoplay —
       Runs only while this slideshow holds the election and is unattended:
       not hovered, not keyboard-focused, tab visible, motion not reduced.
       Any manual move restarts the clock so the next advance isn't cut short. */
    var box = root.querySelector('.slides');
    var timer = null;
    var held = false;
    var locked = false; /* held by the lightbox, which outlives focus leaving root */

    var show = {
      ratio: 0,
      elected: false,
      slides: slides,
      captions: captions,
      count: count,
      go: go,
      lock: function (on) { locked = on; show.resync(); },
      resync: function () {
        if (timer) { clearInterval(timer); timer = null; }
        var play = count > 1 && show.elected && !held && !locked &&
          !pageHidden() && !reduceMotion.matches;
        if (play) {
          timer = setInterval(function () { go(active + 1, 1); }, AUTOPLAY_MS);
        }
      }
    };

    function hold(on) {
      held = on;
      show.resync();
    }

    if (box) {
      box.addEventListener('mouseenter', function () { hold(true); });
      box.addEventListener('mouseleave', function () { hold(false); });
      /* Tabbing to an arrow or dot should stop the slide moving underneath. */
      root.addEventListener('focusin', function () { hold(true); });
      root.addEventListener('focusout', function () { hold(false); });

      if (observer) {
        box.showRecord = show;
        observer.observe(box);
      } else {
        show.ratio = 1; /* no IntersectionObserver: fall back to first-wins */
      }
    }

    /* — drag / swipe —
       The slide follows the pointer and the neighbour it's uncovering rides
       alongside it. Past a threshold the drag commits; short of it, both
       spring back. Works for touch, pen and mouse via Pointer Events. */
    var drag = null;
    var dragged = false; /* a drag ends in a click event we don't want to act on */

    function neighbourFor(dir) {
      return slides[(active + dir + count) % count];
    }

    function releaseNeighbour(el, dir) {
      place(el, dir * 100 + '%', true);
      var done = function (e) {
        if (e.propertyName !== 'transform') return;
        el.removeEventListener('transitionend', done);
        el.removeAttribute('data-dragging');
      };
      el.addEventListener('transitionend', done);
    }

    function onDown(e) {
      if (count < 2 || !box) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && e.target.closest('button')) return;
      dragged = false;
      drag = { x0: e.clientX, y0: e.clientY, dx: 0, dir: 0, neighbour: null,
               live: false, id: e.pointerId };
      /* Capture up front. Claiming the pointer late lets the browser decide the
         gesture is a scroll first and cancel it a few pixels in. */
      if (box.setPointerCapture) {
        try { box.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      }
    }

    function releasePointer(id) {
      if (box.releasePointerCapture && box.hasPointerCapture && box.hasPointerCapture(id)) {
        box.releasePointerCapture(id);
      }
    }

    function onMove(e) {
      if (!drag) return;
      var dx = e.clientX - drag.x0;
      var dy = e.clientY - drag.y0;

      /* Wait for intent: a mostly-vertical move belongs to the page scroller. */
      if (!drag.live) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          releasePointer(drag.id); /* hand the gesture back to the scroller */
          drag = null;
          return;
        }
        drag.live = true;
        dragged = true;
        box.setAttribute('data-dragging', '');
        hold(true);
      }

      /* Stops the browser turning the rest of the gesture into a scroll or an
         image drag partway through. */
      if (e.cancelable) e.preventDefault();

      var dir = dx < 0 ? 1 : -1; /* pulling left uncovers the next slide */
      if (dir !== drag.dir) {
        if (drag.neighbour) drag.neighbour.removeAttribute('data-dragging');
        drag.dir = dir;
        drag.neighbour = neighbourFor(dir);
        drag.neighbour.setAttribute('data-dragging', '');
        place(drag.neighbour, dir * 100 + '%', false);
      }

      drag.dx = dx;
      place(slides[active], dx + 'px', false);
      place(drag.neighbour, 'calc(' + (dir * 100) + '% + ' + dx + 'px)', false);
    }

    function onUp() {
      if (!drag) return;
      var d = drag;
      drag = null;
      releasePointer(d.id);
      if (!d.live) return;

      box.removeAttribute('data-dragging');
      var width = box.clientWidth || 1;
      var threshold = Math.min(80, width * 0.18);

      if (d.neighbour && Math.abs(d.dx) >= threshold) {
        var target = (active + d.dir + count) % count;
        place(d.neighbour, '0', true);
        d.neighbour.removeAttribute('data-dragging');
        toggle(d.neighbour, true);
        exit(slides[active], d.dir);
        active = target;
        renderChrome();
      } else {
        place(slides[active], '0', true);
        if (d.neighbour) releaseNeighbour(d.neighbour, d.dir);
      }

      hold(false);
    }

    if (box) {
      box.addEventListener('pointerdown', onDown);
      /* Non-passive: onMove calls preventDefault to keep the gesture. */
      box.addEventListener('pointermove', onMove, { passive: false });
      box.addEventListener('pointerup', onUp);
      box.addEventListener('pointercancel', onUp);
      /* A drag that ends off the element still has to settle. */
      box.addEventListener('lostpointercapture', onUp);
      /* Firefox ignores -webkit-user-drag, so block the native image drag. */
      box.addEventListener('dragstart', function (e) { e.preventDefault(); });
    }

    shows.push(show);

    /* Clicking a screenshot expands it. Only the on-screen slide is reachable —
       the others are visibility:hidden, so they fall out of the tab order. */
    if (lightbox) {
      Array.prototype.forEach.call(slides, function (slide, i) {
        var img = slide.querySelector('img');
        if (!img) return;
        img.setAttribute('data-expandable', '');
        img.setAttribute('role', 'button');
        img.setAttribute('tabindex', '0');
        img.setAttribute('aria-haspopup', 'dialog');
        img.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            lightbox.open(show, i);
          }
        });
      });

      /* Delegated, not bound per image: while a pointer is captured the click
         is dispatched at the capture target (.slides), not the image under it,
         so a listener on the image alone never hears it. */
      if (box) {
        box.addEventListener('click', function (e) {
          if (dragged) return; /* the click that ends a swipe isn't a tap */
          if (e.target.closest && e.target.closest('button')) return;
          if (!slides[active].querySelector('img')) return; /* placeholder slot */
          lightbox.open(show, active);
        });
      }
    }

    /* Arrows force their direction so wrapping animates as one step, not a rewind. */
    var prev = root.querySelector('[data-prev]');
    var next = root.querySelector('[data-next]');
    if (prev) prev.addEventListener('click', function () { go(active - 1, -1); show.resync(); });
    if (next) next.addEventListener('click', function () { go(active + 1, 1); show.resync(); });

    Array.prototype.forEach.call(dots, function (dot, i) {
      dot.addEventListener('click', function () { go(i); show.resync(); });
    });

    renderChrome();
  }

  /* A screenshot that hasn't been dropped in yet leaves a labelled slot
     rather than a broken-image icon. */
  function initImageFallbacks() {
    var imgs = document.querySelectorAll('.slide img, .about-photo img');
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener('error', function () {
        var slot = document.createElement('div');
        slot.className = 'slide-placeholder';
        slot.textContent = img.getAttribute('data-placeholder') || 'Image coming soon';
        if (img.parentNode) img.parentNode.replaceChild(slot, img);
      });
    });
  }

  function init() {
    var roots = document.querySelectorAll('[data-slideshow]');
    Array.prototype.forEach.call(roots, initSlideshow);
    initImageFallbacks();
    elect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
