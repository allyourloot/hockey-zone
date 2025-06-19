import { Entity } from 'hytopia';
import type { World } from 'hytopia';
import * as CONSTANTS from '../utils/constants';
import { IceSkatingController } from '../controllers/IceSkatingController';

export class PuckTrailEffect {
  private puck: Entity;
  private world: World;
  private trailParticles: Entity[] = [];
  private lastPosition: { x: number, y: number, z: number } | null = null;
  private lastUpdateTime: number = 0;
  
  constructor(puck: Entity, world: World) {
    this.puck = puck;
    this.world = world;
  }

  public update(): void {
    if (!this.puck || !this.puck.isSpawned) return;

    // Check if the puck is currently being controlled by a player
    const isPuckControlled = IceSkatingController._globalPuckController !== null && 
                            IceSkatingController._globalPuckController.isControllingPuck;

    // If puck just became controlled, immediately clear existing trail particles
    if (isPuckControlled && this.trailParticles.length > 0) {
      this.clearTrail();
    }

    const currentTime = Date.now();
    const currentPosition = this.puck.position;

    // Calculate puck speed
    let speed = 0;
    if (this.lastPosition) {
      const dx = currentPosition.x - this.lastPosition.x;
      const dz = currentPosition.z - this.lastPosition.z;
      speed = Math.sqrt(dx * dx + dz * dz) * 20; // Approximate speed
    }

    // Only spawn trail particles if puck is moving fast enough AND not controlled by a player
    if (!isPuckControlled && 
        speed > CONSTANTS.PUCK_TRAIL.MIN_SPEED_FOR_TRAIL && 
        currentTime - this.lastUpdateTime > CONSTANTS.PUCK_TRAIL.SPAWN_INTERVAL) {
      
      this.spawnTrailParticle(currentPosition);
      this.lastUpdateTime = currentTime;
    }

    // Update existing particles (fade them out)
    this.updateTrailParticles();
    
    this.lastPosition = { ...currentPosition };
  }

  private spawnTrailParticle(position: { x: number, y: number, z: number }): void {
    // Create a trail particle using the custom puck trail model (white-to-gray gradient plane)
    const particle = new Entity({
      modelUri: 'models/particles/puck-trail.gltf',
      modelScale: CONSTANTS.PUCK_TRAIL.PARTICLE_SCALE
    });

    // Calculate spawn position with slight randomness and at ice level
    const spawnPosition = {
      x: position.x + (Math.random() - 0.5) * CONSTANTS.PUCK_TRAIL.POSITION_RANDOMNESS,
      y: position.y - 0.02, // Spawn slightly below puck center for clean trail appearance
      z: position.z + (Math.random() - 0.5) * CONSTANTS.PUCK_TRAIL.POSITION_RANDOMNESS
    };

    // Spawn the particle at the calculated position
    particle.spawn(this.world, spawnPosition);
    
    // Add to our trail array
    this.trailParticles.push(particle);
    
    // Remove old particles if we have too many
    if (this.trailParticles.length > CONSTANTS.PUCK_TRAIL.MAX_LENGTH) {
      const oldParticle = this.trailParticles.shift();
      if (oldParticle && oldParticle.isSpawned) {
        oldParticle.despawn();
      }
    }

    // Schedule this particle for removal
    setTimeout(() => {
      this.removeParticle(particle);
    }, CONSTANTS.PUCK_TRAIL.PARTICLE_LIFETIME);
  }

  private updateTrailParticles(): void {
    // Make particles slowly fade/shrink (visual effect)
    // Note: Hytopia SDK doesn't support dynamic model scaling after spawn
    // The fading effect will be handled through particle lifetime instead
    this.trailParticles.forEach((particle, index) => {
      if (particle && particle.isSpawned) {
        // Particles will naturally fade as they get removed by timeout
        // Future enhancement: could recreate particles with smaller scale
      }
    });
  }

  private removeParticle(particle: Entity): void {
    const index = this.trailParticles.indexOf(particle);
    if (index > -1) {
      this.trailParticles.splice(index, 1);
    }
    
    if (particle && particle.isSpawned) {
      particle.despawn();
    }
  }

  public clearTrail(): void {
    // Immediately clear all trail particles (used when puck becomes controlled)
    this.trailParticles.forEach(particle => {
      if (particle && particle.isSpawned) {
        particle.despawn();
      }
    });
    this.trailParticles = [];
  }

  public cleanup(): void {
    // Clean up all trail particles
    this.clearTrail();
  }

  public setPuck(newPuck: Entity): void {
    // Clean up old trail when switching pucks
    this.cleanup();
    this.puck = newPuck;
    this.lastPosition = null;
    this.lastUpdateTime = 0;
  }
} 