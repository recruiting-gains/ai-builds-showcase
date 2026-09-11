/** Touch/pointer depth is decorative; camera tracking never depends on dashboard motion. */
export function installStudioDepth(cards: NodeListOf<HTMLElement>) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  for (const card of cards) {
    let pending = 0;
    const reset = () => { cancelAnimationFrame(pending); card.style.removeProperty('--card-x'); card.style.removeProperty('--card-y'); };
    const tilt = (event: PointerEvent) => {
      if (motion.matches) return;
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => { card.style.setProperty('--card-x', `${-y * 5}deg`); card.style.setProperty('--card-y', `${x * 7}deg`); });
    };
    card.addEventListener('pointermove', tilt);
    card.addEventListener('pointerdown', tilt);
    for (const type of ['pointerleave', 'pointerup', 'pointercancel']) card.addEventListener(type, reset);
    motion.addEventListener('change', reset);
  }
}
