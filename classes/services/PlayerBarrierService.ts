import { Entity, RigidBodyType, ColliderShape, CollisionGroup, CoefficientCombineRule, EntityEvent, Vector3Like } from 'hytopia';
import { HockeyTeam } from '../utils/types';
import * as CONSTANTS from '../utils/constants';

/**
 * Goal zone configuration for coordinate-based player blocking
 */
interface GoalZone {
  minX: number;
  maxX: number;
  goalLineZ: number;
  team: HockeyTeam;
  name: string;
}

/**
 * Service to prevent players from entering goal areas using coordinate-based detection
 * Similar to GoalDetectionService but for player position monitoring
 */
export class PlayerBarrierService {
  private static _instance: PlayerBarrierService;
  private _isActive: boolean = false;
  private _world: any = null;
  private _monitoringInterval: NodeJS.Timeout | null = null;
  private _lastPushTime: Map<string, number> = new Map(); // Track last push time per player
  
  // Goal zones based on the same coordinates as GoalDetectionService
  private readonly GOAL_ZONES: Record<string, GoalZone> = {
    BLUE: {
      minX: -1.17,
      maxX: 1.16,
      goalLineZ: 31.26, // Blue goal line
      team: HockeyTeam.BLUE,
      name: 'Blue Goal'
    },
    RED: {
      minX: -1.17,
      maxX: 1.16,
      goalLineZ: -31.285, // Red goal line
      team: HockeyTeam.RED,
      name: 'Red Goal'
    }
  };

  private constructor() {}

  public static get instance(): PlayerBarrierService {
    if (!PlayerBarrierService._instance) {
      PlayerBarrierService._instance = new PlayerBarrierService();
    }
    return PlayerBarrierService._instance;
  }

  /**
   * Start monitoring player positions to prevent goal area entry
   */
  public startMonitoring(world: any): void {
    if (this._isActive) {
      console.log('[PlayerBarrierService] Player monitoring already active');
      return;
    }

    console.log('[PlayerBarrierService] Starting coordinate-based player monitoring...');
    
    this._world = world;
    this._isActive = true;
    
    // Monitor player positions every 50ms (20 times per second)
    this._monitoringInterval = setInterval(() => {
      this.checkPlayerPositions();
    }, 50);
    
    console.log('[PlayerBarrierService] Player position monitoring started');
  }

  /**
   * Stop monitoring player positions
   */
  public stopMonitoring(): void {
    if (this._monitoringInterval) {
      clearInterval(this._monitoringInterval);
      this._monitoringInterval = null;
    }
    
    this._isActive = false;
    this._world = null;
    console.log('[PlayerBarrierService] Player position monitoring stopped');
  }

  /**
   * Check all player positions and push back any players in goal areas
   */
  private checkPlayerPositions(): void {
    if (!this._world || !this._isActive) {
      return;
    }

    try {
      // Get all player entities using the EntityManager
      const playerEntities = this._world.entityManager.getAllPlayerEntities();
      
      for (const entity of playerEntities) {
        if (entity.isSpawned) {
          const position = entity.position;
          
          // Check if player is in any goal zone
          for (const zone of Object.values(this.GOAL_ZONES)) {
            if (this.isPlayerInGoalZone(position, zone)) {
              // Add more detailed debug info
              const velocity = entity.velocity;
              console.log(`[PlayerBarrierService] Player ${entity.id} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) detected in ${zone.name} - velocity Z: ${velocity?.z?.toFixed(2) || 'unknown'}`);
              this.blockPlayerMovement(entity, zone);
            }
          }
        }
      }
    } catch (error) {
      console.warn('[PlayerBarrierService] Error checking player positions:', error);
    }
  }

  /**
   * Check if a player is within a goal zone (approaching from center ice side only)
   */
  private isPlayerInGoalZone(position: Vector3Like, zone: GoalZone): boolean {
    // Check X bounds (goal width)
    if (position.x < zone.minX || position.x > zone.maxX) {
      return false;
    }
    
    // Check Y bounds (reasonable height)
    if (position.y < 0.5 || position.y > 4.0) {
      return false;
    }
    
    // Check if player is approaching the goal line from the CENTER ICE side only
    // Don't block players who are behind the goal (outside the rink)
    const bufferDistance = 1.2; // 1.2 blocks buffer before goal line
    
    if (zone.team === HockeyTeam.BLUE) {
      // Blue goal at Z=31.26 - only block players coming from negative Z (center ice)
      // Don't block players who are already past the goal line (behind the goal)
      const isApproachingFromCenterIce = position.z >= (zone.goalLineZ - bufferDistance) && position.z <= zone.goalLineZ;
      return isApproachingFromCenterIce;
    } else {
      // Red goal at Z=-31.285 - only block players coming from positive Z (center ice)
      // Don't block players who are already past the goal line (behind the goal)
      const isApproachingFromCenterIce = position.z <= (zone.goalLineZ + bufferDistance) && position.z >= zone.goalLineZ;
      return isApproachingFromCenterIce;
    }
  }

  /**
   * Create an invisible wall effect by blocking movement toward the goal
   */
  private blockPlayerMovement(playerEntity: Entity, zone: GoalZone): void {
    try {
      const playerId = playerEntity.id;
      const currentTime = Date.now();
      const lastBlockTime = this._lastPushTime.get(playerId) || 0;
      
      // Only apply blocking every 25ms for more responsive blocking
      if (currentTime - lastBlockTime < 25) {
        return;
      }
      
      this._lastPushTime.set(playerId, currentTime);
      
      // Get current position
      const position = playerEntity.position;
      
      // Determine safe position based on goal zone
      let safeZ: number;
      let shouldTeleport = false;
      
      if (zone.team === HockeyTeam.BLUE) {
        // Blue goal at Z=31.26 - keep player at safe distance
        safeZ = zone.goalLineZ - 1.5; // 1.5 blocks before goal line (reduced from 2.5)
        shouldTeleport = position.z > (zone.goalLineZ - 0.8); // If within 0.8 blocks, teleport back
      } else {
        // Red goal at Z=-31.285 - keep player at safe distance  
        safeZ = zone.goalLineZ + 1.5; // 1.5 blocks before goal line (reduced from 2.5)
        shouldTeleport = position.z < (zone.goalLineZ + 0.8); // If within 0.8 blocks, teleport back
      }
      
      if (shouldTeleport) {
        // Player got too close - teleport them back to safe position
        const safePosition = {
          x: position.x,
          y: position.y,
          z: safeZ
        };
        
        playerEntity.setPosition(safePosition);
        
        // Also stop their velocity to prevent continued movement
        try {
          playerEntity.setVelocity({ x: 0, y: 0, z: 0 });
        } catch (velocityError) {
          // If velocity setting fails, try applying an impulse in the opposite direction
          const pushForce = zone.team === HockeyTeam.BLUE ? -5.0 : 5.0;
          const mass = playerEntity.mass || 1.0;
          playerEntity.applyImpulse({ x: 0, y: 0, z: pushForce * mass });
        }
        
        console.log(`[PlayerBarrierService] Teleported player ${playerId} away from ${zone.name} to safe position Z=${safeZ.toFixed(2)}`);
      } else {
        // Player is in buffer zone - try to stop their movement toward goal
        try {
          const velocity = playerEntity.velocity;
          if (velocity) {
            let shouldBlock = false;
            
            if (zone.team === HockeyTeam.BLUE && velocity.z > 0.1) {
              shouldBlock = true;
            } else if (zone.team === HockeyTeam.RED && velocity.z < -0.1) {
              shouldBlock = true;
            }
            
            if (shouldBlock) {
              // Stop Z movement only
              playerEntity.setVelocity({
                x: velocity.x,
                y: velocity.y,
                z: 0
              });
              console.log(`[PlayerBarrierService] Stopped Z movement for player ${playerId} in ${zone.name}`);
            }
          }
        } catch (velocityError) {
          // If velocity methods fail, apply counter-impulse
          const pushForce = zone.team === HockeyTeam.BLUE ? -3.0 : 3.0;
          const mass = playerEntity.mass || 1.0;
          playerEntity.applyImpulse({ x: 0, y: 0, z: pushForce * mass });
          console.log(`[PlayerBarrierService] Applied counter-impulse to player ${playerId} in ${zone.name}`);
        }
      }
      
    } catch (error) {
      console.warn('[PlayerBarrierService] Error blocking player movement:', error);
    }
  }

  /**
   * Check if an entity is a player
   */
  private isPlayerEntity(entity: any): boolean {
    if (!entity) return false;
    
    try {
      // Check for player-specific properties
      const hasPlayerProp = !!(entity.player);
      const isPlayerModel = entity.modelUri && entity.modelUri.includes('player');
      
      // Player entities should have .player property AND use player model
      return hasPlayerProp && isPlayerModel;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if an entity is a puck (for debugging purposes)
   */
  private isPuckEntity(entity: any): boolean {
    if (!entity) return false;
    
    try {
      // Check by model URI
      return entity.modelUri && entity.modelUri.includes('puck');
    } catch (error) {
      return false;
    }
  }

  // Legacy methods for compatibility with existing code
  
  /**
   * Legacy method - now starts coordinate monitoring instead of creating barriers
   */
  public createBarriers(world: any): void {
    console.log('[PlayerBarrierService] createBarriers called - starting coordinate monitoring');
    this.startMonitoring(world);
  }

  /**
   * Legacy method - now stops coordinate monitoring instead of removing barriers
   */
  public removeBarriers(): void {
    console.log('[PlayerBarrierService] removeBarriers called - stopping coordinate monitoring');
    this.stopMonitoring();
  }

  /**
   * Get current monitoring status
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Get debug information about the service
   */
  public getDebugInfo(): any {
    return {
      isActive: this._isActive,
      hasWorld: !!this._world,
      hasMonitoringInterval: !!this._monitoringInterval,
      goalZones: this.GOAL_ZONES
    };
  }
} 