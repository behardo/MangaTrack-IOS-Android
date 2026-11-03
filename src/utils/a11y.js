/**
 * Keyboard activation for clickable non-button elements (cards, tabs, stars).
 * The target check keeps Enter/Space on a nested button from also firing the
 * parent card handler.
 */
export function onActivateKey(handler) {
  return event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      handler?.(event);
    }
  };
}
