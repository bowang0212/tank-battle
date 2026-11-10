import { CONFIG } from './config.js';
import { rectsOverlap } from './utils.js';

export function isInsideBoard(x, y, size, width, height) {
  return x >= 0 && y >= 0 && x + size <= width && y + size <= height;
}

export function blockedPosition(x, y, size, obstacleList, entities, ignoreEntity = null) {
  const box = { x, y, w: size, h: size };

  if (!isInsideBoard(x, y, size, CONFIG.canvas.width, CONFIG.canvas.height)) {
    return true;
  }

  if (obstacleList.some((wall) => rectsOverlap(box, wall))) {
    return true;
  }

  return entities.some((entity) => {
    if (entity === ignoreEntity || !entity) {
      return false;
    }

    const target = { x: entity.x, y: entity.y, w: size, h: size };
    return rectsOverlap(box, target);
  });
}
