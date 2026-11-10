export function createInputController(onTogglePause) {
  const keys = new Set();

  const normalizeKey = (value) => value.toLowerCase();

  const onKeyDown = (event) => {
    const key = normalizeKey(event.key);

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      event.preventDefault();
    }

    if (key === 'p') {
      onTogglePause();
    }

    keys.add(key);
  };

  const onKeyUp = (event) => {
    keys.delete(normalizeKey(event.key));
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());

  return {
    isDown(keyName) {
      return keys.has(normalizeKey(keyName));
    },
    clear() {
      keys.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', () => keys.clear());
    },
  };
}
