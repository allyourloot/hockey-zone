/**
 * PuckControlIndicatorService - Manages the puck control indicator SceneUI
 * Shows a blinking triangle over the player's head who is controlling the puck
 */

import { PlayerEntity, SceneUI } from 'hytopia';
import type { World } from 'hytopia';
import { IceSkatingController } from '../controllers/IceSkatingController';
import * as CONSTANTS from '../utils/constants';

export class PuckControlIndicatorService {
  private static _instance: PuckControlIndicatorService;
  private _world: World | null = null;
  private _currentPlayerEntity: PlayerEntity | null = null;
  private _currentIndicatorSceneUI: SceneUI | null = null;
  private _monitoringInterval: NodeJS.Timeout | null = null;

  public static get instance(): PuckControlIndicatorService {
    if (!PuckControlIndicatorService._instance) {
      PuckControlIndicatorService._instance = new PuckControlIndicatorService();
    }
    return PuckControlIndicatorService._instance;
  }

  private constructor() {}

  /**
   * Initialize the service with the world instance
   */
  public initialize(world: World): void {
    this._world = world;
    this.startMonitoring();
    CONSTANTS.debugLog('PuckControlIndicatorService initialized', 'PuckControlIndicatorService');
  }

  /**
   * Start monitoring for puck control changes
   */
  private startMonitoring(): void {
    if (this._monitoringInterval) {
      clearInterval(this._monitoringInterval);
    }

    // Check for puck control changes every 50ms for more responsive updates
    this._monitoringInterval = setInterval(() => {
      this.updatePuckControlIndicator();
    }, 50);

    CONSTANTS.debugLog('Started puck control monitoring', 'PuckControlIndicatorService');
  }

  /**
   * Stop monitoring for puck control changes
   */
  public stopMonitoring(): void {
    if (this._monitoringInterval) {
      clearInterval(this._monitoringInterval);
      this._monitoringInterval = null;
    }

    // Clean up current indicator
    this.clearCurrentIndicator();
    CONSTANTS.debugLog('Stopped puck control monitoring', 'PuckControlIndicatorService');
  }

  /**
   * Update the puck control indicator based on current state
   */
  private updatePuckControlIndicator(): void {
    if (!this._world) return;

    try {
      // Get the current puck controller
      const globalController = IceSkatingController._globalPuckController;
      
      if (globalController && globalController.isControllingPuck) {
        // Find the player entity associated with this controller
        const controllingPlayer = (globalController as any)._controllingPlayer;
        
        // The controllingPlayer is the Player object, and we need to find the PlayerEntity
        if (controllingPlayer) {
          // Get all player entities and find the one belonging to this player
          const playerEntities = this._world.entityManager.getAllPlayerEntities();
          const playerEntity = playerEntities.find(entity => entity.player?.id === controllingPlayer.id);
          
          if (playerEntity) {
            // If this is a different player than current, update the indicator
            if (playerEntity !== this._currentPlayerEntity) {
              this.showIndicatorForPlayer(playerEntity);
            }
          } else {
            CONSTANTS.debugWarn(`Could not find player entity for controlling player: ${controllingPlayer.username}`, 'PuckControlIndicatorService');
          }
        }
      } else {
        // No one is controlling the puck, clear indicator
        if (this._currentPlayerEntity) {
          this.clearCurrentIndicator();
        }
      }
    } catch (error) {
      CONSTANTS.debugError('Error updating puck control indicator', error, 'PuckControlIndicatorService');
    }
  }

  /**
   * Show the puck control indicator for a specific player
   */
  private showIndicatorForPlayer(playerEntity: PlayerEntity): void {
    if (!this._world) return;

    try {
      // Clear any existing indicator
      this.clearCurrentIndicator();

      const playerName = playerEntity.player?.username || 'Player';

      // Use a lower y-offset to bring the indicator closer to player's head for all devices
      // The mobile-specific CSS scaling will handle size differences
      const yOffset = 1.8; // Positioned closer to player's head for better visibility
      
      CONSTANTS.debugLog(`Showing puck control indicator for ${playerName} with y-offset: ${yOffset}`, 'PuckControlIndicatorService');

      // Create SceneUI following the same pattern as body-check-indicator
      const sceneUI = new SceneUI({
        templateId: 'puck-control-indicator',
        attachedToEntity: playerEntity,
        state: { 
          visible: true,
          playerName: playerName
        },
        offset: { x: 0, y: yOffset, z: 0 }, // Position adjusted for mobile
        viewDistance: 85, // Increase visibility distance to 100 blocks (from default ~15-20)
      });
      
      // Load the SceneUI
      sceneUI.load(this._world);

      // Store references
      this._currentPlayerEntity = playerEntity;
      this._currentIndicatorSceneUI = sceneUI;

      // Successfully loaded puck control indicator
    } catch (error) {
      CONSTANTS.debugError('Error showing puck control indicator', error, 'PuckControlIndicatorService');
    }
  }

  /**
   * Clear the current puck control indicator
   */
  private clearCurrentIndicator(): void {
    if (this._currentIndicatorSceneUI) {
      try {
        // Unload the SceneUI (following the same pattern as body-check-indicator)
        this._currentIndicatorSceneUI.unload();
        
        // Puck control indicator cleared
      } catch (error) {
        CONSTANTS.debugError('Error clearing puck control indicator', error, 'PuckControlIndicatorService');
      }
    }

    this._currentPlayerEntity = null;
    this._currentIndicatorSceneUI = null;
  }

  /**
   * Clean up the service
   */
  public cleanup(): void {
    this.stopMonitoring();
    this._world = null;
    CONSTANTS.debugLog('PuckControlIndicatorService cleaned up', 'PuckControlIndicatorService');
  }
} 