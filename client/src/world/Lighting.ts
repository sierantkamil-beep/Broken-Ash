import Phaser from "phaser";

export interface LightSource {
  /** Screen position (px). */
  x: number;
  y: number;
  /** Radius in px. */
  radius: number;
  color: number;
  intensity: number;
  flicker?: boolean;
  seed: number;
}

export const DEPTH_LIGHT = 9.5e6;

/**
 * Night: a render texture filled with the ambient colour, with every light stamped in additively,
 * then multiplied over the scene. Lights are 2:1 ellipses so they lie on the iso ground.
 */
export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private ambient: number;

  constructor(
    private readonly scene: Phaser.Scene,
    ambient: number,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.ambient = ambient;
    this.rt = this.create(16, 16);
  }

  private create(w: number, h: number) {
    const rt = this.scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(DEPTH_LIGHT).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.layer.add(rt);
    return rt;
  }

  setAmbient(color: number) {
    this.ambient = color;
  }

  render(time: number, lights: LightSource[]) {
    const view = this.scene.cameras.main.worldView;
    const pad = 256;
    const w = Math.ceil(view.width + pad * 2);
    const h = Math.ceil(view.height + pad * 2);
    // RenderTexture.resize() doesn't grow the WebGL framebuffer in Phaser 3.90, so recreate instead.
    if (this.rt.width < w || this.rt.height < h || this.rt.width > w * 1.5 || this.rt.height > h * 1.5) {
      this.rt.destroy();
      this.rt = this.create(w, h);
    }
    const ox = Math.floor(view.x - pad);
    const oy = Math.floor(view.y - pad);
    this.rt.setPosition(ox, oy);
    this.rt.clear();
    this.rt.fill(this.ambient, 1);
    for (const l of lights) {
      const f = l.flicker ? 1 + Math.sin(time / 83 + l.seed) * 0.035 + Math.sin(time / 31 + l.seed * 3) * 0.025 : 1;
      const r = l.radius * f;
      if (l.x + r < ox || l.y + r < oy || l.x - r > ox + w || l.y - r > oy + h) continue;
      this.rt.stamp("fx", "light", l.x - ox, l.y - oy, {
        scaleX: (r * 2) / 256,
        scaleY: (r * 2 * 0.62) / 256,
        tint: l.color,
        alpha: l.intensity * f,
        blendMode: Phaser.BlendModes.ADD,
      });
    }
  }
}
