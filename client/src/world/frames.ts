import Phaser from "phaser";

/** The pivot of an atlas frame in pixels (tools/art writes it into the atlas JSON). */
export function framePivot(scene: Phaser.Scene, atlas: string, frame: string): { x: number; y: number; w: number; h: number } | null {
  const f = scene.textures.getFrame(atlas, frame);
  if (!f || f.name === "__BASE") return null;
  const px = f.customPivot ? f.pivotX : 0.5;
  const py = f.customPivot ? f.pivotY : 0.5;
  return { x: px * f.width, y: py * f.height, w: f.width, h: f.height };
}

export function hasFrame(scene: Phaser.Scene, atlas: string, frame: string): boolean {
  return scene.textures.exists(atlas) && scene.textures.get(atlas).has(frame);
}
