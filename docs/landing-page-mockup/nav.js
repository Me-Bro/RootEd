/* Review navigation: arrow keys move between concepts, Escape/I opens the index.
   Static mockups only — no build step, no dependencies. */
(function () {
  function go(sel) {
    var el = document.querySelector('[data-nav="' + sel + '"]');
    if (el && el.tagName === 'A') window.location.href = el.getAttribute('href');
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'j') {
      e.preventDefault();
      go('next');
    } else if (k === 'ArrowLeft' || k === 'k') {
      e.preventDefault();
      go('prev');
    } else if (k === 'Escape' || k === 'i') {
      go('index');
    }
  });
})();
