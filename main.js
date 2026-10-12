/**
 * MLR INFRA - Vanilla JS Engine
 * Adheres strictly to DESIGN.md Section 8 (Motion)
 * - One entrance animation per section at most (12px rise + fade, 400ms ease-out)
 * - Stats count up once when first visible
 * - Hovers 150-200ms
 * - Respects prefers-reduced-motion
 */

document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 0. INITIALIZE LENIS SMOOTH SCROLL ENGINE
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !prefersReducedMotion) {
    try {
      lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        touchMultiplier: 1.1,
      });
      window.lenis = lenis;

      // If preloader is currently active, pause Lenis until preloader exits
      if (document.documentElement.classList.contains('is-loading')) {
        lenis.stop();
      }

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    } catch (err) {
      console.warn('Lenis initialization skipped:', err);
    }
  }

  // 1. NAVBAR SCROLL COLLAPSE & 75% SECTION INDICATOR ANIMATION (Replicated from mlr-infra-v4)
  const navbar = document.getElementById('siteHeader');
  const roller = document.getElementById('navIndicatorRoller');
  const navLinks = document.querySelectorAll('.nav-menu .nav-link');
  const drawerLinks = document.querySelectorAll('.mobile-nav-link');
  const centerIndicator = document.getElementById('navCenterIndicator');

  const sections = [
    { id: 'home', label: 'Home' },
    { id: 'about', label: 'About' },
    { id: 'products', label: 'Products' },
    { id: 'projects', label: 'Projects' },
    { id: 'how-we-work', label: 'How We Work' },
    { id: 'faq', label: 'FAQ' },
    { id: 'contact', label: 'Contact' }
  ];

  function calculateActiveIndex() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollBottom = window.innerHeight + scrollY;
    const docHeight = document.documentElement.scrollHeight;

    const existingSections = sections.filter(s => document.getElementById(s.id));
    if (existingSections.length === 0) return 0;

    // If reached bottom of page, highlight Contact / last section
    if (scrollBottom >= docHeight - 80) {
      return sections.findIndex(s => s.id === existingSections[existingSections.length - 1].id);
    }

    // "as the user scrolls past 75% of a section the next section has to display at the center of the navbar"
    // A nav section spans from its own top to the top of the next nav target, so unlisted
    // blocks in between (e.g. #why-choose-us under About) count as part of the previous one.
    const tops = existingSections.map(s => scrollY + document.getElementById(s.id).getBoundingClientRect().top);
    for (let i = existingSections.length - 2; i >= 0; i--) {
      const top = tops[i];
      const height = tops[i + 1] - top;
      const threshold = Math.max(top + height * 0.75, tops[i + 1] - window.innerHeight * 0.5);

      // When scroll reaches or passes 75% of section i, section i+1 displays
      if (scrollY + 80 >= threshold) {
        const nextId = existingSections[i + 1].id;
        return sections.findIndex(s => s.id === nextId);
      }
    }

    return 0; // Default to Home
  }

  function saveNavState(isScrolled, label, idx) {
    try {
      sessionStorage.setItem('mlr_nav_scrolled', isScrolled ? '1' : '0');
      if (label) sessionStorage.setItem('mlr_nav_section_label', label);
      if (idx !== undefined) sessionStorage.setItem('mlr_nav_section_idx', String(idx));
    } catch (e) {}
  }

  // 1. Immediately determine current section on load/refresh
  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const isActuallyScrolled = currentScrollY > 60;
  const initialIndex = isActuallyScrolled ? calculateActiveIndex() : 0;
  let currentIndex = initialIndex;
  let isTransitioning = false;
  let pendingIndex = null;

  // 2. Set initial text directly without slide animation
  if (roller) {
    const initialSpan = roller.querySelector('.nav-indicator-text.current') || roller.querySelector('.nav-indicator-text');
    if (initialSpan) {
      initialSpan.className = 'nav-indicator-text current';
      initialSpan.textContent = sections[initialIndex].label;
    } else {
      roller.innerHTML = `<span class="nav-indicator-text current">${sections[initialIndex].label}</span>`;
    }
  }

  // 3. Immediately sync active link highlight
  navLinks.forEach((link, idx) => {
    link.classList.toggle('active', idx === initialIndex);
  });
  drawerLinks.forEach((link, idx) => {
    link.classList.toggle('active', idx === initialIndex);
  });

  // 4. Set initial scrolled/collapsed state immediately
  if (navbar) {
    if (isActuallyScrolled) {
      navbar.classList.add('is-scrolled');
    } else {
      navbar.classList.remove('is-scrolled');
    }
  }

  saveNavState(isActuallyScrolled, sections[initialIndex].label, initialIndex);

  let isNavbarHovered = false;

  function updateNavbar(options) {
    if (!navbar || !roller) return;
    const immediate = Boolean(options && options.immediate) || !navbar.classList.contains('is-ready');
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Hysteresis threshold: collapse at > 80px, return to full width at < 35px to prevent scroll-edge flicker
    const wasScrolled = navbar.classList.contains('is-scrolled');
    const isScrolled = wasScrolled ? (scrollY > 35) : (scrollY > 80);

    if (isScrolled) {
      if (!wasScrolled) {
        navbar.classList.add('is-scrolled');
      }
    } else {
      if (wasScrolled) {
        navbar.classList.remove('is-scrolled');
        navbar.classList.remove('is-expanded');
      }
    }

    // Calculate active section by 75% threshold
    const targetIndex = calculateActiveIndex();
    saveNavState(isScrolled, sections[targetIndex].label, targetIndex);

    if (targetIndex !== currentIndex) {
      if (immediate) {
        currentIndex = targetIndex;
        const span = roller.querySelector('.nav-indicator-text.current') || roller.querySelector('.nav-indicator-text');
        if (span) {
          span.className = 'nav-indicator-text current';
          span.textContent = sections[targetIndex].label;
        } else {
          roller.innerHTML = `<span class="nav-indicator-text current">${sections[targetIndex].label}</span>`;
        }
        navLinks.forEach((link, idx) => {
          link.classList.toggle('active', idx === targetIndex);
        });
        drawerLinks.forEach((link, idx) => {
          link.classList.toggle('active', idx === targetIndex);
        });
      } else if (isTransitioning) {
        pendingIndex = targetIndex;
      } else {
        performTransition(currentIndex, targetIndex);
      }
    }
  }

  function performTransition(fromIdx, toIdx) {
    if (!roller) return;
    isTransitioning = true;
    const direction = toIdx > fromIdx ? 'down' : 'up';

    const oldSpan = roller.querySelector('.nav-indicator-text.current') || roller.querySelector('.nav-indicator-text');
    const newSpan = document.createElement('span');
    newSpan.className = 'nav-indicator-text';
    newSpan.textContent = sections[toIdx].label;

    if (direction === 'down') {
      if (oldSpan) {
        oldSpan.className = 'nav-indicator-text nav-slide-out-up';
      }
      newSpan.classList.add('nav-slide-in-up');
    } else {
      if (oldSpan) {
        oldSpan.className = 'nav-indicator-text nav-slide-out-down';
      }
      newSpan.classList.add('nav-slide-in-down');
    }

    roller.appendChild(newSpan);

    // Sync active highlight
    navLinks.forEach((link, idx) => {
      link.classList.toggle('active', idx === toIdx);
    });
    drawerLinks.forEach((link, idx) => {
      link.classList.toggle('active', idx === toIdx);
    });

    currentIndex = toIdx;

    setTimeout(() => {
      if (oldSpan && oldSpan.parentNode === roller) {
        roller.removeChild(oldSpan);
      }
      newSpan.className = 'nav-indicator-text current';
      isTransitioning = false;

      if (pendingIndex !== null && pendingIndex !== currentIndex) {
        const nextTarget = pendingIndex;
        pendingIndex = null;
        performTransition(currentIndex, nextTarget);
      }
    }, 240);
  }

  // Expand ONLY when user hovers over section heading (.nav-center-indicator), NOT on logo or CTA
  if (navbar && centerIndicator) {
    let collapseTimer = null;

    centerIndicator.addEventListener('mouseenter', () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      if (navbar.classList.contains('is-scrolled')) {
        navbar.classList.add('is-expanded');
      }
    });

    // While user is moving around within the revealed desktop menu, keep it expanded
    const navDesktop = navbar.querySelector('.nav-desktop');
    if (navDesktop) {
      navDesktop.addEventListener('mouseenter', () => {
        if (collapseTimer) {
          clearTimeout(collapseTimer);
          collapseTimer = null;
        }
      });
      navDesktop.addEventListener('mouseleave', () => {
        if (navbar.classList.contains('is-expanded')) {
          collapseTimer = setTimeout(() => {
            navbar.classList.remove('is-expanded');
          }, 200);
        }
      });
    }

    // Leaving the entire navbar collapses it after a gentle 200ms grace period
    navbar.addEventListener('mouseleave', () => {
      if (navbar.classList.contains('is-expanded')) {
        collapseTimer = setTimeout(() => {
          navbar.classList.remove('is-expanded');
        }, 200);
      }
    });

    // Logo and CTA: Hovering over them must NOT trigger expansion
    const navBrand = navbar.querySelector('.nav-brand');
    const navRight = navbar.querySelector('.nav-right');
    [navBrand, navRight].forEach(el => {
      if (el) {
        el.addEventListener('mouseenter', (e) => {
          // If not currently expanded, ensure it stays collapsed
          if (!navbar.classList.contains('is-expanded')) {
            e.stopPropagation();
          }
        });
      }
    });

    // Collapse immediately when clicking any navigation link or action
    navbar.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        if (collapseTimer) clearTimeout(collapseTimer);
        navbar.classList.remove('is-expanded');
      });
    });
  }

  // 1.5. ABOUT SECTION BACKGROUND BUILDING PARALLAX
  const aboutSection = document.getElementById('about');
  const aboutBuildingImg = document.querySelector('.about-bg-building-img');

  function updateAboutParallax() {
    if (!aboutSection || !aboutBuildingImg || prefersReducedMotion) return;
    const rect = aboutSection.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    if (rect.bottom > -100 && rect.top < windowHeight + 100) {
      const totalDistance = windowHeight + rect.height;
      const progress = (windowHeight - rect.top) / totalDistance;
      const baseOffset = 20;
      const parallaxDelta = (progress - 0.5) * 80;
      aboutBuildingImg.style.transform = `translate3d(0, ${Math.round(baseOffset + parallaxDelta)}px, 0)`;
    }
  }

  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(() => {
        updateNavbar();
        updateAboutParallax();
        scrollTicking = false;
      });
    }
  }, { passive: true });
  window.addEventListener('resize', () => {
    updateNavbar();
    updateAboutParallax();
  }, { passive: true });
  window.addEventListener('pageshow', () => {
    updateNavbar({ immediate: true });
    updateAboutParallax();
  });
  updateAboutParallax();

  requestAnimationFrame(() => {
    setTimeout(() => {
      navbar?.classList.add('is-ready');
    }, 120);
  });

  // Smooth Anchor Scrolling with Floating Header Offset
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;

    let hash = '';
    try {
      const url = new URL(link.href, window.location.href);
      if (url.pathname !== window.location.pathname) return;
      hash = url.hash;
    } catch (err) {
      if (href.startsWith('#')) hash = href;
      else return;
    }

    if (!hash || hash === '#' || hash.length < 2) {
      if (hash === '#') e.preventDefault();
      return;
    }

    if (hash === '#home') {
      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.15 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (history.pushState) {
        history.pushState(null, '', window.location.pathname + window.location.search);
      }
      const drawer = document.getElementById('mobileNavDrawer');
      const toggle = document.getElementById('mobileNavToggle');
      if (drawer && drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        toggle?.classList.remove('open');
        toggle?.setAttribute('aria-expanded', 'false');
        lenis?.start();
      }
      return;
    }

    const targetEl = document.querySelector(hash);
    if (!targetEl) return;

    e.preventDefault();
    if (lenis) {
      lenis.scrollTo(targetEl, { offset: -88, duration: 1.15 });
    } else {
      const offset = 88;
      const targetTop = targetEl.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - offset;
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }

    if (history.pushState) {
      history.pushState(null, '', hash);
    }

    const drawer = document.getElementById('mobileNavDrawer');
    const toggle = document.getElementById('mobileNavToggle');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
      toggle?.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
      lenis?.start();
    }
  });

  // 2. MOBILE DRAWER TOGGLE
  const mobileToggle = document.getElementById('mobileNavToggle');
  const mobileDrawer = document.getElementById('mobileNavDrawer');

  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileDrawer.classList.toggle('open');
      mobileToggle.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) lenis?.stop(); else lenis?.start();
    });

    // Close mobile drawer when a link is clicked
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        mobileToggle.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
        lenis?.start();
      });
    });
  }

  // 3. STATS COUNT UP ONCE WHEN FIRST VISIBLE (DESIGN.md Section 8)
  const statNumbers = document.querySelectorAll('.trust-stat-number');

  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const statsObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const targetNum = parseInt(el.getAttribute('data-target'), 10);
          const suffix = el.getAttribute('data-suffix') || '';

          if (!isNaN(targetNum)) {
            let current = 0;
            const duration = 1200; // 1.2s count up
            const stepTime = 30;
            const steps = duration / stepTime;
            const increment = targetNum / steps;

            const timer = setInterval(() => {
              current += increment;
              if (current >= targetNum) {
                current = targetNum;
                clearInterval(timer);
                el.textContent = `${Math.round(current)}${suffix}`;
              } else {
                el.textContent = `${Math.round(current)}${suffix}`;
              }
            }, stepTime);
          }

          observer.unobserve(el); // Count up once only!
        }
      });
    }, { threshold: 0.3 });

    statNumbers.forEach(stat => statsObserver.observe(stat));
  }

  // 4. SECTION ENTRANCE MOTION (DESIGN.md Section 8)
  // One entrance animation per section at most: 12px rise + fade, 400ms, ease-out.
  const animatedElements = document.querySelectorAll('.fade-rise');

  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target); // Play once, never repeat on scroll-up
        }
      });
    }, { threshold: 0.15 });

    animatedElements.forEach(el => revealObserver.observe(el));
  } else {
    // If reduced motion or observer not supported, show immediately
    animatedElements.forEach(el => el.classList.add('in-view'));
  }

  // 5. HERO SCROLL-DRIVEN WEBP CANVAS ENGINE
  // - Converts scroll position directly into WebP frame sequence
  // - Zero random fallback photos or posters preloaded
  // - Playback position is strictly bound to scroll progress (not a play button)
  // - Butter-smooth 60fps canvas rendering with requestAnimationFrame
  // - Instant frame 0 paint + progressive background preloading
  const canvas = document.getElementById('heroCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const TOTAL_FRAMES = 75;
    const frames = new Array(TOTAL_FRAMES);
    let currentRenderedIndex = -1;
    let targetIndex = 0;
    let isTicking = false;

    // Helper to format frame path: assets/frames/frame_000.webp ... frame_074.webp
    const getFramePath = (i) => `assets/frames/frame_${String(i).padStart(3, '0')}.webp`;

    // Render a frame onto canvas
    const drawFrame = (img) => {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    // Draw the best available frame for target index
    const render = () => {
      isTicking = false;
      const targetImg = frames[targetIndex];
      if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
        drawFrame(targetImg);
        currentRenderedIndex = targetIndex;
      } else {
        // Nearest loaded fallback
        let nearest = null;
        let minDiff = Infinity;
        for (let i = 0; i < TOTAL_FRAMES; i++) {
          if (frames[i] && frames[i].complete && frames[i].naturalWidth > 0) {
            const diff = Math.abs(i - targetIndex);
            if (diff < minDiff) {
              minDiff = diff;
              nearest = frames[i];
            }
          }
        }
        if (nearest) {
          drawFrame(nearest);
        }
      }
    };

    const requestRender = () => {
      if (!isTicking) {
        isTicking = true;
        requestAnimationFrame(render);
      }
    };

    // Calculate frame from scroll position
    const updateScrollFrame = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const aboutSection = document.getElementById('about');
      const maxScroll = aboutSection ? (aboutSection.offsetTop - 80) : (window.innerHeight * 0.9);
      const progress = Math.min(1, Math.max(0, scrollY / (maxScroll || 600)));

      const newTarget = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * (TOTAL_FRAMES - 1)));
      if (newTarget !== targetIndex) {
        targetIndex = newTarget;
        requestRender();
      }
    };

    // Step 1: Instantly load & paint frame 0 (Hero initial view)
    const frame0 = new Image();
    frame0.src = getFramePath(0);
    frame0.onload = () => {
      frames[0] = frame0;
      drawFrame(frame0);
      currentRenderedIndex = 0;
    };
    frames[0] = frame0;

    // Step 2: Progressively preload remaining frames
    const preloadFrames = () => {
      for (let i = 1; i < TOTAL_FRAMES; i++) {
        const img = new Image();
        img.src = getFramePath(i);
        img.onload = () => {
          frames[i] = img;
          if (i === targetIndex) {
            requestRender();
          }
        };
        frames[i] = img;
      }
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preloadFrames, { timeout: 200 });
    } else {
      setTimeout(preloadFrames, 50);
    }

    // Scroll listener for real-time scrub
    window.addEventListener('scroll', updateScrollFrame, { passive: true });
    window.addEventListener('resize', updateScrollFrame, { passive: true });
    updateScrollFrame();
  }

  /* Section 5: What We Manufacture layout rendered via CSS grid & flex */

  /* =========================================================================
     SECTION 7: PROJECTS CAROUSEL INTERACTION
     ========================================================================= */
  const projTrack = document.getElementById('projectsSliderTrack');
  const projPrevBtn = document.getElementById('projPrevBtn');
  const projNextBtn = document.getElementById('projNextBtn');
  const projProgressFill = document.getElementById('projProgressFill');

  if (projTrack && projPrevBtn && projNextBtn) {
    const cards = projTrack.querySelectorAll('.project-slide-card');

    const updateCarouselState = () => {
      const scrollLeft = projTrack.scrollLeft;
      const maxScroll = projTrack.scrollWidth - projTrack.clientWidth;

      // Update progress bar
      if (projProgressFill) {
        const progressPct = maxScroll > 0 
          ? Math.min(100, Math.max(16.66, ((scrollLeft / maxScroll) * (100 - 16.66)) + 16.66))
          : 100;
        projProgressFill.style.width = progressPct + '%';
      }

      // Update button states
      projPrevBtn.disabled = scrollLeft <= 8;
      projNextBtn.disabled = maxScroll > 0 && scrollLeft >= maxScroll - 8;
    };

    const getScrollStep = () => {
      const firstCard = cards[0];
      if (!firstCard) return 320;
      const cardWidth = firstCard.offsetWidth;
      const gap = parseFloat(window.getComputedStyle(projTrack).gap) || 24;
      return cardWidth + gap;
    };

    projPrevBtn.addEventListener('click', () => {
      projTrack.scrollBy({ left: -getScrollStep(), behavior: 'smooth' });
    });

    projNextBtn.addEventListener('click', () => {
      projTrack.scrollBy({ left: getScrollStep(), behavior: 'smooth' });
    });

    let scrollTimeout;
    projTrack.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateCarouselState, 30);
    }, { passive: true });

    window.addEventListener('resize', updateCarouselState, { passive: true });
    updateCarouselState();

    // Floating "Scroll" cue that follows the pointer over the slider
    const projCue = document.getElementById('projScrollCue');
    const projWrap = projTrack.closest('.projects-slider-wrap');
    if (projCue && projWrap && window.matchMedia('(hover: hover)').matches) {
      projWrap.addEventListener('mousemove', (e) => {
        const rect = projWrap.getBoundingClientRect();
        projCue.style.left = (e.clientX - rect.left) + 'px';
        projCue.style.top = (e.clientY - rect.top) + 'px';
        projCue.classList.toggle('is-hidden', !!e.target.closest('.proj-nav-btn'));
      });
      projWrap.addEventListener('mouseenter', () => projCue.classList.add('is-active'));
      projWrap.addEventListener('mouseleave', () => projCue.classList.remove('is-active'));
    }
  }

  /* =========================================================================
     SECTION 7: TESTIMONIALS AUTO-ROTATOR (ONE AT A TIME WITH DELAY)
     ========================================================================= */
  const testSlides = document.querySelectorAll('.testimonial-slide');
  const testDots = document.querySelectorAll('.testimonial-dot');
  const testBlock = document.getElementById('testimonialsBlock');

  if (testSlides.length > 0) {
    let currentSlide = 0;
    let autoTimer = null;
    const ROTATE_DELAY = 5000; // 5 seconds per testimonial

    const goToSlide = (index) => {
      testSlides.forEach((slide, i) => {
        const isActive = (i === index);
        slide.classList.toggle('active', isActive);
        slide.setAttribute('aria-hidden', !isActive);
      });

      testDots.forEach((dot, i) => {
        const isActive = (i === index);
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive);
      });

      currentSlide = index;
    };

    const nextSlide = () => {
      const nextIndex = (currentSlide + 1) % testSlides.length;
      goToSlide(nextIndex);
    };

    const startTimer = () => {
      stopTimer();
      autoTimer = setInterval(nextSlide, ROTATE_DELAY);
    };

    const stopTimer = () => {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    };

    testDots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        goToSlide(idx);
        startTimer(); // Reset auto-timer on manual dot click
      });
    });

    if (testBlock) {
      testBlock.addEventListener('mouseenter', stopTimer);
      testBlock.addEventListener('mouseleave', startTimer);
    }

    startTimer();
  }

  // 7. WHERE WE WORK STATS COUNTER
  const statVals = document.querySelectorAll('.where-stat-val');
  if (statVals.length > 0 && 'IntersectionObserver' in window && !prefersReducedMotion) {
    let animated = false;
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !animated) {
          animated = true;
          statVals.forEach(el => {
            const target = parseInt(el.getAttribute('data-target'), 10);
            if (isNaN(target)) return;
            const duration = 1100;
            const start = performance.now();
            const animateCount = (now) => {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              const ease = 1 - Math.pow(1 - progress, 4);
              const current = Math.round(target * ease);
              el.textContent = current;
              if (progress < 1) {
                requestAnimationFrame(animateCount);
              } else {
                el.textContent = target;
              }
            };
            requestAnimationFrame(animateCount);
          });
          statsObserver.disconnect();
        }
      });
    }, { threshold: 0.3 });

    const statsRow = document.querySelector('.where-stats-row');
    if (statsRow) statsObserver.observe(statsRow);
  }

  /* ==========================================================================
     8. INTERACTIVE ESTIMATOR CALCULATOR
     ========================================================================== */
  const calcCategory = document.getElementById('calc-category');
  const categoryBricksGroup = document.getElementById('category-bricks-group');
  const categoryFencingGroup = document.getElementById('category-fencing-group');

  const calcBrickType = document.getElementById('calc-brick-type');
  const calcBrickSize = document.getElementById('calc-brick-size');
  const customBrickDims = document.getElementById('custom-brick-dims');
  const customLen = document.getElementById('custom-len');
  const customWid = document.getElementById('custom-wid');
  const customHt = document.getElementById('custom-ht');

  const calcFenceType = document.getElementById('calc-fence-type');
  const calcFenceHeight = document.getElementById('calc-fence-height');
  const customFenceDims = document.getElementById('custom-fence-dims');
  const customFenceHt = document.getElementById('custom-fence-ht');

  const wallLength = document.getElementById('wall-length');
  const wallHeight = document.getElementById('wall-height');
  const calcWastage = document.getElementById('calc-wastage');
  const wastageDisplay = document.getElementById('wastage-display');

  const resTotalUnits = document.getElementById('res-total-units');
  const resUnitLabel = document.getElementById('res-unit-label');
  const calcSummaryText = document.getElementById('calc-summary-text');
  const resAreaVal = document.getElementById('res-area-val');
  const resSpecVal = document.getElementById('res-spec-val');
  const resWastageVal = document.getElementById('res-wastage-val');

  if (calcCategory) {
    calcCategory.addEventListener('change', () => {
      const isBricks = calcCategory.value === 'cc-bricks';
      if (categoryBricksGroup && categoryFencingGroup) {
        if (isBricks) {
          categoryBricksGroup.classList.remove('hidden');
          categoryFencingGroup.classList.add('hidden');
        } else {
          categoryBricksGroup.classList.add('hidden');
          categoryFencingGroup.classList.remove('hidden');
        }
      }
      calculateEstimator();
    });
  }

  if (calcBrickSize) {
    calcBrickSize.addEventListener('change', () => {
      if (customBrickDims) {
        calcBrickSize.value === 'custom' ? customBrickDims.classList.remove('hidden') : customBrickDims.classList.add('hidden');
      }
      calculateEstimator();
    });
  }

  if (calcFenceHeight) {
    calcFenceHeight.addEventListener('change', () => {
      if (customFenceDims) {
        calcFenceHeight.value === 'custom-fence' ? customFenceDims.classList.remove('hidden') : customFenceDims.classList.add('hidden');
      }
      calculateEstimator();
    });
  }

  if (calcWastage && wastageDisplay) {
    calcWastage.addEventListener('input', () => {
      wastageDisplay.textContent = `${calcWastage.value}%`;
      calculateEstimator();
    });
  }

  const allCalcInputs = [
    calcBrickType, calcBrickSize, customLen, customWid, customHt,
    calcFenceType, calcFenceHeight, customFenceHt,
    wallLength, wallHeight
  ];
  allCalcInputs.forEach((input) => {
    if (input) {
      input.addEventListener('input', calculateEstimator);
      input.addEventListener('change', calculateEstimator);
    }
  });

  function calculateEstimator() {
    const isBricks = !calcCategory || calcCategory.value === 'cc-bricks';
    const wastagePct = parseFloat(calcWastage ? calcWastage.value : 10) / 100;

    let totalUnits = 0;
    let unitName = 'BRICKS NEEDED';
    let areaSqFt = 0;
    let specDescription = '';
    let summaryHtml = '';

    {
      const lenFt = Math.max(1, parseFloat(wallLength ? wallLength.value : 100) || 0);
      const htFt = Math.max(1, parseFloat(wallHeight ? wallHeight.value : 10) || 0);
      areaSqFt = Math.round(lenFt * htFt);

      if (isBricks) {
        let brickLenMm = 400;
        let brickWidMm = 200;
        let brickHtMm = 200;

        const sizeVal = calcBrickSize ? calcBrickSize.value : '400x200x200';
        if (sizeVal === '400x200x200') {
          brickLenMm = 400; brickWidMm = 200; brickHtMm = 200;
        } else if (sizeVal === '400x200x150') {
          brickLenMm = 400; brickWidMm = 200; brickHtMm = 150;
        } else if (sizeVal === '230x110x75') {
          brickLenMm = 230; brickWidMm = 110; brickHtMm = 75;
        } else if (sizeVal === 'custom') {
          brickLenMm = Math.max(50, parseFloat(customLen ? customLen.value : 400) || 400);
          brickWidMm = Math.max(50, parseFloat(customWid ? customWid.value : 200) || 200);
          brickHtMm = Math.max(50, parseFloat(customHt ? customHt.value : 200) || 200);
        }

        const brickType = calcBrickType ? calcBrickType.options[calcBrickType.selectedIndex].text.split('(')[0].trim() : 'Solid CC Brick';
        specDescription = `${brickType} &bull; ${brickLenMm}&times;${brickWidMm}&times;${brickHtMm} mm`;

        const brickLenIn = brickLenMm * 0.0393701;
        const brickHtIn = brickHtMm * 0.0393701;
        const isInterlocking = calcBrickType && calcBrickType.value === 'interlocking';
        const mortarJointIn = isInterlocking ? 0 : 0.394;

        const brickFaceAreaSqIn = (brickLenIn + mortarJointIn) * (brickHtIn + mortarJointIn);
        const wallAreaSqIn = areaSqFt * 144;

        const baseBricks = wallAreaSqIn / brickFaceAreaSqIn;
        totalUnits = Math.ceil(baseBricks * (1 + wastagePct));
        unitName = 'BRICKS NEEDED';

        summaryHtml = `You'll need approximately <strong>${totalUnits.toLocaleString()} bricks</strong> to cover <strong>${areaSqFt.toLocaleString()} sq ft</strong>.`;

      } else {
        const fenceType = calcFenceType ? calcFenceType.options[calcFenceType.selectedIndex].text.split('(')[0].trim() : 'Compound Wall';
        let fenceHt = 6.6;
        if (calcFenceHeight && calcFenceHeight.value === 'custom-fence') {
          fenceHt = Math.max(3, parseFloat(customFenceHt ? customFenceHt.value : 6.6) || 6.6);
        } else if (calcFenceHeight) {
          fenceHt = parseFloat(calcFenceHeight.value) || 6.6;
        }

        specDescription = `${fenceType} &bull; ${fenceHt} ft Height`;

        const panelsLengthWise = Math.ceil(lenFt / 7);
        const planksVertical = Math.ceil(fenceHt);
        const basePanels = panelsLengthWise * planksVertical;
        const postsCount = panelsLengthWise + 1;

        totalUnits = Math.ceil(basePanels * (1 + wastagePct));
        unitName = 'PANELS + POSTS';

        summaryHtml = `You'll need approximately <strong>${totalUnits.toLocaleString()} modular panels</strong> and <strong>${postsCount} posts</strong> for <strong>${lenFt} running ft (${areaSqFt.toLocaleString()} sq ft)</strong>.`;
      }

    }

    if (resTotalUnits) resTotalUnits.textContent = totalUnits.toLocaleString();
    if (resUnitLabel) resUnitLabel.textContent = unitName;
    if (calcSummaryText) calcSummaryText.innerHTML = summaryHtml;
    if (resAreaVal) resAreaVal.textContent = `${areaSqFt.toLocaleString()} sq ft`;
    if (resSpecVal) resSpecVal.innerHTML = specDescription;
    if (resWastageVal) resWastageVal.textContent = `+${Math.round(wastagePct * 100)}% included`;
  }

  // Initial calculation run
  calculateEstimator();

  /* ==========================================================================
     9. BRIDGE: SEND ESTIMATE DIRECTLY INTO CONTACT ENQUIRY FORM
     ========================================================================== */
  const btnSendEstimate = document.getElementById('btn-send-estimate');
  if (btnSendEstimate) {
    btnSendEstimate.addEventListener('click', () => {
      const isBricks = !calcCategory || calcCategory.value === 'cc-bricks';
      const quantityText = resTotalUnits ? resTotalUnits.textContent : '0';
      const areaText = resAreaVal ? resAreaVal.textContent : '';
      const specText = resSpecVal ? resSpecVal.innerText.replace(/&bull;/g, '|') : '';

      const formProduct = document.getElementById('form-product');
      const formQuantity = document.getElementById('form-quantity');
      const formMessage = document.getElementById('form-message');

      if (formProduct) {
        formProduct.value = isBricks ? 'CC Bricks' : 'Precast Fencing';
      }
      if (formQuantity) {
        formQuantity.value = `${quantityText} units (${areaText})`;
      }
      if (formMessage) {
        formMessage.value = `Site Estimator Parameters:\n- Material: ${isBricks ? 'CC Bricks' : 'Precast Fencing'}\n- Calculated Units: ${quantityText}\n- Wall Area: ${areaText}\n- Spec: ${specText}\n\nPlease provide indicative on-site casting quote and mobilization lead time.`;
      }

      const formBlock = document.getElementById('contact-form-block');
      if (formBlock) {
        formBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Subtle visual highlight
        formBlock.style.transition = 'outline 0.3s ease';
        formBlock.style.outline = '2px solid var(--blue)';
        setTimeout(() => {
          formBlock.style.outline = 'none';
        }, 1500);
      }
    });
  }

  /* ==========================================================================
     10. RAPID ENQUIRY FORM VALIDATION & FEEDBACK
     ========================================================================== */
  const enquiryForm = document.getElementById('enquiry-form');
  const enquirySuccess = document.getElementById('enquiry-success');
  const btnResetForm = document.getElementById('btn-reset-form');

  if (enquiryForm) {
    enquiryForm.addEventListener('submit', (e) => {
      e.preventDefault();

      let hasError = false;
      const nameInput = document.getElementById('form-name');
      const contactInput = document.getElementById('form-contact');
      const locationInput = document.getElementById('form-location');

      const errName = document.getElementById('err-name');
      const errContact = document.getElementById('err-contact');
      const errLocation = document.getElementById('err-location');

      if (errName) errName.textContent = '';
      if (errContact) errContact.textContent = '';
      if (errLocation) errLocation.textContent = '';

      if (!nameInput || !nameInput.value.trim()) {
        if (errName) errName.textContent = 'Please enter your name.';
        hasError = true;
      }
      if (!contactInput || !contactInput.value.trim()) {
        if (errContact) errContact.textContent = 'Please enter a phone number or email.';
        hasError = true;
      }
      if (!locationInput || !locationInput.value.trim()) {
        if (errLocation) errLocation.textContent = 'Please specify your site location.';
        hasError = true;
      }

      if (hasError) return;

      const submitBtn = document.getElementById('btn-submit-enquiry');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-label">Transmitting...</span>';
      }

      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span class="btn-label">Request a Project Quote</span><span class="btn-arrow-block" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>`;
        }
        enquiryForm.classList.add('hidden');
        if (enquirySuccess) {
          enquirySuccess.classList.remove('hidden');
        }
      }, 600);
    });
  }

  if (btnResetForm) {
    btnResetForm.addEventListener('click', () => {
      if (enquiryForm) {
        enquiryForm.reset();
        enquiryForm.classList.remove('hidden');
      }
      if (enquirySuccess) {
        enquirySuccess.classList.add('hidden');
      }
    });
  }

  // FAQ Accordion Interactivity
  const faqTriggers = document.querySelectorAll('.faq-trigger');
  faqTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      const panelId = trigger.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);

      faqTriggers.forEach(otherTrigger => {
        if (otherTrigger !== trigger) {
          otherTrigger.setAttribute('aria-expanded', 'false');
          const otherPanelId = otherTrigger.getAttribute('aria-controls');
          const otherPanel = document.getElementById(otherPanelId);
          if (otherPanel) otherPanel.classList.remove('open');
        }
      });

      trigger.setAttribute('aria-expanded', !isExpanded ? 'true' : 'false');
      if (panel) {
        panel.classList.toggle('open', !isExpanded);
      }
    });
  });
});

