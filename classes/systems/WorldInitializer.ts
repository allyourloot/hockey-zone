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
  SceneUI
} from 'hytopia';
import type { World } from 'hytopia';
import worldMap from '../../assets/maps/hockey-zone.json';
import * as CONSTANTS from '../utils/constants';
import { PlayerBarrierService } from '../services/PlayerBarrierService';

export class WorldInitializer {
  private static _instance: WorldInitializer | null = null;
  
  private world: World | null = null;
  private redGoal: Entity | null = null;
  private blueGoal: Entity | null = null;
  
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
    
    console.log('WorldInitializer: Starting world initialization...');
    
    // Configure model registry
    this.configureModelRegistry();
    
    // Load the game map
    this.loadGameMap();
    
    // Create hockey goals
    this.createHockeyGoals();
    
    // Create player barriers to prevent goal entry
    this.createPlayerBarriers();
    
    console.log('WorldInitializer: World initialization complete');
  }
  
  /**
   * Configure the model registry settings
   */
  private configureModelRegistry(): void {
    ModelRegistry.instance.optimize = false;
    console.log('WorldInitializer: Model registry configured');
  }
  
  /**
   * Load the game map
   */
  private loadGameMap(): void {
    if (!this.world) {
      console.error('WorldInitializer: Cannot load map - world not initialized');
      return;
    }
    
    try {
      this.world.loadMap(worldMap);
      console.log('WorldInitializer: Hockey zone map loaded successfully');
    } catch (error) {
      console.error('WorldInitializer: Failed to load map:', error);
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
      this.redGoal = this.createGoalEntity();
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
      
      // Create blue team goal
      this.blueGoal = this.createGoalEntity();
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
      
      console.log('WorldInitializer: Hockey goals created and positioned');
    } catch (error) {
      console.error('WorldInitializer: Failed to create hockey goals:', error);
      throw new Error('Failed to create hockey goals');
    }
  }

  /**
   * Create invisible barriers to prevent players from entering goal areas
   */
  private createPlayerBarriers(): void {
    if (!this.world) {
      console.error('WorldInitializer: Cannot create barriers - world not initialized');
      return;
    }

    try {
      PlayerBarrierService.instance.createBarriers(this.world);
      console.log('WorldInitializer: Player barriers created successfully');
    } catch (error) {
      console.error('WorldInitializer: Failed to create player barriers:', error);
      throw new Error('Failed to create player barriers');
    }
  }
  
  /**
   * Create a hockey goal entity with all colliders
   * @returns The goal entity with proper physics setup
   */
  private createGoalEntity(): Entity {
    return new Entity({
      modelUri: 'models/structures/hockey-goal.gltf',
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
        ccdEnabled: false, // Enable CCD to prevent tunneling
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
              // Pucks collide with blocks and entities, but NOT with player barriers
              // This allows pucks to pass through goal barriers while players are blocked
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
              // Note: PLAYER_BARRIER group is intentionally excluded from collidesWith
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
      console.log('[WorldInitializer] Puck created with custom properties support');
    } catch (error) {
      console.warn('[WorldInitializer] Could not initialize puck custom properties:', error);
    }
    
    return puck;
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
} 