import { World, Player, type Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';
import * as CONSTANTS from '../utils/constants';

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
        position: { x: 10.11, y: 1.75, z: -0.30 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.WINGER2]: { 
        position: { x: -10.11, y: 1.75, z: -0.30 }, 
        yaw: Math.PI 
      },
      [HockeyPosition.CENTER]: { 
        position: { x: 0.05, y: 1.75, z: -1.30 }, 
        yaw: Math.PI 
      }
    },
    [HockeyTeam.BLUE]: {
      [HockeyPosition.GOALIE]: { 
        position: { x: 0, y: 1.75, z: 29 }, 
        yaw: 0 // Face towards negative Z (Red goal)
      },
      [HockeyPosition.DEFENDER1]: { 
        position: { x: -10.11, y: 1.75, z: 8 }, 
        yaw: 0 
      },
      [HockeyPosition.DEFENDER2]: { 
        position: { x: 10.11, y: 1.75, z: 8 }, 
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
        position: { x: 0.05, y: 1.75, z: 3.30 }, 
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
    CONSTANTS.debugLog('Initialized with spawn positions', 'PlayerSpawnManager');
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
      console.error('[PlayerSpawnManager] Cannot teleport player - world not initialized');
      return false;
    }

    const spawnData = this.getSpawnData(team, position);
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);

    if (playerEntities.length === 0) {
      console.warn(`[PlayerSpawnManager] No entities found for player ${player.id}`);
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
        
        CONSTANTS.debugLog(`Teleported ${player.id} (entity ${index}) to ${team} ${position} at: ${JSON.stringify(spawnData.position)} with rotation: ${spawnData.yaw} radians`, 'PlayerSpawnManager');
        teleported = true;
      } catch (error) {
        console.error(`[PlayerSpawnManager] Error teleporting player ${player.id}:`, error);
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
      console.error('[PlayerSpawnManager] Cannot teleport players - world not initialized');
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
            console.warn(`[PlayerSpawnManager] Player object not found for ID: ${playerId}`);
          }
        }
      }
    }

    CONSTANTS.debugLog(`Teleported ${totalTeleported} players to their spawn positions`, 'PlayerSpawnManager');

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
      console.warn('[PlayerSpawnManager] Cannot reset puck - puck entity is null or undefined');
      return false;
    }
    
    if (!puckEntity.isSpawned) {
      console.warn('[PlayerSpawnManager] Cannot reset puck - puck not spawned');
      return false;
    }

    try {
      // First, detach the puck from any player who might be controlling it
      this.detachPuckFromAllPlayers();
      
      const centerIcePosition = { x: 0, y: 1.1, z: 1 }; // Same as SPAWN_POSITIONS.PUCK_CENTER_ICE
      puckEntity.setPosition(centerIcePosition);
      puckEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      puckEntity.setAngularVelocity({ x: 0, y: 0, z: 0 });
      
      // Clear goal detection previous position to prevent false detections
      const { GoalDetectionService } = require('../services/GoalDetectionService');
      GoalDetectionService.instance.reset();
      
      CONSTANTS.debugLog(`Puck detached and reset to center ice at: ${JSON.stringify(centerIcePosition)}`, 'PlayerSpawnManager');
      return true;
    } catch (error) {
      console.error('[PlayerSpawnManager] Error resetting puck:', error);
      return false;
    }
  }

  /**
   * Detach the puck from any player who might be controlling it
   */
  private detachPuckFromAllPlayers(): void {
    try {
      // Import the IceSkatingController class to access the global puck controller
      const { IceSkatingController } = require('../controllers/IceSkatingController');
      
      // Check if any player is currently controlling the puck
      if (IceSkatingController._globalPuckController) {
        const controller = IceSkatingController._globalPuckController;
        CONSTANTS.debugLog('Detaching puck from current controller', 'PlayerSpawnManager');
        
        // Release the puck (this also updates the player's UI)
        controller.releasePuck();
        
        // Additional safety: ensure the global controller is cleared
        IceSkatingController._globalPuckController = null;
        
        CONSTANTS.debugLog('Puck successfully detached and global controller cleared', 'PlayerSpawnManager');
      } else {
        CONSTANTS.debugLog('No player currently controlling puck', 'PlayerSpawnManager');
      }
    } catch (error) {
      console.error('[PlayerSpawnManager] Error detaching puck from players:', error);
      
      // Emergency fallback: clear the global controller even if there was an error
      try {
        const { IceSkatingController } = require('../controllers/IceSkatingController');
        IceSkatingController._globalPuckController = null;
      } catch (fallbackError) {
        console.error('[PlayerSpawnManager] Error in emergency fallback:', fallbackError);
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
    CONSTANTS.debugLog('Performing complete reset...', 'PlayerSpawnManager');
    
    // Reset all players to their spawn positions
    this.teleportAllPlayersToSpawn(teams, playerIdToPlayer);
    
    // Detach puck from any player and reset to center ice
    this.resetPuckToCenterIce(puckEntity);
    
    CONSTANTS.debugLog('Complete reset finished - all players and puck reset', 'PlayerSpawnManager');
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
          console.error(`[PlayerSpawnManager] Invalid spawn data for ${team} ${position}:`, spawnData);
          return false;
        }
      }
    }
          CONSTANTS.debugLog('All spawn positions validated successfully', 'PlayerSpawnManager');
    return true;
  }
} 