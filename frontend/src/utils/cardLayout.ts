/**
 * Geometry of the AnimalCard artboard (~/Documents/rive-cli/animal-card/rive/scene.rml).
 * Keep in sync with the artboard size and the Card3D / Aura positions there.
 */
export const ARTBOARD = { width: 610, height: 1082 };
export const CARD = { x: 305, y: 440, width: 358.5, height: 508.5 };

export type Rect = { left: number; top: number; width: number; height: number };

/** Where the card lands on screen when the artboard is drawn with Fit.Cover + Alignment.TopCenter. */
export function cardRectOnScreen(containerWidth: number, containerHeight: number): Rect {
  const scale = Math.max(containerWidth / ARTBOARD.width, containerHeight / ARTBOARD.height);
  const offsetX = (containerWidth - ARTBOARD.width * scale) / 2;
  return {
    left: offsetX + (CARD.x - CARD.width / 2) * scale,
    top: (CARD.y - CARD.height / 2) * scale,
    width: CARD.width * scale,
    height: CARD.height * scale,
  };
}
