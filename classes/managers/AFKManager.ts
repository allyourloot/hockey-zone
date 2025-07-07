import { Player, World } from 'hytopia';
import { HockeyGameManager } from './HockeyGameManager';
import { PlayerManager } from './PlayerManager';
import { GameMode } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

interface AFKPlayerData {
  playerId: string;
  player: Player;
  lastActivity: number;
  warningShown: boolean;
  countdownShown: boolean;
  timeoutTimer?: NodeJS.Timeout;
  warningTimer?: NodeJS.Timeout;
  countdownTimer?: NodeJS.Timeout;
}

export class AFKManager {
  private static _instance: AFKManager;
  private _world: World | undefined;
  private _afkPlayers: Map<string, AFKPlayerData> = new Map();
  private _checkInterval: NodeJS.Timeout | undefined;
  private _isActive: boolean = false;

  private constructor() {}

  public static get instance(): AFKManager {
    if (!AFKManager._instance) {
      AFKManager._instance = new AFKManager();
    }
    return AFKManager._instance;
  }

  public initialize(world: World): void {
    this._world = world;
    this.startMonitoring();
    debugLog('AFKManager initialized', 'AFKManager');
  }

  public startMonitoring(): void {
    if (this._isActive) {
      debugLog('AFK monitoring already active', 'AFKManager');
      return;
    }

    this._isActive = true;
    this._checkInterval = setInterval(() => {
      this.checkAFKPlayers();
    }, CONSTANTS.AFK_DETECTION.CHECK_INTERVAL);

    debugLog('AFK monitoring started', 'AFKManager');
  }

  public stopMonitoring(): void {
    if (!this._isActive) return;

    this._isActive = false;
    
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = undefined;
    }

    // Clear all player timers
    this._afkPlayers.forEach(data => {
      this.clearPlayerTimers(data);
    });
    
    this._afkPlayers.clear();
    debugLog('AFK monitoring stopped', 'AFKManager');
  }

  public trackPlayer(player: Player): void {
    if (!this._isActive) return;

    const currentTime = Date.now();
    const existing = this._afkPlayers.get(player.id);
    
    if (existing) {
      // Update existing player data
      existing.lastActivity = currentTime;
      existing.warningShown = false;
      existing.countdownShown = false;
      this.clearPlayerTimers(existing);
    } else {
      // Add new player
      const playerData: AFKPlayerData = {
        playerId: player.id,
        player: player,
        lastActivity: currentTime,
        warningShown: false,
        countdownShown: false
      };
      this._afkPlayers.set(player.id, playerData);
    }

    debugLog(`Now tracking player ${player.id} for AFK`, 'AFKManager');
  }

  public untrackPlayer(playerId: string): void {
    const playerData = this._afkPlayers.get(playerId);
    if (playerData) {
      this.clearPlayerTimers(playerData);
      this._afkPlayers.delete(playerId);
      debugLog(`Stopped tracking player ${playerId} for AFK`, 'AFKManager');
    }
  }

  public recordActivity(playerId: string): void {
    const playerData = this._afkPlayers.get(playerId);
    if (playerData) {
      const currentTime = Date.now();
      playerData.lastActivity = currentTime;
      
      // Reset warning flags if player becomes active
      if (playerData.warningShown || playerData.countdownShown) {
        playerData.warningShown = false;
        playerData.countdownShown = false;
        this.clearPlayerTimers(playerData);
        
        // Send activity resumed message
        try {
          playerData.player.ui.sendData({
            type: 'afk-activity-resumed'
          });
        } catch (error) {
          debugError(`Error sending activity resumed message to ${playerId}:`, error, 'AFKManager');
        }
        
        debugLog(`Player ${playerId} resumed activity`, 'AFKManager');
      }
    }
  }

  private checkAFKPlayers(): void {
    if (!this._world) return;

    const currentTime = Date.now();
    const playersToRemove: string[] = [];

    this._afkPlayers.forEach((data, playerId) => {
      const timeSinceActivity = currentTime - data.lastActivity;
      
      // Check if player should be timed out
      if (timeSinceActivity >= CONSTANTS.AFK_DETECTION.TIMEOUT_DURATION) {
        this.timeoutPlayer(data);
        playersToRemove.push(playerId);
      }
      // Check if player should see countdown
      else if (timeSinceActivity >= (CONSTANTS.AFK_DETECTION.TIMEOUT_DURATION - CONSTANTS.AFK_DETECTION.COUNTDOWN_DISPLAY_TIME) 
               && !data.countdownShown) {
        this.showCountdownToPlayer(data);
      }
      // Check if player should see warning
      else if (timeSinceActivity >= (CONSTANTS.AFK_DETECTION.TIMEOUT_DURATION - CONSTANTS.AFK_DETECTION.WARNING_DURATION) 
               && !data.warningShown) {
        this.showWarningToPlayer(data);
      }
    });

    // Remove timed out players
    playersToRemove.forEach(playerId => {
      this.untrackPlayer(playerId);
    });
  }

  private showWarningToPlayer(data: AFKPlayerData): void {
    data.warningShown = true;
    
    try {
      data.player.ui.sendData({
        type: 'afk-warning',
        message: CONSTANTS.AFK_DETECTION.WARNING_MESSAGE
      });
      
      // Also send chat message
      if (this._world) {
        this._world.chatManager.sendPlayerMessage(
          data.player,
          CONSTANTS.AFK_DETECTION.WARNING_MESSAGE,
          'FFAA00' // Orange color
        );
      }
      
      debugLog(`Sent AFK warning to player ${data.playerId}`, 'AFKManager');
    } catch (error) {
      debugError(`Error sending AFK warning to ${data.playerId}:`, error, 'AFKManager');
    }
  }

  private showCountdownToPlayer(data: AFKPlayerData): void {
    data.countdownShown = true;
    
    const remainingTime = Math.max(0, CONSTANTS.AFK_DETECTION.TIMEOUT_DURATION - (Date.now() - data.lastActivity));
    const countdownSeconds = Math.ceil(remainingTime / 1000);
    
    try {
      data.player.ui.sendData({
        type: 'afk-countdown',
        message: CONSTANTS.AFK_DETECTION.COUNTDOWN_MESSAGE,
        countdown: countdownSeconds
      });
      
      debugLog(`Sent AFK countdown to player ${data.playerId} (${countdownSeconds}s remaining)`, 'AFKManager');
      
      // Start countdown timer to update every second
      data.countdownTimer = setInterval(() => {
        const currentRemainingTime = Math.max(0, CONSTANTS.AFK_DETECTION.TIMEOUT_DURATION - (Date.now() - data.lastActivity));
        const currentCountdownSeconds = Math.ceil(currentRemainingTime / 1000);
        
        if (currentCountdownSeconds > 0) {
          try {
            data.player.ui.sendData({
              type: 'afk-countdown-update',
              countdown: currentCountdownSeconds
            });
          } catch (error) {
            debugError(`Error sending AFK countdown update to ${data.playerId}:`, error, 'AFKManager');
          }
        }
      }, 1000);
      
    } catch (error) {
      debugError(`Error sending AFK countdown to ${data.playerId}:`, error, 'AFKManager');
    }
  }

  private timeoutPlayer(data: AFKPlayerData): void {
    debugLog(`Timing out AFK player ${data.playerId}`, 'AFKManager');
    
    try {
      // Send timeout message
      data.player.ui.sendData({
        type: 'afk-timeout',
        message: CONSTANTS.AFK_DETECTION.TIMEOUT_MESSAGE
      });
      
      // Send chat message
      if (this._world) {
        this._world.chatManager.sendPlayerMessage(
          data.player,
          CONSTANTS.AFK_DETECTION.TIMEOUT_MESSAGE,
          'FF4444' // Red color
        );
      }
      
      // Despawn player entities
      if (this._world) {
        this._world.entityManager.getPlayerEntitiesByPlayer(data.player).forEach(entity => {
          entity.despawn();
          debugLog(`Despawned entity for AFK player ${data.playerId}`, 'AFKManager');
        });
      }
      
      // Remove player from game managers (this will handle all cleanup including game mode unlocking)
      HockeyGameManager.instance.removePlayer(data.player);
      
      // Return player to game mode selection after a short delay
      setTimeout(() => {
        try {
          // Import PlayerManager to use the proper show game mode selection method
          if (this._world) {
            const { PlayerManager } = require('./PlayerManager');
            PlayerManager.instance.showGameModeSelectionToAllPlayers();
            debugLog(`Returned AFK player ${data.playerId} to game mode selection`, 'AFKManager');
          } else {
            // Fallback to direct UI message
            data.player.ui.sendData({
              type: 'game-mode-selection-start'
            });
            debugLog(`Returned AFK player ${data.playerId} to game mode selection (fallback)`, 'AFKManager');
          }
        } catch (error) {
          debugError(`Error returning AFK player ${data.playerId} to game mode selection:`, error, 'AFKManager');
        }
      }, 1000);
      
    } catch (error) {
      debugError(`Error timing out AFK player ${data.playerId}:`, error, 'AFKManager');
    }
  }



  private clearPlayerTimers(data: AFKPlayerData): void {
    if (data.timeoutTimer) {
      clearTimeout(data.timeoutTimer);
      data.timeoutTimer = undefined;
    }
    
    if (data.warningTimer) {
      clearTimeout(data.warningTimer);
      data.warningTimer = undefined;
    }
    
    if (data.countdownTimer) {
      clearInterval(data.countdownTimer);
      data.countdownTimer = undefined;
    }
  }

  public getTrackedPlayersCount(): number {
    return this._afkPlayers.size;
  }

  public isPlayerTracked(playerId: string): boolean {
    return this._afkPlayers.has(playerId);
  }

  public getPlayerAFKStatus(playerId: string): { isAFK: boolean, timeSinceActivity: number } | null {
    const playerData = this._afkPlayers.get(playerId);
    if (!playerData) return null;
    
    const timeSinceActivity = Date.now() - playerData.lastActivity;
    const isAFK = timeSinceActivity >= CONSTANTS.AFK_DETECTION.WARNING_DURATION;
    
    return { isAFK, timeSinceActivity };
  }
} 