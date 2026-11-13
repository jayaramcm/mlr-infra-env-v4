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
  const isHomePage = Boolean(document.getElementById('home'));
  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const isActuallyScrolled = currentScrollY > 60;
  const initialIndex = isHomePage ? (isActuallyScrolled ? calculateActiveIndex() : 0) : 0;
  let currentIndex = initialIndex;
  let isTransitioning = false;
  let pendingIndex = null;

  // 2. Set initial text directly without slide animation
  if (roller && isHomePage) {
    const initialSpan = roller.querySelector('.nav-indicator-text.current') || roller.querySelector('.nav-indicator-text');
    if (initialSpan) {
      initialSpan.className = 'nav-indicator-text current';
      initialSpan.textContent = sections[initialIndex].label;
    } else {
      roller.innerHTML = `<span class="nav-indicator-text current">${sections[initialIndex].label}</span>`;
    }
  }

  // 3. Immediately sync active link highlight on home page
  if (isHomePage) {
    navLinks.forEach((link, idx) => {
      link.classList.toggle('active', idx === initialIndex);
    });
    drawerLinks.forEach((link, idx) => {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        link.classList.toggle('active', idx === initialIndex);
      }
    });
  }

  // 4. Set initial scrolled/collapsed state immediately
  if (navbar) {
    if (isActuallyScrolled) {
      navbar.classList.add('is-scrolled');
    } else {
      navbar.classList.remove('is-scrolled');
    }
  }

  if (isHomePage) {
    saveNavState(isActuallyScrolled, sections[initialIndex].label, initialIndex);
  }

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

    if (!isHomePage) return;

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
          const href = link.getAttribute('href') || '';
          if (href.startsWith('#')) {
            link.classList.toggle('active', idx === targetIndex);
          }
        });
      } else if (isTransitioning) {
        pendingIndex = targetIndex;
      } else {
        performTransition(currentIndex, targetIndex);
      }
    }
  }

  function performTransition(fromIdx, toIdx) {
    if (!roller || !isHomePage) return;
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
      const href = link.getAttribute('href') || '';
      if (href.startsWith('#')) {
        link.classList.toggle('active', idx === toIdx);
      }
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

  // Expand when user hovers over section heading (.nav-center-indicator),
  // and once expanded, keep it expanded across the entire navbar (including logo & CTAs)
  // until the cursor leaves the navbar completely.
  if (navbar && centerIndicator) {
    let collapseTimer = null;

    const clearCollapseTimer = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    };

    centerIndicator.addEventListener('mouseenter', () => {
      clearCollapseTimer();
      if (navbar.classList.contains('is-scrolled')) {
        navbar.classList.add('is-expanded');
      }
    });

    // Keep expanded while cursor is anywhere inside the navbar (menu, white space, logo, or CTAs)
    navbar.addEventListener('mouseenter', () => {
      clearCollapseTimer();
    });

    navbar.addEventListener('mousemove', () => {
      if (navbar.classList.contains('is-expanded')) {
        clearCollapseTimer();
      }
    });

    // Collapse ONLY when the cursor leaves the entire navbar
    navbar.addEventListener('mouseleave', () => {
      if (navbar.classList.contains('is-expanded')) {
        collapseTimer = setTimeout(() => {
          navbar.classList.remove('is-expanded');
        }, 180);
      }
    });

    // Collapse immediately when clicking any navigation link or action
    navbar.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        clearCollapseTimer();
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

  // 3. 2G NETWORK DETECTION & SKELETAL LOADING / UNABLE-TO-LOAD FALLBACK SYSTEM
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isSlowNetwork = () => Boolean(
    !navigator.onLine ||
    (conn && (conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType)))
  );

  const networkBanner = document.getElementById('networkStatusBanner');
  const networkStatusText = document.getElementById('networkStatusText');
  const networkRetryBtn = document.getElementById('networkRetryBtn');
  const skeletonRegistry = [];

  function updateNetworkBanner() {
    if (!networkBanner || !networkStatusText) return;
    const failedCount = document.querySelectorAll('[data-skeleton].is-skeleton-error').length;
    if (!navigator.onLine) {
      networkStatusText.textContent = 'Offline — Showing skeletal blueprint view';
      networkBanner.hidden = false;
      requestAnimationFrame(() => networkBanner.classList.add('is-visible'));
    } else if (failedCount > 0) {
      networkStatusText.textContent = `${failedCount} visual asset${failedCount > 1 ? 's' : ''} unable to load — Skeletal fallback active`;
      networkBanner.hidden = false;
      requestAnimationFrame(() => networkBanner.classList.add('is-visible'));
    } else if (isSlowNetwork()) {
      networkStatusText.textContent = '2G / Data-Saver mode — Lightweight skeletal stream active';
      networkBanner.hidden = false;
      requestAnimationFrame(() => networkBanner.classList.add('is-visible'));
    } else {
      networkBanner.classList.remove('is-visible');
      setTimeout(() => {
        if (!networkBanner.classList.contains('is-visible')) {
          networkBanner.hidden = true;
        }
      }, 260);
    }
  }

  function ensureSkeletonOverlay(container) {
    let overlay = container.querySelector(':scope > .skeleton-overlay');
    if (overlay) return overlay;

    const label = container.getAttribute('data-skeleton') || 'Visual Asset';
    overlay = document.createElement('div');
    overlay.className = 'skeleton-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="skeleton-wireframe">
        <span class="skeleton-bar skeleton-bar--lg"></span>
        <span class="skeleton-bar skeleton-bar--md"></span>
        <span class="skeleton-bar skeleton-bar--sm"></span>
      </div>
      <span class="skeleton-status-label">Loading ${label}...</span>
      <button type="button" class="skeleton-retry-btn">Retry Load</button>
    `;
    container.appendChild(overlay);
    return overlay;
  }

  function markSkeletonLoaded(container) {
    if (!container) return;
    container.classList.remove('is-skeleton', 'is-skeleton-error');
    container.classList.add('is-loaded');
    const statusEl = container.querySelector(':scope > .skeleton-overlay .skeleton-status-label');
    if (statusEl) {
      statusEl.textContent = container.getAttribute('data-skeleton') || 'Loaded';
    }
    updateNetworkBanner();
  }

  function markSkeletonError(container, reason) {
    if (!container) return;
    ensureSkeletonOverlay(container);
    container.classList.remove('is-skeleton', 'is-loaded');
    container.classList.add('is-skeleton-error');
    const label = container.getAttribute('data-skeleton') || 'Media';
    const statusEl = container.querySelector(':scope > .skeleton-overlay .skeleton-status-label');
    if (statusEl) {
      statusEl.textContent = reason || `${label} — Unable to load (Skeletal view)`;
    }
    updateNetworkBanner();
  }

  function markSkeletonLoading(container) {
    if (!container) return;
    ensureSkeletonOverlay(container);
    container.classList.remove('is-skeleton-error', 'is-loaded');
    container.classList.add('is-skeleton');
    const label = container.getAttribute('data-skeleton') || 'Media';
    const statusEl = container.querySelector(':scope > .skeleton-overlay .skeleton-status-label');
    if (statusEl) {
      statusEl.textContent = `Loading ${label}...`;
    }
    updateNetworkBanner();
  }

  // Bind all image-based [data-skeleton] containers
  document.querySelectorAll('[data-skeleton]').forEach((container) => {
    const overlay = ensureSkeletonOverlay(container);
    if (container.id === 'home') return; // Managed by Hero Canvas engine below

    const img = container.querySelector('img');
    if (!img) {
      markSkeletonLoaded(container);
      return;
    }

    const origSrc = img.getAttribute('src');
    let loadTimeout = null;

    const clearTimer = () => {
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
    };

    const startTimeoutWatch = () => {
      clearTimer();
      // If image takes longer than 8s (or 12s on 2G) while in view, transition to skeletal unable-to-load state
      const timeoutMs = isSlowNetwork() ? 12000 : 8000;
      loadTimeout = setTimeout(() => {
        if (!img.complete || img.naturalWidth === 0) {
          markSkeletonError(container);
        }
      }, timeoutMs);
    };

    const onImgLoad = () => {
      clearTimer();
      if (img.naturalWidth > 0) {
        markSkeletonLoaded(container);
      } else {
        markSkeletonError(container);
      }
    };

    const onImgError = () => {
      clearTimer();
      markSkeletonError(container);
    };

    img.addEventListener('load', onImgLoad);
    img.addEventListener('error', onImgError);

    const retryLoad = () => {
      if (!origSrc) return;
      markSkeletonLoading(container);
      startTimeoutWatch();
      const sep = origSrc.includes('?') ? '&' : '?';
      img.src = `${origSrc}${sep}retry=${Date.now()}`;
    };

    const retryBtn = overlay.querySelector('.skeleton-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        retryLoad();
      });
    }

    skeletonRegistry.push({ container, img, retryLoad });

    // Check immediate completion state
    if (img.complete) {
      if (img.naturalWidth > 0) {
        markSkeletonLoaded(container);
      } else {
        markSkeletonError(container);
      }
    } else if (!navigator.onLine) {
      markSkeletonError(container, 'Offline — Skeletal view');
    } else if ('IntersectionObserver' in window) {
      const watchObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!img.complete) startTimeoutWatch();
            obs.unobserve(container);
          }
        });
      }, { rootMargin: '200px 0px' });
      watchObserver.observe(container);
    } else {
      startTimeoutWatch();
    }
  });

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

  // 5. HERO SCROLL-DRIVEN WEBP CANVAS ENGINE (75 HD 1280x720 WEBP FRAMES, PROGRESSIVE 2G-AWARE STREAMING)
  const canvas = document.getElementById('heroCanvas');
  const heroSection = document.getElementById('home');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    const TOTAL_FRAMES = 75;
    const frames = new Array(TOTAL_FRAMES);
    let targetIndex = 0;
    let isTicking = false;
    let sequencePreloaded = false;

    // Helper to format frame path: assets/frames/frame_000.webp ... frame_074.webp
    const getFramePath = (i) => `assets/frames/frame_${String(i).padStart(3, '0')}.webp`;

    const drawFrame = (img) => {
      if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    const render = () => {
      isTicking = false;
      const targetImg = frames[targetIndex];
      if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
        drawFrame(targetImg);
      } else {
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
        if (nearest) drawFrame(nearest);
      }
    };

    const requestRender = () => {
      if (!isTicking) {
        isTicking = true;
        requestAnimationFrame(render);
      }
    };

    // Progressive two-pass batch preloader so 75 HD frames never choke the browser connection queue
    const preloadFrames = () => {
      if (sequencePreloaded) return;
      sequencePreloaded = true;

      // Order: stride-3 keyframes first (3, 6, 9...) for immediate scroll responsiveness, then in-between frames
      const queue = [];
      for (let i = 3; i < TOTAL_FRAMES; i += 3) queue.push(i);
      for (let i = 1; i < TOTAL_FRAMES; i++) {
        if (i % 3 !== 0) queue.push(i);
      }

      let cursor = 0;
      const CONCURRENCY = isSlowNetwork() ? 2 : 8;

      const loadNext = () => {
        if (cursor >= queue.length) return;
        const idx = queue[cursor++];
        const img = new Image();
        img.decoding = 'async';
        img.src = getFramePath(idx);
        img.onload = () => {
          frames[idx] = img;
          if (idx === targetIndex) requestRender();
          loadNext();
        };
        img.onerror = () => {
          loadNext();
        };
        frames[idx] = img;
      };

      for (let c = 0; c < CONCURRENCY; c++) {
        loadNext();
      }
    };

    const updateScrollFrame = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      if (!sequencePreloaded && scrollY > 16 && navigator.onLine) {
        preloadFrames();
      }
      const aboutEl = document.getElementById('about');
      const maxScroll = aboutEl ? (aboutEl.offsetTop - 80) : (window.innerHeight * 0.9);
      const progress = Math.min(1, Math.max(0, scrollY / (maxScroll || 600)));

      const newTarget = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * (TOTAL_FRAMES - 1)));
      if (newTarget !== targetIndex) {
        targetIndex = newTarget;
        requestRender();
      }
    };

    const loadHeroPrimaryFrame = (bustCache = false) => {
      if (heroSection && bustCache) markSkeletonLoading(heroSection);
      const frame0 = new Image();
      frame0.decoding = 'async';
      const baseSrc = getFramePath(0);
      frame0.src = bustCache ? `${baseSrc}?retry=${Date.now()}` : baseSrc;

      const heroTimer = setTimeout(() => {
        if (!frame0.complete || frame0.naturalWidth === 0) {
          if (heroSection) markSkeletonError(heroSection, 'Hero visual unable to load — Skeletal view');
        }
      }, isSlowNetwork() ? 10000 : 6500);

      frame0.onload = () => {
        clearTimeout(heroTimer);
        frames[0] = frame0;
        drawFrame(frame0);
        if (heroSection) markSkeletonLoaded(heroSection);

        if (!isSlowNetwork() && !prefersReducedMotion) {
          if ('requestIdleCallback' in window) {
            window.requestIdleCallback(preloadFrames, { timeout: 600 });
          } else {
            setTimeout(preloadFrames, 200);
          }
        }
      };

      frame0.onerror = () => {
        clearTimeout(heroTimer);
        if (heroSection) markSkeletonError(heroSection, 'Hero visual unable to load — Skeletal view');
      };

      frames[0] = frame0;
    };

    if (heroSection) {
      const heroOverlay = ensureSkeletonOverlay(heroSection);
      const heroRetryBtn = heroOverlay.querySelector('.skeleton-retry-btn');
      if (heroRetryBtn) {
        heroRetryBtn.addEventListener('click', (e) => {
          e.preventDefault();
          loadHeroPrimaryFrame(true);
        });
      }
      skeletonRegistry.push({
        container: heroSection,
        img: null,
        retryLoad: () => loadHeroPrimaryFrame(true)
      });
    }

    loadHeroPrimaryFrame(false);

    window.addEventListener('scroll', updateScrollFrame, { passive: true });
    window.addEventListener('resize', updateScrollFrame, { passive: true });
    updateScrollFrame();
  }

  // Global retry handler for #networkRetryBtn and browser online/offline events
  const retryAllFailedSkeletons = () => {
    skeletonRegistry.forEach((item) => {
      if (item.container.classList.contains('is-skeleton-error') || item.container.classList.contains('is-skeleton')) {
        item.retryLoad();
      }
    });
    updateNetworkBanner();
  };

  if (networkRetryBtn) {
    networkRetryBtn.addEventListener('click', retryAllFailedSkeletons);
  }
  const networkDismissBtn = document.getElementById('networkDismissBtn');
  if (networkDismissBtn && networkBanner) {
    networkDismissBtn.addEventListener('click', () => {
      networkBanner.classList.remove('is-visible');
      setTimeout(() => { networkBanner.hidden = true; }, 250);
    });
  }
  window.addEventListener('online', retryAllFailedSkeletons);
  window.addEventListener('offline', () => {
    skeletonRegistry.forEach((item) => {
      if (!item.container.classList.contains('is-loaded')) {
        markSkeletonError(item.container, 'Offline — Skeletal view');
      }
    });
    updateNetworkBanner();
  });

  // Support URL query parameter (?skeleton=error or ?skeleton=loading) and global helper for testing skeletal fallback
  window.mlrSetSkeletalMode = (mode) => {
    skeletonRegistry.forEach(({ container, retryLoad }) => {
      if (mode === 'error') {
        markSkeletonError(container, 'Unable to load — Skeletal view');
      } else if (mode === 'loading') {
        markSkeletonLoading(container);
      } else {
        retryLoad();
      }
    });
    updateNetworkBanner();
  };

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('skeleton') === 'error') {
    window.mlrSetSkeletalMode('error');
  } else if (urlParams.get('skeleton') === 'loading') {
    window.mlrSetSkeletalMode('loading');
  } else {
    updateNetworkBanner();
  }

  /* Section 5: What We Manufacture layout rendered via CSS grid & flex */

  /* =========================================================================
     SECTION 7: PROJECTS CAROUSEL INTERACTION
     ========================================================================= */
  const projTrack = document.getElementById('projectsSliderTrack');
  const projPrevBtn = document.getElementById('projPrevBtn');
  const projNextBtn = document.getElementById('projNextBtn');

  if (projTrack && projPrevBtn && projNextBtn) {
    const cards = projTrack.querySelectorAll('.project-slide-card');

    const updateCarouselState = () => {
      const scrollLeft = projTrack.scrollLeft;
      const maxScroll = projTrack.scrollWidth - projTrack.clientWidth;

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
        let brickLenMm = 300;
        let brickWidMm = 200;
        let brickHtMm = 200;

        const sizeVal = calcBrickSize ? calcBrickSize.value : '300x200x200';
        if (sizeVal === '300x200x200') {
          brickLenMm = 300; brickWidMm = 200; brickHtMm = 200;
        } else if (sizeVal === '300x200x150') {
          brickLenMm = 300; brickWidMm = 200; brickHtMm = 150;
        } else if (sizeVal === '300x200x100') {
          brickLenMm = 300; brickWidMm = 200; brickHtMm = 100;
        } else if (sizeVal === '290x225x140') {
          brickLenMm = 290; brickWidMm = 225; brickHtMm = 140;
        } else if (sizeVal === '290x140x100') {
          brickLenMm = 290; brickWidMm = 140; brickHtMm = 100;
        } else if (sizeVal === 'custom') {
          brickLenMm = Math.max(50, parseFloat(customLen ? customLen.value : 300) || 300);
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
     10. RAPID ENQUIRY FORM VALIDATION & FEEDBACK (STRICT RESTRICTION + reCAPTCHA)
     ========================================================================== */
  const enquiryForm = document.getElementById('enquiry-form');
  const enquirySuccess = document.getElementById('enquiry-success');
  const enquirySuccessMsg = document.getElementById('enquiry-success-msg');
  const btnResetForm = document.getElementById('btn-reset-form');
  const submitBtn = document.getElementById('btn-submit-enquiry');

  const nameInput = document.getElementById('form-name');
  const contactInput = document.getElementById('form-contact');
  const emailInput = document.getElementById('form-email');
  const locationInput = document.getElementById('form-location');
  const messageInput = document.getElementById('form-message'); // Requirement details
  const productSelect = document.getElementById('form-product');
  const quantityInput = document.getElementById('form-quantity');

  const errName = document.getElementById('err-name');
  const errContact = document.getElementById('err-contact');
  const errEmail = document.getElementById('err-email');
  const errLocation = document.getElementById('err-location');
  const errMessage = document.getElementById('err-message');
  const errCaptcha = document.getElementById('err-captcha');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9+\-\s()]{7,20}$/;

  function checkEnquiryValidity(showErrors = false) {
    const nameVal = nameInput ? nameInput.value.trim() : '';
    const contactVal = contactInput ? contactInput.value.trim() : '';
    const emailVal = emailInput ? emailInput.value.trim() : '';
    const locationVal = locationInput ? locationInput.value.trim() : '';
    const messageVal = messageInput ? messageInput.value.trim() : '';
    const captchaToken = (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) ? grecaptcha.getResponse() : '';

    let isValid = true;

    if (!nameVal || nameVal.length < 2) {
      if (showErrors && errName) errName.textContent = 'Please enter your full name.';
      isValid = false;
    } else if (errName) {
      errName.textContent = '';
    }

    if (!contactVal || !phoneRegex.test(contactVal)) {
      if (showErrors && errContact) errContact.textContent = 'Please enter a valid phone number.';
      isValid = false;
    } else if (errContact) {
      errContact.textContent = '';
    }

    if (!emailVal || !emailRegex.test(emailVal)) {
      if (showErrors && errEmail) errEmail.textContent = 'Please enter a valid email address.';
      isValid = false;
    } else if (errEmail) {
      errEmail.textContent = '';
    }

    if (!locationVal) {
      if (showErrors && errLocation) errLocation.textContent = 'Please specify your site location.';
      isValid = false;
    } else if (errLocation) {
      errLocation.textContent = '';
    }

    if (!messageVal) {
      if (showErrors && errMessage) errMessage.textContent = 'Please provide your requirement or project parameters.';
      isValid = false;
    } else if (errMessage) {
      errMessage.textContent = '';
    }

    if (errCaptcha && isValid) {
      errCaptcha.textContent = '';
    }

    if (submitBtn) {
      submitBtn.disabled = !isValid;
      if (!isValid) {
        submitBtn.setAttribute('title', 'Please provide name, phone, email, location, and requirement to submit');
      } else {
        submitBtn.removeAttribute('title');
      }
    }

    return isValid;
  }

  if (enquiryForm) {
    // Monitor real-time user inputs so the button unlocks as soon as requirements are fulfilled
    [nameInput, contactInput, emailInput, locationInput, messageInput].forEach(field => {
      if (!field) return;
      field.addEventListener('input', () => {
        checkEnquiryValidity(false);
      });
      field.addEventListener('blur', () => {
        if (!field.value.trim()) {
          checkEnquiryValidity(true);
        } else {
          checkEnquiryValidity(false);
        }
      });
    });

    // Initial check: ensure button starts disabled until all required fields are provided
    checkEnquiryValidity(false);

    enquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isValid = checkEnquiryValidity(true);
      if (!isValid) {
        if (nameInput && !nameInput.value.trim()) nameInput.focus();
        else if (contactInput && (!contactInput.value.trim() || !phoneRegex.test(contactInput.value.trim()))) contactInput.focus();
        else if (emailInput && (!emailInput.value.trim() || !emailRegex.test(emailInput.value.trim()))) emailInput.focus();
        else if (locationInput && !locationInput.value.trim()) locationInput.focus();
        else if (messageInput && !messageInput.value.trim()) messageInput.focus();
        return;
      }

      const captchaToken = (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) ? grecaptcha.getResponse() : '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-label">Verifying &amp; Sending Mail...</span>';
      }

      const payload = {
        full_name: nameInput ? nameInput.value.trim() : '',
        phone: contactInput ? contactInput.value.trim() : '',
        contact_info: contactInput ? contactInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        product_interest: productSelect ? productSelect.value : 'CC Bricks',
        estimated_quantity: quantityInput ? quantityInput.value.trim() : '',
        project_location: locationInput ? locationInput.value.trim() : '',
        project_parameters: messageInput ? messageInput.value.trim() : '',
        'g-recaptcha-response': captchaToken,
        token: captchaToken,
        website: ''
      };

      const formBody = new URLSearchParams(payload).toString();
      let serverMsg = '';

      try {
        const endpoint = enquiryForm.getAttribute('action') || 'contact_validate.php';
        const requestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json'
          },
          body: formBody
        };

        let response = await fetch(endpoint, requestInit).catch(() => null);
        let rawText = response ? await response.text() : '';
        let result = null;

        try {
          result = rawText ? JSON.parse(rawText) : null;
        } catch (_) {
          result = null;
        }

        // If opened via a static server (e.g. Live Server / file) where .php is not executed, fallback to local Node server on port 3030
        if (!result && window.location.port !== '3030') {
          response = await fetch('http://localhost:3030/contact_validate.php', requestInit);
          rawText = await response.text();
          result = JSON.parse(rawText);
        }

        if (!result) {
          throw new Error('Empty or non-JSON response from mail endpoint');
        }

        const isSuccess = result.success === true || result.status === 'success';

        if (!response.ok || !isSuccess) {
          const errorMessage = result.message || result.error || 'Submission failed. Please verify your details and try again.';
          if (errCaptcha) errCaptcha.textContent = errorMessage;
          if (typeof grecaptcha !== 'undefined' && grecaptcha.reset) grecaptcha.reset();
          checkEnquiryValidity(false);
          if (submitBtn) {
            submitBtn.innerHTML = `<span class="btn-label">Request a Project Quote</span><span class="btn-arrow-block" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>`;
          }
          return;
        }

        serverMsg = result.message || '';
      } catch (err) {
        console.error('Form submission error:', err);
        if (errCaptcha) {
          errCaptcha.textContent = 'Unable to reach mail server. Please call +91 94905 57886 or email keshanthenvizon@gmail.com.';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span class="btn-label">Request a Project Quote</span><span class="btn-arrow-block" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>`;
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span class="btn-label">Request a Project Quote</span><span class="btn-arrow-block" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span>`;
      }
      if (enquirySuccessMsg && serverMsg) {
        enquirySuccessMsg.textContent = serverMsg;
      }
      enquiryForm.classList.add('hidden');
      if (enquirySuccess) {
        enquirySuccess.classList.remove('hidden');
      }
    });
  }

  if (btnResetForm) {
    btnResetForm.addEventListener('click', () => {
      if (enquiryForm) {
        enquiryForm.reset();
        if (typeof grecaptcha !== 'undefined' && grecaptcha.reset) {
          grecaptcha.reset();
        }
        if (errName) errName.textContent = '';
        if (errContact) errContact.textContent = '';
        if (errEmail) errEmail.textContent = '';
        if (errLocation) errLocation.textContent = '';
        if (errMessage) errMessage.textContent = '';
        if (errCaptcha) errCaptcha.textContent = '';
        checkEnquiryValidity(false);
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

  // Blog Reading Progress Bar & Sidebar TOC Scroll-Spy
  const readingProgressFill = document.getElementById('blogReadingProgressFill');
  const blogTocLinks = document.querySelectorAll('.blog-toc-link');
  const copyLinkBtn = document.getElementById('copyArticleLinkBtn');

  if (readingProgressFill || blogTocLinks.length > 0) {
    const tocTargets = Array.from(blogTocLinks).map(link => {
      const id = (link.getAttribute('href') || '').replace(/^#/, '');
      return { link, el: id ? document.getElementById(id) : null };
    }).filter(item => item.el);

    const updateBlogScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (readingProgressFill && docHeight > 0) {
        const pct = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
        readingProgressFill.style.width = `${pct}%`;
      }

      if (tocTargets.length > 0) {
        let activeIdx = 0;
        const triggerLine = Math.max(180, Math.min(300, window.innerHeight * 0.34));
        for (let i = 0; i < tocTargets.length; i++) {
          const rect = tocTargets[i].el.getBoundingClientRect();
          if (rect.top <= triggerLine) {
            activeIdx = i;
          }
        }
        // If user has scrolled to the bottom of the page, highlight the final section
        if (docHeight > 0 && scrollTop >= docHeight - 60) {
          activeIdx = tocTargets.length - 1;
        }
        tocTargets.forEach((item, idx) => {
          item.link.classList.toggle('active', idx === activeIdx);
        });
      }
    };

    window.addEventListener('scroll', updateBlogScroll, { passive: true });
    window.addEventListener('resize', updateBlogScroll, { passive: true });
    if (lenis && typeof lenis.on === 'function') {
      lenis.on('scroll', updateBlogScroll);
    }
    updateBlogScroll();
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          copyLinkBtn.classList.add('is-copied');
          setTimeout(() => copyLinkBtn.classList.remove('is-copied'), 1800);
        });
      }
    });
  }
});

