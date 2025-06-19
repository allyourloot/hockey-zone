import { Entity } from 'hytopia';
import type { World } from 'hytopia';
import { PuckTrailEffect } from '../entities/PuckTrailEffect';

export class PuckTrailManager {
  private static _instance: PuckTrailManager | null = null;
  private world: World | null = null;
  private currentTrailEffect: PuckTrailEffect | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static get instance(): PuckTrailManager {
    if (!PuckTrailManager._instance) {
      PuckTrailManager._instance = new PuckTrailManager();
    }
    return PuckTrailManager._instance;
  }

  public initialize(world: World): void {
    this.world = world;
    this.startUpdateLoop();
  }

  public attachTrailToPuck(puck: Entity): void {
    if (!this.world) return;

    // Clean up existing trail
    if (this.currentTrailEffect) {
      this.currentTrailEffect.cleanup();
    }

    // Create new trail effect for this puck
    this.currentTrailEffect = new PuckTrailEffect(puck, this.world);
    console.log('Puck trail effect attached');
  }

  public removeTrail(): void {
    if (this.currentTrailEffect) {
      this.currentTrailEffect.cleanup();
      this.currentTrailEffect = null;
      console.log('Puck trail effect removed');
    }
  }

  public updateTrailPuck(newPuck: Entity): void {
    if (this.currentTrailEffect) {
      this.currentTrailEffect.setPuck(newPuck);
    } else if (this.world) {
      this.attachTrailToPuck(newPuck);
    }
  }

  private startUpdateLoop(): void {
    // Update trail effect at ~60 FPS
    this.updateInterval = setInterval(() => {
      if (this.currentTrailEffect) {
        this.currentTrailEffect.update();
      }
    }, 16);
  }

  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.currentTrailEffect) {
      this.currentTrailEffect.cleanup();
      this.currentTrailEffect = null;
    }
  }
} 