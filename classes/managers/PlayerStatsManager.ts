import { Player } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';
import { PersistentPlayerStatsManager } from './PersistentPlayerStatsManager';

export interface PlayerStats {
  playerId: string;
  playerName: string;
  team: HockeyTeam;
  position: HockeyPosition;
  goals: number;
  assists: number;
  saves: number;
  shotsOnGoal: number;
  shotsBlocked: number;
  timeOnIce: number; // in seconds
  plusMinus: number; // +/- rating
  penaltyMinutes: number;
  hits: number;
  faceoffWins: number;
  faceoffLosses: number;
}

export interface GoalInfo {
  scorerId: string;
  assistId?: string;
  team: HockeyTeam;
  period: number;
  timeInPeriod: number;
  isOwnGoal: boolean;
}

export interface PeriodScore {
  red: number;
  blue: number;
}

export interface BoxScore {
  periodScores: PeriodScore[]; // Index 0 = Period 1, Index 1 = Period 2, etc.
  totalScore: PeriodScore;
  topPerformers: {
    topScorer: { name: string; goals: number; assists: number; points: number } | null;
    mostGoals: { name: string; goals: number } | null;
    mostSaves: { name: string; saves: number } | null;
  };
  playerStats: PlayerStats[];
}

export interface ShotInfo {
  shooterId: string;
  team: HockeyTeam;
  onGoal: boolean;
  saved: boolean;
  goalieId?: string;
  isOwnGoal: boolean;
}

export class PlayerStatsManager {
  private static _instance: PlayerStatsManager;
  private _playerStats: Map<string, PlayerStats> = new Map();
  private _playerObjects: Map<string, Player> = new Map(); // Track Player objects for persistence
  private _goals: GoalInfo[] = [];
  private _gameStartTime: number = 0;
  private _periodStartTime: number = 0;
  
  // Track when players join the game for time on ice calculation
  private _playerJoinTimes: Map<string, number> = new Map();
  private _totalGameDurationMs: number = 6 * 60 * 1000; // 6 minutes total game time

  private constructor() {}

  public static get instance(): PlayerStatsManager {
    if (!PlayerStatsManager._instance) {
      PlayerStatsManager._instance = new PlayerStatsManager();
    }
    return PlayerStatsManager._instance;
  }

  /**
   * Initialize a player's stats
   */
  public async initializePlayer(player: Player, team: HockeyTeam, position: HockeyPosition): Promise<void> {
    const stats: PlayerStats = {
      playerId: player.id,
      playerName: player.username,
      team,
      position,
      goals: 0,
      assists: 0,
      saves: 0,
      shotsOnGoal: 0,
      shotsBlocked: 0,
      timeOnIce: 0,
      plusMinus: 0,
      penaltyMinutes: 0,
      hits: 0,
      faceoffWins: 0,
      faceoffLosses: 0
    };

    this._playerStats.set(player.id, stats);
    this._playerObjects.set(player.id, player); // Store Player object for persistence
    
    // Track when this player joined the game for time on ice calculation
    this._playerJoinTimes.set(player.id, Date.now());
    
    // Load persistent stats for this player
    try {
      await PersistentPlayerStatsManager.instance.loadPlayerStats(player);
      debugLog(`Initialized stats for ${player.username} (${team} ${position}) and loaded persistent data`, 'PlayerStatsManager');
    } catch (error) {
      debugError(`Error loading persistent stats for ${player.username}:`, error, 'PlayerStatsManager');
      debugLog(`Initialized stats for ${player.username} (${team} ${position}) but failed to load persistent data`, 'PlayerStatsManager');
    }
  }

  /**
   * Remove a player's stats
   */
  public async removePlayer(playerId: string): Promise<void> {
    // Update time on ice before removing
    this.updatePlayerTimeOnIce(playerId);
    
    // Save persistent stats before removing
    const player = this._playerObjects.get(playerId);
    if (player) {
      try {
        await PersistentPlayerStatsManager.instance.saveDirtyPlayerStats(player);
      } catch (error) {
        debugError('Error saving persistent stats before removing player:', error, 'PlayerStatsManager');
      }
    }
    
    this._playerStats.delete(playerId);
    this._playerObjects.delete(playerId);
    this._playerJoinTimes.delete(playerId);
    
    // Clear from persistent cache
    PersistentPlayerStatsManager.instance.clearPlayerFromCache(playerId);
    
    debugLog(`Removed stats for player ${playerId}`, 'PlayerStatsManager');
  }

  /**
   * Record a goal with proper attribution
   */
  public async recordGoal(scorerId: string, assistId: string | undefined, team: HockeyTeam, period: number, isOwnGoal: boolean = false): Promise<GoalInfo> {
    const timeInPeriod = this.getCurrentPeriodTime();
    
    debugLog(`recordGoal called - Scorer: ${scorerId}, Assist: ${assistId || 'None'}, Team: ${team}, Period: ${period}, OwnGoal: ${isOwnGoal}`, 'PlayerStatsManager');
    
    const goalInfo: GoalInfo = {
      scorerId,
      assistId,
      team,
      period,
      timeInPeriod,
      isOwnGoal
    };

    // Record goal for scorer
    const scorerStats = this._playerStats.get(scorerId);
    if (scorerStats) {
      debugLog(`Recording goal for scorer ${scorerId} (${scorerStats.playerName}) - Current goals: ${scorerStats.goals}, Own Goal: ${isOwnGoal}`, 'PlayerStatsManager');
      
      // Only count as a goal if it's NOT an own goal
      if (!isOwnGoal) {
        scorerStats.goals++;
        scorerStats.plusMinus++;
        
        // Update persistent stats for scorer (only for actual goals, not own goals)
        try {
          const scorerPlayer = this.getPlayerObjectById(scorerId);
          if (scorerPlayer) {
            await PersistentPlayerStatsManager.instance.recordGoal(scorerPlayer);
            debugLog(`✅ Persistent goal stat recorded for ${scorerStats.playerName}`, 'PlayerStatsManager');
          } else {
            debugWarn(`❌ Could not find player object for scorer ${scorerId}`, 'PlayerStatsManager');
          }
        } catch (error) {
          debugError('Error updating persistent goal stats:', error, 'PlayerStatsManager');
        }
      } else {
        // Own goal - only affects +/- rating, not goal count
        scorerStats.plusMinus--;
        debugLog(`❌ Own goal - no goal stat recorded for ${scorerStats.playerName}`, 'PlayerStatsManager');
      }
      
      debugLog(`Scorer stats updated - Goals: ${scorerStats.goals}, +/-: ${scorerStats.plusMinus}`, 'PlayerStatsManager');
    } else {
      debugWarn(`❌ Scorer ${scorerId} not found in player stats map!`, 'PlayerStatsManager');
    }

    // Record assist if applicable
    if (assistId && assistId !== scorerId) {
      debugLog(`Processing assist for ${assistId}...`, 'PlayerStatsManager');
      const assistStats = this._playerStats.get(assistId);
      if (assistStats && !isOwnGoal) {
        debugLog(`Recording assist for ${assistId} (${assistStats.playerName}) - Current assists: ${assistStats.assists}`, 'PlayerStatsManager');
        assistStats.assists++;
        assistStats.plusMinus++;
        debugLog(`Assist stats updated - New assists: ${assistStats.assists}, +/-: ${assistStats.plusMinus}`, 'PlayerStatsManager');
        
        // Update persistent stats for assister
        try {
          const assistPlayer = this.getPlayerObjectById(assistId);
          if (assistPlayer) {
            await PersistentPlayerStatsManager.instance.recordAssist(assistPlayer);
            debugLog(`✅ Persistent assist stat recorded for ${assistStats.playerName}`, 'PlayerStatsManager');
          } else {
            debugWarn(`❌ Could not find player object for assister ${assistId}`, 'PlayerStatsManager');
          }
        } catch (error) {
          debugError('Error updating persistent assist stats:', error, 'PlayerStatsManager');
        }
      } else if (!assistStats) {
        debugWarn(`❌ Assister ${assistId} not found in player stats map!`, 'PlayerStatsManager');
      } else if (isOwnGoal) {
        debugLog(`❌ No assist awarded - own goal`, 'PlayerStatsManager');
      }
    } else if (assistId === scorerId) {
      debugLog(`❌ No assist awarded - assist ID same as scorer ID`, 'PlayerStatsManager');
    } else {
      debugLog(`❌ No assist - no assist ID provided`, 'PlayerStatsManager');
    }

    // Update +/- for all players on ice
    this.updatePlusMinusForGoal(team, isOwnGoal);

    this._goals.push(goalInfo);
    
    debugLog(`Recorded goal: ${scorerStats?.playerName} (${isOwnGoal ? 'OWN GOAL' : 'GOAL'})`, 'PlayerStatsManager');
    if (assistId && assistId !== scorerId) {
      const assistStats = this._playerStats.get(assistId);
      debugLog(`Assist: ${assistStats?.playerName}`, 'PlayerStatsManager');
    }

    debugLog(`✅ Goal recording complete - Total goals in game: ${this._goals.length}`, 'PlayerStatsManager');
    return goalInfo;
  }

  /**
   * Record a shot attempt
   */
  public async recordShot(shooterId: string, team: HockeyTeam, onGoal: boolean, saved: boolean, goalieId?: string, isOwnGoal: boolean = false): Promise<ShotInfo> {
    const shotInfo: ShotInfo = {
      shooterId,
      team,
      onGoal,
      saved,
      goalieId,
      isOwnGoal
    };

    const shooterStats = this._playerStats.get(shooterId);
    if (shooterStats && onGoal && !isOwnGoal) {
      // Only count as shot on goal if it's on goal AND not shooting at own goal
      shooterStats.shotsOnGoal++;
      
      // Update persistent stats for shooter (only for shots at opponent's goal)
      try {
        const shooterPlayer = this.getPlayerObjectById(shooterId);
        if (shooterPlayer) {
          await PersistentPlayerStatsManager.instance.recordShotOnGoal(shooterPlayer);
        }
      } catch (error) {
        debugError('Error updating persistent shot stats:', error, 'PlayerStatsManager');
      }
      
      CONSTANTS.debugLog(`Recorded shot on goal: ${shooterStats.playerName} (Total SOG: ${shooterStats.shotsOnGoal})`, 'PlayerStatsManager');
    } else if (shooterStats && onGoal && isOwnGoal) {
      CONSTANTS.debugLog(`Shot at own goal by ${shooterStats.playerName} - not counted as SOG`, 'PlayerStatsManager');
    }

    // Record save for goalie
    if (saved && goalieId) {
      const goalieStats = this._playerStats.get(goalieId);
      if (goalieStats) {
        goalieStats.saves++;
      }
    }

    CONSTANTS.debugLog(`Recorded shot: ${shooterStats?.playerName} (${onGoal ? 'on goal' : 'off target'}${saved ? ', saved' : ''}${isOwnGoal ? ', own goal' : ''})`, 'PlayerStatsManager');

    return shotInfo;
  }

  /**
   * Record a hit/body check (only when target player was controlling the puck)
   */
  public async recordHit(hitterId: string): Promise<void> {
    const hitterStats = this._playerStats.get(hitterId);
    if (hitterStats) {
      hitterStats.hits++;
      
      // Update persistent stats for hitter
      try {
        const hitterPlayer = this.getPlayerObjectById(hitterId);
        if (hitterPlayer) {
          await PersistentPlayerStatsManager.instance.recordHit(hitterPlayer);
        }
      } catch (error) {
        debugError('Error updating persistent hit stats:', error, 'PlayerStatsManager');
      }
      
      CONSTANTS.debugLog(`Recorded hit by ${hitterStats.playerName} against puck-controlling player (Total: ${hitterStats.hits})`, 'PlayerStatsManager');
    }
  }

  /**
   * Record wins and losses for players based on game outcome
   */
  public async recordGameOutcome(winningTeam: HockeyTeam, isTie: boolean = false): Promise<void> {
    CONSTANTS.debugLog(`Recording game outcome - Winner: ${isTie ? 'TIE' : winningTeam}`, 'PlayerStatsManager');
    
    // Update all players' time on ice before checking qualification
    this.updateAllPlayersTimeOnIce();
    
    // Log GP qualification summary
    this.logGPQualificationSummary();
    
    for (const [playerId, stats] of this._playerStats.entries()) {
      const player = this.getPlayerObjectById(playerId);
      if (!player) continue;
      
      // Check if player qualifies for GP based on new criteria
      const qualifiesForGP = this.doesPlayerQualifyForGP(playerId);
      
      if (!qualifiesForGP) {
        CONSTANTS.debugLog(`❌ ${stats.playerName} did not qualify for GP - no win/loss/GP recorded`, 'PlayerStatsManager');
        continue;
      }
      
      try {
        if (isTie) {
          // Record tie (conditional GP)
          await PersistentPlayerStatsManager.instance.recordConditionalGamePlayed(player);
          CONSTANTS.debugLog(`✅ Recorded GP (tie) for ${stats.playerName} - qualified based on play time/contribution`, 'PlayerStatsManager');
        } else if (stats.team === winningTeam) {
          // Player is on winning team (conditional GP)
          await PersistentPlayerStatsManager.instance.recordConditionalWin(player);
          CONSTANTS.debugLog(`✅ Recorded WIN and GP for ${stats.playerName} (${stats.team} team) - qualified based on play time/contribution`, 'PlayerStatsManager');
        } else {
          // Player is on losing team (conditional GP)
          await PersistentPlayerStatsManager.instance.recordConditionalLoss(player);
          CONSTANTS.debugLog(`✅ Recorded LOSS and GP for ${stats.playerName} (${stats.team} team) - qualified based on play time/contribution`, 'PlayerStatsManager');
        }
      } catch (error) {
        debugError(`Error recording game outcome for ${stats.playerName}:`, error, 'PlayerStatsManager');
      }
    }
  }

  /**
   * Log GP qualification summary for debugging
   */
  public logGPQualificationSummary(): void {
    const summary = this.getPlayTimeSummary();
    
    CONSTANTS.debugLog('=== GAMES PLAYED (GP) QUALIFICATION SUMMARY ===', 'PlayerStatsManager');
    CONSTANTS.debugLog(`Game Duration: ${this._totalGameDurationMs / 60000} minutes`, 'PlayerStatsManager');
    CONSTANTS.debugLog('Qualification Criteria: 50%+ play time OR <50% play time + contribution (Goal/Assist/Save/Hit)', 'PlayerStatsManager');
    CONSTANTS.debugLog('', 'PlayerStatsManager');
    
    summary.forEach((player, index) => {
      const status = player.qualifiesForGP ? '✅ QUALIFIED' : '❌ NOT QUALIFIED';
      const timeMinutes = (player.timeOnIce / 60).toFixed(1);
      
      CONSTANTS.debugLog(`${index + 1}. ${player.playerName}`, 'PlayerStatsManager');
      CONSTANTS.debugLog(`   Time Played: ${timeMinutes} min (${player.percentageOfGame.toFixed(1)}%)`, 'PlayerStatsManager');
      CONSTANTS.debugLog(`   ${status}: ${player.qualificationReason}`, 'PlayerStatsManager');
      CONSTANTS.debugLog('', 'PlayerStatsManager');
    });
    
    const qualifiedCount = summary.filter(p => p.qualifiesForGP).length;
    CONSTANTS.debugLog(`${qualifiedCount}/${summary.length} players qualified for GP this game`, 'PlayerStatsManager');
    CONSTANTS.debugLog('=== END GP QUALIFICATION SUMMARY ===', 'PlayerStatsManager');
  }

  /**
   * Save all player persistent stats (call at game end)
   */
  public async saveAllPlayerStats(): Promise<void> {
    CONSTANTS.debugLog('Saving persistent stats for all players', 'PlayerStatsManager');
    
    // Update all players' time on ice before saving
    this.updateAllPlayersTimeOnIce();
    
    const savePromises: Promise<boolean>[] = [];
    
    for (const [playerId, stats] of this._playerStats.entries()) {
      const player = this.getPlayerObjectById(playerId);
      if (player) {
        savePromises.push(
          PersistentPlayerStatsManager.instance.saveDirtyPlayerStats(player)
        );
      }
    }
    
    try {
      const results = await Promise.all(savePromises);
      const successCount = results.filter(Boolean).length;
      CONSTANTS.debugLog(`Successfully saved persistent stats for ${successCount}/${results.length} players`, 'PlayerStatsManager');
    } catch (error) {
      debugError('Error saving persistent stats for players:', error, 'PlayerStatsManager');
    }
  }

  /**
   * Get stats for a specific player
   */
  public getPlayerStats(playerId: string): PlayerStats | undefined {
    return this._playerStats.get(playerId);
  }

  /**
   * Get Player object by ID for persistence operations
   */
  public getPlayerObjectById(playerId: string): Player | undefined {
    return this._playerObjects.get(playerId);
  }

  /**
   * Get all player stats
   */
  public getAllStats(): PlayerStats[] {
    return Array.from(this._playerStats.values());
  }

  /**
   * Get stats by team
   */
  public getTeamStats(team: HockeyTeam): PlayerStats[] {
    return Array.from(this._playerStats.values()).filter(stats => stats.team === team);
  }

  /**
   * Get top scorers
   */
  public getTopScorers(limit: number = 5): PlayerStats[] {
    return Array.from(this._playerStats.values())
      .sort((a, b) => {
        const aPoints = a.goals + a.assists;
        const bPoints = b.goals + b.assists;
        if (aPoints !== bPoints) return bPoints - aPoints;
        return b.goals - a.goals; // Tiebreaker: goals
      })
      .slice(0, limit);
  }

  /**
   * Get goal history
   */
  public getGoals(): GoalInfo[] {
    return [...this._goals];
  }

  /**
   * Generate comprehensive box score for game over display
   */
  public generateBoxScore(): BoxScore {
    // Calculate period-by-period scores
    const periodScores: PeriodScore[] = [
      { red: 0, blue: 0 }, // Period 1
      { red: 0, blue: 0 }, // Period 2
      { red: 0, blue: 0 }  // Period 3
    ];

    // Count goals by period
    this._goals.forEach(goal => {
      if (goal.period >= 1 && goal.period <= 3) {
        const periodIndex = goal.period - 1;
        if (goal.team === HockeyTeam.RED) {
          periodScores[periodIndex].red++;
        } else if (goal.team === HockeyTeam.BLUE) {
          periodScores[periodIndex].blue++;
        }
      }
    });

    // Calculate total scores
    const totalScore: PeriodScore = {
      red: periodScores.reduce((sum, period) => sum + period.red, 0),
      blue: periodScores.reduce((sum, period) => sum + period.blue, 0)
    };

    // Get top performers
    const allStats = this.getAllStats();
    
    // Top scorer (most points)
    const topScorer = allStats.reduce((best, player) => {
      const points = player.goals + player.assists;
      const bestPoints = best ? best.goals + best.assists : -1;
      return points > bestPoints ? player : best;
    }, null as PlayerStats | null);

    // Most goals
    const mostGoals = allStats.reduce((best, player) => {
      return player.goals > (best?.goals || -1) ? player : best;
    }, null as PlayerStats | null);

    // Most saves
    const mostSaves = allStats.reduce((best, player) => {
      return player.saves > (best?.saves || -1) ? player : best;
    }, null as PlayerStats | null);

    return {
      periodScores,
      totalScore,
      topPerformers: {
        topScorer: topScorer ? {
          name: topScorer.playerName,
          goals: topScorer.goals,
          assists: topScorer.assists,
          points: topScorer.goals + topScorer.assists
        } : null,
        mostGoals: mostGoals ? {
          name: mostGoals.playerName,
          goals: mostGoals.goals
        } : null,
        mostSaves: mostSaves ? {
          name: mostSaves.playerName,
          saves: mostSaves.saves
        } : null
      },
      playerStats: allStats.sort((a, b) => {
        // Sort by points first, then by goals
        const aPoints = a.goals + a.assists;
        const bPoints = b.goals + b.assists;
        if (aPoints !== bPoints) return bPoints - aPoints;
        return b.goals - a.goals;
      })
    };
  }

  /**
   * Get last goal scorer info
   */
  public getLastGoal(): GoalInfo | undefined {
    return this._goals.length > 0 ? this._goals[this._goals.length - 1] : undefined;
  }

  /**
   * Reset all stats for new game
   */
  public resetStats(): void {
    this._playerStats.clear();
    this._playerJoinTimes.clear();
    this._goals = [];
    this._gameStartTime = 0;
    this._periodStartTime = 0;
    CONSTANTS.debugLog('All stats reset for new game', 'PlayerStatsManager');
  }

  /**
   * Start tracking game time
   */
  public startGameTime(): void {
    this._gameStartTime = Date.now();
    this._periodStartTime = Date.now();
    CONSTANTS.debugLog('Started tracking game time', 'PlayerStatsManager');
  }

  /**
   * Start new period time tracking
   */
  public startPeriodTime(): void {
    this._periodStartTime = Date.now();
    CONSTANTS.debugLog('Started tracking new period time', 'PlayerStatsManager');
  }

  /**
   * Adjust period start time to account for pauses (like goal celebrations)
   */
  public adjustPeriodStartTime(pauseDurationMs: number): void {
    if (this._periodStartTime > 0) {
      this._periodStartTime += pauseDurationMs;
      CONSTANTS.debugLog(`Adjusted period start time by ${pauseDurationMs}ms to account for pause`, 'PlayerStatsManager');
    }
  }

  /**
   * Get current period start time for synchronizing new players
   */
  public getPeriodStartTime(): number | null {
    return this._periodStartTime > 0 ? this._periodStartTime : null;
  }

  /**
   * Get current period time remaining on clock (public accessor)
   */
  public getCurrentPeriodTimeRemaining(): number {
    return this.getCurrentPeriodTime();
  }

  /**
   * Get current period time remaining on clock in seconds (countdown format)
   */
  private getCurrentPeriodTime(): number {
    if (this._periodStartTime === 0) return 0;
    const elapsedSeconds = Math.floor((Date.now() - this._periodStartTime) / 1000);
    const periodDurationSeconds = 2 * 60; // 2 minutes (matches UI timer)
    const remainingSeconds = Math.max(0, periodDurationSeconds - elapsedSeconds);
    return remainingSeconds;
  }

  /**
   * Update +/- rating for all players on ice when goal is scored
   */
  private updatePlusMinusForGoal(scoringTeam: HockeyTeam, isOwnGoal: boolean): void {
    // In a real implementation, this would track which players are currently on ice
    // For now, we'll update all players on both teams
    const effectiveTeam = isOwnGoal ? (scoringTeam === HockeyTeam.RED ? HockeyTeam.BLUE : HockeyTeam.RED) : scoringTeam;
    
    for (const stats of this._playerStats.values()) {
      if (stats.team === effectiveTeam) {
        // Don't double-count for the goal scorer (already handled above)
        if (stats.playerId !== this._goals[this._goals.length - 1]?.scorerId) {
          stats.plusMinus++;
        }
      } else {
        stats.plusMinus--;
      }
    }
  }

  /**
   * Get formatted stats summary for UI
   */
  public getStatsSummary(): {
    topScorer: { name: string; points: number } | null;
    mostGoals: { name: string; goals: number } | null;
    mostSaves: { name: string; saves: number } | null;
    teamStats: {
      red: { goals: number; shots: number; saves: number };
      blue: { goals: number; shots: number; saves: number };
    };
  } {
    const allStats = this.getAllStats();
    
    // Find top performers
    const topScorer = allStats.reduce((top, stats) => {
      const points = stats.goals + stats.assists;
      return !top || points > (top.goals + top.assists) ? stats : top;
    }, null as PlayerStats | null);

    const mostGoals = allStats.reduce((top, stats) => {
      return !top || stats.goals > top.goals ? stats : top;
    }, null as PlayerStats | null);

    const mostSaves = allStats.reduce((top, stats) => {
      return !top || stats.saves > top.saves ? stats : top;
    }, null as PlayerStats | null);

    // Calculate team stats
    const redStats = this.getTeamStats(HockeyTeam.RED);
    const blueStats = this.getTeamStats(HockeyTeam.BLUE);

    const teamStats = {
      red: {
        goals: redStats.reduce((sum, stats) => sum + stats.goals, 0),
        shots: redStats.reduce((sum, stats) => sum + stats.shotsOnGoal, 0),
        saves: redStats.reduce((sum, stats) => sum + stats.saves, 0)
      },
      blue: {
        goals: blueStats.reduce((sum, stats) => sum + stats.goals, 0),
        shots: blueStats.reduce((sum, stats) => sum + stats.shotsOnGoal, 0),
        saves: blueStats.reduce((sum, stats) => sum + stats.saves, 0)
      }
    };

    return {
      topScorer: topScorer ? { name: topScorer.playerName, points: topScorer.goals + topScorer.assists } : null,
      mostGoals: mostGoals ? { name: mostGoals.playerName, goals: mostGoals.goals } : null,
      mostSaves: mostSaves ? { name: mostSaves.playerName, saves: mostSaves.saves } : null,
      teamStats
    };
  }

  /**
   * Update a player's time on ice based on when they joined
   */
  private updatePlayerTimeOnIce(playerId: string): void {
    const joinTime = this._playerJoinTimes.get(playerId);
    const stats = this._playerStats.get(playerId);
    
    if (joinTime && stats) {
      const timePlayedMs = Date.now() - joinTime;
      const timePlayedSeconds = Math.floor(timePlayedMs / 1000);
      stats.timeOnIce = timePlayedSeconds;
      
      CONSTANTS.debugLog(`Updated time on ice for player ${playerId}: ${timePlayedSeconds} seconds`, 'PlayerStatsManager');
    }
  }

  /**
   * Update all players' time on ice (call this periodically or at game end)
   */
  public updateAllPlayersTimeOnIce(): void {
    for (const playerId of this._playerStats.keys()) {
      this.updatePlayerTimeOnIce(playerId);
    }
  }

  /**
   * Check if a player qualifies for a Games Played (GP) based on new criteria
   */
  private doesPlayerQualifyForGP(playerId: string): boolean {
    this.updatePlayerTimeOnIce(playerId); // Make sure time on ice is current
    
    const stats = this._playerStats.get(playerId);
    if (!stats) return false;

    // Calculate percentage of game played
    const timePlayedMs = stats.timeOnIce * 1000;
    const gamePlayedPercentage = (timePlayedMs / this._totalGameDurationMs) * 100;

    CONSTANTS.debugLog(`GP Qualification check for ${stats.playerName}: ${stats.timeOnIce}s played (${gamePlayedPercentage.toFixed(1)}%)`, 'PlayerStatsManager');

    // Condition 1: Played at least 50% of the game
    if (gamePlayedPercentage >= 50) {
      CONSTANTS.debugLog(`✅ ${stats.playerName} qualifies for GP: Played ${gamePlayedPercentage.toFixed(1)}% of game (≥50%)`, 'PlayerStatsManager');
      return true;
    }

    // Condition 2: If played less than 50%, must have contributed with at least one stat
    const hasContribution = stats.goals > 0 || stats.assists > 0 || stats.saves > 0 || stats.hits > 0;
    
    if (hasContribution) {
      CONSTANTS.debugLog(`✅ ${stats.playerName} qualifies for GP: Played ${gamePlayedPercentage.toFixed(1)}% but has contribution (G:${stats.goals} A:${stats.assists} S:${stats.saves} H:${stats.hits})`, 'PlayerStatsManager');
      return true;
    }

    CONSTANTS.debugLog(`❌ ${stats.playerName} does NOT qualify for GP: Played ${gamePlayedPercentage.toFixed(1)}% with no contribution`, 'PlayerStatsManager');
    return false;
  }

  /**
   * Get play time summary for all players (for debugging)
   */
  public getPlayTimeSummary(): Array<{
    playerId: string;
    playerName: string;
    timeOnIce: number;
    percentageOfGame: number;
    qualifiesForGP: boolean;
    qualificationReason: string;
  }> {
    this.updateAllPlayersTimeOnIce();
    
    const summary: Array<{
      playerId: string;
      playerName: string;
      timeOnIce: number;
      percentageOfGame: number;
      qualifiesForGP: boolean;
      qualificationReason: string;
    }> = [];

    for (const [playerId, stats] of this._playerStats.entries()) {
      const timePlayedMs = stats.timeOnIce * 1000;
      const gamePlayedPercentage = (timePlayedMs / this._totalGameDurationMs) * 100;
      const qualifiesForGP = this.doesPlayerQualifyForGP(playerId);
      
      let qualificationReason = '';
      if (gamePlayedPercentage >= 50) {
        qualificationReason = `Played ${gamePlayedPercentage.toFixed(1)}% of game (≥50%)`;
      } else {
        const hasContribution = stats.goals > 0 || stats.assists > 0 || stats.saves > 0 || stats.hits > 0;
        if (hasContribution) {
          qualificationReason = `Played ${gamePlayedPercentage.toFixed(1)}% but contributed (G:${stats.goals} A:${stats.assists} S:${stats.saves} H:${stats.hits})`;
        } else {
          qualificationReason = `Played ${gamePlayedPercentage.toFixed(1)}% with no contribution`;
        }
      }

      summary.push({
        playerId,
        playerName: stats.playerName,
        timeOnIce: stats.timeOnIce,
        percentageOfGame: gamePlayedPercentage,
        qualifiesForGP,
        qualificationReason
      });
    }

    return summary.sort((a, b) => b.percentageOfGame - a.percentageOfGame);
  }

  /**
   * Record a save by a goalie
   */
  public async recordSave(goalieId: string, shooterId: string, shooterTeam: HockeyTeam): Promise<void> {
    const goalieStats = this._playerStats.get(goalieId);
    const shooterStats = this._playerStats.get(shooterId);
    
    if (goalieStats) {
      goalieStats.saves++;
      
      // Update persistent stats for goalie
      try {
        const goaliePlayer = this.getPlayerObjectById(goalieId);
        if (goaliePlayer) {
          await PersistentPlayerStatsManager.instance.recordSave(goaliePlayer);
        }
      } catch (error) {
        debugError('Error updating persistent save stats:', error, 'PlayerStatsManager');
      }
      
      CONSTANTS.debugLog(`SAVE! ${goalieStats.playerName} saved shot from ${shooterStats?.playerName || 'Unknown'} (${shooterTeam} team)`, 'PlayerStatsManager');
      CONSTANTS.debugLog(`${goalieStats.playerName} now has ${goalieStats.saves} saves`, 'PlayerStatsManager');
    } else {
      CONSTANTS.debugWarn(`Cannot record save - goalie ${goalieId} not found in stats`, 'PlayerStatsManager');
    }
  }
} 