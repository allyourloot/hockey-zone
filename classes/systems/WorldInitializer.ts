/**
 * WorldInitializer handles world setup, map loading, and entity creation
 * Extracted from index.ts section 2. MAP & WORLD INITIALIZATION
 */

import {
  Entity,
  ModelRegistry,
  RigidBodyType,
  ColliderShape,
  CoefficientCombineRule,
  CollisionGroup,
  SceneUI,
  BlockType,
  Audio
} from 'hytopia';
import type { World } from 'hytopia';
import worldMap from '../../assets/maps/hockey-zone-ayl.json';
import * as CONSTANTS from '../utils/constants';
import { PlayerBarrierService } from '../services/PlayerBarrierService';
import { AudioManager } from '../managers/AudioManager';

export class WorldInitializer {
  private static _instance: WorldInitializer | null = null;
  
  private world: World | null = null;
  private redGoal: Entity | null = null;
  private blueGoal: Entity | null = null;
  private iceFloor: Entity | null = null;
  
  // Private constructor for singleton pattern
  private constructor() {}
  
  public static get instance(): WorldInitializer {
    if (!WorldInitializer._instance) {
      WorldInitializer._instance = new WorldInitializer();
    }
    return WorldInitializer._instance;
  }
  
  /**
   * Initialize the world with map, model registry, and game entities
   * @param world - The game world instance
   */
  public initialize(world: World): void {
    this.world = world;
    
    CONSTANTS.debugLog('Starting world initialization...', 'WorldInitializer');
    
    // Configure model registry
    this.configureModelRegistry();
    
    // Load the game map
    this.loadGameMap();
    
    // Create hockey goals
    this.createHockeyGoals();
    
    // Create player barriers to prevent goal entry
    this.createPlayerBarriers();
    
    // Create ice floor entity for smooth puck physics
    this.createIceFloor();
    
    CONSTANTS.debugLog('World initialization complete', 'WorldInitializer');
  }
  
  /**
   * Configure the model registry settings
   */
  private configureModelRegistry(): void {
    ModelRegistry.instance.optimize = false;
    CONSTANTS.debugLog('Model registry configured', 'WorldInitializer');
  }
  
  /**
   * Load the game map
   */
  private loadGameMap(): void {
    if (!this.world) {
      CONSTANTS.debugError('Cannot load map - world not initialized', undefined, 'WorldInitializer');
      return;
    }
    
    try {
      this.world.loadMap(worldMap);
      CONSTANTS.debugLog('Hockey zone map loaded successfully', 'WorldInitializer');
    } catch (error) {
      CONSTANTS.debugError('Failed to load map', error, 'WorldInitializer');
      throw new Error('Failed to load game map');
    }
  }
  
  /**
   * Create hockey goals for both teams
   */
  private createHockeyGoals(): void {
    if (!this.world) {
      console.error('WorldInitializer: Cannot create goals - world not initialized');
      return;
    }
    
    try {
      // Create red team goal
      this.redGoal = this.createGoalEntity('models/structures/hockey-goal.gltf');
      this.redGoal.spawn(
        this.world, 
        CONSTANTS.SPAWN_POSITIONS.RED_GOAL, 
        { x: 0, y: 1, z: 0, w: 0 }
      );
      
      // Create red goal label UI
      const redGoalLabelUI = new SceneUI({
        templateId: 'red-goal-label',
        attachedToEntity: this.redGoal,
        offset: { x: 0, y: 3.2, z: 0 },
      });
      redGoalLabelUI.load(this.world);
      
      // Create blue team goal with custom model
      this.blueGoal = this.createGoalEntity('models/structures/hockey-goal-blue.gltf');
      this.blueGoal.spawn(
        this.world, 
        CONSTANTS.SPAWN_POSITIONS.BLUE_GOAL, 
        { x: 0, y: 0, z: 0, w: 0 }
      );
      
      // Create blue goal label UI
      const blueGoalLabelUI = new SceneUI({
        templateId: 'blue-goal-label',
        attachedToEntity: this.blueGoal,
        offset: { x: 0, y: 3.2, z: 0 },
      });
      blueGoalLabelUI.load(this.world);
      
      CONSTANTS.debugLog('Hockey goals created and positioned', 'WorldInitializer');
    } catch (error) {
      CONSTANTS.debugError('Failed to create hockey goals', error, 'WorldInitializer');
      throw new Error('Failed to create hockey goals');
    }
  }

  /**
   * Create invisible barriers to prevent players from entering goal areas
   */
  private createPlayerBarriers(): void {
    if (!this.world) {
      CONSTANTS.debugError('Cannot create barriers - world not initialized', undefined, 'WorldInitializer');
      return;
    }

    try {
      PlayerBarrierService.instance.createBarriers(this.world);
      CONSTANTS.debugLog('Player barriers created successfully', 'WorldInitializer');
    } catch (error) {
      CONSTANTS.debugError('Failed to create player barriers', error, 'WorldInitializer');
      throw new Error('Failed to create player barriers');
    }
  }

  /**
   * Create the ice floor entity for smooth puck physics
   */
  private createIceFloor(): void {
    if (!this.world) {
      CONSTANTS.debugError('Cannot create ice floor - world not initialized', undefined, 'WorldInitializer');
      return;
    }

    try {
      this.iceFloor = WorldInitializer.createIceFloorEntity();
      // Use the ICE_FLOOR_PHYSICS constants for proper positioning above floor blocks
      this.iceFloor.spawn(this.world, CONSTANTS.ICE_FLOOR_PHYSICS.CENTER_POSITION);
      
      CONSTANTS.debugLog('Ice floor entity created and spawned for smooth puck physics', 'WorldInitializer');
    } catch (error) {
      CONSTANTS.debugError('Failed to create ice floor entity', error, 'WorldInitializer');
      throw new Error('Failed to create ice floor entity');
    }
  }

      /**
   * Create a hockey goal entity with all colliders
   * @param modelUri The model URI to use for the goal
   * @returns The goal entity with proper physics setup
   */
  private createGoalEntity(modelUri: string): Entity {
    // Track last hit-post sound time to prevent spam
    let lastHitPostSoundTime = 0;
    
    return new Entity({
      modelUri: modelUri,
      modelScale: 0.5,
      rigidBodyOptions: {
        type: RigidBodyType.FIXED,
        colliders: [
          // Left post (vertical bar on the left side of the goal)
          {
            shape: ColliderShape.BLOCK,
            halfExtents: CONSTANTS.GOAL_COLLIDERS.POST_HALF_EXTENTS,
            relativePosition: { 
              x: CONSTANTS.GOAL_COLLIDERS.LEFT_POST_X_OFFSET, 
              y: CONSTANTS.GOAL_COLLIDERS.POST_Y_OFFSET, 
              z: 0 
            },
            friction: CONSTANTS.GOAL_COLLIDERS.FRICTION,
            bounciness: CONSTANTS.GOAL_COLLIDERS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            },
            onCollision: (other: Entity | BlockType, started: boolean) => {
              this.handleGoalPostCollision(other, started, lastHitPostSoundTime, (time: number) => { lastHitPostSoundTime = time; });
            }
          },
          // Right post (vertical bar on the right side of the goal)
          {
            shape: ColliderShape.BLOCK,
            halfExtents: CONSTANTS.GOAL_COLLIDERS.POST_HALF_EXTENTS,
            relativePosition: { 
              x: CONSTANTS.GOAL_COLLIDERS.RIGHT_POST_X_OFFSET, 
              y: CONSTANTS.GOAL_COLLIDERS.POST_Y_OFFSET, 
              z: 0 
            },
            friction: CONSTANTS.GOAL_COLLIDERS.FRICTION,
            bounciness: CONSTANTS.GOAL_COLLIDERS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            },
            onCollision: (other: Entity | BlockType, started: boolean) => {
              this.handleGoalPostCollision(other, started, lastHitPostSoundTime, (time: number) => { lastHitPostSoundTime = time; });
            }
          },
          // Crossbar (horizontal bar at the top front of the goal)
          {
            shape: ColliderShape.BLOCK,
            halfExtents: CONSTANTS.GOAL_COLLIDERS.CROSSBAR_HALF_EXTENTS,
            relativePosition: { x: 0, y: CONSTANTS.GOAL_COLLIDERS.CROSSBAR_Y_OFFSET, z: 0 },
            friction: CONSTANTS.GOAL_COLLIDERS.FRICTION,
            bounciness: CONSTANTS.GOAL_COLLIDERS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            },
            onCollision: (other: Entity | BlockType, started: boolean) => {
              this.handleGoalPostCollision(other, started, lastHitPostSoundTime, (time: number) => { lastHitPostSoundTime = time; });
            }
          },
          // Bottom bar (horizontal bar at the bottom front of the goal)
          {
            shape: ColliderShape.BLOCK,
            halfExtents: CONSTANTS.GOAL_COLLIDERS.BOTTOM_BAR_HALF_EXTENTS,
            relativePosition: { 
              x: 0, 
              y: CONSTANTS.GOAL_COLLIDERS.POST_Y_OFFSET, 
              z: CONSTANTS.GOAL_COLLIDERS.BOTTOM_BAR_Z_OFFSET 
            },
            friction: CONSTANTS.GOAL_COLLIDERS.FRICTION,
            bounciness: CONSTANTS.GOAL_COLLIDERS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            }
          },
          // Netting (back of goal, acts as a thin wall at the rear)
          {
            shape: ColliderShape.BLOCK,
            halfExtents: CONSTANTS.GOAL_COLLIDERS.NETTING_HALF_EXTENTS,
            relativePosition: { 
              x: 0, 
              y: CONSTANTS.GOAL_COLLIDERS.POST_Y_OFFSET, 
              z: CONSTANTS.GOAL_COLLIDERS.NETTING_Z_OFFSET 
            },
            friction: CONSTANTS.GOAL_COLLIDERS.FRICTION,
            bounciness: CONSTANTS.GOAL_COLLIDERS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            }
          }
        ]
      }
    });
  }
  
  /**
   * Create a puck entity with proper physics setup
   * @returns A new puck entity ready for spawning
   */
  public static createPuckEntity(): Entity {
    const puck = new Entity({
      modelUri: 'models/projectiles/puck-hytopia.gltf',
      modelScale: CONSTANTS.PUCK_PHYSICS.MODEL_SCALE,
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        ccdEnabled: CONSTANTS.PUCK_PHYSICS.CCD_ENABLED, // Disable CCD to prevent choppy movement
        linearDamping: CONSTANTS.PUCK_PHYSICS.LINEAR_DAMPING,
        angularDamping: CONSTANTS.PUCK_PHYSICS.ANGULAR_DAMPING,
        enabledRotations: { x: false, y: true, z: false },
        gravityScale: CONSTANTS.PUCK_PHYSICS.GRAVITY_SCALE,
        colliders: [
          {
            shape: ColliderShape.ROUND_CYLINDER,
            radius: CONSTANTS.PUCK_PHYSICS.RADIUS,
            halfHeight: CONSTANTS.PUCK_PHYSICS.HALF_HEIGHT,
            borderRadius: CONSTANTS.PUCK_PHYSICS.BORDER_RADIUS,
            friction: CONSTANTS.PUCK_PHYSICS.FRICTION,
            bounciness: CONSTANTS.PUCK_PHYSICS.BOUNCINESS,
            frictionCombineRule: CoefficientCombineRule.Min,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.ENTITY],
              // Pucks collide with blocks and entities - ice floor will override floor block physics
              // The ice floor entity provides smooth collision surface on top of floor blocks
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
              // Ice floor entity (ENTITY group) will provide smooth physics over rough floor blocks
            }
          }
        ]
      }
    });
    
    // Initialize custom properties for tracking player interactions
    try {
      (puck as any).customProperties = new Map();
      (puck as any).customProperties.set('touchHistory', []);
      (puck as any).customProperties.set('lastTouchedBy', null);
      CONSTANTS.debugLog('Puck created with custom properties support', 'WorldInitializer');
    } catch (error) {
      CONSTANTS.debugWarn('Could not initialize puck custom properties: ' + error, 'WorldInitializer');
    }
    
    return puck;
  }

  /**
   * Create an ice floor entity to replace choppy floor block collisions
   * @returns A new ice floor entity ready for spawning
   */
  public static createIceFloorEntity(): Entity {
    const { IceFloorEntity } = require('../entities/IceFloorEntity');
    const iceFloor = new IceFloorEntity();
    
    CONSTANTS.debugLog('Ice floor entity created for smooth puck physics', 'WorldInitializer');
    return iceFloor;
  }
  
  /**
   * Get the red team goal entity
   */
  public getRedGoal(): Entity | null {
    return this.redGoal;
  }
  
  /**
   * Get the blue team goal entity
   */
  public getBlueGoal(): Entity | null {
    return this.blueGoal;
  }

  /**
   * Get the ice floor entity
   */
  public getIceFloor(): Entity | null {
    return this.iceFloor;
  }

  /**
   * Handle collision between puck and goal posts/crossbar
   */
  private handleGoalPostCollision(
    other: Entity | BlockType, 
    started: boolean, 
    lastHitPostSoundTime: number, 
    updateLastSoundTime: (time: number) => void
  ): void {
    // Only handle collision start events with puck entities
    if (started && other instanceof Entity && other.modelUri && other.modelUri.includes('puck')) {
      // Check if the puck is currently being controlled by a player
      // If so, don't play the hit-post sound (player is just skating into the posts)
      const customProperties = (other as any).customProperties;
      const isControlled = customProperties && customProperties.get('isControlled');
      
      if (isControlled) {
        CONSTANTS.debugLog('Puck hit goal post but is controlled by player - skipping sound', 'WorldInitializer');
        return;
      }
      
      // Check if the puck is moving fast enough to warrant a sound
      const puckVelocity = other.linearVelocity;
      if (puckVelocity) {
        const speed = Math.sqrt(puckVelocity.x * puckVelocity.x + puckVelocity.z * puckVelocity.z);
        
        // Only play sound if puck is moving with sufficient speed (to avoid tiny bumps)
        if (speed > 2.0) {
                    // Check cooldown to prevent sound spam
          const currentTime = Date.now();
          if (currentTime - lastHitPostSoundTime > CONSTANTS.PUCK_SOUND.HIT_POST_COOLDOWN) {
            // Play hit-post sound effect with volume based on speed using pooled audio
            const volume = Math.min(CONSTANTS.PUCK_SOUND.HIT_POST_VOLUME, speed * 0.1);
            const success = AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.HIT_POST, {
              volume: volume,
              attachedToEntity: other,
              referenceDistance: CONSTANTS.PUCK_SOUND.HIT_POST_REFERENCE_DISTANCE,
              duration: 1000 // 1 second duration for hit-post sound
            });
            
            if (success) {
              updateLastSoundTime(currentTime);
              CONSTANTS.debugLog(`Puck hit goal post/crossbar at speed ${speed.toFixed(2)}, volume ${volume.toFixed(2)}`, 'WorldInitializer');
            }
          }
        }
      }
    }
  }
} 