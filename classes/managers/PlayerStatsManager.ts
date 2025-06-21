import { Player } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';

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
}

export class PlayerStatsManager {
  private static _instance: PlayerStatsManager;
  private _playerStats: Map<string, PlayerStats> = new Map();
  private _goals: GoalInfo[] = [];
  private _gameStartTime: number = 0;
  private _periodStartTime: number = 0;

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
  public initializePlayer(player: Player, team: HockeyTeam, position: HockeyPosition): void {
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
    console.log(`[PlayerStatsManager] Initialized stats for ${player.username} (${team} ${position})`);
  }

  /**
   * Remove a player's stats
   */
  public removePlayer(playerId: string): void {
    this._playerStats.delete(playerId);
    console.log(`[PlayerStatsManager] Removed stats for player ${playerId}`);
  }

  /**
   * Record a goal with proper attribution
   */
  public recordGoal(scorerId: string, assistId: string | undefined, team: HockeyTeam, period: number, isOwnGoal: boolean = false): GoalInfo {
    const timeInPeriod = this.getCurrentPeriodTime();
    
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
      scorerStats.goals++;
      if (!isOwnGoal) {
        scorerStats.plusMinus++;
      } else {
        scorerStats.plusMinus--;
      }
    }

    // Record assist if applicable
    if (assistId && assistId !== scorerId) {
      const assistStats = this._playerStats.get(assistId);
      if (assistStats && !isOwnGoal) {
        assistStats.assists++;
        assistStats.plusMinus++;
      }
    }

    // Update +/- for all players on ice
    this.updatePlusMinusForGoal(team, isOwnGoal);

    this._goals.push(goalInfo);
    
    console.log(`[PlayerStatsManager] Recorded goal: ${scorerStats?.playerName} (${isOwnGoal ? 'OWN GOAL' : 'GOAL'})`);
    if (assistId && assistId !== scorerId) {
      const assistStats = this._playerStats.get(assistId);
      console.log(`[PlayerStatsManager] Assist: ${assistStats?.playerName}`);
    }

    return goalInfo;
  }

  /**
   * Record a shot attempt
   */
  public recordShot(shooterId: string, team: HockeyTeam, onGoal: boolean, saved: boolean, goalieId?: string): ShotInfo {
    const shotInfo: ShotInfo = {
      shooterId,
      team,
      onGoal,
      saved,
      goalieId
    };

    const shooterStats = this._playerStats.get(shooterId);
    if (shooterStats && onGoal) {
      shooterStats.shotsOnGoal++;
    }

    // Record save for goalie
    if (saved && goalieId) {
      const goalieStats = this._playerStats.get(goalieId);
      if (goalieStats) {
        goalieStats.saves++;
      }
    }

    console.log(`[PlayerStatsManager] Recorded shot: ${shooterStats?.playerName} (${onGoal ? 'on goal' : 'off target'}${saved ? ', saved' : ''})`);

    return shotInfo;
  }

  /**
   * Record a hit/body check
   */
  public recordHit(hitterId: string): void {
    const hitterStats = this._playerStats.get(hitterId);
    if (hitterStats) {
      hitterStats.hits++;
      console.log(`[PlayerStatsManager] Recorded hit by ${hitterStats.playerName} (Total: ${hitterStats.hits})`);
    }
  }

  /**
   * Get stats for a specific player
   */
  public getPlayerStats(playerId: string): PlayerStats | undefined {
    return this._playerStats.get(playerId);
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
    this._goals = [];
    this._gameStartTime = 0;
    this._periodStartTime = 0;
    console.log('[PlayerStatsManager] All stats reset for new game');
  }

  /**
   * Start tracking game time
   */
  public startGameTime(): void {
    this._gameStartTime = Date.now();
    this._periodStartTime = Date.now();
    console.log('[PlayerStatsManager] Started tracking game time');
  }

  /**
   * Start new period time tracking
   */
  public startPeriodTime(): void {
    this._periodStartTime = Date.now();
    console.log('[PlayerStatsManager] Started tracking new period time');
  }

  /**
   * Get current period time in seconds
   */
  private getCurrentPeriodTime(): number {
    if (this._periodStartTime === 0) return 0;
    return Math.floor((Date.now() - this._periodStartTime) / 1000);
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
} 