import { PersistenceManager, Player } from 'hytopia';
import * as CONSTANTS from '../utils/constants';

export interface PersistentPlayerStats {
  playerId: string;
  playerName: string;
  
  // Core Stats
  goals: number;
  assists: number;
  saves: number;
  wins: number;
  losses: number;
  
  // Additional Career Stats
  gamesPlayed: number;
  shotsOnGoal: number;
  shotsBlocked: number;
  hits: number;
  penaltyMinutes: number;
  
  // Performance Metrics (calculated fields)
  winRate: number;
  pointsPerGame: number;
  savesPerGame: number;
  
  // Timestamps
  firstGameDate: number; // Unix timestamp
  lastGameDate: number; // Unix timestamp
  lastUpdated: number; // Unix timestamp
}

export class PersistentPlayerStatsManager {
  private static _instance: PersistentPlayerStatsManager;
  
  // Cache for loaded player stats to avoid repeated database hits
  private _playerStatsCache: Map<string, PersistentPlayerStats> = new Map();
  
  // Track if cache is dirty and needs saving
  private _dirtyPlayers: Set<string> = new Set();
  
  private constructor() {}

  public static get instance(): PersistentPlayerStatsManager {
    if (!PersistentPlayerStatsManager._instance) {
      PersistentPlayerStatsManager._instance = new PersistentPlayerStatsManager();
    }
    return PersistentPlayerStatsManager._instance;
  }

  /**
   * Load persistent stats for a player from the database
   */
  public async loadPlayerStats(player: Player): Promise<PersistentPlayerStats> {
    const playerId = player.id;
    
    // Check cache first
    const cachedStats = this._playerStatsCache.get(playerId);
    if (cachedStats) {
      CONSTANTS.debugLog(`Loaded cached stats for ${player.username}`, 'PersistentPlayerStatsManager');
      return cachedStats;
    }

    try {
      // FIX: Try getting data without a key - just the player's main persistent data
      const persistedData = await player.getPersistedData();
      
      // Look for stats in the persistent data
      const statsData = persistedData?.playerStats;
      
      if (statsData && this._isValidStatsData(statsData)) {
        const stats = statsData as PersistentPlayerStats;
        
        // Update player name in case it changed
        stats.playerName = player.username;
        stats.lastUpdated = Date.now();
        
        // Recalculate derived stats
        this._recalculateStats(stats);
        
        // Cache the loaded stats
        this._playerStatsCache.set(playerId, stats);
        
        CONSTANTS.debugLog(`Loaded persistent stats for ${player.username}: ${stats.gamesPlayed} games, ${stats.goals} goals, ${stats.assists} assists, ${stats.saves} saves, ${stats.wins}W-${stats.losses}L`, 'PersistentPlayerStatsManager');
        
        return stats;
      } else {
        // No existing data or invalid data, create new stats
        CONSTANTS.debugLog(`Creating new persistent stats for ${player.username}`, 'PersistentPlayerStatsManager');
        return this._createNewPlayerStats(player);
      }
    } catch (error) {
      console.error(`Error loading persistent stats for player ${player.username}:`, error);
      CONSTANTS.debugLog(`Failed to load stats for ${player.username}, creating new stats`, 'PersistentPlayerStatsManager');
      
      // Create new stats as fallback
      return this._createNewPlayerStats(player);
    }
  }

  /**
   * Save persistent stats for a player to the database
   */
  public async savePlayerStats(player: Player, stats?: PersistentPlayerStats): Promise<boolean> {
    const playerId = player.id;
    
    try {
      // Use provided stats or get from cache
      const statsToSave = stats || this._playerStatsCache.get(playerId);
      
      if (!statsToSave) {
        CONSTANTS.debugLog(`No stats to save for player ${player.username}`, 'PersistentPlayerStatsManager');
        return false;
      }
      
      // Update timestamps and recalculate derived stats
      statsToSave.lastUpdated = Date.now();
      this._recalculateStats(statsToSave);
      
      // FIX: Store the stats as part of the player's main persistent data object
      await player.setPersistedData({ playerStats: statsToSave });
      
      // Update cache and mark as clean
      this._playerStatsCache.set(playerId, statsToSave);
      this._dirtyPlayers.delete(playerId);
      
      CONSTANTS.debugLog(`Saved persistent stats for ${player.username}: ${statsToSave.gamesPlayed} games, ${statsToSave.goals} goals, ${statsToSave.assists} assists, ${statsToSave.saves} saves, ${statsToSave.wins}W-${statsToSave.losses}L`, 'PersistentPlayerStatsManager');
      
      return true;
    } catch (error) {
      console.error(`Error saving persistent stats for player ${player.username}:`, error);
      return false;
    }
  }

  /**
   * Get cached stats for a player (loads if not cached)
   */
  public async getPlayerStats(player: Player): Promise<PersistentPlayerStats> {
    const playerId = player.id;
    
    if (this._playerStatsCache.has(playerId)) {
      return this._playerStatsCache.get(playerId)!;
    }
    
    return await this.loadPlayerStats(player);
  }

  /**
   * Update specific stats for a player
   */
  public async updatePlayerStats(player: Player, updates: Partial<PersistentPlayerStats>): Promise<void> {
    const playerId = player.id;
    const currentStats = await this.getPlayerStats(player);
    
    // Apply updates
    Object.assign(currentStats, updates);
    
    // Mark as dirty for batch saving
    this._dirtyPlayers.add(playerId);
    
    CONSTANTS.debugLog(`Updated stats for ${player.username}: ${JSON.stringify(updates)}`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a goal for a player
   */
  public async recordGoal(player: Player): Promise<void> {
    await this.updatePlayerStats(player, { 
      goals: (await this.getPlayerStats(player)).goals + 1 
    });
  }

  /**
   * Record an assist for a player
   */
  public async recordAssist(player: Player): Promise<void> {
    await this.updatePlayerStats(player, { 
      assists: (await this.getPlayerStats(player)).assists + 1 
    });
  }

  /**
   * Record a save for a player
   */
  public async recordSave(player: Player): Promise<void> {
    await this.updatePlayerStats(player, { 
      saves: (await this.getPlayerStats(player)).saves + 1 
    });
  }

  /**
   * Record a win for a player
   */
  public async recordWin(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    await this.updatePlayerStats(player, { 
      wins: currentStats.wins + 1,
      gamesPlayed: currentStats.gamesPlayed + 1
    });
  }

  /**
   * Record a loss for a player
   */
  public async recordLoss(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    await this.updatePlayerStats(player, { 
      losses: currentStats.losses + 1,
      gamesPlayed: currentStats.gamesPlayed + 1
    });
  }

  /**
   * Record a shot on goal for a player
   */
  public async recordShotOnGoal(player: Player): Promise<void> {
    await this.updatePlayerStats(player, { 
      shotsOnGoal: (await this.getPlayerStats(player)).shotsOnGoal + 1 
    });
  }

  /**
   * Record a hit for a player
   */
  public async recordHit(player: Player): Promise<void> {
    await this.updatePlayerStats(player, { 
      hits: (await this.getPlayerStats(player)).hits + 1 
    });
  }

  /**
   * Save all dirty (modified) player stats
   */
  public async saveAllDirtyStats(): Promise<void> {
    const savePromises: Promise<boolean>[] = [];
    
    for (const playerId of this._dirtyPlayers) {
      const stats = this._playerStatsCache.get(playerId);
      if (stats) {
        // We need the Player object to save, but we only have playerId
        // This method should be called with available players
        CONSTANTS.debugLog(`Player ID ${playerId} needs stats saved but no Player object available`, 'PersistentPlayerStatsManager');
      }
    }
    
    // Note: This method has limitations - we need Player objects to save
    // Better to save immediately when we have the Player object available
  }

  /**
   * Save stats for a specific player if they are dirty
   */
  public async saveDirtyPlayerStats(player: Player): Promise<boolean> {
    const playerId = player.id;
    
    if (this._dirtyPlayers.has(playerId)) {
      return await this.savePlayerStats(player);
    }
    
    return true; // Not dirty, no need to save
  }

  /**
   * Get leaderboard data for top players
   */
  public async getLeaderboard(limit: number = 10): Promise<PersistentPlayerStats[]> {
    // Note: This is a simplified implementation
    // In a real scenario, you might want to use global data or aggregate player data
    const allStats = Array.from(this._playerStatsCache.values());
    
    // Sort by total points (goals + assists), then by wins
    allStats.sort((a, b) => {
      const aPoints = a.goals + a.assists;
      const bPoints = b.goals + b.assists;
      
      if (aPoints !== bPoints) {
        return bPoints - aPoints; // Higher points first
      }
      
      return b.wins - a.wins; // Then by wins
    });
    
    return allStats.slice(0, limit);
  }

  /**
   * Clear cache for a player (useful when they disconnect)
   */
  public clearPlayerFromCache(playerId: string): void {
    this._playerStatsCache.delete(playerId);
    this._dirtyPlayers.delete(playerId);
    CONSTANTS.debugLog(`Cleared cache for player ${playerId}`, 'PersistentPlayerStatsManager');
  }

  /**
   * Create new default stats for a player
   */
  private _createNewPlayerStats(player: Player): PersistentPlayerStats {
    const now = Date.now();
    
    const newStats: PersistentPlayerStats = {
      playerId: player.id,
      playerName: player.username,
      goals: 0,
      assists: 0,
      saves: 0,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      shotsOnGoal: 0,
      shotsBlocked: 0,
      hits: 0,
      penaltyMinutes: 0,
      winRate: 0,
      pointsPerGame: 0,
      savesPerGame: 0,
      firstGameDate: now,
      lastGameDate: now,
      lastUpdated: now
    };
    
    // Cache the new stats
    this._playerStatsCache.set(player.id, newStats);
    
    return newStats;
  }

  /**
   * Recalculate derived statistics
   */
  private _recalculateStats(stats: PersistentPlayerStats): void {
    const totalGames = stats.gamesPlayed;
    
    if (totalGames > 0) {
      stats.winRate = (stats.wins / totalGames) * 100;
      stats.pointsPerGame = (stats.goals + stats.assists) / totalGames;
      stats.savesPerGame = stats.saves / totalGames;
    } else {
      stats.winRate = 0;
      stats.pointsPerGame = 0;
      stats.savesPerGame = 0;
    }
  }

  /**
   * Validate that loaded data has the expected structure
   */
  private _isValidStatsData(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    
    const requiredFields = [
      'playerId', 'playerName', 'goals', 'assists', 'saves', 
      'wins', 'losses', 'gamesPlayed'
    ];
    
    return requiredFields.every(field => field in data);
  }
} 