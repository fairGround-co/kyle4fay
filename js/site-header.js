// Shared header behavior: runoff banner expiry, dropdowns, mobile menu,
// and marking the current page in the nav.
(function () {
  var banner = document.getElementById('runoff-banner');
  if (banner && new Date() > new Date('2026-12-02T00:00:00-06:00')) {
    banner.remove();
  }

  var nav = document.getElementById('site-nav');
  var toggle = document.querySelector('.site-menu-toggle');
  if (!nav || !toggle) return;

  var groups = nav.querySelectorAll('.site-nav-group');
  var mobile = window.matchMedia('(max-width: 900px)');

  function closeGroups(except) {
    groups.forEach(function (g) {
      if (g !== except) g.setAttribute('aria-expanded', 'false');
    });
  }

  function closeMenu() {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Desktop dropdowns open on click as well as hover, for touch and keyboard.
  groups.forEach(function (g) {
    g.addEventListener('click', function () {
      if (mobile.matches) return;
      var open = g.getAttribute('aria-expanded') !== 'true';
      closeGroups(g);
      g.setAttribute('aria-expanded', String(open));
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-header')) {
      closeGroups();
      closeMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeGroups();
      closeMenu();
    }
  });

  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      closeGroups();
      closeMenu();
    });

    // Mark the current page (not in-page anchors on the home page).
    var url = new URL(a.href, location.href);
    if (!url.hash && url.origin === location.origin && url.pathname === location.pathname) {
      a.setAttribute('aria-current', 'page');
    }
  });
})();
