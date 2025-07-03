import { World, Player, type Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';
import { IceSkatingController } from '../controllers/IceSkatingController';

interface SpawnData {
  position: Vector3Like;
  yaw: number; // Rotation in radians
}

/**
 * Manages player spawning and positioning for hockey matches
 * Handles initial spawns, goal resets, and position-specific teleportation
 */
export class PlayerSpawnManager {
  private static _instance: PlayerSpawnManager;
  private _world: World | null = null;
  
  // Store player rotations during faceoff for later reuse
  private _lastFaceoffRotations: Map<string, number> = new Map();

  // Spawn positions and rotations based on your measured coordinates
  // Red team faces towards positive Z (Blue goal), Blue team faces towards negative Z (Red goal)
  private readonly SPAWN_POSITIONS: Record<HockeyTeam, Record<HockeyPosition, SpawnData>> = {
    [HockeyTeam.RED]: {
      [HockeyPosition.GOALIE]: { 
        position: { x: 0, y: 1.75, z: -29 }, 
        yaw: Math.PI // Face towards positive Z (Blue goal) - 180° rotation
      },
      [HockeyPosition.DEFENDER1]: { 
        position: { x: 10.11, y: 1.75, z: -6.21 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.DEFENDER2]: { 
        position: { x: -10.11, y: 1.75, z: -6.21 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.WINGER1]: { 
        position: { x: 10.11, y: 1.75, z: 0.24 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.WINGER2]: { 
        position: { x: -10.11, y: 1.75, z: 0.24 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.CENTER]: { 
        position: { x: 0.05, y: 1.75, z: -0.50 }, 
        yaw: Math.PI 
      }
    },
    [HockeyTeam.BLUE]: {
      [HockeyPosition.GOALIE]: { 
        position: { x: 0, y: 1.75, z: 29 }, 
        yaw: 0 // Face towards negative Z (Red goal)
      },
      [HockeyPosition.DEFENDER1]: { 
        position: { x: -10.11, y: 1.75, z: 8.7 }, 
        yaw: 0 
      },
      [HockeyPosition.DEFENDER2]: { 
        position: { x: 10.11, y: 1.75, z: 8.7 }, 
        yaw: 0 
      },
      [HockeyPosition.WINGER1]: { 
        position: { x: -10.11, y: 1.75, z: 1.76 }, 
        yaw: 0 
      },
      [HockeyPosition.WINGER2]: { 
        position: { x: 10.11, y: 1.75, z: 1.76 }, 
        yaw: 0 
      },
      [HockeyPosition.CENTER]: { 
        position: { x: 0.05, y: 1.75, z: 2.50 }, 
        yaw: 0 
      }
    }
  };

  private constructor() {}

  public static get instance(): PlayerSpawnManager {
    if (!PlayerSpawnManager._instance) {
      PlayerSpawnManager._instance = new PlayerSpawnManager();
    }
    return PlayerSpawnManager._instance;
  }

  /**
   * Initialize the spawn manager with the world instance
   */
  public initialize(world: World): void {
    this._world = world;
    debugLog('Initialized with spawn positions', 'PlayerSpawnManager');
  }

  /**
   * Get the spawn position for a specific team and position
   */
  public getSpawnPosition(team: HockeyTeam, position: HockeyPosition): Vector3Like {
    return { ...this.SPAWN_POSITIONS[team][position].position }; // Return a copy of the position
  }

  /**
   * Get the spawn data (position and rotation) for a specific team and position
   */
  public getSpawnData(team: HockeyTeam, position: HockeyPosition): SpawnData {
    return { ...this.SPAWN_POSITIONS[team][position] }; // Return a copy
  }

  /**
   * Teleport a player to their designated spawn position with correct rotation
   */
  public teleportPlayerToSpawn(player: Player, team: HockeyTeam, position: HockeyPosition): boolean {
    if (!this._world) {
      debugError('[PlayerSpawnManager] Cannot teleport player - world not initialized', 'PlayerSpawnManager');
      return false;
    }

    const spawnData = this.getSpawnData(team, position);
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);

    if (playerEntities.length === 0) {
      debugWarn(`[PlayerSpawnManager] No entities found for player ${player.id}`, 'PlayerSpawnManager');
      return false;
    }

    let teleported = false;
    playerEntities.forEach((entity, index) => {
      try {
        // Set position
        entity.setPosition(spawnData.position);
        
        // Set rotation - convert yaw to quaternion
        const halfYaw = spawnData.yaw / 2;
        entity.setRotation({
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        });
        
        // Stop any movement
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
        
        debugLog(`Teleported ${player.id} (entity ${index}) to ${team} ${position} at: ${JSON.stringify(spawnData.position)} with rotation: ${spawnData.yaw} radians`, 'PlayerSpawnManager');
        teleported = true;
      } catch (error) {
        debugError(`[PlayerSpawnManager] Error teleporting player ${player.id}:`, error, 'PlayerSpawnManager');
      }
    });

    return teleported;
  }

  /**
   * Teleport all players from a team assignment map to their spawn positions
   */
  public teleportAllPlayersToSpawn(
    teams: Record<HockeyTeam, Record<HockeyPosition, string>>,
    playerIdToPlayer: Map<string, Player>
  ): void {
    if (!this._world) {
      debugError('[PlayerSpawnManager] Cannot teleport players - world not initialized', 'PlayerSpawnManager');
      return;
    }

    let totalTeleported = 0;

    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const playerId = teams[team][position];
        if (playerId) {
          const player = playerIdToPlayer.get(playerId);
          if (player) {
            const success = this.teleportPlayerToSpawn(player, team, position);
            if (success) {
              totalTeleported++;
            }
          } else {
            debugWarn(`[PlayerSpawnManager] Player object not found for ID: ${playerId}`, 'PlayerSpawnManager');
          }
        }
      }
    }

    debugLog(`Teleported ${totalTeleported} players to their spawn positions`, 'PlayerSpawnManager');

    // Announce the reset
    if (this._world && totalTeleported > 0) {
      this._world.chatManager.sendBroadcastMessage(
        `Players reset to starting positions!`,
        '00FF00'
      );
    }
  }

  /**
   * Reset the puck to center ice
   */
  public resetPuckToCenterIce(puckEntity: any): boolean {
    if (!puckEntity) {
      debugWarn('[PlayerSpawnManager] Cannot reset puck - puck entity is null or undefined', 'PlayerSpawnManager');
      return false;
    }
    
    if (!puckEntity.isSpawned) {
      debugWarn('[PlayerSpawnManager] Cannot reset puck - puck not spawned', 'PlayerSpawnManager');
      return false;
    }

    try {
      // First, detach the puck from any player who might be controlling it
      this.detachPuckFromAllPlayers();
      
      const centerIcePosition = CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE; // Use constants for consistency
      puckEntity.setPosition(centerIcePosition);
      puckEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      puckEntity.setAngularVelocity({ x: 0, y: 0, z: 0 });
      
      // Clear goal detection previous position to prevent false detections
      const { GoalDetectionService } = require('../services/GoalDetectionService');
      GoalDetectionService.instance.reset();
      
      debugLog(`Puck detached and reset to center ice at: ${JSON.stringify(centerIcePosition)}`, 'PlayerSpawnManager');
      return true;
    } catch (error) {
      debugError('[PlayerSpawnManager] Error resetting puck:', error, 'PlayerSpawnManager');
      return false;
    }
  }

  /**
   * Detach the puck from any player who might be controlling it
   */
  public detachPuckFromAllPlayers(): void {
    try {
      // Import the IceSkatingController class to access the global puck controller
      const { IceSkatingController } = require('../controllers/IceSkatingController');
      
      // Check if any player is currently controlling the puck
      if (IceSkatingController._globalPuckController) {
        const controller = IceSkatingController._globalPuckController;
        debugLog('Detaching puck from current controller', 'PlayerSpawnManager');
        
        // Release the puck (this also updates the player's UI)
        controller.releasePuck();
        
        // Additional safety: ensure the global controller is cleared
        IceSkatingController._globalPuckController = null;
        
        debugLog('Puck successfully detached and global controller cleared', 'PlayerSpawnManager');
      } else {
        debugLog('No player currently controlling puck', 'PlayerSpawnManager');
      }
    } catch (error) {
      debugError('[PlayerSpawnManager] Error detaching puck from players:', error, 'PlayerSpawnManager');
      
      // Emergency fallback: clear the global controller even if there was an error
      try {
        const { IceSkatingController } = require('../controllers/IceSkatingController');
        IceSkatingController._globalPuckController = null;
      } catch (fallbackError) {
        debugError('[PlayerSpawnManager] Error in emergency fallback:', fallbackError, 'PlayerSpawnManager');
      }
    }
  }

  /**
   * Perform a complete reset: teleport all players and reset puck
   */
  public performCompleteReset(
    teams: Record<HockeyTeam, Record<HockeyPosition, string>>,
    playerIdToPlayer: Map<string, Player>,
    puckEntity: any
  ): void {
    debugLog('Performing complete reset...', 'PlayerSpawnManager');
    
    // Clear all skating players to stop global ice skating sound
    const { AudioManager } = require('../managers/AudioManager');
    AudioManager.instance.clearSkatingPlayers();
    
    // Reset all players to their spawn positions
    this.teleportAllPlayersToSpawn(teams, playerIdToPlayer);
    
    // Detach puck from any player and reset to center ice
    this.resetPuckToCenterIce(puckEntity);
    
    debugLog('Complete reset finished - all players and puck reset', 'PlayerSpawnManager');
  }

  /**
   * Get all spawn positions for debugging
   */
  public getAllSpawnPositions(): Record<HockeyTeam, Record<HockeyPosition, Vector3Like>> {
    const positions: Record<HockeyTeam, Record<HockeyPosition, Vector3Like>> = {} as any;
    
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      positions[team] = {} as any;
      for (const position of Object.values(HockeyPosition)) {
        positions[team][position] = { ...this.SPAWN_POSITIONS[team][position].position };
      }
    }
    
    return positions;
  }

  /**
   * Teleport players to faceoff formation around a specific faceoff dot
   */
  public teleportPlayersToFaceoffFormation(
    teams: Record<HockeyTeam, Record<HockeyPosition, string>>,
    playerIdToPlayer: Map<string, Player>,
    faceoffPosition: Vector3Like
  ): void {
    if (!this._world) {
      debugError('[PlayerSpawnManager] Cannot teleport players to faceoff - world not initialized', 'PlayerSpawnManager');
      return;
    }

    let totalTeleported = 0;

    // Define faceoff formation offsets relative to the faceoff dot
    const faceoffFormation: Record<HockeyTeam, Record<HockeyPosition, { offset: Vector3Like, yaw: number }>> = {
      [HockeyTeam.RED]: {
        [HockeyPosition.CENTER]: { offset: { x: 0, y: 0, z: -1 }, yaw: Math.PI }, // 1 block towards Red side, face Blue center
        [HockeyPosition.WINGER1]: { offset: { x: 5, y: 0, z: -1 }, yaw: 0 }, // Right wing inline with center, face puck
        [HockeyPosition.WINGER2]: { offset: { x: -5, y: 0, z: -1 }, yaw: 0 }, // Left wing inline with center, face puck
        [HockeyPosition.DEFENDER1]: { offset: { x: 2, y: 0, z: -6 }, yaw: 0 }, // Right defense back, face puck
        [HockeyPosition.DEFENDER2]: { offset: { x: -2, y: 0, z: -6 }, yaw: 0 }, // Left defense back, face puck
        [HockeyPosition.GOALIE]: { offset: { x: 0, y: 0, z: -12 }, yaw: Math.PI } // Stay back in net area, face up ice
      },
      [HockeyTeam.BLUE]: {
        [HockeyPosition.CENTER]: { offset: { x: 0, y: 0, z: 1 }, yaw: 0 }, // 1 block towards Blue side, face Red center
        [HockeyPosition.WINGER1]: { offset: { x: -5, y: 0, z: 1 }, yaw: Math.PI }, // Left wing inline with center, face puck
        [HockeyPosition.WINGER2]: { offset: { x: 5, y: 0, z: 1 }, yaw: Math.PI }, // Right wing inline with center, face puck
        [HockeyPosition.DEFENDER1]: { offset: { x: -2, y: 0, z: 6 }, yaw: Math.PI }, // Left defense back, face puck
        [HockeyPosition.DEFENDER2]: { offset: { x: 2, y: 0, z: 6 }, yaw: Math.PI }, // Right defense back, face puck
        [HockeyPosition.GOALIE]: { offset: { x: 0, y: 0, z: 12 }, yaw: 0 } // Stay back in net area, face up ice
      }
    };

    // Check if this is a faceoff dot that needs adjustments
    const isBlueNeutralRight = Math.abs(faceoffPosition.x - 14.36) < 0.1 && 
                               Math.abs(faceoffPosition.z - 5.25) < 0.1;
    const isRedNeutralRight = Math.abs(faceoffPosition.x - 14.36) < 0.1 && 
                              Math.abs(faceoffPosition.z - (-3.75)) < 0.1;
    const isRedNeutralLeft = Math.abs(faceoffPosition.x - (-13.36)) < 0.1 && 
                             Math.abs(faceoffPosition.z - (-3.75)) < 0.1;
    
    const xAdjustment = isBlueNeutralRight ? 1 : 
                        isRedNeutralRight ? 1 : 
                        isRedNeutralLeft ? -0.1 : 0;

    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const playerId = teams[team][position];
        if (playerId) {
          const player = playerIdToPlayer.get(playerId);
          if (player) {
            // GOALIE FIX: Keep goalies in their default spawn positions during offside resets
            if (position === HockeyPosition.GOALIE) {
              const spawnData = this.SPAWN_POSITIONS[team][position];
              const success = this.teleportPlayerToSpecificPosition(player, spawnData.position, spawnData.yaw);
              if (success) {
                totalTeleported++;
                debugLog(`${team} ${position} kept at default spawn position during offside reset: X=${spawnData.position.x}, Z=${spawnData.position.z}`, 'OffsideDetectionService');
              }
            } else {
              // Non-goalies use faceoff formation positioning
              const formation = faceoffFormation[team][position];
              const zAdjustment = isRedNeutralRight ? 0.2 : 
                                  isRedNeutralLeft ? 0.2 : 0;
              const finalPosition = {
                x: faceoffPosition.x + formation.offset.x + xAdjustment,
                y: faceoffPosition.y + formation.offset.y,
                z: faceoffPosition.z + formation.offset.z + zAdjustment
              };

              const success = this.teleportPlayerToSpecificPosition(player, finalPosition, formation.yaw);
              if (success) {
                totalTeleported++;
                const adjustmentNote = isBlueNeutralRight ? ' (Blue Right +1 X)' : 
                                       isRedNeutralRight ? ' (Red Right +1 X +0.2 Z)' : 
                                       isRedNeutralLeft ? ' (Red Left -0.1 X +0.2 Z)' : '';
                debugLog(`${team} ${position} positioned at faceoff formation: X=${finalPosition.x}, Z=${finalPosition.z}${adjustmentNote}`, 'OffsideDetectionService');
              }
            }
          } else {
            debugWarn(`[PlayerSpawnManager] Player object not found for ID: ${playerId}`, 'PlayerSpawnManager');
          }
        }
      }
    }

    debugLog(`Teleported ${totalTeleported} players to faceoff formation around: ${JSON.stringify(faceoffPosition)}`, 'OffsideDetectionService');

    // Make all teleported players look at the puck immediately after positioning
    if (totalTeleported > 0) {
      this.makePlayersLookAtPuck(teams, playerIdToPlayer);
    }

    // Announce the faceoff positioning
    if (this._world && totalTeleported > 0) {
      this._world.chatManager.sendBroadcastMessage(
        `Players positioned for faceoff!`,
        'FFA500' // Orange referee color
      );
    }
  }

  /**
   * Teleport a player to a specific position with rotation
   */
  private teleportPlayerToSpecificPosition(player: Player, position: Vector3Like, yaw: number): boolean {
    if (!this._world) {
      debugError('[PlayerSpawnManager] Cannot teleport player - world not initialized', 'PlayerSpawnManager');
      return false;
    }

    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);

    if (playerEntities.length === 0) {
      debugWarn(`[PlayerSpawnManager] No entities found for player ${player.id}`, 'PlayerSpawnManager');
      return false;
    }

    let teleported = false;
    playerEntities.forEach((entity, index) => {
      try {
        // Set position
        entity.setPosition(position);
        
        // Set rotation - convert yaw to quaternion
        const halfYaw = yaw / 2;
        entity.setRotation({
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        });
        
        // Stop any movement
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 });
        
        teleported = true;
      } catch (error) {
        debugError(`[PlayerSpawnManager] Error teleporting player ${player.id}:`, error, 'PlayerSpawnManager');
      }
    });

    return teleported;
  }

  /**
   * Validate that all required spawn positions are defined
   */
  public validateSpawnPositions(): boolean {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const spawnData = this.SPAWN_POSITIONS[team][position];
        if (!spawnData || 
            !spawnData.position ||
            typeof spawnData.position.x !== 'number' || 
            typeof spawnData.position.y !== 'number' || 
            typeof spawnData.position.z !== 'number' ||
            typeof spawnData.yaw !== 'number') {
          debugError(`[PlayerSpawnManager] Invalid spawn data for ${team} ${position}:`, spawnData, 'PlayerSpawnManager');
          return false;
        }
      }
    }
          debugLog('All spawn positions validated successfully', 'PlayerSpawnManager');
    return true;
  }

  /**
   * Make all players look at the puck entity for faceoff focus
   * Sets both camera and physical model to face puck immediately
   */
  private makePlayersLookAtPuck(
    teams: Record<HockeyTeam, Record<HockeyPosition, string>>,
    playerIdToPlayer: Map<string, Player>
  ): void {
    const { ChatCommandManager } = require('./ChatCommandManager');
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    if (!puckEntity || !puckEntity.isSpawned) {
      CONSTANTS.debugError('Cannot make players look at puck - puck entity not found or not spawned', undefined, 'PlayerSpawnManager');
      return;
    }

    let playersLooking = 0;

    // Make both RED and BLUE team players look at the puck
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const playerId = teams[team][position];
        if (playerId) {
          const player = playerIdToPlayer.get(playerId);
          if (player) {
            try {
                            // Add delay to ensure teleportation AND puck positioning are complete
              setTimeout(() => {
                // Get fresh puck position after it's been moved
                const currentPuckPosition = puckEntity.position;
                
                // Set camera to look at puck
                player.camera.lookAtEntity(puckEntity);
                
                // Set physical model to face puck as well
                this.rotatePlayerEntityTowardsPuck(player, currentPuckPosition);
                
                // Store and preserve the faceoff rotation for 3 seconds after play resumes
                const playerEntities = this._world!.entityManager.getPlayerEntitiesByPlayer(player);
                if (playerEntities.length > 0) {
                  const playerEntity = playerEntities[0];
                  const controller = playerEntity.controller as IceSkatingController;
                  
                  // Store the perfect faceoff rotation
                  setTimeout(() => {
                    if (playerEntity.isSpawned && controller) {
                      const faceoffRotation = playerEntity.rotation;
                      controller.setFaceoffRotation(faceoffRotation);
                      controller.preserveFaceoffRotation(3000); // Preserve for 3 seconds
                      debugLog(`${team} ${position} (${player.id}) faceoff rotation preserved for 3 seconds`, 'OffsideDetectionService');
                    }
                  }, 100); // Small delay to ensure rotation is applied first
                }
                
                debugLog(`${team} ${position} (${player.id}) camera AND model set to face puck at (${currentPuckPosition.x.toFixed(1)}, ${currentPuckPosition.z.toFixed(1)})`, 'OffsideDetectionService');
              }, 300); // Longer delay to ensure both player teleport AND puck positioning are complete
              
              playersLooking++;
            } catch (error) {
              debugError(`Error setting ${team} ${position} to look at puck:`, error, 'PlayerSpawnManager');
            }
          } else {
            debugWarn(`[PlayerSpawnManager] Player object not found for ${team} ${position}: ${playerId}`, 'PlayerSpawnManager');
          }
        }
      }
    }

    debugLog(`Initiated camera AND model look setup for ${playersLooking} players`, 'OffsideDetectionService');
  }

  /**
   * Rotate a player's physical entity to face the puck position
   */
  private rotatePlayerEntityTowardsPuck(player: Player, puckPosition: Vector3Like): void {
    if (!this._world) return;

    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
    
    if (playerEntities.length === 0) {
      debugWarn(`[PlayerSpawnManager] No entities found for player ${player.id} - cannot rotate toward puck`, 'PlayerSpawnManager');
      return;
    }

    playerEntities.forEach((entity) => {
      try {
        const playerPosition = entity.position;
        
        // Calculate direction vector from player to puck
        const dx = puckPosition.x - playerPosition.x;
        const dz = puckPosition.z - playerPosition.z;
        
        // Skip rotation if player is exactly at puck position
        if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) {
          debugLog(`Player too close to puck for rotation calculation, skipping`, 'OffsideDetectionService');
          return;
        }
        
        // Calculate yaw angle to face the puck (in radians)
        // Using Math.atan2(dx, dz) for Hytopia's coordinate system
        // Add π (180°) to flip direction so players face TOWARD puck instead of away
        const yaw = Math.atan2(dx, dz) + Math.PI;
        
        // Store this rotation for later reuse when play resumes
        this._lastFaceoffRotations.set(player.id, yaw);
        
        // Convert yaw to quaternion for entity rotation
        const halfYaw = yaw / 2;
        const rotation = {
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        };
        
        // Apply the rotation
        entity.setRotation(rotation);
        
        // Convert yaw to degrees for logging
        const yawDegrees = (yaw * 180 / Math.PI).toFixed(1);
                 debugLog(`Player at (${playerPosition.x.toFixed(1)}, ${playerPosition.z.toFixed(1)}) rotated ${yawDegrees}° to face puck at (${puckPosition.x.toFixed(1)}, ${puckPosition.z.toFixed(1)})`, 'OffsideDetectionService');
      } catch (error) {
        debugError(`Error rotating player entity toward puck:`, error, 'PlayerSpawnManager');
      }
    });
  }

  /**
   * Get stored faceoff rotations for all players
   */
  public getLastFaceoffRotations(): Map<string, number> {
    return new Map(this._lastFaceoffRotations);
  }

  /**
   * Clear stored faceoff rotations
   */
  public clearFaceoffRotations(): void {
    this._lastFaceoffRotations.clear();
  }
} 