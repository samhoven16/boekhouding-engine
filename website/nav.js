/* Hamburger-toggle voor canonieke header-nav.
 * Gedeeld script: één bron-van-waarheid over alle pagina's. */
(function () {
  var btn = document.querySelector('body > nav .nav-toggle');
  var menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
})();
