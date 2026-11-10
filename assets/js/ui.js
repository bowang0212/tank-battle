export function createUI(elements) {
  const {
    scoreEl,
    livesEl,
    remainingEl,
    message,
    messageTitle,
    messageText,
  } = elements;

  function updateHUD(score, lives, remaining) {
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
    remainingEl.textContent = String(remaining);
  }

  function showMessage(title, text) {
    message.hidden = false;
    messageTitle.textContent = title;
    messageText.textContent = text;
  }

  function hideMessage() {
    message.hidden = true;
  }

  return {
    updateHUD,
    showMessage,
    hideMessage,
  };
}
