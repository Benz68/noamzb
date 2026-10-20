// Slanted black band behind the page. At the top of the page it covers the right third of the screen;
// as you scroll down it slides across until it covers the left third, and back again when you scroll up.
(function () {
  const root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // stays on the right third
  let queued = false;
  function update() {
    queued = false;
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    root.style.setProperty("--band", (77 - 87 * p).toFixed(2) + "%");
  }
  function request() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request);
  update();
})();
