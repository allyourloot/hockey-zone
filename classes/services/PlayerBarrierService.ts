import { Entity, RigidBodyType, ColliderShape, CollisionGroup, CoefficientCombineRule, EntityEvent } from 'hytopia';
import type { Vector3Like, PlayerEntity } from 'hytopia';
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
 * Now includes goalie-aware logic for better positioning experience
 */
export class PlayerBarrierService {
  private static _instance: PlayerBarrierService;
  private _isActive: boolean = false;
  private _world: any = null;
  private _monitoringInterval: NodeJS.Timeout | null = null;
  private _lastPushTime: Map<string, number> = new Map(); // Track last push time per player
  private _persistentAttempts: Map<string, { count: number, firstAttempt: number, lastAttempt: number }> = new Map(); // Track persistent barrier breaking attempts
  
  // Goal zones based on the same coordinates as GoalDetectionService
  private readonly GOAL_ZONES: Record<string, GoalZone> = {
    BLUE: {
      minX: -1.65,
      maxX: 1.65,
      goalLineZ: 31.26, // Blue goal line
      team: HockeyTeam.BLUE,
      name: 'Blue Goal'
    },
    RED: {
      minX: -1.65,
      maxX: 1.65,
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
      CONSTANTS.debugLog('Player monitoring already active', 'PlayerBarrierService');
      return;
    }

    CONSTANTS.debugLog('Starting coordinate-based player monitoring...', 'PlayerBarrierService');
    
    this._world = world;
    this._isActive = true;
    
    // Monitor player positions every 16ms (~60 times per second) for high-speed detection
    this._monitoringInterval = setInterval(() => {
      this.checkPlayerPositions();
    }, 16);
    
    CONSTANTS.debugLog('Player position monitoring started', 'PlayerBarrierService');
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
    CONSTANTS.debugLog('Player position monitoring stopped', 'PlayerBarrierService');
  }

  /**
   * Check if a player is a goalie and if they're near their own goal
   */
  private getPlayerInfo(playerEntity: Entity): { 
    isGoalie: boolean, 
    team: HockeyTeam | null,
    isAtOwnGoal: (zone: GoalZone) => boolean 
  } {
    try {
      // Import HockeyGameManager dynamically to avoid circular dependencies
      const { HockeyGameManager } = require('../managers/HockeyGameManager');
      const gameManager = HockeyGameManager.instance;
      
      // Get the actual player ID from the entity's player property
      const playerEntity_ = playerEntity as PlayerEntity;
      const actualPlayerId = playerEntity_.player?.id;
      
      if (!actualPlayerId) {
        return { 
          isGoalie: false, 
          team: null, 
          isAtOwnGoal: () => false 
        };
      }
      
      const teamInfo = gameManager.getTeamAndPosition(actualPlayerId);
      
      if (!teamInfo) {
        return { 
          isGoalie: false, 
          team: null, 
          isAtOwnGoal: () => false 
        };
      }
      
      const isGoalie = teamInfo.position === 'GOALIE';
      const playerTeam = teamInfo.team;
      
      return {
        isGoalie,
        team: playerTeam,
        isAtOwnGoal: (zone: GoalZone) => zone.team === playerTeam
      };
      
    } catch (error) {
      CONSTANTS.debugWarn('Error getting player info: ' + error, 'PlayerBarrierService');
      return { 
        isGoalie: false, 
        team: null, 
        isAtOwnGoal: () => false 
      };
    }
  }

  /**
   * Check if a player is within a goal zone with goalie-aware logic
   */
  private isPlayerInGoalZone(position: Vector3Like, zone: GoalZone, velocity?: Vector3Like, playerEntity?: Entity): boolean {
    // Check X bounds (goal width)
    if (position.x < zone.minX || position.x > zone.maxX) {
      return false;
    }
    
    // Check Y bounds (reasonable height)
    if (position.y < 0.5 || position.y > 4.0) {
      return false;
    }
    
    // Get player information for goalie-aware logic
    const playerInfo = playerEntity ? this.getPlayerInfo(playerEntity) : { isGoalie: false, team: null, isAtOwnGoal: () => false };
    
    // Different buffer distances based on player type and goal ownership
    let bufferDistance: number;
    
    if (playerInfo.isGoalie && playerInfo.isAtOwnGoal(zone)) {
      // Goalies at their own goal: Extremely small buffer - only detect when very close to actual goal line
      bufferDistance = 0.9; // Match the wall position so detection only happens at the wall
    } else if (playerInfo.isGoalie && !playerInfo.isAtOwnGoal(zone)) {
      // Goalies at opponent's goal: Standard buffer (they shouldn't be camping there)
      bufferDistance = 1.2;
    } else {
      // Non-goalies: Standard buffer for all goals
      bufferDistance = 1.2;
    }
    
    // Velocity-based prediction (completely disabled for goalies at own goal)
    if (velocity && !(playerInfo.isGoalie && playerInfo.isAtOwnGoal(zone))) {
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      
      // For high-speed players, increase buffer distance to catch them earlier
      if (speed > 8) {
        const speedMultiplier = Math.min(2.0, speed / 8);
        bufferDistance = bufferDistance * speedMultiplier;
        
        // Check if they're moving toward the goal
        const isMovingTowardGoal = (zone.team === HockeyTeam.BLUE && velocity.z > 0) || 
                                   (zone.team === HockeyTeam.RED && velocity.z < 0);
        
        if (isMovingTowardGoal && speed > 12) {
          bufferDistance = bufferDistance * 1.5;
        }
      }
    }
    
    if (zone.team === HockeyTeam.BLUE) {
      // Blue goal at Z=31.26 - only block players coming from negative Z (center ice)
      const isApproachingFromCenterIce = position.z >= (zone.goalLineZ - bufferDistance) && position.z <= zone.goalLineZ;
      return isApproachingFromCenterIce;
    } else {
      // Red goal at Z=-31.285 - only block players coming from positive Z (center ice)
      const isApproachingFromCenterIce = position.z <= (zone.goalLineZ + bufferDistance) && position.z >= zone.goalLineZ;
      return isApproachingFromCenterIce;
    }
  }

  /**
   * Create an invisible wall effect with goalie-aware blocking
   */
  private blockPlayerMovement(playerEntity: Entity, zone: GoalZone): void {
    try {
      const playerId = playerEntity.id?.toString() || 'unknown';
      const currentTime = Date.now();
      const lastBlockTime = this._lastPushTime.get(playerId) || 0;
      
      // Get player information for goalie-aware logic
      const playerInfo = this.getPlayerInfo(playerEntity);
      const isGoalieAtOwnGoal = playerInfo.isGoalie && playerInfo.isAtOwnGoal(zone);
      
      // Debug: Log goalie detection
      if (playerInfo.isGoalie) {
        CONSTANTS.debugLog(`GOALIE DETECTED: Player ${playerId}, isGoalie: ${playerInfo.isGoalie}, team: ${playerInfo.team}, zone.team: ${zone.team}, isAtOwnGoal: ${playerInfo.isAtOwnGoal(zone)}`, 'PlayerBarrierService');
      }
      
      // Special handling for goalies at their own goal - create a gentle "wall" effect
      if (isGoalieAtOwnGoal) {
        // For goalies at their own goal, just create a position-based wall with minimal intervention
        const position = playerEntity.position;
        const goalLine = zone.goalLineZ;
        
        // Define the absolute "do not cross" line - further out from goal line to actually prevent entry
        const wallPosition = zone.team === HockeyTeam.BLUE ? goalLine - 0.8 : goalLine + 0.8;
        
        // Check if goalie has crossed the absolute line
        const hasCrossedWall = zone.team === HockeyTeam.BLUE 
          ? position.z > wallPosition 
          : position.z < wallPosition;
        
        if (hasCrossedWall) {
          // Gentle position correction - just put them right at the wall
          const correctedPosition = {
            x: position.x,
            y: position.y,
            z: wallPosition
          };
          
          playerEntity.setPosition(correctedPosition);
          
          // Stop only the Z velocity component gently
          try {
            const velocity = playerEntity.linearVelocity;
            if (velocity) {
              playerEntity.setLinearVelocity({
                x: velocity.x,
                y: velocity.y,
                z: 0 // Just stop Z movement, no impulse
              });
            }
          } catch (velocityError) {
            // If velocity setting fails, do nothing - no impulses for goalies at own goal
          }
          
          CONSTANTS.debugLog(`GOALIE WALL: Gently positioned goalie ${playerId} at wall Z=${wallPosition.toFixed(2)} (own ${zone.name})`, 'PlayerBarrierService');
        }
        
        return; // Exit early for goalies at own goal - no further processing
      }
      
      // === STANDARD LOGIC FOR NON-GOALIES OR GOALIES AT OPPONENT GOAL ===
      
      // Track persistent attempts
      let persistenceInfo = this._persistentAttempts.get(playerId);
      if (!persistenceInfo) {
        persistenceInfo = { count: 0, firstAttempt: currentTime, lastAttempt: currentTime };
        this._persistentAttempts.set(playerId, persistenceInfo);
      }
      
      // Update persistence tracking
      const timeSinceFirstAttempt = currentTime - persistenceInfo.firstAttempt;
      const timeSinceLastAttempt = currentTime - persistenceInfo.lastAttempt;
      
      // Reset persistence counter
      if (timeSinceLastAttempt > 2000) {
        persistenceInfo.count = 0;
        persistenceInfo.firstAttempt = currentTime;
      }
      
      persistenceInfo.lastAttempt = currentTime;
      persistenceInfo.count++;
      
      // Calculate persistence level
      const persistenceLevel = Math.min(5, Math.floor(timeSinceFirstAttempt / 1000));
      const isPersistent = persistenceLevel >= 2;
      
      // Get current velocity and speed
      const velocity = playerEntity.linearVelocity;
      const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
      
      // Standard cooldown system
      let cooldown = 25; // Default cooldown
      if (isPersistent) {
        cooldown = persistenceLevel >= 4 ? 0 : 5;
      } else if (speed > 10) {
        cooldown = 10;
      }
      
      if (currentTime - lastBlockTime < cooldown) {
        return;
      }
      
      this._lastPushTime.set(playerId, currentTime);
      
      // Get current position and determine safe position
      const position = playerEntity.position;
      let safeZ: number;
      let shouldTeleport = false;
      
      // Standard teleport thresholds and safe distances
      const baseTeleportThreshold = speed > 10 ? 1.2 : 0.8;
      const teleportThreshold = isPersistent ? baseTeleportThreshold + (persistenceLevel * 0.3) : baseTeleportThreshold;
      
      const baseSafeDistance = speed > 10 ? 2.0 : 1.5;
      const safeDistance = isPersistent ? baseSafeDistance + (persistenceLevel * 0.5) : baseSafeDistance;
      
      if (zone.team === HockeyTeam.BLUE) {
        safeZ = zone.goalLineZ - safeDistance;
        shouldTeleport = position.z > (zone.goalLineZ - teleportThreshold);
      } else {
        safeZ = zone.goalLineZ + safeDistance;
        shouldTeleport = position.z < (zone.goalLineZ + teleportThreshold);
      }
      
      if (shouldTeleport || isPersistent) {
        // Standard teleport logic for non-goalies
        const safePosition = {
          x: position.x,
          y: position.y,
          z: safeZ
        };
        
        playerEntity.setPosition(safePosition);
        
        // Apply standard force
        const baseForce = zone.team === HockeyTeam.BLUE ? -5.0 : 5.0;
        const forceMultiplier = isPersistent ? (1.5 + persistenceLevel * 0.5) : 1.0;
        const counterForce = baseForce * forceMultiplier;
        
        // Apply velocity changes and impulses
        try {
          playerEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
          const mass = playerEntity.mass || 1.0;
          playerEntity.applyImpulse({ x: 0, y: 0, z: counterForce * mass });
        } catch (velocityError) {
          const mass = playerEntity.mass || 1.0;
          playerEntity.applyImpulse({ x: 0, y: 0, z: counterForce * mass });
        }
        
        const persistenceMsg = isPersistent ? ` (PERSISTENT - Level ${persistenceLevel})` : '';
        CONSTANTS.debugLog(`Moved player ${playerId} away from ${zone.name} to Z=${safeZ.toFixed(2)}${persistenceMsg}`, 'PlayerBarrierService');
      } else {
        // Player is in buffer zone - standard velocity stopping
        try {
          const velocity = playerEntity.linearVelocity;
          if (velocity) {
            let shouldBlock = false;
            
            if (zone.team === HockeyTeam.BLUE && velocity.z > 0.1) {
              shouldBlock = true;
            } else if (zone.team === HockeyTeam.RED && velocity.z < -0.1) {
              shouldBlock = true;
            }
            
            if (shouldBlock) {
              playerEntity.setLinearVelocity({
                x: velocity.x,
                y: velocity.y,
                z: 0
              });
              CONSTANTS.debugLog(`Stopped Z movement for player ${playerId} in ${zone.name}`, 'PlayerBarrierService');
            }
          }
        } catch (velocityError) {
          // Fallback: apply counter-impulse
          const pushForce = zone.team === HockeyTeam.BLUE ? -3.0 : 3.0;
          const mass = playerEntity.mass || 1.0;
          playerEntity.applyImpulse({ x: 0, y: 0, z: pushForce * mass });
          CONSTANTS.debugLog(`Applied counter-impulse to player ${playerId} in ${zone.name}`, 'PlayerBarrierService');
        }
      }
      
    } catch (error) {
      CONSTANTS.debugWarn('Error blocking player movement: ' + error, 'PlayerBarrierService');
    }
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
        // Debug: Log all entities being processed
        const modelUri = entity.modelUri || 'unknown';
        const isPuck = this.isPuckEntity(entity);
        const isPlayer = this.isPlayerEntity(entity);
        
        if (isPuck) {
          CONSTANTS.debugLog(`PlayerBarrierService: Skipping puck entity ${entity.id} with model ${modelUri}`, 'PlayerBarrierService');
          continue;
        }
        
        if (entity.isSpawned && isPlayer) {
          const position = entity.position;
          const playerId = entity.id;
          
                  // Check if player is in any goal zone (with velocity prediction and player entity for goalie logic)
        for (const zone of Object.values(this.GOAL_ZONES)) {
          const velocity = entity.linearVelocity;
          if (this.isPlayerInGoalZone(position, zone, velocity, entity)) {
            // Get player info for better logging
            const playerInfo = this.getPlayerInfo(entity);
            const goalieNote = playerInfo.isGoalie && playerInfo.isAtOwnGoal(zone) ? ' (GOALIE at own goal)' : '';
            const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0;
              
              CONSTANTS.debugLog(`Player ${playerId} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) detected in ${zone.name}${goalieNote} - velocity Z: ${velocity?.z?.toFixed(2) || 'unknown'}, speed: ${speed.toFixed(2)}`, 'PlayerBarrierService');
              this.blockPlayerMovement(entity, zone);
            }
          }
        }
      }
    } catch (error) {
      CONSTANTS.debugWarn('Error checking player positions: ' + error, 'PlayerBarrierService');
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
    CONSTANTS.debugLog('createBarriers called - starting coordinate monitoring', 'PlayerBarrierService');
    this.startMonitoring(world);
  }

  /**
   * Legacy method - now stops coordinate monitoring instead of removing barriers
   */
  public removeBarriers(): void {
    CONSTANTS.debugLog('removeBarriers called - stopping coordinate monitoring', 'PlayerBarrierService');
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