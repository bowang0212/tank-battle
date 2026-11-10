import { createGame } from './game.js';
import { createInputController } from './input.js';
import { createUI } from './ui.js';

const canvas = document.querySelector('#game');
const scoreEl = document.querySelector('#score');
const livesEl = document.querySelector('#lives');
const remainingEl = document.querySelector('#remaining');
const message = document.querySelector('#message');
const messageTitle = document.querySelector('#message-title');
const messageText = document.querySelector('#message-text');
const restartButton = document.querySelector('#restart');

const ui = createUI({
  scoreEl,
  livesEl,
  remainingEl,
  message,
  messageTitle,
  messageText,
});

const inputController = createInputController(() => game.togglePause());

const game = createGame(canvas, ui, inputController);

restartButton.addEventListener('click', () => {
  game.reset();
});
