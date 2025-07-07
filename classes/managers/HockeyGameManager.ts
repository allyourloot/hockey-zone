import { DefaultPlayerEntity, Entity, Player, World, Audio, PlayerCameraMode } from 'hytopia';
import { 
  HockeyGameState, 
  HockeyTeam, 
  HockeyPosition,
  FaceoffLocation,
  GameMode
} from '../utils/types';
import type { OffsideViolation } from '../utils/types';
import type { 
  TeamAssignment, 
  Teams,
  GameModeSelectData
} from '../utils/types';
import { ShootoutManager } from './ShootoutManager';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { AudioManager } from './AudioManager';
import { PlayerStatsManager } from './PlayerStatsManager';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

export class HockeyGameManager {
  private static _instance: HockeyGameManager;
  private _world: World | undefined;
  private _state: HockeyGameState = HockeyGameState.LOBBY;
  private _gameMode: GameMode = GameMode.REGULATION;
  private _teams: Teams = {
    [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
    [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
  };
  // Track tentative selections (before lock-in) separately
  private _tentativeSelections: Map<string, { team: HockeyTeam, position: HockeyPosition }> = new Map();
  private _scores: Record<HockeyTeam, number> = {
    [HockeyTeam.RED]: 0,
    [HockeyTeam.BLUE]: 0,
  };
  private _period: number = 1;
  private _periodTimeMs: number = 2 * 60 * 1000; // 2 minutes
  private _periodTimer: NodeJS.Timeout | undefined;
  private _lockedInPlayers: Set<string> = new Set();
  private _playerIdToPlayer: Map<string, Player> = new Map();
  
  // Track ongoing goal celebration/countdown state for new players
  private _goalCelebrationState: {
    isActive: boolean;
    team?: HockeyTeam;
    isOwnGoal?: boolean;
    scorerName?: string;
    assistName?: string;
  } = { isActive: false };
  
  // Track ongoing offside state for new players
  private _offsideState: {
    isActive: boolean;
    violatingTeam?: HockeyTeam;
    faceoffLocation?: FaceoffLocation;
  } = { isActive: false };

  // Store player rotations during faceoff spawn to maintain exact same angles when play resumes
  private _faceoffPlayerRotations: Map<string, number> = new Map();
  
  // Store remaining period time when offsides pauses the backend timer
  private _pausedPeriodTimeMs: number | null = null;
  private _offsidePauseStartTime: number | null = null;
  
  private _countdownState: {
    isActive: boolean;
    countdown?: number;
    subtitle?: string;
  } = { isActive: false };
  
  // Track the exact time when timer was paused (for goal celebrations)
  private _pausedTimerValue: number | null = null;
  
  // Removed movement lock system - was interfering with puck controls

  // Add at the top of the class
  private _gameModeLock: GameMode | null = null;

  private constructor() {}

  public static get instance(): HockeyGameManager {
    if (!HockeyGameManager._instance) {
      HockeyGameManager._instance = new HockeyGameManager();
    }
    return HockeyGameManager._instance;
  }

  public setupGame(world: World) {
    this._world = world;
    this._state = HockeyGameState.GAME_MODE_SELECTION;
    this._gameMode = GameMode.REGULATION;
    this._teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
    };
    this._tentativeSelections.clear();
    this._scores = {
      [HockeyTeam.RED]: 0,
      [HockeyTeam.BLUE]: 0,
    };
    this._period = 1;
    this._lockedInPlayers.clear();
    this._playerIdToPlayer.clear();
    
    // Reset player stats for new game
    PlayerStatsManager.instance.resetStats();
    
    // Initialize shootout manager
    ShootoutManager.instance.initialize(world);
    
    // Start with game mode selection
    this.startGameModeSelection();
  }

  public startGameModeSelection() {
    if (this._state === HockeyGameState.GAME_MODE_SELECTION) return;
    this._state = HockeyGameState.GAME_MODE_SELECTION;
    
    debugLog('🎮 GAME MODE SELECTION STARTED - State set to GAME_MODE_SELECTION', 'HockeyGameManager');
    debugLog(`📊 Current players in map: ${this._playerIdToPlayer.size}`, 'HockeyGameManager');
    
    // Unlock pointer for game mode selection UI interaction for all connected players
    if (this._world) {
      const { PlayerManager } = require('./PlayerManager');
      const allConnectedPlayers = PlayerManager.instance.getConnectedPlayers();
      
      allConnectedPlayers.forEach((player: any) => {
        try {
          player.ui.lockPointer(false); // Unlock pointer for game mode selection
          debugLog(`Unlocked pointer for player ${player.id} during game mode selection`, 'HockeyGameManager');
        } catch (error) {
          debugError('Error unlocking pointer for player during game mode selection:', error, 'HockeyGameManager');
        }
      });
    }
    
    // Broadcast game mode selection start to all connected players (not just those in _playerIdToPlayer)
    if (this._world) {
      const { PlayerManager } = require('./PlayerManager');
      const allConnectedPlayers = PlayerManager.instance.getConnectedPlayers();
      
      allConnectedPlayers.forEach((player: any) => {
        try {
          player.ui.sendData({
            type: 'game-mode-selection-start'
          });
        } catch (error) {
          debugError('Error sending game mode selection start to player:', error, 'HockeyGameManager');
        }
      });
      
      debugLog(`📡 Broadcasted game-mode-selection-start to ${allConnectedPlayers.length} connected players`, 'HockeyGameManager');
    }
  }

  public selectGameMode(gameMode: GameMode) {
    if (this._state !== HockeyGameState.GAME_MODE_SELECTION) {
      debugWarn(`selectGameMode called but not in GAME_MODE_SELECTION state. Current state: ${this._state}`, 'HockeyGameManager');
      return;
    }
    
    this._gameMode = gameMode;
    this.setGameModeLock(gameMode);

    // --- FIX: Immediately broadcast new availability to all players ---
    this.broadcastGameModeAvailability();
    
    debugLog(`🎯 Game mode selected: ${gameMode}`, 'HockeyGameManager');
    
    if (gameMode === GameMode.SHOOTOUT) {
      debugLog('🥅 Starting Shootout mode', 'HockeyGameManager');
      this.startShootoutMode();
    } else {
      debugLog('🏒 Starting Regulation mode (Team Selection)', 'HockeyGameManager');
      this.startTeamSelection();
    }
  }

  public registerPlayerForShootout(player: any): void {
    if (this._gameMode !== GameMode.SHOOTOUT) return;
    
    // Only accept the first 2 players for shootout, or if shootout is already in progress
    if (this._playerIdToPlayer.size >= 2 || this._state === HockeyGameState.SHOOTOUT_IN_PROGRESS) {
      const reason = this._state === HockeyGameState.SHOOTOUT_IN_PROGRESS ? 'shootout already in progress' : 'shootout already has 2 players';
      debugLog(`🚫 Rejecting player ${player.id} - ${reason}`, 'HockeyGameManager');
      
      // Hide game mode selection overlay for spectator
      player.ui.sendData({
        type: 'hide-game-mode-selection'
      });
      
      // Send message to player that shootout is full
      player.ui.sendData({
        type: 'shootout-full',
        message: 'Shootout is full! You are now spectating the match.'
      });
      
      // Hide any existing scoreboards
      player.ui.sendData({
        type: 'hide-scoreboard'
      });
      
      // Add them as a spectator to the shootout so they can see the scoreboard
      ShootoutManager.instance.addSpectator(player);
      debugLog(`👀 Added spectator ${player.id} to shootout`, 'HockeyGameManager');
      return;
    }
    
    // Add player to the map
    this._playerIdToPlayer.set(player.id, player);
    debugLog(`🥅 Registered player ${player.id} for shootout mode (${this._playerIdToPlayer.size}/2 players)`, 'HockeyGameManager');
    
    // Hide game mode selection overlay for this player
    player.ui.sendData({
      type: 'hide-game-mode-selection'
    });
    
    // Hide any existing scoreboards
    player.ui.sendData({
      type: 'hide-scoreboard'
    });
    
    if (this._playerIdToPlayer.size === 1) {
      // First player - show waiting message
      player.ui.sendData({
        type: 'shootout-waiting',
        message: 'Waiting for another player to join shootout...',
        playersWaiting: 1,
        playersNeeded: 2
      });
    } else if (this._playerIdToPlayer.size === 2) {
      // Second player - hide waiting message and prepare for game start
      const allRegisteredPlayers = Array.from(this._playerIdToPlayer.values());
      allRegisteredPlayers.forEach(p => {
        p.ui.sendData({
          type: 'hide-waiting-message'
        });
      });
    }
    
    // Spawn player immediately as CENTER position
    this.spawnPlayerForShootout(player);
    
    // Check if we can start shootout
    this.checkShootoutReadiness();
  }

  private spawnPlayerForShootout(player: any): void {
    if (!this._world) return;
    
    // Determine team and position based on how many players are already registered
    const playerCount = this._playerIdToPlayer.size;
    let team: HockeyTeam;
    let position: HockeyPosition;
    
    if (playerCount === 1) {
      // First player: RED CENTER
      team = HockeyTeam.RED;
      position = HockeyPosition.CENTER;
      this._teams[HockeyTeam.RED][HockeyPosition.CENTER] = player.id;
    } else if (playerCount === 2) {
      // Second player: BLUE GOALIE
      team = HockeyTeam.BLUE;
      position = HockeyPosition.GOALIE;
      this._teams[HockeyTeam.BLUE][HockeyPosition.GOALIE] = player.id;
    } else {
      debugWarn(`Unexpected player count in shootout: ${playerCount}`, 'HockeyGameManager');
      return;
    }
    
    this._lockedInPlayers.add(player.id);
    
    debugLog(`🎯 Spawning player ${player.id} as ${team} ${position} for shootout`, 'HockeyGameManager');
    
    // Broadcast spawn event to PlayerManager
    if (this._playerManagerCallback) {
      this._playerManagerCallback('spawnPlayerForShootout', {
        player: player,
        team: team,
        position: position
      });
    }
  }

  private checkShootoutReadiness(): void {
    const connectedPlayers = Array.from(this._playerIdToPlayer.values());
    
    if (connectedPlayers.length >= 2) {
      debugLog(`✅ Shootout ready with ${connectedPlayers.length} players`, 'HockeyGameManager');
      
      // Show brief "Get ready" message before countdown
      this.broadcastToAllPlayers({
        type: 'shootout-preparing',
        message: 'Get ready for shootout...',
        waitSeconds: 2
      });
      
      // Add a 2-second delay before starting shootout to make it less jarring
      setTimeout(() => {
        this.beginShootout();
      }, 2000);
    } else {
      debugLog(`⏳ Waiting for more players (${connectedPlayers.length}/2)`, 'HockeyGameManager');
    }
  }

  private beginShootout(): void {
    if (!this._world) return;
    
    this._state = HockeyGameState.SHOOTOUT_IN_PROGRESS;
    const connectedPlayers = Array.from(this._playerIdToPlayer.values());
    
    debugLog('🥅 Beginning shootout with position assignments', 'HockeyGameManager');
    
    // Clear previous team assignments
    this._teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
    };
    
    // Start shootout - ShootoutManager will handle the countdown
    ShootoutManager.instance.startShootout(connectedPlayers);
  }

  public startShootoutMode() {
    if (!this._world) return;
    
    this._state = HockeyGameState.SHOOTOUT_READY;
    debugLog('🥅 Shootout mode started - waiting for players to join', 'HockeyGameManager');
    
    // Don't automatically register all existing players
    // Players must individually select "Shootout" mode to join
    // The first player to select shootout will have already been registered
    
    // Check if there are already players registered (from the first player selection)
    this.checkShootoutReadiness();
  }

  public shootoutGoalScored(scored: boolean, scorerId?: string) {
    if (this._state !== HockeyGameState.SHOOTOUT_IN_PROGRESS) return;
    
    debugLog(`Shootout shot attempted - scored: ${scored}, scorer: ${scorerId}`, 'HockeyGameManager');
    
    // If a goal was scored, trigger the same celebration effects as regulation goals
    if (scored && this._world && scorerId) {
      // Get the scorer's team information
      const scorerTeamInfo = this.getTeamAndPosition(scorerId);
      if (!scorerTeamInfo) {
        debugWarn(`Cannot determine team for shooter ${scorerId} in shootout`, 'HockeyGameManager');
        // Still pass the goal to shootout manager even if we can't determine team
        ShootoutManager.instance.shotAttempted(scored, scorerId);
        return;
      }
      
      const scoringTeam = scorerTeamInfo.team;
      
      // Play goal horn sound effect (same as regulation)
      AudioManager.instance.playGoalHorn();
      
      // Get scorer name for UI
      const scorerName = this._playerIdToPlayer.get(scorerId)?.username || 'Unknown';
      
      // Get all players to send goal overlay and updates
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      // Send goal overlay and score update to all players (same as regulation)
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'goal-scored',
            team: scoringTeam,
            isOwnGoal: false, // Shootout goals can't be own goals
            scorerName: scorerName
          });
        } catch (error) {
          debugError('Error sending shootout goal overlay to player:', error, 'HockeyGameManager');
        }
      });
      
      // Send chat message about the goal
      this._world.chatManager.sendBroadcastMessage(
        `SHOOTOUT GOAL! ${scoringTeam} team scores! Scored by ${scorerName}`,
        scoringTeam === HockeyTeam.RED ? 'FF4444' : '44AAFF'
      );
    }
    
    // Always pass the goal event to the shootout manager (handles timing)
    ShootoutManager.instance.shotAttempted(scored, scorerId);
  }

  public startTeamSelection() {
    if (this._state === HockeyGameState.TEAM_SELECTION) return;
    this._state = HockeyGameState.TEAM_SELECTION;
    
    debugLog('👥 TEAM SELECTION STARTED - State set to TEAM_SELECTION', 'HockeyGameManager');
    debugLog(`📊 Current players in map: ${this._playerIdToPlayer.size}`, 'HockeyGameManager');
    
    // Unlock pointer for team selection UI interaction
    if (this._world) {
      this._playerIdToPlayer.forEach((player) => {
        try {
          player.ui.lockPointer(false); // Unlock pointer for team selection
          debugLog(`Unlocked pointer for player ${player.id} during team selection`, 'HockeyGameManager');
        } catch (error) {
          debugError('Error unlocking pointer for player during team selection:', error, 'HockeyGameManager');
        }
      });
    }
    
    // Broadcast team selection start
    this.broadcastToAllPlayers({
      type: 'show-team-selection'
    });
    
    // Also broadcast current team positions so players see what's taken
    this.broadcastToAllPlayers({
      type: 'team-positions-update',
      teams: this.getTeamsWithNamesForUI()
    });
    
    debugLog('📡 Broadcasted show-team-selection and team-positions-update events', 'HockeyGameManager');
  }

  public startWaitingForPlayers() {
    if (this._state === HockeyGameState.WAITING_FOR_PLAYERS) return;
    this._state = HockeyGameState.WAITING_FOR_PLAYERS;
    // TODO: Wait for both teams to fill
  }

  public startMatch() {
    if (this._state === HockeyGameState.MATCH_START) return;
    this._state = HockeyGameState.MATCH_START;
    this._period = 1;
    this._scores = {
      RED: 0,
      BLUE: 0,
    };
    
    // Start tracking game time for stats
    PlayerStatsManager.instance.startGameTime();
    
    // TODO: Announce match start, countdown, then call startPeriod()
  }

  public startPeriod() {
    if (this._state === HockeyGameState.IN_PERIOD) return;
    this._state = HockeyGameState.IN_PERIOD;
    
    // Start tracking period time for stats
    PlayerStatsManager.instance.startPeriodTime();
    
    // Movement lock system removed - no longer needed
    
    // Update period and notify all players
    if (this._world) {
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'game-start'
          });
          player.ui.sendData({
            type: 'period-update',
            period: this._period
          });
        } catch (error) {
          debugError('Error sending period start to player:', error, 'HockeyGameManager');
        }
      });
    }
    
    // Start period timer, reset puck/players
    this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
  }

  public goalScored(team: HockeyTeam, puckEntity?: any, isOwnGoal: boolean = false, scorerId?: string, primaryAssistId?: string) {
    // Handle shootout goals differently
    if (this._state === HockeyGameState.SHOOTOUT_IN_PROGRESS) {
      // Check if shot is still valid before processing goal
      if (!ShootoutManager.instance.isShotStillValid()) {
        debugLog(`🚫 Goal ignored in shootout - shot timer already expired`, 'HockeyGameManager');
        return;
      }
      this.shootoutGoalScored(true, scorerId);
      return;
    }
    
    if (this._state === HockeyGameState.GOAL_SCORED) return;
    this._scores[team]++;
    
    // Record goal in stats if we have scorer info
    if (scorerId) {
      debugLog(`Recording goal for scorer: ${scorerId}, team: ${team}, period: ${this._period}`, 'HockeyGameManager');
      if (primaryAssistId) {
        debugLog(`Recording primary assist for: ${primaryAssistId}`, 'HockeyGameManager');
      }
      
      // TRACK SHOT ON GOAL: Record that this was a shot on goal (resulted in goal)
      PlayerStatsManager.instance.recordShot(scorerId, team, true, false, undefined, isOwnGoal).catch(error => {
        debugError('Error recording shot stat:', error, 'HockeyGameManager');
      }); // onGoal=true, saved=false, isOwnGoal passed from method parameter
      debugLog(`📊 Recorded shot on goal for ${scorerId} (resulted in ${isOwnGoal ? 'own goal' : 'goal'})`, 'HockeyGameManager');
      
      // Record goal (now async)
      PlayerStatsManager.instance.recordGoal(scorerId, primaryAssistId, team, this._period, isOwnGoal)
        .then(goalInfo => {
          // Debug: Log current stats after goal
          const scorerStats = PlayerStatsManager.instance.getPlayerStats(scorerId);
          debugLog(`Scorer stats after goal: ${JSON.stringify(scorerStats)}`, 'HockeyGameManager');
          
          if (primaryAssistId) {
            const assistStats = PlayerStatsManager.instance.getPlayerStats(primaryAssistId);
            debugLog(`Primary assist stats after goal: ${JSON.stringify(assistStats)}`, 'HockeyGameManager');
          }
        })
        .catch(error => {
          debugError('Error recording goal stats:', error, 'HockeyGameManager');
        });
    } else {
      debugLog('No scorer ID provided for goal - stats not recorded', 'HockeyGameManager');
    }
    
    // DON'T lock movement yet - allow celebration time
    // this._state = HockeyGameState.GOAL_SCORED;
    
    // Play goal horn sound effect
    AudioManager.instance.playGoalHorn();
    
    // Notify all players of the score update
    if (this._world) {
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      // Get goal scorer and assist info for enhanced UI
      const goalInfo = PlayerStatsManager.instance.getLastGoal();
      const scorerName = goalInfo ? PlayerStatsManager.instance.getPlayerStats(goalInfo.scorerId)?.playerName : 'Unknown';
      const assistName = goalInfo?.assistId ? PlayerStatsManager.instance.getPlayerStats(goalInfo.assistId)?.playerName : undefined;
      
      // Track goal celebration state for new players
      this._goalCelebrationState = {
        isActive: true,
        team: team,
        isOwnGoal: isOwnGoal,
        scorerName: scorerName,
        assistName: assistName
      };
      
      // Capture the current timer value when goal is scored (for new players)
      const currentPeriodTime = PlayerStatsManager.instance.getCurrentPeriodTimeRemaining();
      this._pausedTimerValue = currentPeriodTime;
      debugLog(`Goal scored - captured paused timer value: ${this._pausedTimerValue} seconds`, 'HockeyGameManager');
      
      // CRITICAL: Pause the backend period timer to prevent period from ending while goal celebration is active
      if (this._periodTimer) {
        clearTimeout(this._periodTimer);
        this._periodTimer = undefined;
        
        // Calculate remaining time in milliseconds for the backend timer
        this._pausedPeriodTimeMs = currentPeriodTime * 1000; // Convert seconds to milliseconds
        this._offsidePauseStartTime = Date.now(); // Reuse the same pause tracking mechanism
        
        debugLog(`Backend period timer paused for goal celebration - remaining time: ${this._pausedPeriodTimeMs}ms`, 'HockeyGameManager');
      }
      
      // Broadcast the paused timer value to all existing players
      this.broadcastToAllPlayers({
        type: 'timer-pause',
        pausedTime: this._pausedTimerValue
      });
      
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'score-update',
            redScore: this._scores[HockeyTeam.RED],
            blueScore: this._scores[HockeyTeam.BLUE]
          });
          player.ui.sendData({
            type: 'goal-scored',
            team: team,
            isOwnGoal: isOwnGoal,
            scorerName: scorerName,
            assistName: assistName
          });
        } catch (error) {
          debugError('Error sending score update to player:', error, 'HockeyGameManager');
        }
      });
      
      // Enhanced goal announcement with player names
      let goalMessage = isOwnGoal 
        ? `OWN GOAL! ${team} team scores!`
        : `GOAL! ${team} team scores!`;
      
      if (scorerName && scorerName !== 'Unknown') {
        goalMessage += ` Scored by ${scorerName}`;
        if (assistName) {
          goalMessage += ` (Assist: ${assistName})`;
        }
      }
      
      goalMessage += ` Score is now RED ${this._scores[HockeyTeam.RED]} - BLUE ${this._scores[HockeyTeam.BLUE]}`;
      
      this._world.chatManager.sendBroadcastMessage(
        goalMessage,
        team === HockeyTeam.RED ? 'FF4444' : '44AAFF'
      );
      
      // Broadcast updated stats after goal
      this.broadcastStatsUpdate();
    }
    
    // Reset players and puck after goal celebration (no immediate movement lock)
    setTimeout(() => {
      debugLog('Starting goal reset sequence...', 'HockeyGameManager');
      
      // Lock movement IMMEDIATELY when reset starts
      this._state = HockeyGameState.GOAL_SCORED;
      debugLog('Entered GOAL_SCORED state - players locked during reset and countdown', 'HockeyGameManager');
      
      // Clear goal celebration state (celebration is over, countdown begins)
      this._goalCelebrationState.isActive = false;
      
      // Perform complete reset using PlayerSpawnManager
      PlayerSpawnManager.instance.performCompleteReset(
        this.getValidTeamsForReset(),
        this._playerIdToPlayer,
        puckEntity
      );
      
      // Start countdown immediately after reset
      this.startResumeCountdown();
      
    }, 6000); // 6s celebration before reset
  }

  // Add protection against rapid offside calls
  private _lastOffsideCallTime: number = 0;
  private _offsideCallCooldownMs: number = 1000; // 1 second cooldown between offside calls

  /**
   * Handle offside violation - play whistle, show UI, and set up faceoff
   * @param violation - The offside violation details
   */
  public offsideCalled(violation: OffsideViolation): void {
    if (this._state === HockeyGameState.GOAL_SCORED) return; // Don't interrupt goal celebrations
    
    // Prevent rapid/duplicate offside calls
    const currentTime = Date.now();
    if (currentTime - this._lastOffsideCallTime < this._offsideCallCooldownMs) {
      debugLog(`Offside call ignored - too soon after last call (${currentTime - this._lastOffsideCallTime}ms ago)`, 'HockeyGameManager');
      return;
    }
    this._lastOffsideCallTime = currentTime;
    
    debugLog(`Offside called: ${violation.violatingTeam} at ${violation.faceoffLocation}`, 'HockeyGameManager');
    
    // Play referee whistle immediately
    this.playRefereeWhistle();
    
    // Track offside state for new players
    this._offsideState = {
      isActive: true,
      violatingTeam: violation.violatingTeam,
      faceoffLocation: violation.faceoffLocation
    };
    
    // Capture the current timer value when offside is called (same as goals)
    const currentPeriodTime = PlayerStatsManager.instance.getCurrentPeriodTimeRemaining();
    this._pausedTimerValue = currentPeriodTime;
    debugLog(`🕐 Offside called - captured paused timer value: ${this._pausedTimerValue} seconds`, 'HockeyGameManager');
    
    // CRITICAL: Pause the backend period timer to prevent period from ending while offsides is active
    if (this._periodTimer) {
      clearTimeout(this._periodTimer);
      this._periodTimer = undefined;
      
      // Calculate remaining time in milliseconds for the backend timer
      this._pausedPeriodTimeMs = currentPeriodTime * 1000; // Convert seconds to milliseconds
      this._offsidePauseStartTime = Date.now();
      
      debugLog(`🕐 Backend period timer paused - remaining time: ${this._pausedPeriodTimeMs}ms (${currentPeriodTime}s)`, 'HockeyGameManager');
      
      // Additional debugging to understand timer state
      const periodStartTime = PlayerStatsManager.instance.getPeriodStartTime();
      const currentTime = Date.now();
      const actualElapsed = periodStartTime ? (currentTime - periodStartTime) / 1000 : 0;
      debugLog(`🕐 DEBUG: Period started at ${periodStartTime}, current time ${currentTime}, actual elapsed: ${actualElapsed.toFixed(1)}s`, 'HockeyGameManager');
    } else {
      debugLog(`🕐 WARNING: No period timer was running when offside called`, 'HockeyGameManager');
    }
    
    // Broadcast offsides call to all players
    if (this._world) {
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      // Broadcast the paused timer value to all existing players
      this.broadcastToAllPlayers({
        type: 'timer-pause',
        pausedTime: this._pausedTimerValue
      });
      
              // Send offside overlay message
        allPlayers.forEach((player) => {
          try {
            player.ui.sendData({
              type: 'offside-called',
              violatingTeam: violation.violatingTeam,
              faceoffLocation: violation.faceoffLocation
            });
          } catch (error) {
            debugError('Error sending offside message to player:', error, 'HockeyGameManager');
          }
        });
        
        // Broadcast chat message
        this._world.chatManager.sendBroadcastMessage(
          `OFFSIDE! ${violation.violatingTeam} team violation - Faceoff at ${this.getFaceoffLocationDescription(violation.faceoffLocation)}`,
          'FFA500' // Orange color for referee calls
        );
    }
    
    // Reset players and puck to faceoff positions after brief delay
    setTimeout(() => {
      this.performOffsideFaceoff(violation.faceoffLocation);
    }, 2000); // 2s delay to show offside message
  }

  /**
   * Perform faceoff positioning after offside call
   */
  private performOffsideFaceoff(faceoffLocation: FaceoffLocation): void {
    if (!this._world) return;
    
    debugLog(`Performing offside faceoff at: ${faceoffLocation}`, 'OffsideDetectionService');
    
    // Lock movement during reset
    this._state = HockeyGameState.GOAL_SCORED; // Reuse goal state for movement lock
    
    // Clear any previous faceoff rotations
    this._faceoffPlayerRotations.clear();
    
    // Get faceoff position from OffsideDetectionService
    const { OffsideDetectionService } = require('../services/OffsideDetectionService');
    const faceoffPosition = OffsideDetectionService.instance.getFaceoffPosition(faceoffLocation);
    
    // Position players in faceoff formation around the offside dot
    const validTeams = this.getValidTeamsForReset();
    PlayerSpawnManager.instance.teleportPlayersToFaceoffFormation(validTeams, this._playerIdToPlayer, faceoffPosition);
    
    // Store the faceoff rotations from PlayerSpawnManager for later reuse
    setTimeout(() => {
      this._faceoffPlayerRotations = PlayerSpawnManager.instance.getLastFaceoffRotations();
      debugLog(`Stored ${this._faceoffPlayerRotations.size} player rotations for faceoff reuse`, 'OffsideDetectionService');
    }, 400); // Wait for PlayerSpawnManager to finish setting rotations
    
    // Reset puck to the specific faceoff position instead of center ice
    const { ChatCommandManager } = require('./ChatCommandManager');
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    if (puckEntity && puckEntity.isSpawned) {
      // Detach puck from any player first
      PlayerSpawnManager.instance.detachPuckFromAllPlayers();
      
      // Check if this is a faceoff dot that needs adjustments for puck position
      const isBlueNeutralRight = Math.abs(faceoffPosition.x - 14.36) < 0.1 && 
                                 Math.abs(faceoffPosition.z - 5.25) < 0.1;
      const isRedNeutralRight = Math.abs(faceoffPosition.x - 14.36) < 0.1 && 
                                Math.abs(faceoffPosition.z - (-3.75)) < 0.1;
      const isRedNeutralLeft = Math.abs(faceoffPosition.x - (-13.36)) < 0.1 && 
                               Math.abs(faceoffPosition.z - (-3.75)) < 0.1;
      
      const adjustedPuckPosition = {
        x: faceoffPosition.x + (isBlueNeutralRight ? 1 : 
                                isRedNeutralRight ? 1 : 
                                isRedNeutralLeft ? -0.1 : 0),
        y: faceoffPosition.y,
        z: faceoffPosition.z + (isRedNeutralRight ? 0.2 : 
                                isRedNeutralLeft ? 0.2 : 0)
      };
      
      // Move puck to faceoff position
      puckEntity.setPosition(adjustedPuckPosition);
      puckEntity.setLinearVelocity({ x: 0, y: 0, z: 0 });
      puckEntity.setAngularVelocity({ x: 0, y: 0, z: 0 });
      const puckAdjustmentNote = isBlueNeutralRight ? ' (Blue Right +1 X)' : 
                                 isRedNeutralRight ? ' (Red Right +1 X +0.2 Z)' : 
                                 isRedNeutralLeft ? ' (Red Left -0.1 X +0.2 Z)' : '';
      debugLog(`Puck teleported to faceoff position: ${JSON.stringify(adjustedPuckPosition)}${puckAdjustmentNote}`, 'OffsideDetectionService');
    } else {
              CONSTANTS.debugError(`Could not reset puck for offside faceoff - puck not found or not spawned`, undefined, 'OffsideDetectionService');
    }
    

    
    // Start faceoff countdown
    this.startFaceoffCountdown(faceoffLocation);
  }

  /**
   * Start countdown before faceoff
   */
  private startFaceoffCountdown(faceoffLocation: FaceoffLocation): void {
    if (!this._world) return;
    
    // Import OffsideDetectionService for grace period management
    const { OffsideDetectionService } = require('../services/OffsideDetectionService');
    
    // Start the grace period for offside detection during countdown
    OffsideDetectionService.instance.startCountdownGracePeriod();
    
    let countdown = 3;
    
    // Update countdown state
    this._countdownState = {
      isActive: true,
      countdown: countdown,
      subtitle: `Faceoff - ${this.getFaceoffLocationDescription(faceoffLocation)}`
    };
    
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        // Play countdown sound only once at start
        if (countdown === 3) {
          this.playCountdownSound();
        }
        
        // Update countdown state
        this._countdownState.countdown = countdown;
        
        // Send countdown update to UI
        this.broadcastToAllPlayers({
          type: 'countdown-update',
          countdown: countdown,
          subtitle: `Faceoff - ${this.getFaceoffLocationDescription(faceoffLocation)}`
        });
        
        // Chat message removed to reduce clutter - UI overlay handles countdown display
        countdown--;
      } else {
        clearInterval(countdownInterval);
        
        // Clear states (faceoff is complete)
        this._countdownState.isActive = false;
        this._offsideState.isActive = false;
        
        // Clear paused timer value (play is resuming)
        this._pausedTimerValue = null;
        
        // Adjust period start time to account for offside pause
        // 2s offside overlay + 3s countdown = 5s total pause
        const pauseDurationMs = 5000;
        PlayerStatsManager.instance.adjustPeriodStartTime(pauseDurationMs);
        
        // CRITICAL FIX: Send exact resume time to prevent UI flash
        const exactResumeTime = this._pausedPeriodTimeMs ? this._pausedPeriodTimeMs / 1000 : 0;
        this.broadcastToAllPlayers({
          type: 'timer-resume',
          exactTime: exactResumeTime
        });
        
        // Send "GO!" to UI
        this.broadcastToAllPlayers({
          type: 'countdown-go'
        });
        
        // End the grace period for offside detection - play is resuming!
        OffsideDetectionService.instance.endCountdownGracePeriod();
        
        // Play final whistle to start play
        this.playRefereeWhistle();
        
        // Small delay to ensure UI processes timer resume before state change
        setTimeout(() => {
          // Resume normal play
          this._state = HockeyGameState.IN_PERIOD;
          
          // CRITICAL: Restart the backend period timer with adjusted remaining time
          if (this._pausedPeriodTimeMs !== null && this._offsidePauseStartTime !== null) {
            // Calculate actual pause duration (offside overlay + countdown)
            const actualPauseDuration = Date.now() - this._offsidePauseStartTime;
            
            // Remaining time should be the original paused time (we already adjusted UI timing separately)
            const adjustedRemainingTime = this._pausedPeriodTimeMs;
            
            debugLog(`🕐 TIMER RESTART: Paused time: ${this._pausedPeriodTimeMs}ms, Pause duration: ${actualPauseDuration}ms, Adjusted remaining: ${adjustedRemainingTime}ms`, 'HockeyGameManager');
            
            if (adjustedRemainingTime > 0) {
              // Restart the period timer with adjusted time
              this._periodTimer = setTimeout(() => this.endPeriod(), adjustedRemainingTime);
              debugLog(`🕐 ✅ Backend period timer restarted after offside - remaining time: ${adjustedRemainingTime}ms (${(adjustedRemainingTime/1000).toFixed(1)}s)`, 'HockeyGameManager');
            } else {
              // Time is up, end period immediately
              debugLog(`🕐 ❌ Period time expired during offside (${adjustedRemainingTime}ms remaining) - ending period now`, 'HockeyGameManager');
              setTimeout(() => this.endPeriod(), 100); // Small delay to let UI update
            }
            
            // Clear pause tracking
            this._pausedPeriodTimeMs = null;
            this._offsidePauseStartTime = null;
          } else {
            debugLog(`🕐 ❌ No paused period timer found - period timer may not have been running (pausedMs: ${this._pausedPeriodTimeMs}, pauseStart: ${this._offsidePauseStartTime})`, 'HockeyGameManager');
          }
        }, 50); // Small delay to prevent race condition
        
        // Players are already correctly oriented from initial faceoff setup - no need to reapply rotations
        // this.maintainPuckFacingOrientation(); // REMOVED: Was causing incorrect rotations when play resumed
        
        // Lock pointer for gameplay and reset cameras
        if (this._world) {
          const allPlayerIds = [
            ...Object.values(this._teams[HockeyTeam.RED]), 
            ...Object.values(this._teams[HockeyTeam.BLUE])
          ].filter(Boolean) as string[];
          
          const allPlayers = allPlayerIds
            .map(playerId => this._playerIdToPlayer.get(playerId))
            .filter(Boolean) as Player[];
          
          allPlayers.forEach((player) => {
            try {
              player.ui.lockPointer(true);
              
              // Reset camera back to normal attachment to player entity
              const playerEntities = this._world!.entityManager.getPlayerEntitiesByPlayer(player);
              if (playerEntities.length > 0) {
                const playerEntity = playerEntities[0];
                // Reset camera to normal third-person mode attached to player
                player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
                player.camera.setAttachedToEntity(playerEntity);
                player.camera.setOffset({ x: 0, y: 1, z: 0 });
                debugLog(`Reset camera for player ${player.id} back to normal third-person mode`, 'OffsideDetectionService');
              }
            } catch (error) {
              debugError('Error setting up player after faceoff:', error, 'HockeyGameManager');
            }
          });
        }
        
                 debugLog('Faceoff complete - play resumed', 'OffsideDetectionService');
        
        // CRITICAL FIX: Reset offside detection state after faceoff to prevent false positives
        // Use resetAfterFaceoff() to preserve cooldown timers and prevent immediate re-tracking
        const { ChatCommandManager } = require('./ChatCommandManager');
        const puckEntity = ChatCommandManager.instance.getPuck();
        
        // Pass current puck position to prevent false zone entry detection on next frame
        const currentPuckPosition = puckEntity?.isSpawned ? puckEntity.position : undefined;
        OffsideDetectionService.instance.resetAfterFaceoff(currentPuckPosition);
        
        // Hide countdown overlay after a brief delay
        setTimeout(() => {
          this.broadcastToAllPlayers({
            type: 'countdown-end'
          });
        }, 1000);
      }
    }, 1000); // 1 second intervals
  }

  /**
   * Get human-readable description of faceoff location
   */
  private getFaceoffLocationDescription(location: FaceoffLocation): string {
    switch (location) {
      case FaceoffLocation.RED_DEFENSIVE_LEFT:
        return 'Red Defensive Zone (Left)';
      case FaceoffLocation.RED_DEFENSIVE_RIGHT:
        return 'Red Defensive Zone (Right)';
      case FaceoffLocation.RED_NEUTRAL_LEFT:
        return 'Red Neutral Zone (Left)';
      case FaceoffLocation.RED_NEUTRAL_RIGHT:
        return 'Red Neutral Zone (Right)';
      case FaceoffLocation.BLUE_NEUTRAL_LEFT:
        return 'Blue Neutral Zone (Left)';
      case FaceoffLocation.BLUE_NEUTRAL_RIGHT:
        return 'Blue Neutral Zone (Right)';
      case FaceoffLocation.BLUE_DEFENSIVE_LEFT:
        return 'Blue Defensive Zone (Left)';
      case FaceoffLocation.BLUE_DEFENSIVE_RIGHT:
        return 'Blue Defensive Zone (Right)';
      default:
        return 'Center Ice';
    }
  }

  /**
   * Maintain player orientation toward puck when play resumes after faceoff
   * Uses stored rotation angles from initial faceoff spawn to avoid recalculation issues
   */
  private maintainPuckFacingOrientation(): void {
    if (!this._world) return;

    // Use stored rotation angles if available, otherwise fallback to recalculation
    if (this._faceoffPlayerRotations.size > 0) {
      debugLog(`Using stored faceoff rotations for ${this._faceoffPlayerRotations.size} players`, 'OffsideDetectionService');
      
      // Get all player IDs from teams
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];

      // Re-apply stored rotation for each player
      allPlayers.forEach((player) => {
        try {
          const storedYaw = this._faceoffPlayerRotations.get(player.id);
          if (storedYaw !== undefined) {
            const playerEntities = this._world!.entityManager.getPlayerEntitiesByPlayer(player);
            
            playerEntities.forEach((entity) => {
              try {
                // Convert stored yaw to quaternion
                const halfYaw = storedYaw / 2;
                const rotation = {
                  x: 0,
                  y: Math.sin(halfYaw),
                  z: 0,
                  w: Math.cos(halfYaw),
                };
                
                // Apply the stored rotation
                entity.setRotation(rotation);
                
                const playerPosition = entity.position;
                const yawDegrees = (storedYaw * 180 / Math.PI).toFixed(1);
                                 debugLog(`Reapplied stored rotation for player at (${playerPosition.x.toFixed(1)}, ${playerPosition.z.toFixed(1)}) - ${yawDegrees}° toward puck`, 'OffsideDetectionService');
              } catch (error) {
                debugError('Error reapplying stored rotation for player entity:', error, 'HockeyGameManager');
              }
            });
          } else {
                         debugLog(`No stored rotation found for player ${player.id}, skipping`, 'OffsideDetectionService');
          }
        } catch (error) {
          debugError('Error reapplying stored rotation for player:', error, 'HockeyGameManager');
        }
      });

             debugLog('Reapplied stored puck-facing orientations for all players when play resumed', 'OffsideDetectionService');
      
      // Clear stored rotations after use
      this._faceoffPlayerRotations.clear();
    } else {
      // Fallback to recalculation if no stored rotations available
             debugLog('No stored rotations available, falling back to recalculation', 'OffsideDetectionService');
      
      const { ChatCommandManager } = require('./ChatCommandManager');
      const puckEntity = ChatCommandManager.instance.getPuck();
      
      if (!puckEntity || !puckEntity.isSpawned) {
                 debugLog('Cannot maintain puck orientation - puck not found', 'OffsideDetectionService');
        return;
      }

      const puckPosition = puckEntity.position;
      
      // Get all player IDs from teams
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];

      // Re-apply puck-facing rotation for all players
      allPlayers.forEach((player) => {
        try {
          const playerEntities = this._world!.entityManager.getPlayerEntitiesByPlayer(player);
          
          playerEntities.forEach((entity) => {
            try {
              const playerPosition = entity.position;
              
              // Calculate direction vector from player to puck
              const dx = puckPosition.x - playerPosition.x;
              const dz = puckPosition.z - playerPosition.z;
              
              // Skip if too close
              if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;
              
              // Calculate yaw angle to face the puck
              const yaw = Math.atan2(dx, dz) + Math.PI;
              
              // Convert yaw to quaternion
              const halfYaw = yaw / 2;
              const rotation = {
                x: 0,
                y: Math.sin(halfYaw),
                z: 0,
                w: Math.cos(halfYaw),
              };
              
              // Apply the rotation
              entity.setRotation(rotation);
              
              const yawDegrees = (yaw * 180 / Math.PI).toFixed(1);
                             debugLog(`Recalculated puck orientation for player at (${playerPosition.x.toFixed(1)}, ${playerPosition.z.toFixed(1)}) - ${yawDegrees}° toward puck`, 'OffsideDetectionService');
            } catch (error) {
              debugError('Error maintaining rotation for player entity:', error, 'HockeyGameManager');
            }
          });
        } catch (error) {
          debugError('Error maintaining puck orientation for player:', error, 'HockeyGameManager');
        }
      });

             debugLog('Recalculated puck-facing orientation for all players when play resumed', 'OffsideDetectionService');
    }
  }

  /**
   * Play referee whistle sound effect for all players
   */
  private playRefereeWhistle(): void {
    if (!this._world) return;
    
    // Use centralized AudioManager instead of creating audio for each player
    AudioManager.instance.playRefereeWhistle();
    debugLog('[HockeyGameManager] Referee whistle played globally', 'HockeyGameManager');
  }

  /**
   * Play countdown sound effect for all players
   */
  private playCountdownSound(): void {
    if (!this._world) return;
    
    // Use centralized AudioManager instead of creating audio for each player
    AudioManager.instance.playCountdownSound();
    debugLog('[HockeyGameManager] Countdown sound played globally', 'HockeyGameManager');
  }

  /**
   * Send stats update to all players
   */
  public broadcastStatsUpdate(): void {
    if (!this._world) return;
    
    const statsData = PlayerStatsManager.instance.getStatsSummary();
    const playerStats = PlayerStatsManager.instance.getAllStats();
    const goalHistory = PlayerStatsManager.instance.getGoals().map(goal => ({
      ...goal,
      scorerName: PlayerStatsManager.instance.getPlayerStats(goal.scorerId)?.playerName || 'Unknown',
      assistName: goal.assistId ? PlayerStatsManager.instance.getPlayerStats(goal.assistId)?.playerName : undefined
    }));
    
    this.broadcastToAllPlayers({
      type: 'stats-update',
      statsData,
      playerStats,
      goalHistory
    });
    
    debugLog('Broadcasted stats update to all players', 'HockeyGameManager');
  }

  /**
   * Helper method to broadcast data to all players
   */
  private broadcastToAllPlayers(data: any): void {
    if (!this._world) return;
    // Revert: Only send to players in _playerIdToPlayer (not all connected players)
    const allPlayers = Array.from(this._playerIdToPlayer.values());
    allPlayers.forEach((player: any) => {
      try {
        player.ui.sendData(data);
      } catch (error) {
        debugError('Error sending data to player:', error, 'HockeyGameManager');
      }
    });
  }

  /**
   * Send live stats to a specific player
   */
  public sendLiveStatsToPlayer(player: Player): void {
    if (!this._world) return;
    
    const statsData = PlayerStatsManager.instance.getStatsSummary();
    const playerStats = PlayerStatsManager.instance.getAllStats();
    const goalHistory = PlayerStatsManager.instance.getGoals().map(goal => ({
      ...goal,
      scorerName: PlayerStatsManager.instance.getPlayerStats(goal.scorerId)?.playerName || 'Unknown',
      assistName: goal.assistId ? PlayerStatsManager.instance.getPlayerStats(goal.assistId)?.playerName : undefined
    }));
    
    // Generate box score for period-by-period breakdown
    const boxScore = PlayerStatsManager.instance.generateBoxScore();
    
    try {
      player.ui.sendData({
        type: 'live-stats-response',
        redScore: this._scores[HockeyTeam.RED],
        blueScore: this._scores[HockeyTeam.BLUE],
        period: this._period,
        topScorer: statsData.topScorer,
        mostGoals: statsData.mostGoals,
        mostSaves: statsData.mostSaves,
        playerStats,
        goalHistory,
        boxScore
      });
      
      debugLog(`Sent live stats with box score to player: ${player.id}`, 'HockeyGameManager');
    } catch (error) {
      debugError('Error sending live stats to player:', error, 'HockeyGameManager');
    }
  }

  /**
   * Helper method to convert teams to valid format for PlayerSpawnManager
   */
  private getValidTeamsForReset(): Record<HockeyTeam, Record<HockeyPosition, string>> {
    const validTeams: Record<HockeyTeam, Record<HockeyPosition, string>> = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
    };
    
    // Copy only defined player assignments
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const playerId = this._teams[team][position];
        if (playerId) {
          validTeams[team][position] = playerId;
        }
      }
    }
    
    return validTeams;
  }

  /**
   * Start countdown before resuming play after a goal
   */
  private startResumeCountdown(): void {
    if (!this._world) return;
    
    let countdown = 3;
    
    // Track countdown state for new players
    this._countdownState = {
      isActive: true,
      countdown: countdown,
      subtitle: 'Resuming Play'
    };
    
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        // Play countdown sound effect only once at the start (when countdown is 3)
        if (countdown === 3) {
          this.playCountdownSound();
        }
        
        // Update countdown state
        this._countdownState.countdown = countdown;
        
        // Send countdown update to UI
        this.broadcastToAllPlayers({
          type: 'countdown-update',
          countdown: countdown,
          subtitle: 'Resuming Play'
        });
        
        // Chat message removed to reduce clutter - UI overlay handles countdown display
        countdown--;
      } else {
        clearInterval(countdownInterval);
        
        // Clear countdown state (countdown is over)
        this._countdownState.isActive = false;
        
        // Clear paused timer value (play is resuming)
        this._pausedTimerValue = null;
        
        // Adjust period start time to account for goal celebration + countdown pause
        // 6s celebration + 3s countdown = 9s total pause
        const pauseDurationMs = 9000;
        PlayerStatsManager.instance.adjustPeriodStartTime(pauseDurationMs);
        
        // CRITICAL FIX: Send exact resume time to prevent UI flash
        const exactResumeTime = this._pausedPeriodTimeMs ? this._pausedPeriodTimeMs / 1000 : 0;
        this.broadcastToAllPlayers({
          type: 'timer-resume',
          exactTime: exactResumeTime
        });
        
        // Send "GO!" to UI
        this.broadcastToAllPlayers({
          type: 'countdown-go'
        });
        
        // Play referee whistle sound effect
        this.playRefereeWhistle();
        
        // Lock pointer for gameplay after goal reset countdown finishes
        if (this._world) {
          const allPlayerIds = [
            ...Object.values(this._teams[HockeyTeam.RED]), 
            ...Object.values(this._teams[HockeyTeam.BLUE])
          ].filter(Boolean) as string[];
          
          const allPlayers = allPlayerIds
            .map(playerId => this._playerIdToPlayer.get(playerId))
            .filter(Boolean) as Player[];
          
          allPlayers.forEach((player) => {
            try {
              player.ui.lockPointer(true); // Lock pointer for gameplay
              debugLog(`Locked pointer for player ${player.id} after goal reset countdown`, 'HockeyGameManager');
            } catch (error) {
              debugError('Error locking pointer for player after goal reset countdown:', error, 'HockeyGameManager');
            }
          });
        }
        
        // Small delay to ensure UI processes timer resume before state change
        setTimeout(() => {
          // Resume normal play
          this._state = HockeyGameState.IN_PERIOD;
          
          // CRITICAL: Restart the backend period timer with adjusted remaining time
          if (this._pausedPeriodTimeMs !== null && this._offsidePauseStartTime !== null) {
            // Calculate actual pause duration (goal celebration + countdown)
            const actualPauseDuration = Date.now() - this._offsidePauseStartTime;
            
            // Remaining time should be the original paused time (we already adjusted UI timing separately)
            const adjustedRemainingTime = this._pausedPeriodTimeMs;
            
            if (adjustedRemainingTime > 0) {
              // Restart the period timer with adjusted time
              this._periodTimer = setTimeout(() => this.endPeriod(), adjustedRemainingTime);
              debugLog(`Backend period timer restarted after goal celebration - remaining time: ${adjustedRemainingTime}ms (paused for ${actualPauseDuration}ms)`, 'HockeyGameManager');
            } else {
              // Time is up, end period immediately
              debugLog('Period time expired during goal celebration - ending period now', 'HockeyGameManager');
              setTimeout(() => this.endPeriod(), 100); // Small delay to let UI update
            }
            
            // Clear pause tracking
            this._pausedPeriodTimeMs = null;
            this._offsidePauseStartTime = null;
          } else {
            debugLog('No paused period timer found - period timer may not have been running', 'HockeyGameManager');
          }
          
          // "Play resumed!" message removed to reduce chat clutter
          debugLog('Play resumed after goal reset', 'HockeyGameManager');
          
          // Hide countdown overlay after a brief delay
          setTimeout(() => {
            this.broadcastToAllPlayers({
              type: 'countdown-end'
            });
          }, 1000);
        }, 50); // Small delay to prevent race condition
      }
    }, 1000);
  }

  /**
   * Start the complete match sequence with proper reset and countdown
   */
  public startMatchSequence(): void {
    if (this._state === HockeyGameState.MATCH_START) return;
    
    debugLog('Starting match sequence...', 'HockeyGameManager');
    
    // Don't lock pointer here - do it after countdown when game actually starts
    // This prevents pointer lock issues during the reset/countdown phase
    
    // Set state to MATCH_START to lock movement during reset
    this._state = HockeyGameState.MATCH_START;
    
    // Reset period and scores
    this._period = 1;
    this._scores = {
      [HockeyTeam.RED]: 0,
      [HockeyTeam.BLUE]: 0,
    };
    
    // Perform complete reset of all players and puck
    this.performMatchReset();
    
    // Start the game countdown immediately after reset
    this.startGameCountdown();
  }

  /**
   * Perform complete reset for match start (similar to goal reset but for match start)
   */
  private performMatchReset(): void {
    if (!this._world) return;
    
    debugLog('Performing match reset...', 'HockeyGameManager');
    
    // Reset all players to spawn positions and puck to center ice
    // We'll use the existing PlayerSpawnManager system
    const { PlayerSpawnManager } = require('./PlayerSpawnManager');
    const { ChatCommandManager } = require('./ChatCommandManager');
    
    // Get the actual puck entity for reset
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    // Perform the reset with valid teams and actual puck entity
    PlayerSpawnManager.instance.performCompleteReset(
      this.getValidTeamsForReset(),
      this._playerIdToPlayer,
      puckEntity
    );
    
    // Broadcast score reset to all players
    this.broadcastToAllPlayers({
      type: 'score-update',
      redScore: 0,
      blueScore: 0
    });
    
    // Update period display
    this.broadcastToAllPlayers({
      type: 'period-update',
      period: 1
    });
  }

  /**
   * Start countdown for game start
   */
  private startGameCountdown(): void {
    if (!this._world) return;
    
    debugLog('Starting game countdown...', 'HockeyGameManager');
    
    let countdown = 3;
    
    // Track countdown state for new players
    this._countdownState = {
      isActive: true,
      countdown: countdown,
      subtitle: 'Game Starting'
    };
    
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        // Play countdown sound effect only once at the start (when countdown is 3)
        if (countdown === 3) {
          this.playCountdownSound();
        }
        
        // Update countdown state
        this._countdownState.countdown = countdown;
        
        // Send countdown update to UI with game start subtitle
        this.broadcastToAllPlayers({
          type: 'countdown-update',
          countdown: countdown,
          subtitle: 'Game Starting'
        });
        
        // Chat message removed to reduce clutter - UI overlay handles countdown display
        countdown--;
      } else {
        clearInterval(countdownInterval);
        
        // Clear countdown state (countdown is over)
        this._countdownState.isActive = false;
        
        // Send "GO!" to UI
        this.broadcastToAllPlayers({
          type: 'countdown-go'
        });
        
        // Play referee whistle sound effect
        this.playRefereeWhistle();
        
        // Lock pointer for gameplay after countdown finishes
        if (this._world) {
          const allPlayerIds = [
            ...Object.values(this._teams[HockeyTeam.RED]), 
            ...Object.values(this._teams[HockeyTeam.BLUE])
          ].filter(Boolean) as string[];
          
          const allPlayers = allPlayerIds
            .map(playerId => this._playerIdToPlayer.get(playerId))
            .filter(Boolean) as Player[];
          
          allPlayers.forEach((player) => {
            try {
              player.ui.lockPointer(true); // Lock pointer for gameplay
              debugLog(`Locked pointer for player ${player.id} after game start countdown`, 'HockeyGameManager');
            } catch (error) {
              debugError('Error locking pointer for player after countdown:', error, 'HockeyGameManager');
            }
          });
        }
        
        // Transition to IN_PERIOD state (this unlocks movement)
        this._state = HockeyGameState.IN_PERIOD;
        
        // Start tracking period time for stats
        PlayerStatsManager.instance.startPeriodTime();
        
        // "Game started! GO!" message removed to reduce chat clutter
        debugLog('Game started - players unlocked', 'HockeyGameManager');
        
        // Start the period timer
        this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
        
        // Notify all players that the game has started
        this.broadcastToAllPlayers({
          type: 'game-start',
          redScore: 0,
          blueScore: 0,
          period: 1,
          periodStartTime: Date.now() // Send exact start time for synchronization
        });
        
        // Hide countdown overlay after a brief delay
        setTimeout(() => {
          this.broadcastToAllPlayers({
            type: 'countdown-end'
          });
        }, 1000);
      }
    }, 1000);
  }

  public endPeriod() {
    if (this._period < 3) {
      if (this._state === HockeyGameState.PERIOD_END) return;
      this._state = HockeyGameState.PERIOD_END;
      
      // Clear the period timer to prevent conflicts
      if (this._periodTimer) {
        clearTimeout(this._periodTimer);
        this._periodTimer = undefined;
      }
      
      // Clear offside pause tracking if period ends naturally
      this._pausedPeriodTimeMs = null;
      this._offsidePauseStartTime = null;
      
      const previousPeriod = this._period;
      this._period++;
      
      debugLog(`End of period ${previousPeriod}, transitioning to period ${this._period}`, 'HockeyGameManager');
      
      // Start period break sequence
      this.startPeriodBreak(previousPeriod);
    } else {
      this.endGame().catch(error => {
        debugError('Error ending game:', error, 'HockeyGameManager');
      });
    }
  }

  /**
   * Handle the break between periods
   */
  private startPeriodBreak(endedPeriod: number): void {
    if (!this._world) return;
    
    debugLog(`Starting period break after period ${endedPeriod}`, 'HockeyGameManager');
    
    // Play referee whistle sound effect when period ends
    this.playRefereeWhistle();
    
    // Show "End of [X] Period" overlay
    this.broadcastToAllPlayers({
      type: 'period-end',
      period: endedPeriod,
      redScore: this._scores[HockeyTeam.RED],
      blueScore: this._scores[HockeyTeam.BLUE]
    });
    
    // Announce period end in chat
    this._world.chatManager.sendBroadcastMessage(
      `End of ${this.getPeriodName(endedPeriod)}! Score: RED ${this._scores[HockeyTeam.RED]} - BLUE ${this._scores[HockeyTeam.BLUE]}`,
      'FFFF00'
    );
    
    // Wait 4 seconds, then start next period sequence
    setTimeout(() => {
      this.startNextPeriodSequence();
    }, 4000);
  }

  /**
   * Start the sequence for the next period
   */
  private startNextPeriodSequence(): void {
    if (!this._world) return;
    
    debugLog(`Starting ${this.getPeriodName(this._period)} sequence`, 'HockeyGameManager');
    
    // Hide period break overlay
    this.broadcastToAllPlayers({
      type: 'period-end-hide'
    });
    
    // Set state to PERIOD_END to lock movement during reset (same as goal resets)
    this._state = HockeyGameState.PERIOD_END;
    debugLog('Entered PERIOD_END state - players locked during period reset and countdown', 'HockeyGameManager');
    
    // Reset all players and puck to starting positions
    this.performPeriodReset();
    
    // Start period countdown
    this.startPeriodCountdown();
  }

  /**
   * Reset players and puck for new period start
   */
  private performPeriodReset(): void {
    if (!this._world) return;
    
    debugLog(`Performing period reset for ${this.getPeriodName(this._period)}`, 'HockeyGameManager');
    
    // Get the current puck entity from ChatCommandManager (same way goal resets work)
    const { ChatCommandManager } = require('./ChatCommandManager');
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    // Use existing reset system with actual puck entity (same as goal resets)
    const { PlayerSpawnManager } = require('./PlayerSpawnManager');
    
    PlayerSpawnManager.instance.performCompleteReset(
      this.getValidTeamsForReset(),
      this._playerIdToPlayer,
      puckEntity // Pass actual puck entity for proper reset
    );
    
    debugLog(`Period reset completed with puck entity: ${!!puckEntity}`, 'HockeyGameManager');
  }

  /**
   * Start countdown for new period
   */
  private startPeriodCountdown(): void {
    if (!this._world) return;
    
    debugLog(`Starting countdown for ${this.getPeriodName(this._period)}`, 'HockeyGameManager');
    
    let countdown = 3;
    
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        // Play countdown sound effect only once at the start (when countdown is 3)
        if (countdown === 3) {
          this.playCountdownSound();
        }
        
        // Send countdown update to UI with period start subtitle
        this.broadcastToAllPlayers({
          type: 'countdown-update',
          countdown: countdown,
          subtitle: `${this.getPeriodName(this._period)} Starting`
        });
        
        // Chat message removed to reduce clutter - UI overlay handles countdown display
        countdown--;
      } else {
        clearInterval(countdownInterval);
        
        // Send "GO!" to UI
        this.broadcastToAllPlayers({
          type: 'countdown-go'
        });
        
        // Play referee whistle sound effect
        this.playRefereeWhistle();
        
        // Lock pointer for gameplay after period countdown finishes
        if (this._world) {
          const allPlayerIds = [
            ...Object.values(this._teams[HockeyTeam.RED]), 
            ...Object.values(this._teams[HockeyTeam.BLUE])
          ].filter(Boolean) as string[];
          
          const allPlayers = allPlayerIds
            .map(playerId => this._playerIdToPlayer.get(playerId))
            .filter(Boolean) as Player[];
          
          allPlayers.forEach((player) => {
            try {
              player.ui.lockPointer(true); // Lock pointer for gameplay
              debugLog(`Locked pointer for player ${player.id} after period start countdown`, 'HockeyGameManager');
            } catch (error) {
              debugError('Error locking pointer for player after period countdown:', error, 'HockeyGameManager');
            }
          });
        }
        
        // Transition to IN_PERIOD state (this unlocks movement)
        this._state = HockeyGameState.IN_PERIOD;
        
        // Start tracking period time for stats
        PlayerStatsManager.instance.startPeriodTime();
        
        // Period start message removed to reduce chat clutter
        debugLog(`${this.getPeriodName(this._period)} started - players unlocked`, 'HockeyGameManager');
        
        // Clear any existing period timer before setting new one
        if (this._periodTimer) {
          clearTimeout(this._periodTimer);
        }
        
        // Start the period timer
        this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
        debugLog(`Period timer set for ${this._periodTimeMs}ms`, 'HockeyGameManager');
        
        // Update period display and restart UI timer
        this.broadcastToAllPlayers({
          type: 'period-update',
          period: this._period
        });
        
        // Tell UI to restart its timer with exact start time
        this.broadcastToAllPlayers({
          type: 'timer-restart',
          periodStartTime: Date.now() // Send exact start time for synchronization
        });
        
        // Hide countdown overlay after a brief delay
        setTimeout(() => {
          this.broadcastToAllPlayers({
            type: 'countdown-end'
          });
        }, 1000);
      }
    }, 1000);
  }

  /**
   * Helper method to get period names for display
   */
  private getPeriodName(period: number): string {
    switch (period) {
      case 1: return '1st Period';
      case 2: return '2nd Period';
      case 3: return '3rd Period';
      default: return `Period ${period}`;
    }
  }

  private resetGameState() {
    debugLog('Resetting game state for game mode selection', 'HockeyGameManager');
    
    // Reset the puck to center ice
    const { ChatCommandManager } = require('./ChatCommandManager');
    const { PlayerSpawnManager } = require('./PlayerSpawnManager');
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    if (puckEntity) {
      PlayerSpawnManager.instance.resetPuckToCenterIce(puckEntity);
      debugLog('Puck reset to center ice during game state reset', 'HockeyGameManager');
    } else {
      debugWarn('[HockeyGameManager] Could not reset puck - entity not found', 'HockeyGameManager');
    }
    
    // Clear all teams and player assignments
    this._teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>
    };
    this._tentativeSelections.clear();
    this._lockedInPlayers.clear();
    this._playerIdToPlayer.clear();
    
    // NOTE: Do NOT re-populate _playerIdToPlayer here during game mode selection reset
    // Players should only be added to this map when they register for specific game modes
    // This ensures shootout registration works correctly after transitioning from other games
    
    // Reset scores and period
    this._scores = {
      [HockeyTeam.RED]: 0,
      [HockeyTeam.BLUE]: 0
    };
    this._period = 1;
    
    // Clear any timers
    if (this._periodTimer) {
      clearTimeout(this._periodTimer);
      this._periodTimer = undefined;
    }
    
    // Clear countdown timer
    this.clearCountdownTimer();
    
    // Clear offside pause tracking
    this._pausedPeriodTimeMs = null;
    this._offsidePauseStartTime = null;
    
    // Reset player stats
    PlayerStatsManager.instance.resetStats();
    
    // Clear all player UI states - ensure clean slate for game mode selection
    // Send to all connected players (not just those in _playerIdToPlayer)
    if (this._world) {
      const { PlayerManager } = require('./PlayerManager');
      const allConnectedPlayers = PlayerManager.instance.getConnectedPlayers();
      
      allConnectedPlayers.forEach((player: any) => {
        try {
          player.ui.sendData({
            type: 'clear-all-ui'
          });
        } catch (error) {
          debugError('Error clearing UI for player:', error, 'HockeyGameManager');
        }
      });
      
      // Hide any existing scoreboards
      allConnectedPlayers.forEach((player: any) => {
        try {
          player.ui.sendData({
            type: 'hide-scoreboard'
          });
        } catch (error) {
          debugError('Error hiding scoreboard for player:', error, 'HockeyGameManager');
        }
      });
    }
    
    // In resetGameState and after game end, clear the lock and broadcast
    this._gameModeLock = null;
    this.broadcastGameModeAvailability();
    
    debugLog('Game state reset complete for game mode selection', 'HockeyGameManager');
  }

  public resetToLobby() {
    debugLog('Resetting to lobby with team selection', 'HockeyGameManager');
    
    // Reset all players to lobby state first
    if (this._world) {
      // Import PlayerManager dynamically to avoid circular dependency
      const { PlayerManager } = require('./PlayerManager');
      const playerManager = PlayerManager.instance;
      
      if (playerManager) {
        playerManager.resetAllPlayersToLobby();
      }
    }
    
    // Reset the puck to center ice (important for lobby state)
    const { ChatCommandManager } = require('./ChatCommandManager');
    const { PlayerSpawnManager } = require('./PlayerSpawnManager');
    const puckEntity = ChatCommandManager.instance.getPuck();
    
    if (puckEntity) {
      PlayerSpawnManager.instance.resetPuckToCenterIce(puckEntity);
      debugLog('Puck reset to center ice during lobby reset', 'HockeyGameManager');
    } else {
      debugWarn('[HockeyGameManager] Could not reset puck - entity not found', 'HockeyGameManager');
    }
    
    // Clear all teams and player assignments
    this._teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>
    };
    this._tentativeSelections.clear();
    this._lockedInPlayers.clear();
    
    // Immediately broadcast the cleared team positions to all players
    // This ensures the UI shows all positions as available
    if (this._world) {
      this._playerIdToPlayer.forEach((player) => {
        player.ui.sendData({
          type: 'team-positions-update',
          teams: this.getTeamsWithNamesForUI() // This will be empty after clearing
        });
      });
      debugLog('Sent cleared team positions to all players during lobby reset', 'HockeyGameManager');
    }
    
    // Reset scores and period
    this._scores = {
      [HockeyTeam.RED]: 0,
      [HockeyTeam.BLUE]: 0
    };
    this._period = 1;
    
    // Clear any timers
    if (this._periodTimer) {
      clearTimeout(this._periodTimer);
      this._periodTimer = undefined;
    }
    
    // Clear countdown timer for new lobby system
    this.clearCountdownTimer();
    
    // Clear offside pause tracking on lobby reset
    this._pausedPeriodTimeMs = null;
    this._offsidePauseStartTime = null;
    
    // Reset player stats
    PlayerStatsManager.instance.resetStats();
    
    // Set state to lobby
    this._state = HockeyGameState.LOBBY;
    
    // Unlock pointer for returning to lobby/team selection
    if (this._world) {
      this._playerIdToPlayer.forEach((player) => {
        try {
          player.ui.lockPointer(false); // Unlock pointer for lobby/team selection
          debugLog(`Unlocked pointer for player ${player.id} during lobby reset`, 'HockeyGameManager');
        } catch (error) {
          debugError('Error unlocking pointer for player during lobby reset:', error, 'HockeyGameManager');
        }
      });
    }
    
    // Set state to waiting for players
    this.startWaitingForPlayers();
    
    // Send timer stop event to UI
    this.broadcastToAllPlayers({
      type: 'timer-stop'
    });
    
    debugLog('Lobby reset complete - players should see team selection', 'HockeyGameManager');
  }

  public async endGame() {
    if (this._state === HockeyGameState.GAME_OVER) return;
    this._state = HockeyGameState.GAME_OVER;
    
    debugLog('Game ended - starting game over sequence', 'HockeyGameManager');
    
    // Clear any existing period timer
    if (this._periodTimer) {
      clearTimeout(this._periodTimer);
      this._periodTimer = undefined;
    }
    
    // Clear offside pause tracking on game end
    this._pausedPeriodTimeMs = null;
    this._offsidePauseStartTime = null;
    
    // Stop UI timer immediately when game ends
    this.broadcastToAllPlayers({
      type: 'timer-stop'
    });
    
    // Calculate game results
    if (this._world) {
      // Play referee whistle sound effect when game ends
      this.playRefereeWhistle();
      
      const redScore = this._scores[HockeyTeam.RED];
      const blueScore = this._scores[HockeyTeam.BLUE];
      const winner = redScore > blueScore ? 'RED' : blueScore > redScore ? 'BLUE' : 'TIED';
      const color = winner === 'RED' ? 'FF4444' : winner === 'BLUE' ? '44AAFF' : 'FFFFFF';
      
      // Record wins/losses and save persistent stats
      try {
        if (winner === 'TIED') {
          await PlayerStatsManager.instance.recordGameOutcome(HockeyTeam.RED, true);
        } else {
          const winningTeam = winner === 'RED' ? HockeyTeam.RED : HockeyTeam.BLUE;
          await PlayerStatsManager.instance.recordGameOutcome(winningTeam, false);
        }
        
        // Save all persistent stats
        await PlayerStatsManager.instance.saveAllPlayerStats();
        debugLog('Successfully recorded game outcome and saved persistent stats', 'HockeyGameManager');
      } catch (error) {
        debugError('Error recording game outcome or saving persistent stats:', error, 'HockeyGameManager');
      }
      
      // Generate box score for enhanced game over display
      const boxScore = PlayerStatsManager.instance.generateBoxScore();

      // Show game over UI overlay to all players currently in the game
      this.broadcastToAllPlayers({
        type: 'game-over',
        winner: winner,
        redScore: redScore,
        blueScore: blueScore,
        finalMessage: winner === 'TIED' ? "It's a tie!" : `${winner} team wins!`,
        boxScore: boxScore
      });
      
      // Announce in chat as backup
      this._world.chatManager.sendBroadcastMessage(
        `Game Over! ${winner === 'TIED' ? "It's a tie!" : `${winner} team wins!`} Final score: RED ${redScore} - BLUE ${blueScore}`,
        color
      );
      
      debugLog(`Game over - Winner: ${winner}, Final Score: RED ${redScore} - BLUE ${blueScore}`, 'HockeyGameManager');
    }
    
    // Return to game mode selection after 10 seconds (like shootout mode)
    setTimeout(() => {
      debugLog('Returning to game mode selection after game over', 'HockeyGameManager');
      
      // --- FIX: Capture players to despawn BEFORE resetting state ---
      const playersToReset = Array.from(this._playerIdToPlayer.values());

      // Hide game over overlay and stop timer for all players that were in the game
      this.broadcastToAllPlayers({
        type: 'game-over-hide'
      });
      
      this.broadcastToAllPlayers({
        type: 'timer-stop'
      });

      // Reset state and clear lock BEFORE showing selection overlay
      this.resetGameState();
      this.setGameModeLock(null);

      // Despawn all player entities
      if (this._world) {
        playersToReset.forEach(player => {
          try {
            this._world!.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
              entity.despawn();
              debugLog(`Despawned entity for player ${player.id} from regulation game`, 'HockeyGameManager');
            });
          } catch (error) {
            debugError(`Error despawning player ${player.id}:`, error, 'HockeyGameManager');
          }
        });
      }

      // Small delay to ensure despawns are processed before showing UI
      setTimeout(() => {
        // --- FIX: Set state to GAME_MODE_SELECTION before showing overlay ---
        this._state = HockeyGameState.GAME_MODE_SELECTION;

        // Now show game mode selection (UI will get correct availability)
        const { PlayerManager } = require('./PlayerManager');
        PlayerManager.instance.showGameModeSelectionToAllPlayers();
        debugLog('🎮 Returned to game mode selection from regulation game', 'HockeyGameManager');
      }, 500); // 500ms delay to ensure despawns are processed
    }, 10000);
  }

  // --- Player/Team Management ---
  public assignPlayerToTeam(player: Player, team: HockeyTeam, position: HockeyPosition): boolean {
    // Check if position is already locked in by another player
    if (this._teams[team][position] && this._lockedInPlayers.has(this._teams[team][position])) {
      return false; // Position is taken by a locked-in player
    }
    
    // Store this as a tentative selection (can be changed until lock-in)
    this._tentativeSelections.set(player.id, { team, position });
    this._playerIdToPlayer.set(player.id, player);
    
    debugLog(`assignPlayerToTeam (tentative): player.id=${player.id}, team=${team}, position=${position}`, 'HGM');
    debugLog(`Tentative selections: ${JSON.stringify(Array.from(this._tentativeSelections.entries()))}`, 'HGM');
    return true;
  }

  public removePlayer(player: Player) {
    debugLog(`Removing player ${player.id} from HockeyGameManager`, 'HockeyGameManager');
    
    // Remove from teams
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === player.id) {
          delete this._teams[team][pos];
          debugLog(`Removed player ${player.id} from ${team}-${pos}`, 'HockeyGameManager');
        }
      }
    }
    
    // Remove from various tracking systems
    this._tentativeSelections.delete(player.id);
    this._lockedInPlayers.delete(player.id);
    this._playerIdToPlayer.delete(player.id);
    
    // Remove player stats
    PlayerStatsManager.instance.removePlayer(player.id)
      .catch(error => {
        debugError('Error removing player stats:', error, 'HockeyGameManager');
      });
    
    // Check if this was the last player and clean up game state
    const remainingPlayers = this.getPlayersInGame();
    debugLog(`Players remaining after removal: ${remainingPlayers.length}`, 'HockeyGameManager');
    
    if (remainingPlayers.length === 0) {
      debugLog('No players remaining, resetting game state', 'HockeyGameManager');
      this.resetGameStateForEmptyServer();
    }
    
    // Always broadcast updated game state
    this.broadcastGameModeAvailability();
    this.broadcastStatsUpdate();
  }

  /**
   * Reset game state when no players remain on the server
   * This mimics the normal game end sequence to ensure proper state transition
   */
  private resetGameStateForEmptyServer(): void {
    debugLog('Resetting game state for empty server', 'HockeyGameManager');
    
    // Use the same reset sequence as normal game end
    this.resetGameState();
    this.setGameModeLock(null);
    
    // Reset ShootoutManager state
    if (this._world) {
      ShootoutManager.instance.resetShootoutState();
      debugLog('ShootoutManager state reset', 'HockeyGameManager');
    }
    
    // Set state to GAME_MODE_SELECTION (same as normal game end)
    this._state = HockeyGameState.GAME_MODE_SELECTION;
    
    // Clear any remaining celebration/offside states
    this._goalCelebrationState = { isActive: false };
    this._offsideState = { isActive: false };
    this._countdownState = { isActive: false };
    
    debugLog('Game state reset complete for empty server', 'HockeyGameManager');
  }

  /**
   * Clear all active timers
   */
  private clearAllTimers(): void {
    if (this._periodTimer) {
      clearInterval(this._periodTimer);
      this._periodTimer = undefined;
    }
    
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = undefined;
    }
    
    // Clear any other active timers
    this.clearCountdownTimer();
  }

  public getTeamAndPosition(player: Player | string): { team: HockeyTeam, position: HockeyPosition } | undefined {
    const playerId = typeof player === 'string' ? player : player.id;
    
    // First check locked-in teams
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === playerId) {
          return { team, position: pos };
        }
      }
    }
    
    // If not locked in, check tentative selections
    const tentativeSelection = this._tentativeSelections.get(playerId);
    if (tentativeSelection) {
      return tentativeSelection;
    }
    
    return undefined;
  }

  /**
   * Get teams for UI display - only shows locked-in positions as "taken"
   */
  public getTeamsForUI(): Teams {
    return {
      [HockeyTeam.RED]: { ...this._teams[HockeyTeam.RED] },
      [HockeyTeam.BLUE]: { ...this._teams[HockeyTeam.BLUE] }
    };
  }

  /**
   * Get teams with player names for UI display
   */
  public getTeamsWithNamesForUI(): Record<HockeyTeam, Record<HockeyPosition, { playerId: string, playerName: string } | undefined>> {
    const result: Record<HockeyTeam, Record<HockeyPosition, { playerId: string, playerName: string } | undefined>> = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, { playerId: string, playerName: string } | undefined>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, { playerId: string, playerName: string } | undefined>
    };

    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of Object.values(HockeyPosition)) {
        const playerId = this._teams[team][position];
        if (playerId) {
          const player = this._playerIdToPlayer.get(playerId);
          result[team][position] = {
            playerId: playerId,
            playerName: player ? (player.username || player.id) : playerId // Use player.username, fallback to player.id
          };
        } else {
          result[team][position] = undefined;
        }
      }
    }

    return result;
  }

  /**
   * Check if a player has a tentative selection for a specific team/position
   */
  public getTentativeSelection(playerId: string): { team: HockeyTeam, position: HockeyPosition } | undefined {
    return this._tentativeSelections.get(playerId);
  }

  public getPlayerById(id: string): Player | undefined {
    return this._playerIdToPlayer.get(id);
  }

  // --- Utility ---
  public isAnyTeamHasPlayers(): boolean {
    return (
      Object.values(this._teams[HockeyTeam.RED]).some(Boolean) ||
      Object.values(this._teams[HockeyTeam.BLUE]).some(Boolean)
    );
  }

  public isTeamsFull(): boolean {
    // For solo/offline testing, allow if at least one player is present
    const redCount = Object.keys(this._teams[HockeyTeam.RED]).length;
    const blueCount = Object.keys(this._teams[HockeyTeam.BLUE]).length;
    const total = redCount + blueCount;
    if (total === 1) return true;
    return (redCount === 6 && blueCount === 6);
  }

  // Get starting positions for each team and position
  public getStartingPosition(team: HockeyTeam, position: HockeyPosition): { x: number, y: number, z: number } {
    // Example layout: customize as needed for your map
    const baseY = 5;
    const redBaseX = -20;
    const blueBaseX = 20;
    const centerZ = 0;
    const offsets: Record<HockeyPosition, { x: number, z: number }> = {
      [HockeyPosition.GOALIE]:    { x: 0, z: 0 },
      [HockeyPosition.DEFENDER1]: { x: 3, z: -5 },
      [HockeyPosition.DEFENDER2]: { x: 3, z: 5 },
      [HockeyPosition.WINGER1]:   { x: 10, z: -7 },
      [HockeyPosition.WINGER2]:   { x: 10, z: 7 },
      [HockeyPosition.CENTER]:    { x: 15, z: 0 },
    };
    const baseX = team === HockeyTeam.RED ? redBaseX : blueBaseX;
    const sign = team === HockeyTeam.RED ? 1 : -1;
    const offset = offsets[position];
    return {
      x: baseX + sign * offset.x,
      y: baseY,
      z: centerZ + offset.z,
    };
  }

  // Removed old startMatchCountdown - replaced with startMatchSequence() which has proper countdown UI

  // Mark a player as locked in
  public lockInPlayer(player: Player) {
    const tentativeSelection = this._tentativeSelections.get(player.id);
    if (!tentativeSelection) {
      debugWarn(`[HGM] No tentative selection found for player ${player.id}`, 'HockeyGameManager');
      return false;
    }
    
    const { team, position } = tentativeSelection;
    
    // Check if position is still available
    if (this._teams[team][position] && this._lockedInPlayers.has(this._teams[team][position])) {
      debugWarn(`[HGM] Position ${team}-${position} already taken by locked-in player`, 'HockeyGameManager');
      return false;
    }
    
    // IMPORTANT: Remove player from their current position first (if they have one)
    // This is crucial for position switching to work correctly
    if (this._lockedInPlayers.has(player.id)) {
      for (const currentTeam of [HockeyTeam.RED, HockeyTeam.BLUE]) {
        for (const currentPos of Object.values(HockeyPosition)) {
          if (this._teams[currentTeam][currentPos] === player.id) {
            this._teams[currentTeam][currentPos] = undefined;
            debugLog(`Removed player ${player.id} from old position ${currentTeam}-${currentPos}`, 'HGM');
            break;
          }
        }
      }
    }
    
    // Now assign to the new team/position
    this._teams[team][position] = player.id;
    this._lockedInPlayers.add(player.id);
    this._playerIdToPlayer.set(player.id, player);
    
    // Initialize player stats now that they're locked in
    PlayerStatsManager.instance.initializePlayer(player, team, position)
      .catch(error => {
        debugError('Error initializing player stats:', error, 'HockeyGameManager');
      });
    
    debugLog(`Player ${player.id} locked in to ${team}-${position}`, 'HGM');
          debugLog(`Teams after lock-in: ${JSON.stringify(this._teams)}`, 'HGM');
    return true;
  }

  // NEW: Support position switching for locked-in players in lobby/waiting state
  public switchPlayerPosition(player: Player, newTeam: HockeyTeam, newPosition: HockeyPosition): boolean {
    // Only allow position switching during lobby/waiting states
    if (this._state !== HockeyGameState.LOBBY && 
        this._state !== HockeyGameState.WAITING_FOR_PLAYERS && 
        this._state !== HockeyGameState.COUNTDOWN_TO_START) {
      debugLog(`Position switching not allowed in state: ${this._state}`, 'HGM');
      return false;
    }

    // Check if position switching is enabled
    if (!CONSTANTS.LOBBY_CONFIG.ALLOW_POSITION_SWITCHING) {
      debugLog('Position switching is disabled', 'HGM');
      return false;
    }

    // Check if player is currently locked in
    if (!this._lockedInPlayers.has(player.id)) {
      debugLog(`Player ${player.id} is not locked in`, 'HGM');
      return false;
    }

    // Check if new position is available
    if (this._teams[newTeam][newPosition] && 
        this._lockedInPlayers.has(this._teams[newTeam][newPosition]) && 
        this._teams[newTeam][newPosition] !== player.id) {
      debugLog(`Position ${newTeam}-${newPosition} already taken by another locked-in player`, 'HGM');
      return false;
    }

    // Find current position and remove player from it
    let currentTeam: HockeyTeam | undefined;
    let currentPosition: HockeyPosition | undefined;
    
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === player.id) {
          currentTeam = team;
          currentPosition = pos;
          this._teams[team][pos] = undefined;
          break;
        }
      }
      if (currentTeam) break;
    }

    if (!currentTeam || !currentPosition) {
      debugLog(`Could not find current position for player ${player.id}`, 'HGM');
      return false;
    }

    // Assign to new position
    this._teams[newTeam][newPosition] = player.id;
    
    // Update tentative selection
    this._tentativeSelections.set(player.id, { team: newTeam, position: newPosition });
    
    // Update player stats with new team/position
    // TODO: Implement updatePlayerTeamPosition method in PlayerStatsManager
    // PlayerStatsManager.instance.updatePlayerTeamPosition(player, newTeam, newPosition)
    //   .catch((error: any) => {
    //     debugError('Error updating player stats:', error, 'HockeyGameManager');
    //   });

    debugLog(`Player ${player.id} switched from ${currentTeam}-${currentPosition} to ${newTeam}-${newPosition}`, 'HGM');
    return true;
  }

  // NEW: Allow player to unlock and reselect position
  public unlockPlayerForReselection(player: Player): boolean {
    // Only allow unlocking during lobby/waiting states
    if (this._state !== HockeyGameState.LOBBY && 
        this._state !== HockeyGameState.WAITING_FOR_PLAYERS && 
        this._state !== HockeyGameState.COUNTDOWN_TO_START) {
      return false;
    }

    // Check if position switching is enabled
    if (!CONSTANTS.LOBBY_CONFIG.ALLOW_POSITION_SWITCHING) {
      return false;
    }

    // Check if player is currently locked in
    if (!this._lockedInPlayers.has(player.id)) {
      return false;
    }

    // Find current position and remove player from it
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === player.id) {
          this._teams[team][pos] = undefined;
          break;
        }
      }
    }

    // Remove from locked-in players
    this._lockedInPlayers.delete(player.id);
    
    // Keep tentative selection but mark as unlocked for UI purposes
    // This allows them to see their previous selection when reopening team selection
    
    debugLog(`Player ${player.id} unlocked for reselection`, 'HGM');
    return true;
  }



  // NEW: Start countdown when minimum threshold is reached
  private _countdownTimer: NodeJS.Timeout | undefined;
  private _countdownTimeRemaining: number = 0;
  private _countdownUpdateCallback: (() => void) | null = null;
  private _playerManagerCallback: ((action: string, data: any) => void) | null = null;

  // NEW: Set callback for countdown updates
  public setCountdownUpdateCallback(callback: () => void): void {
    this._countdownUpdateCallback = callback;
  }

  // Set callback for PlayerManager actions (entity movement, etc.)
  public setPlayerManagerCallback(callback: (action: string, data: any) => void): void {
    this._playerManagerCallback = callback;
  }

  public startMinimumThresholdCountdown(): void {
    if (this._state !== HockeyGameState.WAITING_FOR_PLAYERS) {
      return;
    }

    this._state = HockeyGameState.COUNTDOWN_TO_START;
    this._countdownTimeRemaining = CONSTANTS.LOBBY_CONFIG.COUNTDOWN_DURATION;

    debugLog(`Started minimum threshold countdown: ${this._countdownTimeRemaining}s`, 'HGM');

    // Track if we've already reset to 5 seconds for full lobby (to avoid repeated resets)
    let hasResetForFullLobby = false;

    // Start countdown timer
    this._countdownTimer = setInterval(() => {
      this._countdownTimeRemaining--;

      // Check if lobby is completely full (12/12) and reset countdown to quick start time (once only)
      if (!hasResetForFullLobby && this.areAllPositionsLockedIn()) {
        debugLog(`Lobby is full (12/12)! Resetting countdown to ${CONSTANTS.LOBBY_CONFIG.FULL_LOBBY_COUNTDOWN} seconds for quick start.`, 'HGM');
        this._countdownTimeRemaining = CONSTANTS.LOBBY_CONFIG.FULL_LOBBY_COUNTDOWN;
        hasResetForFullLobby = true; // Prevent repeated resets
        
        // Broadcast message to all players about the quick start
        if (this._world) {
          this._world.chatManager.sendBroadcastMessage(
            `Lobby full! Game starting in ${CONSTANTS.LOBBY_CONFIG.FULL_LOBBY_COUNTDOWN} seconds...`,
            '00FF00'
          );
        }
      }

      // Trigger UI update in PlayerManager using callback
      if (this._countdownUpdateCallback) {
        debugLog(`Calling countdown update callback, time remaining: ${this._countdownTimeRemaining}s`, 'HGM');
        this._countdownUpdateCallback();
      } else {
        debugLog('No countdown update callback set!', 'HGM');
      }

      // AUTO-BALANCE TEAMS 5 seconds before game starts
      if (this._countdownTimeRemaining === 5) {
        debugLog('5 seconds remaining - triggering final auto-balance!', 'HGM');
        this.autoBalanceTeams();
        
        // After auto-balancing, check if teams are properly balanced
        if (!this.checkMinimumPlayersThreshold()) {
          debugLog('Teams not properly balanced after auto-balancing, restarting countdown with 10 seconds', 'HGM');
          this.clearCountdownTimer();
          this._countdownTimeRemaining = 10; // Give 10 seconds for another attempt
          
          // Restart countdown timer
          this._countdownTimer = setInterval(() => {
            this._countdownTimeRemaining--;
            
            if (this._countdownUpdateCallback) {
              this._countdownUpdateCallback();
            }
            
            // Final check - if still not balanced, cancel completely
            if (!this.checkMinimumPlayersThreshold()) {
              this.cancelCountdown();
              return;
            }
            
            // Start game when countdown reaches 0
            if (this._countdownTimeRemaining <= 0) {
              this.clearCountdownTimer();
              this.startMatchSequence();
            }
          }, 1000);
          
          return; // Exit the current countdown loop
        }
      }

      // Check if we still meet minimum requirements (only if not in auto-balance retry)
      if (!this.checkMinimumPlayersThreshold()) {
        this.cancelCountdown();
        return;
      }

      // Start game when countdown reaches 0 (using normal game start sequence)
      if (this._countdownTimeRemaining <= 0) {
        this.clearCountdownTimer();
        this.startMatchSequence(); // Restore normal game start with overlays
      }
    }, 1000);
  }

  // NEW: Cancel countdown if requirements are no longer met
  public cancelCountdown(): void {
    if (this._state !== HockeyGameState.COUNTDOWN_TO_START) {
      return;
    }

    this.clearCountdownTimer();
    this._state = HockeyGameState.WAITING_FOR_PLAYERS;

    debugLog('Minimum threshold countdown cancelled', 'HGM');
  }

  // NEW: Get countdown time remaining for UI display
  public getCountdownTimeRemaining(): number {
    return this._countdownTimeRemaining;
  }

  // NEW: Clear countdown timer
  private clearCountdownTimer(): void {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = undefined;
    }
  }

  // Check if all positions are filled and all players are locked in
  public areAllPositionsLockedIn(): boolean {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        const playerId = this._teams[team][pos];
        if (!playerId || !this._lockedInPlayers.has(playerId)) {
          return false;
        }
      }
    }
    return true;
  }

  // Add getters for teams and lockedIn
  public get teams(): Teams {
    return this._teams;
  }

  public get lockedIn(): Set<string> {
    return this._lockedInPlayers;
  }

  public get state(): HockeyGameState {
    return this._state;
  }

  public get scores(): Record<HockeyTeam, number> {
    return this._scores;
  }

  public get period(): number {
    return this._period;
  }

  public get gameMode(): GameMode {
    return this._gameMode;
  }

  public isShootoutMode(): boolean {
    return this._gameMode === GameMode.SHOOTOUT;
  }

  /**
   * Get current period start time for synchronizing new players
   */
  public getCurrentPeriodStartTime(): number | null {
    return PlayerStatsManager.instance.getPeriodStartTime();
  }

  /**
   * Get the paused timer value (when goal was scored)
   */
  public getPausedTimerValue(): number | null {
    return this._pausedTimerValue;
  }

  // --- Movement Lock System Removed ---
  // The movement lock system was interfering with puck controls
  // Players will be able to move during goal reset countdowns
  // This is acceptable for Phase 1 implementation

  /**
   * Broadcast save notification to all players
   */
  public saveRecorded(goalieId: string, shooterId: string): void {
    if (!this._world) return;
    
    // Record the save in PlayerStatsManager first
    const shooterInfo = this.getTeamAndPosition(shooterId);
    if (shooterInfo?.team) {
      PlayerStatsManager.instance.recordSave(goalieId, shooterId, shooterInfo.team)
        .catch(error => {
          debugError('Error recording save in PlayerStatsManager:', error, 'HockeyGameManager');
        });
    }
    
    const goalieStats = PlayerStatsManager.instance.getPlayerStats(goalieId);
    const shooterStats = PlayerStatsManager.instance.getPlayerStats(shooterId);
    
    if (goalieStats && shooterStats) {
      const goalieInfo = this.getTeamAndPosition(goalieId);
      const shooterInfo = this.getTeamAndPosition(shooterId);
      
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'save-recorded',
            goalieId: goalieId,
            goalieName: goalieStats.playerName,
            goalieTeam: goalieInfo?.team || 'Unknown',
            shooterId: shooterId,
            shooterName: shooterStats.playerName,
            shooterTeam: shooterInfo?.team || 'Unknown',
            totalSaves: goalieStats.saves
          });
        } catch (error) {
          debugError('Error sending save notification to player:', error, 'HockeyGameManager');
        }
      });
      
      // Enhanced save announcement
      const saveMessage = `SAVE! ${goalieStats.playerName} (${goalieInfo?.team}) stopped ${shooterStats.playerName} (${shooterInfo?.team})! [${goalieStats.saves} saves]`;
      
      this._world.chatManager.sendBroadcastMessage(
        saveMessage,
        goalieInfo?.team === HockeyTeam.RED ? 'FF4444' : '44AAFF'
      );
      
      // Broadcast updated stats after save
      this.broadcastStatsUpdate();
      
      debugLog(`Save notification broadcasted: ${goalieStats.playerName} -> ${goalieStats.saves} saves`, 'HockeyGameManager');
    }
  }

  /**
   * Enhanced minimum threshold check that considers total player redistribution
   * If there are enough total players but poor distribution, it suggests auto-balancing
   */
  public checkMinimumPlayersThreshold(): boolean {
    const lockedInPlayers = Array.from(this._lockedInPlayers);
    const redTeam = this._teams[HockeyTeam.RED];
    const blueTeam = this._teams[HockeyTeam.BLUE];

    // Count locked-in players per team
    const redCount = Object.values(redTeam).filter(playerId => playerId && lockedInPlayers.includes(playerId)).length;
    const blueCount = Object.values(blueTeam).filter(playerId => playerId && lockedInPlayers.includes(playerId)).length;
    const totalPlayers = redCount + blueCount;

    // Check if we have enough total players for minimum threshold (6)
    if (totalPlayers < CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL) {
      return false;
    }

    // Check goalies specifically
    const redGoalie = redTeam[HockeyPosition.GOALIE];
    const blueGoalie = blueTeam[HockeyPosition.GOALIE];
    const redGoalieLocked = redGoalie && lockedInPlayers.includes(redGoalie);
    const blueGoalieLocked = blueGoalie && lockedInPlayers.includes(blueGoalie);

    // ENHANCED LOGIC: If we have enough total players but uneven distribution, auto-balance first
    if (totalPlayers >= CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL) {
      // Case 1: Both teams have goalies - standard check
      if (redGoalieLocked && blueGoalieLocked) {
        const minPerTeam = CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM;
        return redCount >= minPerTeam && blueCount >= minPerTeam;
      }
      
      // Case 2: Only one team has a goalie but we have enough total players for redistribution
      if ((redGoalieLocked || blueGoalieLocked) && totalPlayers >= CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL) {
        debugLog(`Enhanced threshold: Total players=${totalPlayers}, one goalie available, can redistribute`, 'HockeyGameManager');
        return true; // Auto-balancing will fix the distribution
      }
      
      // Case 3: No goalies but enough players - someone can be reassigned to goalie
      if (!redGoalieLocked && !blueGoalieLocked && totalPlayers >= CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL) {
        debugLog(`Enhanced threshold: Total players=${totalPlayers}, no goalies but enough for redistribution`, 'HockeyGameManager');
        return true; // Auto-balancing will assign goalies
      }
    }

    return false;
  }

  /**
   * Enhanced auto-balance that handles goalie assignment and team distribution
   */
  public autoBalanceTeams(): void {
    if (!CONSTANTS.LOBBY_CONFIG.AUTO_BALANCE_ENABLED) {
      debugLog('Auto-balancing disabled in config', 'HockeyGameManager');
      return;
    }

    const lockedInPlayers = Array.from(this._lockedInPlayers);
    const redTeam = this._teams[HockeyTeam.RED];
    const blueTeam = this._teams[HockeyTeam.BLUE];

    // Count locked-in players per team
    const redCount = Object.values(redTeam).filter(playerId => playerId && lockedInPlayers.includes(playerId)).length;
    const blueCount = Object.values(blueTeam).filter(playerId => playerId && lockedInPlayers.includes(playerId)).length;
    const totalPlayers = redCount + blueCount;

    debugLog(`Enhanced auto-balance: RED=${redCount}, BLUE=${blueCount}, Total=${totalPlayers}`, 'HockeyGameManager');

    // Step 1: Analyze what's missing and create a plan
    const balancePlan = this.createBalancePlan(lockedInPlayers);
    
    // Step 2: Execute the plan in one pass (no multiple moves)
    this.executeBalancePlan(balancePlan, lockedInPlayers);

    // Broadcast updated positions to all players
    this.broadcastTeamPositionsUpdate();
    
    debugLog('Auto-balancing completed', 'HockeyGameManager');
  }

  /**
   * Create a comprehensive balance plan that ensures both teams have required positions
   */
  private createBalancePlan(lockedInPlayers: string[]): Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}> {
    const moves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}> = [];
    
    // Check what each team has
    const redGoalie = this._teams[HockeyTeam.RED][HockeyPosition.GOALIE] && 
                     lockedInPlayers.includes(this._teams[HockeyTeam.RED][HockeyPosition.GOALIE]);
    const blueGoalie = this._teams[HockeyTeam.BLUE][HockeyPosition.GOALIE] && 
                      lockedInPlayers.includes(this._teams[HockeyTeam.BLUE][HockeyPosition.GOALIE]);
    const redCenter = this._teams[HockeyTeam.RED][HockeyPosition.CENTER] && 
                     lockedInPlayers.includes(this._teams[HockeyTeam.RED][HockeyPosition.CENTER]);
    const blueCenter = this._teams[HockeyTeam.BLUE][HockeyPosition.CENTER] && 
                      lockedInPlayers.includes(this._teams[HockeyTeam.BLUE][HockeyPosition.CENTER]);

    debugLog(`Current mandatory positions - RED: GOALIE=${redGoalie}, CENTER=${redCenter} | BLUE: GOALIE=${blueGoalie}, CENTER=${blueCenter}`, 'HockeyGameManager');

    // Priority order for finding players to move (non-mandatory positions first)
    const movePriority = [
      HockeyPosition.WINGER1, HockeyPosition.WINGER2,
      HockeyPosition.DEFENDER1, HockeyPosition.DEFENDER2
      // Never move CENTER or GOALIE unless absolutely necessary
    ];

    // Phase 1: Ensure both teams have GOALIE (highest priority)
    if (!redGoalie && !blueGoalie) {
      // Neither team has goalie - assign one to each team from available players
      const availablePlayers = this.findAvailablePlayersForMove(movePriority, lockedInPlayers);
      if (availablePlayers.length >= 2) {
        moves.push({
          from: availablePlayers[0].team,
          fromPos: availablePlayers[0].position,
          to: HockeyTeam.RED,
          toPos: HockeyPosition.GOALIE,
          playerId: availablePlayers[0].playerId,
          reason: 'Assigned as RED GOALIE for required position'
        });
        moves.push({
          from: availablePlayers[1].team,
          fromPos: availablePlayers[1].position,
          to: HockeyTeam.BLUE,
          toPos: HockeyPosition.GOALIE,
          playerId: availablePlayers[1].playerId,
          reason: 'Assigned as BLUE GOALIE for required position'
        });
      }
    } else if (!redGoalie) {
      // RED needs goalie
      const player = this.findBestPlayerToMove([HockeyTeam.BLUE], movePriority, lockedInPlayers);
      if (player) {
        moves.push({
          from: player.team,
          fromPos: player.position,
          to: HockeyTeam.RED,
          toPos: HockeyPosition.GOALIE,
          playerId: player.playerId,
          reason: 'Moved to RED GOALIE for required position'
        });
      }
    } else if (!blueGoalie) {
      // BLUE needs goalie
      const player = this.findBestPlayerToMove([HockeyTeam.RED], movePriority, lockedInPlayers);
      if (player) {
        moves.push({
          from: player.team,
          fromPos: player.position,
          to: HockeyTeam.BLUE,
          toPos: HockeyPosition.GOALIE,
          playerId: player.playerId,
          reason: 'Moved to BLUE GOALIE for required position'
        });
      }
    }

    // Phase 2: Ensure both teams have CENTER (after accounting for goalie moves)
    const redCenterAfterMoves = redCenter || moves.some(m => m.to === HockeyTeam.RED && m.toPos === HockeyPosition.CENTER);
    const blueCenterAfterMoves = blueCenter || moves.some(m => m.to === HockeyTeam.BLUE && m.toPos === HockeyPosition.CENTER);

    if (!redCenterAfterMoves && !blueCenterAfterMoves) {
      // Neither team has center - assign one to each from remaining available players
      const remainingPlayers = this.findAvailablePlayersForMove(movePriority, lockedInPlayers, moves);
      if (remainingPlayers.length >= 2) {
        moves.push({
          from: remainingPlayers[0].team,
          fromPos: remainingPlayers[0].position,
          to: HockeyTeam.RED,
          toPos: HockeyPosition.CENTER,
          playerId: remainingPlayers[0].playerId,
          reason: 'Assigned as RED CENTER for required position'
        });
        moves.push({
          from: remainingPlayers[1].team,
          fromPos: remainingPlayers[1].position,
          to: HockeyTeam.BLUE,
          toPos: HockeyPosition.CENTER,
          playerId: remainingPlayers[1].playerId,
          reason: 'Assigned as BLUE CENTER for required position'
        });
      }
    } else if (!redCenterAfterMoves) {
      // RED needs center - find any available player
      const player = this.findBestPlayerToMove([HockeyTeam.RED, HockeyTeam.BLUE], movePriority, lockedInPlayers, moves);
      if (player) {
        moves.push({
          from: player.team,
          fromPos: player.position,
          to: HockeyTeam.RED,
          toPos: HockeyPosition.CENTER,
          playerId: player.playerId,
          reason: 'Moved to RED CENTER for required position'
        });
      }
    } else if (!blueCenterAfterMoves) {
      // BLUE needs center - find any available player
      const player = this.findBestPlayerToMove([HockeyTeam.RED, HockeyTeam.BLUE], movePriority, lockedInPlayers, moves);
      if (player) {
        moves.push({
          from: player.team,
          fromPos: player.position,
          to: HockeyTeam.BLUE,
          toPos: HockeyPosition.CENTER,
          playerId: player.playerId,
          reason: 'Moved to BLUE CENTER for required position'
        });
      }
    }

    // Phase 3: Ensure balanced team sizes - proper balancing for all scenarios
    const redCountAfterMoves = this.countTeamPlayersAfterMoves(HockeyTeam.RED, moves, lockedInPlayers);
    const blueCountAfterMoves = this.countTeamPlayersAfterMoves(HockeyTeam.BLUE, moves, lockedInPlayers);
    const totalPlayersAfterMoves = redCountAfterMoves + blueCountAfterMoves;
    
    debugLog(`Team counts after mandatory moves: RED=${redCountAfterMoves}, BLUE=${blueCountAfterMoves}, Total=${totalPlayersAfterMoves}`, 'HockeyGameManager');
    
    // Calculate ideal team sizes for maximum balance
    const idealRedCount = Math.floor(totalPlayersAfterMoves / 2);
    const idealBlueCount = totalPlayersAfterMoves - idealRedCount;
    
    debugLog(`Ideal team balance: RED=${idealRedCount}, BLUE=${idealBlueCount}`, 'HockeyGameManager');
    
    // Step 1: Ensure minimum players per team first
    if (redCountAfterMoves < CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM && blueCountAfterMoves > CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM) {
      // RED needs more players to meet minimum
      const needed = CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM - redCountAfterMoves;
      for (let i = 0; i < needed; i++) {
        const player = this.findBestPlayerToMove([HockeyTeam.BLUE], movePriority, lockedInPlayers, moves);
        if (player) {
          const availablePos = this.findAvailablePosition(HockeyTeam.RED, player.position, moves);
          if (availablePos) {
            moves.push({
              from: player.team,
              fromPos: player.position,
              to: HockeyTeam.RED,
              toPos: availablePos,
              playerId: player.playerId,
              reason: 'Moved to RED team for minimum team size requirement'
            });
          }
        }
      }
    } else if (blueCountAfterMoves < CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM && redCountAfterMoves > CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM) {
      // BLUE needs more players to meet minimum
      const needed = CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_PER_TEAM - blueCountAfterMoves;
      for (let i = 0; i < needed; i++) {
        const player = this.findBestPlayerToMove([HockeyTeam.RED], movePriority, lockedInPlayers, moves);
        if (player) {
          const availablePos = this.findAvailablePosition(HockeyTeam.BLUE, player.position, moves);
          if (availablePos) {
            moves.push({
              from: player.team,
              fromPos: player.position,
              to: HockeyTeam.BLUE,
              toPos: availablePos,
              playerId: player.playerId,
              reason: 'Moved to BLUE team for minimum team size requirement'
            });
          }
        }
      }
    }

    // Step 2: Balance teams optimally (after ensuring minimums)
    // Recalculate counts after minimum adjustments
    const redCountAfterMinimum = this.countTeamPlayersAfterMoves(HockeyTeam.RED, moves, lockedInPlayers);
    const blueCountAfterMinimum = this.countTeamPlayersAfterMoves(HockeyTeam.BLUE, moves, lockedInPlayers);
    
    debugLog(`Team counts after minimum adjustments: RED=${redCountAfterMinimum}, BLUE=${blueCountAfterMinimum}`, 'HockeyGameManager');
    
    // Balance teams to get as close to ideal as possible
    if (redCountAfterMinimum > idealRedCount + 1) {
      // RED has too many players - move some to BLUE
      const excess = redCountAfterMinimum - idealRedCount;
      for (let i = 0; i < excess; i++) {
        const player = this.findBestPlayerToMove([HockeyTeam.RED], movePriority, lockedInPlayers, moves);
        if (player) {
          const availablePos = this.findAvailablePosition(HockeyTeam.BLUE, player.position, moves);
          if (availablePos) {
            moves.push({
              from: player.team,
              fromPos: player.position,
              to: HockeyTeam.BLUE,
              toPos: availablePos,
              playerId: player.playerId,
              reason: `Moved to BLUE team for optimal balance (${idealRedCount}v${idealBlueCount})`
            });
          }
        }
      }
    } else if (blueCountAfterMinimum > idealBlueCount + 1) {
      // BLUE has too many players - move some to RED
      const excess = blueCountAfterMinimum - idealBlueCount;
      for (let i = 0; i < excess; i++) {
        const player = this.findBestPlayerToMove([HockeyTeam.BLUE], movePriority, lockedInPlayers, moves);
        if (player) {
          const availablePos = this.findAvailablePosition(HockeyTeam.RED, player.position, moves);
          if (availablePos) {
            moves.push({
              from: player.team,
              fromPos: player.position,
              to: HockeyTeam.RED,
              toPos: availablePos,
              playerId: player.playerId,
              reason: `Moved to RED team for optimal balance (${idealRedCount}v${idealBlueCount})`
            });
          }
        }
      }
    }

    debugLog(`Created balance plan with ${moves.length} moves:`, 'HockeyGameManager');
    moves.forEach(move => {
      debugLog(`  ${move.playerId}: ${move.from} ${move.fromPos} -> ${move.to} ${move.toPos} (${move.reason})`, 'HockeyGameManager');
    });

    return moves;
  }

  /**
   * Execute the balance plan
   */
  private executeBalancePlan(moves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}>, lockedInPlayers: string[]): void {
    for (const move of moves) {
      // Remove player from old position
      this._teams[move.from][move.fromPos] = undefined;
      
      // Add player to new position
      this._teams[move.to][move.toPos] = move.playerId;
      
      // Notify player
      this.notifyPlayerOfMove(move.playerId, move.to, move.toPos, move.reason);
      
      debugLog(`Executed move: ${move.playerId} from ${move.from} ${move.fromPos} to ${move.to} ${move.toPos}`, 'HockeyGameManager');
    }
  }

  /**
   * Find available players that can be moved (excluding players already in mandatory positions)
   */
  private findAvailablePlayersForMove(
    positionPriority: HockeyPosition[], 
    lockedInPlayers: string[], 
    plannedMoves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}> = []
  ): Array<{team: HockeyTeam, position: HockeyPosition, playerId: string}> {
    const available: Array<{team: HockeyTeam, position: HockeyPosition, playerId: string}> = [];
    
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const position of positionPriority) {
        const playerId = this._teams[team][position];
        if (playerId && lockedInPlayers.includes(playerId)) {
          // Check if this player is already planned to be moved
          const isAlreadyPlanned = plannedMoves.some(m => m.playerId === playerId);
          if (!isAlreadyPlanned) {
            available.push({ team, position, playerId });
          }
        }
      }
    }
    
    return available;
  }

  /**
   * Find the best player to move from specific teams
   */
  private findBestPlayerToMove(
    availableTeams: HockeyTeam[], 
    positionPriority: HockeyPosition[], 
    lockedInPlayers: string[], 
    plannedMoves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}> = []
  ): {team: HockeyTeam, position: HockeyPosition, playerId: string} | null {
    for (const position of positionPriority) {
      for (const team of availableTeams) {
        const playerId = this._teams[team][position];
        if (playerId && lockedInPlayers.includes(playerId)) {
          // Check if this player is already planned to be moved
          const isAlreadyPlanned = plannedMoves.some(m => m.playerId === playerId);
          if (!isAlreadyPlanned) {
            return { team, position, playerId };
          }
        }
      }
    }
    return null;
  }

  /**
   * Notify player of position change and update their entity
   */
  private notifyPlayerOfMove(playerId: string, newTeam: HockeyTeam, newPosition: HockeyPosition, reason: string): void {
    const player = this._playerIdToPlayer.get(playerId);
    if (player) {
      try {
        // Update player entity position and cosmetics FIRST
        this.movePlayerToNewPosition(player, newTeam, newPosition);
        
        // Send UI notification AFTER entity recreation with delay to ensure everything is set up
        setTimeout(() => {
          try {
            player.ui.sendData({
              type: 'team-auto-balanced',
              newTeam: newTeam,
              newPosition: newPosition,
              reason: reason
            });
          } catch (error) {
            CONSTANTS.debugError('Failed to send auto-balance notification', error, 'HockeyGameManager');
          }
        }, 300); // Small delay to ensure entity recreation and UI setup is complete
        
      } catch (error) {
        CONSTANTS.debugError('Failed to notify player of auto-balance', error, 'HockeyGameManager');
      }
    }
  }

  /**
   * Move player entity to new team position and update cosmetics
   */
  private movePlayerToNewPosition(player: any, newTeam: HockeyTeam, newPosition: HockeyPosition): void {
    try {
      // Get PlayerManager instance through callback
      if (this._playerManagerCallback) {
        this._playerManagerCallback('movePlayerToNewPosition', {
          player: player,
          newTeam: newTeam,
          newPosition: newPosition
        });
      } else {
        CONSTANTS.debugError('No PlayerManager callback available for entity movement', null, 'HockeyGameManager');
      }
    } catch (error) {
      CONSTANTS.debugError('Failed to move player to new position', error, 'HockeyGameManager');
    }
  }



  /**
   * Broadcast team positions update to all connected players
   */
  private broadcastTeamPositionsUpdate(): void {
    const teamsWithNames = this.getTeamsWithNamesForUI();
    this.broadcastToAllPlayers({
      type: 'team-positions-update',
      teams: teamsWithNames
    });
    debugLog('Broadcasted team positions update after auto-balance', 'HockeyGameManager');
  }

  /**
   * Count how many players a team will have after all planned moves are executed
   */
  private countTeamPlayersAfterMoves(
    team: HockeyTeam, 
    moves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}>,
    lockedInPlayers: string[]
  ): number {
    // Start with current team count
    let count = Object.values(this._teams[team]).filter(playerId => 
      playerId && lockedInPlayers.includes(playerId)
    ).length;
    
    // Add players moving TO this team
    count += moves.filter(m => m.to === team).length;
    
    // Subtract players moving FROM this team
    count -= moves.filter(m => m.from === team).length;
    
    return count;
  }

  /**
   * Find an available position on a team, preferring similar position types
   */
  private findAvailablePosition(
    team: HockeyTeam, 
    preferredPosition: HockeyPosition,
    moves: Array<{from: HockeyTeam, fromPos: HockeyPosition, to: HockeyTeam, toPos: HockeyPosition, playerId: string, reason: string}> = []
  ): HockeyPosition | null {
    const teamPositions = this._teams[team];
    
    // Create a set of positions that will be occupied after moves
    const occupiedAfterMoves = new Set<HockeyPosition>();
    
    // Add currently occupied positions
    Object.entries(teamPositions).forEach(([pos, playerId]) => {
      if (playerId && !moves.some(m => m.from === team && m.fromPos === pos as HockeyPosition)) {
        occupiedAfterMoves.add(pos as HockeyPosition);
      }
    });
    
    // Add positions that will be occupied by moves
    moves.filter(m => m.to === team).forEach(m => {
      occupiedAfterMoves.add(m.toPos);
    });
    
    // Try the preferred position first
    if (!occupiedAfterMoves.has(preferredPosition)) {
      return preferredPosition;
    }
    
    // Try positions of the same type (forward->forward, defender->defender)
    const positionGroups = {
      forwards: [HockeyPosition.WINGER1, HockeyPosition.WINGER2, HockeyPosition.CENTER],
      defenders: [HockeyPosition.DEFENDER1, HockeyPosition.DEFENDER2],
      goalie: [HockeyPosition.GOALIE]
    };
    
    let preferredGroup: HockeyPosition[] = [];
    if (positionGroups.forwards.includes(preferredPosition)) {
      preferredGroup = positionGroups.forwards;
    } else if (positionGroups.defenders.includes(preferredPosition)) {
      preferredGroup = positionGroups.defenders;
    } else if (positionGroups.goalie.includes(preferredPosition)) {
      preferredGroup = positionGroups.goalie;
    }
    
    // Try positions in the preferred group
    for (const pos of preferredGroup) {
      if (!occupiedAfterMoves.has(pos)) {
        return pos;
      }
    }
    
    // Try any available position
    const allPositions = Object.values(HockeyPosition);
    for (const pos of allPositions) {
      if (!occupiedAfterMoves.has(pos)) {
        return pos;
      }
    }
    
    return null; // No available positions
  }

  // Add method to get current lock
  public get gameModeLock(): GameMode | null {
    return this._gameModeLock;
  }

  // Add method to set lock and broadcast
  public setGameModeLock(mode: GameMode | null) {
    this._gameModeLock = mode;
    this.broadcastGameModeAvailability();
  }

  // Add method to broadcast availability
  public broadcastGameModeAvailability() {
    const available = {
      REGULATION: this._gameModeLock === null || this._gameModeLock === GameMode.REGULATION,
      SHOOTOUT: this._gameModeLock === null || this._gameModeLock === GameMode.SHOOTOUT,
    };
    
    // Send to all connected players (not just those in _playerIdToPlayer)
    // This ensures players in game mode selection also get updates
    if (this._world) {
      const { PlayerManager } = require('./PlayerManager');
      const allConnectedPlayers = PlayerManager.instance.getConnectedPlayers();
      
      allConnectedPlayers.forEach((player: any) => {
        try {
          player.ui.sendData({
            type: 'game-mode-availability',
            available,
            locked: this._gameModeLock,
          });
        } catch (error) {
          debugError('Error sending game mode availability to player:', error, 'HockeyGameManager');
        }
      });
      
      debugLog(`📡 Broadcasted game mode availability to ${allConnectedPlayers.length} connected players`, 'HockeyGameManager');
    }
  }

  /**
   * Get all players currently in the game (either in regulation teams or shootout)
   */
  public getPlayersInGame(): Player[] {
    const players: Player[] = [];
    
    // Add all players from _playerIdToPlayer map (this includes regulation and shootout players)
    this._playerIdToPlayer.forEach((player) => {
      players.push(player);
    });
    
    return players;
  }
} 