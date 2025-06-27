import { DefaultPlayerEntity, Entity, Player, World, Audio } from 'hytopia';
import { 
  HockeyGameState, 
  HockeyTeam, 
  HockeyPosition 
} from '../utils/types';
import type { 
  TeamAssignment, 
  Teams 
} from '../utils/types';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { AudioManager } from './AudioManager';
import { PlayerStatsManager } from './PlayerStatsManager';
import * as CONSTANTS from '../utils/constants';

export class HockeyGameManager {
  private static _instance: HockeyGameManager;
  private _world: World | undefined;
  private _state: HockeyGameState = HockeyGameState.LOBBY;
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
  private _countdownState: {
    isActive: boolean;
    countdown?: number;
    subtitle?: string;
  } = { isActive: false };
  
  // Track the exact time when timer was paused (for goal celebrations)
  private _pausedTimerValue: number | null = null;
  
  // Removed movement lock system - was interfering with puck controls

  private constructor() {}

  public static get instance(): HockeyGameManager {
    if (!HockeyGameManager._instance) {
      HockeyGameManager._instance = new HockeyGameManager();
    }
    return HockeyGameManager._instance;
  }

  public setupGame(world: World) {
    this._world = world;
    this._state = HockeyGameState.LOBBY;
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
    
    // TODO: Announce lobby open, show team selection UI
  }

  public startTeamSelection() {
    if (this._state === HockeyGameState.TEAM_SELECTION) return;
    this._state = HockeyGameState.TEAM_SELECTION;
    
    // Unlock pointer for team selection UI interaction
    if (this._world) {
      this._playerIdToPlayer.forEach((player) => {
        try {
          player.ui.lockPointer(false); // Unlock pointer for team selection
          CONSTANTS.debugLog(`Unlocked pointer for player ${player.id} during team selection`, 'HockeyGameManager');
        } catch (error) {
          console.error('Error unlocking pointer for player during team selection:', error);
        }
      });
    }
    
    // Broadcast team selection start
    this.broadcastToAllPlayers({
      type: 'team-selection-start'
    });
    
    // TODO: Show team/position selection UI
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
          console.error('Error sending period start to player:', error);
        }
      });
    }
    
    // Start period timer, reset puck/players
    this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
  }

  public goalScored(team: HockeyTeam, puckEntity?: any, isOwnGoal: boolean = false, scorerId?: string, primaryAssistId?: string) {
    if (this._state === HockeyGameState.GOAL_SCORED) return;
    this._scores[team]++;
    
    // Record goal in stats if we have scorer info
    if (scorerId) {
      CONSTANTS.debugLog(`Recording goal for scorer: ${scorerId}, team: ${team}, period: ${this._period}`, 'HockeyGameManager');
      if (primaryAssistId) {
        CONSTANTS.debugLog(`Recording primary assist for: ${primaryAssistId}`, 'HockeyGameManager');
      }
      
      // TRACK SHOT ON GOAL: Record that this was a shot on goal (resulted in goal)
      PlayerStatsManager.instance.recordShot(scorerId, team, true, false).catch(error => {
        console.error('Error recording shot stat:', error);
      }); // onGoal=true, saved=false
      CONSTANTS.debugLog(`📊 Recorded shot on goal for ${scorerId} (resulted in goal)`, 'HockeyGameManager');
      
      // Record goal (now async)
      PlayerStatsManager.instance.recordGoal(scorerId, primaryAssistId, team, this._period, isOwnGoal)
        .then(goalInfo => {
          // Debug: Log current stats after goal
          const scorerStats = PlayerStatsManager.instance.getPlayerStats(scorerId);
          CONSTANTS.debugLog(`Scorer stats after goal: ${JSON.stringify(scorerStats)}`, 'HockeyGameManager');
          
          if (primaryAssistId) {
            const assistStats = PlayerStatsManager.instance.getPlayerStats(primaryAssistId);
            CONSTANTS.debugLog(`Primary assist stats after goal: ${JSON.stringify(assistStats)}`, 'HockeyGameManager');
          }
        })
        .catch(error => {
          console.error('Error recording goal stats:', error);
        });
    } else {
      CONSTANTS.debugLog('No scorer ID provided for goal - stats not recorded', 'HockeyGameManager');
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
      CONSTANTS.debugLog(`Goal scored - captured paused timer value: ${this._pausedTimerValue} seconds`, 'HockeyGameManager');
      
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
          console.error('Error sending score update to player:', error);
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
      CONSTANTS.debugLog('Starting goal reset sequence...', 'HockeyGameManager');
      
      // Lock movement IMMEDIATELY when reset starts
      this._state = HockeyGameState.GOAL_SCORED;
      CONSTANTS.debugLog('Entered GOAL_SCORED state - players locked during reset and countdown', 'HockeyGameManager');
      
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

  /**
   * Play referee whistle sound effect for all players
   */
  private playRefereeWhistle(): void {
    if (!this._world) return;
    
    // Use centralized AudioManager instead of creating audio for each player
    AudioManager.instance.playRefereeWhistle();
    CONSTANTS.debugLog('[HockeyGameManager] Referee whistle played globally', 'HockeyGameManager');
  }

  /**
   * Play countdown sound effect for all players
   */
  private playCountdownSound(): void {
    if (!this._world) return;
    
    // Use centralized AudioManager instead of creating audio for each player
    AudioManager.instance.playCountdownSound();
    CONSTANTS.debugLog('[HockeyGameManager] Countdown sound played globally', 'HockeyGameManager');
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
    
    CONSTANTS.debugLog('Broadcasted stats update to all players', 'HockeyGameManager');
  }

  /**
   * Helper method to broadcast data to all players
   */
  private broadcastToAllPlayers(data: any): void {
    if (!this._world) return;
    
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
        player.ui.sendData(data);
      } catch (error) {
        console.error('Error sending data to player:', error);
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
      
      CONSTANTS.debugLog(`Sent live stats with box score to player: ${player.id}`, 'HockeyGameManager');
    } catch (error) {
      console.error('Error sending live stats to player:', error);
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
        
        // Keep chat message as backup
        this._world!.chatManager.sendBroadcastMessage(
          `Resuming play in ${countdown}...`,
          'FFFF00'
        );
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
        
        // Send updated period start time to UI for synchronization
        this.broadcastToAllPlayers({
          type: 'period-time-adjusted',
          pauseDurationMs: pauseDurationMs
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
              CONSTANTS.debugLog(`Locked pointer for player ${player.id} after goal reset countdown`, 'HockeyGameManager');
            } catch (error) {
              console.error('Error locking pointer for player after goal reset countdown:', error);
            }
          });
        }
        
        this._state = HockeyGameState.IN_PERIOD;
        this._world!.chatManager.sendBroadcastMessage(
          'Play resumed!',
          '00FF00'
        );
        CONSTANTS.debugLog('Play resumed after goal reset', 'HockeyGameManager');
        
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
   * Start the complete match sequence with proper reset and countdown
   */
  public startMatchSequence(): void {
    if (this._state === HockeyGameState.MATCH_START) return;
    
    CONSTANTS.debugLog('Starting match sequence...', 'HockeyGameManager');
    
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
    
    CONSTANTS.debugLog('Performing match reset...', 'HockeyGameManager');
    
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
    
    CONSTANTS.debugLog('Starting game countdown...', 'HockeyGameManager');
    
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
        
        // Keep chat message as backup
        this._world!.chatManager.sendBroadcastMessage(
          `Game starting in ${countdown}...`,
          'FFFF00'
        );
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
              CONSTANTS.debugLog(`Locked pointer for player ${player.id} after game start countdown`, 'HockeyGameManager');
            } catch (error) {
              console.error('Error locking pointer for player after countdown:', error);
            }
          });
        }
        
        // Transition to IN_PERIOD state (this unlocks movement)
        this._state = HockeyGameState.IN_PERIOD;
        
        // Start tracking period time for stats
        PlayerStatsManager.instance.startPeriodTime();
        
        this._world!.chatManager.sendBroadcastMessage(
          'Game started! GO!',
          '00FF00'
        );
        CONSTANTS.debugLog('Game started - players unlocked', 'HockeyGameManager');
        
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
      
      const previousPeriod = this._period;
      this._period++;
      
      CONSTANTS.debugLog(`End of period ${previousPeriod}, transitioning to period ${this._period}`, 'HockeyGameManager');
      
      // Start period break sequence
      this.startPeriodBreak(previousPeriod);
    } else {
      this.endGame().catch(error => {
        console.error('Error ending game:', error);
      });
    }
  }

  /**
   * Handle the break between periods
   */
  private startPeriodBreak(endedPeriod: number): void {
    if (!this._world) return;
    
    CONSTANTS.debugLog(`Starting period break after period ${endedPeriod}`, 'HockeyGameManager');
    
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
    
    CONSTANTS.debugLog(`Starting ${this.getPeriodName(this._period)} sequence`, 'HockeyGameManager');
    
    // Hide period break overlay
    this.broadcastToAllPlayers({
      type: 'period-end-hide'
    });
    
    // Set state to PERIOD_END to lock movement during reset (same as goal resets)
    this._state = HockeyGameState.PERIOD_END;
    CONSTANTS.debugLog('Entered PERIOD_END state - players locked during period reset and countdown', 'HockeyGameManager');
    
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
    
    CONSTANTS.debugLog(`Performing period reset for ${this.getPeriodName(this._period)}`, 'HockeyGameManager');
    
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
    
    CONSTANTS.debugLog(`Period reset completed with puck entity: ${!!puckEntity}`, 'HockeyGameManager');
  }

  /**
   * Start countdown for new period
   */
  private startPeriodCountdown(): void {
    if (!this._world) return;
    
    CONSTANTS.debugLog(`Starting countdown for ${this.getPeriodName(this._period)}`, 'HockeyGameManager');
    
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
        
        // Keep chat message as backup
        this._world!.chatManager.sendBroadcastMessage(
          `${this.getPeriodName(this._period)} starting in ${countdown}...`,
          'FFFF00'
        );
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
              CONSTANTS.debugLog(`Locked pointer for player ${player.id} after period start countdown`, 'HockeyGameManager');
            } catch (error) {
              console.error('Error locking pointer for player after period countdown:', error);
            }
          });
        }
        
        // Transition to IN_PERIOD state (this unlocks movement)
        this._state = HockeyGameState.IN_PERIOD;
        
        // Start tracking period time for stats
        PlayerStatsManager.instance.startPeriodTime();
        
        this._world!.chatManager.sendBroadcastMessage(
          `${this.getPeriodName(this._period)} started! GO!`,
          '00FF00'
        );
        CONSTANTS.debugLog(`${this.getPeriodName(this._period)} started - players unlocked`, 'HockeyGameManager');
        
        // Clear any existing period timer before setting new one
        if (this._periodTimer) {
          clearTimeout(this._periodTimer);
        }
        
        // Start the period timer
        this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
        CONSTANTS.debugLog(`Period timer set for ${this._periodTimeMs}ms`, 'HockeyGameManager');
        
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

  public resetToLobby() {
    CONSTANTS.debugLog('Resetting to lobby with team selection', 'HockeyGameManager');
    
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
      CONSTANTS.debugLog('Puck reset to center ice during lobby reset', 'HockeyGameManager');
    } else {
      console.warn('[HockeyGameManager] Could not reset puck - entity not found');
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
      CONSTANTS.debugLog('Sent cleared team positions to all players during lobby reset', 'HockeyGameManager');
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
    
    // Reset player stats
    PlayerStatsManager.instance.resetStats();
    
    // Set state to lobby
    this._state = HockeyGameState.LOBBY;
    
    // Unlock pointer for returning to lobby/team selection
    if (this._world) {
      this._playerIdToPlayer.forEach((player) => {
        try {
          player.ui.lockPointer(false); // Unlock pointer for lobby/team selection
          CONSTANTS.debugLog(`Unlocked pointer for player ${player.id} during lobby reset`, 'HockeyGameManager');
        } catch (error) {
          console.error('Error unlocking pointer for player during lobby reset:', error);
        }
      });
    }
    
    // Set state to waiting for players
    this.startWaitingForPlayers();
    
    // Send timer stop event to UI
    this.broadcastToAllPlayers({
      type: 'timer-stop'
    });
    
    CONSTANTS.debugLog('Lobby reset complete - players should see team selection', 'HockeyGameManager');
  }

  public async endGame() {
    if (this._state === HockeyGameState.GAME_OVER) return;
    this._state = HockeyGameState.GAME_OVER;
    
    CONSTANTS.debugLog('Game ended - starting game over sequence', 'HockeyGameManager');
    
    // Clear any existing period timer
    if (this._periodTimer) {
      clearTimeout(this._periodTimer);
      this._periodTimer = undefined;
    }
    
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
        CONSTANTS.debugLog('Successfully recorded game outcome and saved persistent stats', 'HockeyGameManager');
      } catch (error) {
        console.error('Error recording game outcome or saving persistent stats:', error);
      }
      
      // Generate box score for enhanced game over display
      const boxScore = PlayerStatsManager.instance.generateBoxScore();

      // Show game over UI overlay
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
      
      CONSTANTS.debugLog(`Game over - Winner: ${winner}, Final Score: RED ${redScore} - BLUE ${blueScore}`, 'HockeyGameManager');
    }
    
    // Return to lobby after 10 seconds (reduced from 15s for better flow)
    setTimeout(() => {
      CONSTANTS.debugLog('Returning to lobby after game over', 'HockeyGameManager');
      
      // Hide game over overlay
      this.broadcastToAllPlayers({
        type: 'game-over-hide'
      });
      
      // Ensure timer is stopped before reset
      this.broadcastToAllPlayers({
        type: 'timer-stop'
      });
      
      // Reset to lobby with team selection
      this.resetToLobby();
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
    
    CONSTANTS.debugLog(`assignPlayerToTeam (tentative): player.id=${player.id}, team=${team}, position=${position}`, 'HGM');
    CONSTANTS.debugLog(`Tentative selections: ${JSON.stringify(Array.from(this._tentativeSelections.entries()))}`, 'HGM');
    return true;
  }

  public removePlayer(player: Player) {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === player.id) {
          delete this._teams[team][pos];
        }
      }
    }
    this._tentativeSelections.delete(player.id);
    this._lockedInPlayers.delete(player.id);
    this._playerIdToPlayer.delete(player.id);
    
    // Remove player stats
    PlayerStatsManager.instance.removePlayer(player.id)
      .catch(error => {
        console.error('Error removing player stats:', error);
      });
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
      console.warn(`[HGM] No tentative selection found for player ${player.id}`);
      return false;
    }
    
    const { team, position } = tentativeSelection;
    
    // Check if position is still available
    if (this._teams[team][position] && this._lockedInPlayers.has(this._teams[team][position])) {
      console.warn(`[HGM] Position ${team}-${position} already taken by locked-in player`);
      return false;
    }
    
    // Actually assign to team now that they're locking in
    this._teams[team][position] = player.id;
    this._lockedInPlayers.add(player.id);
    this._playerIdToPlayer.set(player.id, player);
    
    // Initialize player stats now that they're locked in
    PlayerStatsManager.instance.initializePlayer(player, team, position)
      .catch(error => {
        console.error('Error initializing player stats:', error);
      });
    
    CONSTANTS.debugLog(`Player ${player.id} locked in to ${team}-${position}`, 'HGM');
          CONSTANTS.debugLog(`Teams after lock-in: ${JSON.stringify(this._teams)}`, 'HGM');
    return true;
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
          console.error('Error recording save in PlayerStatsManager:', error);
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
          console.error('Error sending save notification to player:', error);
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
      
      CONSTANTS.debugLog(`Save notification broadcasted: ${goalieStats.playerName} -> ${goalieStats.saves} saves`, 'HockeyGameManager');
    }
  }
} 