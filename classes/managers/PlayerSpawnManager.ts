import { World, Player, Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';

/**
 * Manages player spawning and positioning for hockey matches
 * Handles initial spawns, goal resets, and position-specific teleportation
 */
export class PlayerSpawnManager {
  private static _instance: PlayerSpawnManager;
  private _world: World | null = null;

  // Spawn positions based on your measured coordinates
  private readonly SPAWN_POSITIONS: Record<HockeyTeam, Record<HockeyPosition, Vector3Like>> = {
    [HockeyTeam.RED]: {
      [HockeyPosition.GOALIE]: { x: 0, y: 1.75, z: -29 }, // In front of red goal
      [HockeyPosition.DEFENDER1]: { x: 10.11, y: 1.75, z: -6.21 },
      [HockeyPosition.DEFENDER2]: { x: -10.11, y: 1.75, z: -6.21 },
      [HockeyPosition.WINGER1]: { x: 10.11, y: 1.75, z: -0.30 },
      [HockeyPosition.WINGER2]: { x: -10.11, y: 1.75, z: -0.30 },
      [HockeyPosition.CENTER]: { x: 0.05, y: 1.75, z: -1.30 }
    },
    [HockeyTeam.BLUE]: {
      [HockeyPosition.GOALIE]: { x: 0, y: 1.75, z: 29 }, // In front of blue goal
      [HockeyPosition.DEFENDER1]: { x: -10.11, y: 1.75, z: 8 },
      [HockeyPosition.DEFENDER2]: { x: 10.11, y: 1.75, z: 8 },
      [HockeyPosition.WINGER1]: { x: -10.11, y: 1.75, z: 1.76 },
      [HockeyPosition.WINGER2]: { x: 10.11, y: 1.75, z: 1.76 },
      [HockeyPosition.CENTER]: { x: 0.05, y: 1.75, z: 3.30 }
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
    console.log('[PlayerSpawnManager] Initialized with spawn positions');
  }

  /**
   * Get the spawn position for a specific team and position
   */
  public getSpawnPosition(team: HockeyTeam, position: HockeyPosition): Vector3Like {
    return { ...this.SPAWN_POSITIONS[team][position] }; // Return a copy
  }

  /**
   * Teleport a player to their designated spawn position
   */
  public teleportPlayerToSpawn(player: Player, team: HockeyTeam, position: HockeyPosition): boolean {
    if (!this._world) {
      console.error('[PlayerSpawnManager] Cannot teleport player - world not initialized');
      return false;
    }

    const spawnPosition = this.getSpawnPosition(team, position);
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);

    if (playerEntities.length === 0) {
      console.warn(`[PlayerSpawnManager] No entities found for player ${player.id}`);
      return false;
    }

    let teleported = false;
    playerEntities.forEach((entity, index) => {
      try {
        entity.setPosition(spawnPosition);
        entity.setLinearVelocity({ x: 0, y: 0, z: 0 }); // Stop any movement
        entity.setAngularVelocity({ x: 0, y: 0, z: 0 }); // Stop any rotation
        
        console.log(`[PlayerSpawnManager] Teleported ${player.id} (entity ${index}) to ${team} ${position} at:`, spawnPosition);
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

    console.log(`[PlayerSpawnManager] Teleported ${totalTeleported} players to their spawn positions`);

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
      
      console.log('[PlayerSpawnManager] Puck detached and reset to center ice at:', centerIcePosition);
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
        console.log('[PlayerSpawnManager] Detaching puck from current controller');
        
        // Release the puck (this also updates the player's UI)
        controller.releasePuck();
        
        // Additional safety: ensure the global controller is cleared
        IceSkatingController._globalPuckController = null;
        
        console.log('[PlayerSpawnManager] Puck successfully detached and global controller cleared');
      } else {
        console.log('[PlayerSpawnManager] No player currently controlling puck');
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
    console.log('[PlayerSpawnManager] Performing complete reset...');
    
    // Reset all players to their spawn positions
    this.teleportAllPlayersToSpawn(teams, playerIdToPlayer);
    
    // Detach puck from any player and reset to center ice
    this.resetPuckToCenterIce(puckEntity);
    
    console.log('[PlayerSpawnManager] Complete reset finished - all players and puck reset');
  }

  /**
   * Get all spawn positions for debugging
   */
  public getAllSpawnPositions(): Record<HockeyTeam, Record<HockeyPosition, Vector3Like>> {
    return JSON.parse(JSON.stringify(this.SPAWN_POSITIONS)); // Deep copy
  }

  /**
   * Validate that all required spawn positions are defined
   */
  public validateSpawnPositions(): boolean {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const spawnPos = this.SPAWN_POSITIONS[team][position];
        if (!spawnPos || typeof spawnPos.x !== 'number' || typeof spawnPos.y !== 'number' || typeof spawnPos.z !== 'number') {
          console.error(`[PlayerSpawnManager] Invalid spawn position for ${team} ${position}:`, spawnPos);
          return false;
        }
      }
    }
    console.log('[PlayerSpawnManager] All spawn positions validated successfully');
    return true;
  }
} 