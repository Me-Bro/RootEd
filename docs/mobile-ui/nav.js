/* Review navigation: arrow keys move between screens, F toggles the fit-all view.
   Static mockups only — no build step, no dependencies. */
(function () {
  function go(sel) {
    var el = document.querySelector('[data-nav="' + sel + '"]');
    if (el && el.tagName === 'A') window.location.href = el.getAttribute('href');
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'j' || k === ' ') {
      e.preventDefault();
      go('next');
    } else if (k === 'ArrowLeft' || k === 'k') {
      e.preventDefault();
      go('prev');
    } else if (k === 'Escape' || k === 'i') {
      go('index');
    } else if (k === 'f') {
      var fit = document.querySelector('#fit');
      if (fit) fit.checked = !fit.checked;
    }
  });

  // Horizontal rails: let the wheel scroll them sideways so a trackpad-less
  // mouse can still reach variant 5.
  document.querySelectorAll('.rail').forEach(function (rail) {
    rail.addEventListener(
      'wheel',
      function (e) {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        if (rail.scrollWidth <= rail.clientWidth) return;
        rail.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false }
    );
  });
})();
