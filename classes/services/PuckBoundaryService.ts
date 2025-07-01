import { Entity, EntityEvent, World } from 'hytopia';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { PlayerSpawnManager } from '../managers/PlayerSpawnManager';
import { AudioManager } from '../managers/AudioManager';
import { HockeyGameState } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

/**
 * Service that monitors puck position and automatically triggers respawn
 * when puck tunnels through walls or goes out of bounds
 */
export class PuckBoundaryService {
  private static _instance: PuckBoundaryService;
  private _world: World | null = null;
  private _puckEntity: Entity | null = null;
  private _isMonitoring: boolean = false;
  private _boundaryCheckCooldown: number = 0;
  private _lastValidPosition: { x: number, y: number, z: number } | null = null;

  // Wall boundary coordinates based on your map analysis
  // These define the playable area - puck should stay within these bounds
  // Made much wider to prevent false triggers when players skate into walls
  private readonly BOUNDARY_LIMITS = {
    X_MIN: -35,  // Much wider buffer to prevent false triggers
    X_MAX: 35,   // Much wider buffer to prevent false triggers
    Z_MIN: -50,  // Much wider buffer to prevent false triggers
    Z_MAX: 50,   // Much wider buffer to prevent false triggers
    Y_MIN: 0.5,  // Below the floor
    Y_MAX: 15,  // Reasonable height limit
  };

  // Cooldown to prevent rapid respawn triggers
  private readonly BOUNDARY_CHECK_COOLDOWN = 2000; // 2 seconds

  private constructor() {}

  public static get instance(): PuckBoundaryService {
    if (!PuckBoundaryService._instance) {
      PuckBoundaryService._instance = new PuckBoundaryService();
    }
    return PuckBoundaryService._instance;
  }

  /**
   * Initialize the boundary service
   */
  public initialize(world: World): void {
    this._world = world;
    debugLog('PuckBoundaryService initialized', 'PuckBoundaryService');
  }

  /**
   * Start monitoring a puck entity for boundary violations
   */
  public startMonitoring(puckEntity: Entity): void {
    if (this._isMonitoring && this._puckEntity === puckEntity) {
      return; // Already monitoring this puck
    }

    // Stop monitoring previous puck if any
    this.stopMonitoring();

    this._puckEntity = puckEntity;
    this._isMonitoring = true;
    this._lastValidPosition = { ...puckEntity.position };
    this._boundaryCheckCooldown = 0;

    // Add tick listener to monitor puck position
    puckEntity.on(EntityEvent.TICK, this._onPuckTick);

    debugLog('Started monitoring puck for boundary violations', 'PuckBoundaryService');
  }

  /**
   * Stop monitoring the current puck
   */
  public stopMonitoring(): void {
    if (this._puckEntity && this._isMonitoring) {
      // Remove the tick listener
      this._puckEntity.off(EntityEvent.TICK, this._onPuckTick);
      debugLog('Stopped monitoring puck for boundary violations', 'PuckBoundaryService');
    }

    this._puckEntity = null;
    this._isMonitoring = false;
    this._lastValidPosition = null;
    this._boundaryCheckCooldown = 0;
  }

  /**
   * Handle puck tick events to check for boundary violations
   */
  private _onPuckTick = ({ deltaTimeMs }: { deltaTimeMs: number }): void => {
    if (!this._puckEntity || !this._world || !this._isMonitoring) {
      return;
    }

    // Update cooldown
    if (this._boundaryCheckCooldown > 0) {
      this._boundaryCheckCooldown -= deltaTimeMs;
      return;
    }

    const position = this._puckEntity.position;

    // Check if puck is within valid boundaries
    if (this._isWithinBoundaries(position)) {
      // Update last valid position when puck is in bounds
      this._lastValidPosition = { ...position };
      return;
    }

    // Puck is out of bounds - trigger automatic respawn
    this._triggerAutomaticRespawn(position);
  };

  /**
   * Check if a position is within the playable boundaries
   */
  private _isWithinBoundaries(position: { x: number, y: number, z: number }): boolean {
    return (
      position.x >= this.BOUNDARY_LIMITS.X_MIN &&
      position.x <= this.BOUNDARY_LIMITS.X_MAX &&
      position.z >= this.BOUNDARY_LIMITS.Z_MIN &&
      position.z <= this.BOUNDARY_LIMITS.Z_MAX &&
      position.y >= this.BOUNDARY_LIMITS.Y_MIN &&
      position.y <= this.BOUNDARY_LIMITS.Y_MAX
    );
  }

  /**
   * Trigger automatic puck respawn when boundary violation is detected
   */
  private _triggerAutomaticRespawn(outOfBoundsPosition: { x: number, y: number, z: number }): void {
    if (!this._world || !this._puckEntity) {
      return;
    }

    // Check if we're already in a reset state to prevent multiple triggers
    const gameManager = HockeyGameManager.instance;
    if (gameManager.state === HockeyGameState.GOAL_SCORED || gameManager.state === HockeyGameState.MATCH_START || gameManager.state === HockeyGameState.PERIOD_END) {
      debugLog('Boundary violation detected but already in reset state, ignoring', 'PuckBoundaryService');
      return;
    }

    debugLog(
      `Puck boundary violation detected at: ${JSON.stringify(outOfBoundsPosition)}. Triggering automatic respawn...`,
      'PuckBoundaryService'
    );

    // Log the last valid position for debugging
    if (this._lastValidPosition) {
      debugLog(
        `Last valid puck position was: ${JSON.stringify(this._lastValidPosition)}`,
        'PuckBoundaryService'
      );
    }

    // IMMEDIATELY stop monitoring to prevent further triggers
    this.stopMonitoring();

    // Broadcast notification to players
    this._world.chatManager.sendBroadcastMessage(
      'Puck out of bounds - Resuming play...',
      'FFA500' // Orange referee color
    );

    // Play referee whistle sound
    AudioManager.instance.playRefereeWhistle();

    // Use existing reset system based on game state
    if (gameManager.state === HockeyGameState.IN_PERIOD) {
      // During active play, perform a complete reset with countdown (like goal reset)
      this._performGameplayReset();
    } else {
      // During other states, just reset puck position
      this._performSimplePuckReset();
    }
  }

  /**
   * Perform a complete reset during active gameplay (mimics goal reset sequence)
   */
  private _performGameplayReset(): void {
    if (!this._world) {
      return;
    }

    const gameManager = HockeyGameManager.instance;
    const playerSpawnManager = PlayerSpawnManager.instance;

    debugLog('Starting boundary reset sequence (similar to goal reset)...', 'PuckBoundaryService');

    // Step 1: Set game state to lock movement (same as goal reset)
    gameManager['_state'] = HockeyGameState.GOAL_SCORED; // Use bracket notation to access private field
    debugLog('Set game state to GOAL_SCORED to lock player movement during boundary reset', 'PuckBoundaryService');

    // Step 2: Pause game timer and UI timer (same as goal reset)
    try {
      // CRITICAL: Pause the backend period timer IMMEDIATELY to get precise timing
      if (gameManager['_periodTimer']) {
        clearTimeout(gameManager['_periodTimer']);
        gameManager['_periodTimer'] = undefined;
      }

      // Capture current period time remaining AFTER pausing (for precise synchronization)
      const { PlayerStatsManager } = require('../managers/PlayerStatsManager');
      const currentPeriodTime = PlayerStatsManager.instance.getCurrentPeriodTimeRemaining();
      
      // Store the EXACT time that should be displayed when we resume
      gameManager['_pausedTimerValue'] = currentPeriodTime;
      gameManager['_pausedPeriodTimeMs'] = currentPeriodTime * 1000; // This is the exact time we'll resume with
      gameManager['_offsidePauseStartTime'] = Date.now();
      
      debugLog(`Boundary reset - captured paused timer value: ${currentPeriodTime} seconds`, 'PuckBoundaryService');
      debugLog(`Backend period timer paused for boundary reset - remaining time: ${currentPeriodTime * 1000}ms`, 'PuckBoundaryService');

      // CRITICAL: Send timer-pause event to UI (stops visual countdown at the exact captured time)
      this._sendTimerPauseToAllPlayers(gameManager, currentPeriodTime);
      
    } catch (error) {
      debugWarn('Could not pause game timer:', error, 'PuckBoundaryService');
    }

    // Step 3: Get current puck entity and despawn it
    const { ChatCommandManager } = require('../managers/ChatCommandManager');
    const currentPuck = ChatCommandManager.instance.getPuck();
    if (currentPuck && currentPuck.isSpawned) {
      try {
        currentPuck.despawn();
        debugLog('Despawned out-of-bounds puck', 'PuckBoundaryService');
      } catch (error) {
        debugWarn('Error despawning puck:', error, 'PuckBoundaryService');
      }
    }

    // Step 4: Build team and player maps for reset
    const teams = this._buildValidTeamsObject(gameManager);
    const playerIdToPlayer = this._buildPlayerMap(gameManager, teams);

    // Step 5: Spawn NEW puck at center ice
    const newPuck = ChatCommandManager.instance['createPuckEntity']?.();
    if (newPuck) {
      newPuck.spawn(this._world, { x: 0, y: 1.8, z: 1 }); // Center ice position
      ChatCommandManager.instance.updatePuckReference(newPuck);
      
      // Attach trail effect to new puck (same as normal puck spawning)
      try {
        const { PuckTrailManager } = require('../managers/PuckTrailManager');
        PuckTrailManager.instance.attachTrailToPuck(newPuck);
        debugLog('Attached trail effect to new boundary-reset puck', 'PuckBoundaryService');
      } catch (error) {
        debugWarn('Could not attach trail to new puck:', error, 'PuckBoundaryService');
      }
      
      debugLog('Spawned new puck at center ice with trail effect', 'PuckBoundaryService');
    }

    // Step 6: Reset all players to spawn positions (same as goal reset)
    playerSpawnManager.teleportAllPlayersToSpawn(teams, playerIdToPlayer);

    // Step 7: Start countdown (with proper game state management)
    this._startBoundaryResetCountdown(gameManager);
  }

  /**
   * Build valid teams object using public API
   */
  private _buildValidTeamsObject(gameManager: any): Record<string, Record<string, string>> {
    const publicTeams = gameManager.teams;
    const validTeams: Record<string, Record<string, string>> = {
      RED: {},
      BLUE: {}
    };

    // Copy only defined player assignments
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = publicTeams[team]?.[position];
        if (playerId) {
          validTeams[team][position] = playerId;
        }
      }
    }

    return validTeams;
  }

  /**
   * Build player ID to Player object map using public API
   */
  private _buildPlayerMap(gameManager: any, teams: Record<string, Record<string, string>>): Map<string, any> {
    const playerIdToPlayer = new Map();

    // Iterate through all assigned players and get Player objects
    for (const team of ['RED', 'BLUE']) {
      for (const position of Object.keys(teams[team])) {
        const playerId = teams[team][position];
        if (playerId) {
          const player = gameManager.getPlayerById(playerId);
          if (player) {
            playerIdToPlayer.set(playerId, player);
          }
        }
      }
    }

    return playerIdToPlayer;
  }

  /**
   * Perform a simple puck reset without moving players (for non-gameplay states)
   */
  private _performSimplePuckReset(): void {
    if (!this._world) {
      return;
    }

    const playerSpawnManager = PlayerSpawnManager.instance;
    
    // Get current puck and reset it to center ice
    const { ChatCommandManager } = require('../managers/ChatCommandManager');
    const currentPuck = ChatCommandManager.instance.getPuck();
    
    if (currentPuck) {
      const success = playerSpawnManager.resetPuckToCenterIce(currentPuck);
      
      if (success) {
        debugLog('Puck reset to center ice due to boundary violation (simple reset)', 'PuckBoundaryService');
        
        // Resume monitoring after reset with fresh puck reference
        setTimeout(() => {
          const freshPuck = ChatCommandManager.instance.getPuck();
          if (freshPuck && freshPuck.isSpawned) {
            this.startMonitoring(freshPuck);
          }
        }, 1000);
      }
    } else {
      debugLog('No puck found for simple reset', 'PuckBoundaryService');
    }
  }

  /**
   * Start countdown for resuming play after reset
   */
  private _startBoundaryResetCountdown(gameManager: any): void {
    if (!this._world) {
      return;
    }

    let countdown = 3;
    
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        // Send countdown directly to all players
        this._sendCountdownToAllPlayers(gameManager, countdown);
        
        // Play countdown sound only at the start
        if (countdown === 3) {
          AudioManager.instance.playCountdownSound();
        }
        
        countdown--;
      } else {
        // Countdown finished
        clearInterval(countdownInterval);
        
        // Send GO! message
        this._sendGoMessageToAllPlayers(gameManager);
        
        // Play final whistle
        AudioManager.instance.playRefereeWhistle();
        
        // Resume with the EXACT same time we paused at
        try {
          if (gameManager['_pausedPeriodTimeMs'] !== null && gameManager['_offsidePauseStartTime'] !== null) {
            // Calculate total pause duration (including countdown)
            const totalPauseDuration = Date.now() - gameManager['_offsidePauseStartTime'];
            
            // Use the EXACT paused time (don't adjust it - this ensures UI and backend match)
            const exactRemainingTime = gameManager['_pausedPeriodTimeMs'];
             
            // CRITICAL: Adjust backend timing FIRST (so calculations are correct)
            const { PlayerStatsManager } = require('../managers/PlayerStatsManager');
            PlayerStatsManager.instance.adjustPeriodStartTime(totalPauseDuration);
            
            // CRITICAL FIX: Send timer adjustment with EXPLICIT resume time to prevent UI flash
            // Instead of relying on UI to calculate, send the exact time to display
            this._sendTimerResumeToAllPlayers(gameManager, exactRemainingTime / 1000); // Convert to seconds
            
            // Small delay to ensure UI processes timer resume before state change
            setTimeout(() => {
              // Now resume game state (UI already has exact timing)
              gameManager['_state'] = HockeyGameState.IN_PERIOD;
              debugLog('Set game state back to IN_PERIOD - resuming play after boundary reset', 'PuckBoundaryService');
              
              if (exactRemainingTime > 0) {
                // Restart period timer with the EXACT remaining time we captured
                gameManager['_periodTimer'] = setTimeout(() => gameManager.endPeriod(), exactRemainingTime);
                debugLog(`Backend period timer restarted after boundary reset - remaining time: ${exactRemainingTime}ms (paused for ${totalPauseDuration}ms)`, 'PuckBoundaryService');
              } else {
                // Time is up, end period immediately
                debugLog('Period time expired during boundary reset - ending period now', 'PuckBoundaryService');
                setTimeout(() => gameManager.endPeriod(), 100);
              }
              
              // Clear pause tracking
              gameManager['_pausedPeriodTimeMs'] = null;
              gameManager['_offsidePauseStartTime'] = null;
            }, 50); // Small delay to prevent race condition
            
          } else {
            debugLog('No paused period timer found - period timer may not have been running', 'PuckBoundaryService');
            // Still resume game state even if no timer was running
            gameManager['_state'] = HockeyGameState.IN_PERIOD;
            debugLog('Set game state back to IN_PERIOD - resuming play after boundary reset (no timer)', 'PuckBoundaryService');
          }
        } catch (error) {
          debugWarn('Could not restart game timer:', error, 'PuckBoundaryService');
          // Fallback: still resume game state
          gameManager['_state'] = HockeyGameState.IN_PERIOD;
          debugLog('Set game state back to IN_PERIOD - resuming play after boundary reset (error fallback)', 'PuckBoundaryService');
        }
        
        // Clear paused timer value (play is resuming)
        gameManager['_pausedTimerValue'] = null;
        
        // Resume monitoring after countdown
        setTimeout(() => {
          // Get fresh puck reference after reset
          const { ChatCommandManager } = require('../managers/ChatCommandManager');
          const freshPuckEntity = ChatCommandManager.instance.getPuck();
          
          if (freshPuckEntity && freshPuckEntity.isSpawned) {
            debugLog('Resuming boundary monitoring with fresh puck reference', 'PuckBoundaryService');
            this.startMonitoring(freshPuckEntity);
          } else {
            debugLog('Could not resume monitoring - fresh puck not found or not spawned', 'PuckBoundaryService');
          }
        }, 1000);
      }
    }, 1000);
  }

  /**
   * Send countdown update to all players using public API
   */
  private _sendCountdownToAllPlayers(gameManager: any, countdown: number): void {
    const teams = gameManager.teams;
    
    // Get all player IDs
    const allPlayerIds: string[] = [];
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = teams[team]?.[position];
        if (playerId) {
          allPlayerIds.push(playerId);
        }
      }
    }

    // Send countdown to each player
    allPlayerIds.forEach(playerId => {
      const player = gameManager.getPlayerById(playerId);
      if (player) {
        try {
          player.ui.sendData({
            type: 'countdown-update',
            countdown: countdown,
            subtitle: 'Resuming Play'
          });
        } catch (error) {
          debugError('Error sending countdown to player:', error, 'PuckBoundaryService');
        }
      }
    });

    // Also send chat message as backup
    this._world!.chatManager.sendBroadcastMessage(
      `Resuming play in ${countdown}...`,
      'FFFF00'
    );
  }

  /**
   * Send GO! message to all players using public API
   */
  private _sendGoMessageToAllPlayers(gameManager: any): void {
    const teams = gameManager.teams;
    
    // Get all player IDs
    const allPlayerIds: string[] = [];
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = teams[team]?.[position];
        if (playerId) {
          allPlayerIds.push(playerId);
        }
      }
    }

    // Send GO! message to each player
    allPlayerIds.forEach(playerId => {
      const player = gameManager.getPlayerById(playerId);
      if (player) {
        try {
          player.ui.sendData({
            type: 'countdown-go'
          });
        } catch (error) {
          debugError('Error sending GO message to player:', error, 'PuckBoundaryService');
        }
      }
    });

    // Send chat message
    this._world!.chatManager.sendBroadcastMessage(
      'Play resumed!',
      '00FF00'
    );

    // Hide countdown overlay after delay
    setTimeout(() => {
      allPlayerIds.forEach(playerId => {
        const player = gameManager.getPlayerById(playerId);
        if (player) {
          try {
            player.ui.sendData({
              type: 'countdown-end'
            });
          } catch (error) {
            debugError('Error ending countdown for player:', error, 'PuckBoundaryService');
          }
        }
      });
    }, 1000);
  }

  /**
   * Send timer-pause event to all players (stops UI countdown)
   */
  private _sendTimerPauseToAllPlayers(gameManager: any, pausedTime: number): void {
    const teams = gameManager.teams;
    
    // Get all player IDs
    const allPlayerIds: string[] = [];
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = teams[team]?.[position];
        if (playerId) {
          allPlayerIds.push(playerId);
        }
      }
    }

    // Send timer-pause event to each player
    allPlayerIds.forEach(playerId => {
      const player = gameManager.getPlayerById(playerId);
      if (player) {
        try {
          player.ui.sendData({
            type: 'timer-pause',
            pausedTime: pausedTime
          });
        } catch (error) {
          debugError('Error sending timer-pause to player:', error, 'PuckBoundaryService');
        }
      }
    });

    debugLog(`Sent timer-pause event to ${allPlayerIds.length} players with pausedTime: ${pausedTime}`, 'PuckBoundaryService');
  }

  /**
   * Send period-time-adjusted event to all players (for UI synchronization)
   */
  private _sendTimerAdjustmentToAllPlayers(gameManager: any, pauseDurationMs: number): void {
    const teams = gameManager.teams;
    
    // Get all player IDs
    const allPlayerIds: string[] = [];
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = teams[team]?.[position];
        if (playerId) {
          allPlayerIds.push(playerId);
        }
      }
    }

    // Send period-time-adjusted event to each player
    allPlayerIds.forEach(playerId => {
      const player = gameManager.getPlayerById(playerId);
      if (player) {
        try {
          player.ui.sendData({
            type: 'period-time-adjusted',
            pauseDurationMs: pauseDurationMs
          });
        } catch (error) {
          debugError('Error sending period-time-adjusted to player:', error, 'PuckBoundaryService');
        }
      }
    });

    debugLog(`Sent period-time-adjusted event to ${allPlayerIds.length} players with pauseDurationMs: ${pauseDurationMs}`, 'PuckBoundaryService');
  }

  /**
   * Send timer-resume event to all players with exact time (prevents UI flash)
   */
  private _sendTimerResumeToAllPlayers(gameManager: any, exactResumeTime: number): void {
    const teams = gameManager.teams;
    
    // Get all player IDs
    const allPlayerIds: string[] = [];
    for (const team of ['RED', 'BLUE']) {
      for (const position of ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER']) {
        const playerId = teams[team]?.[position];
        if (playerId) {
          allPlayerIds.push(playerId);
        }
      }
    }

    // Send timer-resume event to each player with exact time
    allPlayerIds.forEach(playerId => {
      const player = gameManager.getPlayerById(playerId);
      if (player) {
        try {
          player.ui.sendData({
            type: 'timer-resume',
            exactTime: exactResumeTime
          });
        } catch (error) {
          debugError('Error sending timer-resume to player:', error, 'PuckBoundaryService');
        }
      }
    });

    debugLog(`Sent timer-resume event to ${allPlayerIds.length} players with exactTime: ${exactResumeTime} seconds`, 'PuckBoundaryService');
  }

  /**
   * Update boundary limits (useful for testing or different rink sizes)
   */
  public updateBoundaryLimits(limits: Partial<typeof this.BOUNDARY_LIMITS>): void {
    Object.assign(this.BOUNDARY_LIMITS, limits);
    debugLog(
      `Updated boundary limits: ${JSON.stringify(this.BOUNDARY_LIMITS)}`,
      'PuckBoundaryService'
    );
  }

  /**
   * Get current boundary limits for debugging
   */
  public getBoundaryLimits(): typeof this.BOUNDARY_LIMITS {
    return { ...this.BOUNDARY_LIMITS };
  }

  /**
   * Check if service is currently monitoring a puck
   */
  public get isMonitoring(): boolean {
    return this._isMonitoring;
  }

  /**
   * Get the currently monitored puck entity
   */
  public get monitoredPuck(): Entity | null {
    return this._puckEntity;
  }
} 