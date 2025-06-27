import {
  Entity,
  type EntityOptions,
  RigidBodyType,
  ColliderShape,
  CoefficientCombineRule,
  CollisionGroup,
  type Vector3Like,
  World,
  type QuaternionLike,
  BlockType
} from 'hytopia';

import { ICE_FLOOR_PHYSICS, debugLog } from '../utils/constants';

/**
 * IceFloorEntity - A large invisible block entity that replaces the individual floor blocks
 * to provide smooth collision physics for the puck when CCD is enabled.
 * 
 * This entity sits slightly above the map's floor blocks and provides custom
 * collision properties optimized for puck movement.
 */
export class IceFloorEntity extends Entity {
  
  constructor(options: Partial<EntityOptions> = {}) {
    super({
      name: 'IceFloor',
      blockTextureUri: 'blocks/invisible-block.png', // Visible snow texture for testing
      blockHalfExtents: ICE_FLOOR_PHYSICS.HALF_EXTENTS,
      rigidBodyOptions: {
        type: RigidBodyType.FIXED, // Static floor that doesn't move
        colliders: [
          // Physical ice floor collider optimized for smooth puck physics
          {
            shape: ColliderShape.BLOCK,
            halfExtents: {
              x: ICE_FLOOR_PHYSICS.HALF_EXTENTS.x,
              y: ICE_FLOOR_PHYSICS.HALF_EXTENTS.y, // Keep thin for minimal collision interference
              z: ICE_FLOOR_PHYSICS.HALF_EXTENTS.z
            },
            // Physical collider with optimized properties for ice-like behavior
            friction: ICE_FLOOR_PHYSICS.FRICTION, // Ultra-low friction
            bounciness: ICE_FLOOR_PHYSICS.BOUNCINESS, // Zero bounce for floor (walls should handle bounce)
            frictionCombineRule: CoefficientCombineRule.Min, // Use minimum friction
            bouncinessCombineRule: CoefficientCombineRule.Min, // Use minimum bounce for floor only
            collisionGroups: {
              belongsTo: [CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.ENTITY]
            }
          }
        ]
      },
      ...options
    });
    
    debugLog('IceFloorEntity created with custom physics properties', 'IceFloorEntity');
  }

  /**
   * Spawn the ice floor entity at the correct position
   * @param world - The world to spawn in
   * @param position - Optional position override (defaults to center ice at y=0.1)
   * @param rotation - Optional rotation override
   */
     public spawn(world: World, position?: Vector3Like, rotation?: QuaternionLike): void {
     const spawnPosition = position || ICE_FLOOR_PHYSICS.CENTER_POSITION;
     
     super.spawn(world, spawnPosition, rotation);
     
     debugLog(`IceFloorEntity spawned at position: ${JSON.stringify(spawnPosition)}`, 'IceFloorEntity');
   }



  /**
   * Get the dimensions of the ice floor for reference
   */
  public getFloorDimensions() {
    return {
      totalWidth: 63,  // -31.5 to +31.5
      totalLength: 91, // -45.5 to +45.5
      thickness: 0.2   // 0.1 * 2 (half-extent) - optimized thickness
    };
  }
} 