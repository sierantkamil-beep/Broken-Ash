import Phaser from "phaser";

interface Petal {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  sway: number;
  phase: number;
  spin: number;
  tumble: number;
  life: number;
}

/**
 * Red blossom petals drifting down across the view. Hand-rolled instead of a particle emitter so
 * each petal can sway and tumble (scaleX through a cosine) like a real falling petal.
 */
export class Petals {
  private readonly petals: Petal[] = [];
  private wind = 38;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private base = 70,
  ) {
    for (let i = 0; i < base; i++) this.spawn(true);
  }

  private spawn(anywhere: boolean, burst = false) {
    const v = this.scene.cameras.main.worldView;
    const img = this.scene.add.image(0, 0, "fx", `petal_${Phaser.Math.Between(0, 2)}`).setDepth(9.4e6);
    this.layer.add(img);
    const p: Petal = {
      img,
      x: Phaser.Math.FloatBetween(v.x - 200, v.right + 100),
      y: anywhere ? Phaser.Math.FloatBetween(v.y, v.bottom) : v.y - Phaser.Math.FloatBetween(10, 200),
      vy: Phaser.Math.FloatBetween(28, 60) * (burst ? 1.6 : 1),
      sway: Phaser.Math.FloatBetween(14, 38),
      phase: Math.random() * Math.PI * 2,
      spin: Phaser.Math.FloatBetween(-2.2, 2.2),
      tumble: Phaser.Math.FloatBetween(1.5, 4),
      life: burst ? Phaser.Math.FloatBetween(4, 9) : Infinity,
    };
    if (burst) {
      p.x = Phaser.Math.FloatBetween(v.x, v.right);
      p.y = Phaser.Math.FloatBetween(v.y - 100, v.centerY);
    }
    img.setScale(Phaser.Math.FloatBetween(0.6, 1.1));
    this.petals.push(p);
  }

  /** A gust of extra petals (cinematic beats). */
  burst(amount: number) {
    for (let i = 0; i < amount; i++) this.spawn(false, true);
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    const v = this.scene.cameras.main.worldView;
    this.wind = 38 + Math.sin(time / 4100) * 22;
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.phase += dt * 1.7;
      p.x += (this.wind + Math.sin(p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      const scale = Math.abs(p.img.scaleY);
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + p.spin * dt);
      p.img.scaleX = scale * Math.cos(time / 1000 * p.tumble + p.phase);
      p.img.setAlpha(Math.min(1, p.life));
      const gone = p.y > v.bottom + 40 || p.x > v.right + 220 || p.life <= 0;
      if (gone) {
        p.img.destroy();
        this.petals.splice(i, 1);
        if (this.petals.length < this.base) this.spawn(false);
      }
    }
    while (this.petals.length < this.base) this.spawn(false);
  }
}
