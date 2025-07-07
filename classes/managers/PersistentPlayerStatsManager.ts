import { Player, PersistenceManager } from 'hytopia';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

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

export interface GlobalLeaderboardData {
  players: PersistentPlayerStats[];
  lastUpdated: number;
  [key: string]: any; // Make it compatible with Record<string, unknown>
}

export class PersistentPlayerStatsManager {
  private static _instance: PersistentPlayerStatsManager;
  
  // Cache for loaded player stats to avoid repeated database hits
  private _playerStatsCache: Map<string, PersistentPlayerStats> = new Map();
  
  // Track if cache is dirty and needs saving
  private _dirtyPlayers: Set<string> = new Set();
  
  // Track if global leaderboard needs updating
  private _globalLeaderboardDirty: boolean = false;
  
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
      debugLog(`Loaded cached stats for ${player.username}`, 'PersistentPlayerStatsManager');
      
      // Ensure player is in global leaderboard even if cached
      await this.ensurePlayerInGlobalLeaderboard(player);
      
      return cachedStats;
    }

    try {
      // Use the new synchronous API - no await needed
      const persistedData = player.getPersistedData();
      
      // Look for stats in the persistent data
              const statsData = persistedData?.[CONSTANTS.PERSISTENCE.PLAYER_STATS_KEY];
      
      if (statsData && this._isValidStatsData(statsData)) {
        const stats = statsData as PersistentPlayerStats;
        
        // Update player name in case it changed
        stats.playerName = player.username;
        stats.lastUpdated = Date.now();
        
        // Recalculate derived stats
        this._recalculateStats(stats);
        
        // Cache the loaded stats
        this._playerStatsCache.set(playerId, stats);
        
        debugLog(`Loaded persistent stats for ${player.username}: ${stats.gamesPlayed} games, ${stats.goals} goals, ${stats.assists} assists, ${stats.saves} saves, ${stats.wins}W-${stats.losses}L`, 'PersistentPlayerStatsManager');
        
        // Ensure player is in global leaderboard
        await this.ensurePlayerInGlobalLeaderboard(player);
        
        return stats;
      } else {
        // No existing data or invalid data, create new stats
        debugLog(`Creating new persistent stats for ${player.username}`, 'PersistentPlayerStatsManager');
        const newStats = this._createNewPlayerStats(player);
        
        // Ensure new player is added to global leaderboard
        await this.ensurePlayerInGlobalLeaderboard(player);
        
        return newStats;
      }
    } catch (error) {
      debugError(`Error loading persistent stats for player ${player.username}:`, error, 'PersistentPlayerStatsManager');
      debugLog(`Failed to load stats for ${player.username}, creating new stats`, 'PersistentPlayerStatsManager');
      
      // Create new stats as fallback
      const newStats = this._createNewPlayerStats(player);
      
      // Ensure new player is added to global leaderboard
      await this.ensurePlayerInGlobalLeaderboard(player);
      
      return newStats;
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
        debugLog(`No stats to save for player ${player.username}`, 'PersistentPlayerStatsManager');
        return false;
      }
      
      // Update timestamps and recalculate derived stats
      statsToSave.lastUpdated = Date.now();
      this._recalculateStats(statsToSave);
      
      // Use the new synchronous API - no await needed
              player.setPersistedData({ [CONSTANTS.PERSISTENCE.PLAYER_STATS_KEY]: statsToSave });
      
      // Update cache and mark as clean
      this._playerStatsCache.set(playerId, statsToSave);
      this._dirtyPlayers.delete(playerId);
      
      // Mark global leaderboard as dirty since stats changed
      this._globalLeaderboardDirty = true;
      
      debugLog(`Saved persistent stats for ${player.username}: ${statsToSave.gamesPlayed} games, ${statsToSave.goals} goals, ${statsToSave.assists} assists, ${statsToSave.saves} saves, ${statsToSave.wins}W-${statsToSave.losses}L`, 'PersistentPlayerStatsManager');
      
      // Update global leaderboard with this player's stats
      await this._updateGlobalLeaderboard(statsToSave);
      
      return true;
    } catch (error) {
      debugError(`Error saving persistent stats for player ${player.username}:`, error, 'PersistentPlayerStatsManager');
      return false;
    }
  }

  /**
   * Get cached stats for a player (loads if not cached)
   */
  public getPlayerStats(player: Player): Promise<PersistentPlayerStats> {
    const playerId = player.id;
    
    if (this._playerStatsCache.has(playerId)) {
      return Promise.resolve(this._playerStatsCache.get(playerId)!);
    }
    
    return this.loadPlayerStats(player);
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
    this._globalLeaderboardDirty = true;
    
    debugLog(`Updated stats for ${player.username}: ${JSON.stringify(updates)}`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a goal for a player
   */
  public async recordGoal(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.goals += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded goal for ${player.username}: ${currentStats.goals} total`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record an assist for a player
   */
  public async recordAssist(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.assists += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded assist for ${player.username}: ${currentStats.assists} total`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a save for a player
   */
  public async recordSave(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.saves += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded save for ${player.username}: ${currentStats.saves} total`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a win for a player
   */
  public async recordWin(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.wins += 1;
    currentStats.gamesPlayed += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded win for ${player.username}: ${currentStats.wins}W-${currentStats.losses}L`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a loss for a player
   */
  public async recordLoss(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.losses += 1;
    currentStats.gamesPlayed += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded loss for ${player.username}: ${currentStats.wins}W-${currentStats.losses}L`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a shot on goal for a player
   */
  public async recordShotOnGoal(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.shotsOnGoal += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded shot on goal for ${player.username}: ${currentStats.shotsOnGoal} total`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a hit for a player
   */
  public async recordHit(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.hits += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded hit for ${player.username}: ${currentStats.hits} total`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a conditional win for a player (only if they qualify for GP)
   */
  public async recordConditionalWin(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.wins += 1;
    currentStats.gamesPlayed += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded conditional win for ${player.username}: ${currentStats.wins}W-${currentStats.losses}L`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a conditional loss for a player (only if they qualify for GP)
   */
  public async recordConditionalLoss(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.losses += 1;
    currentStats.gamesPlayed += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded conditional loss for ${player.username}: ${currentStats.wins}W-${currentStats.losses}L`, 'PersistentPlayerStatsManager');
  }

  /**
   * Record a conditional game played for a player (tie game, only if they qualify for GP)
   */
  public async recordConditionalGamePlayed(player: Player): Promise<void> {
    const currentStats = await this.getPlayerStats(player);
    currentStats.gamesPlayed += 1;
    this._dirtyPlayers.add(player.id);
    this._globalLeaderboardDirty = true;
    debugLog(`Recorded conditional game played for ${player.username}: ${currentStats.gamesPlayed} total games`, 'PersistentPlayerStatsManager');
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
        debugLog(`Player ID ${playerId} needs stats saved but no Player object available`, 'PersistentPlayerStatsManager');
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
   * Get leaderboard data for top players - now uses global persistent data
   */
  public async getLeaderboard(limit: number = 100): Promise<PersistentPlayerStats[]> {
    try {
      // Get global leaderboard data from persistent storage
      const rawGlobalData = await PersistenceManager.instance.getGlobalData('hockey-zone-leaderboard');
      
      if (rawGlobalData && typeof rawGlobalData === 'object' && 'players' in rawGlobalData && Array.isArray(rawGlobalData.players)) {
        const globalLeaderboardData = rawGlobalData as unknown as GlobalLeaderboardData;
        // Return the top players from global data
        return globalLeaderboardData.players.slice(0, limit);
      }
      
      // Fallback to cached data if global data is not available
      debugWarn('Global leaderboard data not available, falling back to cached data', 'PersistentPlayerStatsManager');
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
    } catch (error) {
      debugError('Error getting leaderboard data:', error, 'PersistentPlayerStatsManager');
      
      // Fallback to cached data
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
  }

  /**
   * Update the global leaderboard with a player's stats
   */
  private async _updateGlobalLeaderboard(playerStats: PersistentPlayerStats): Promise<void> {
    try {
      // Get current global leaderboard data
      const rawGlobalData = await PersistenceManager.instance.getGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY);
      
      let globalLeaderboardData: GlobalLeaderboardData;
      
      if (rawGlobalData && typeof rawGlobalData === 'object' && 'players' in rawGlobalData && Array.isArray(rawGlobalData.players)) {
        globalLeaderboardData = rawGlobalData as unknown as GlobalLeaderboardData;
      } else {
        globalLeaderboardData = {
          players: [],
          lastUpdated: Date.now()
        };
      }
      
      // Find existing player in leaderboard
      const existingPlayerIndex = globalLeaderboardData.players.findIndex(
        (p: PersistentPlayerStats) => p.playerId === playerStats.playerId
      );
      
      if (existingPlayerIndex >= 0) {
        // Update existing player
        globalLeaderboardData.players[existingPlayerIndex] = { ...playerStats };
      } else {
        // Add new player
        globalLeaderboardData.players.push({ ...playerStats });
      }
      
      // Sort players by total points (goals + assists), then by wins
      globalLeaderboardData.players.sort((a: PersistentPlayerStats, b: PersistentPlayerStats) => {
        const aPoints = a.goals + a.assists;
        const bPoints = b.goals + b.assists;
        
        if (aPoints !== bPoints) {
          return bPoints - aPoints; // Higher points first
        }
        
        return b.wins - a.wins; // Then by wins
      });
      
      // Keep only top 100 players to avoid data bloat
      globalLeaderboardData.players = globalLeaderboardData.players.slice(0, 100);
      globalLeaderboardData.lastUpdated = Date.now();
      
      // Save updated leaderboard
      await PersistenceManager.instance.setGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY, globalLeaderboardData as Record<string, unknown>);
      
      this._globalLeaderboardDirty = false;
      
      debugLog(`Updated global leaderboard with ${playerStats.playerName}'s stats`, 'PersistentPlayerStatsManager');
      
    } catch (error) {
      debugError('Error updating global leaderboard:', error, 'PersistentPlayerStatsManager');
    }
  }

  /**
   * Force refresh the global leaderboard from all cached players
   */
  public async refreshGlobalLeaderboard(): Promise<void> {
    try {
      const allCachedStats = Array.from(this._playerStatsCache.values());
      
      for (const playerStats of allCachedStats) {
        await this._updateGlobalLeaderboard(playerStats);
      }
      
      debugLog(`Refreshed global leaderboard with ${allCachedStats.length} players`, 'PersistentPlayerStatsManager');
    } catch (error) {
      debugError('Error refreshing global leaderboard:', error, 'PersistentPlayerStatsManager');
    }
  }

  /**
   * Initialize global leaderboard if it doesn't exist
   */
  public async initializeGlobalLeaderboard(): Promise<void> {
    try {
      const rawGlobalData = await PersistenceManager.instance.getGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY);
      
      if (!rawGlobalData || typeof rawGlobalData !== 'object' || !('players' in rawGlobalData)) {
        // Create initial empty leaderboard
        const initialLeaderboard: GlobalLeaderboardData = {
          players: [],
          lastUpdated: Date.now()
        };
        
        await PersistenceManager.instance.setGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY, initialLeaderboard as Record<string, unknown>);
        debugLog('Initialized empty global leaderboard', 'PersistentPlayerStatsManager');
      }
    } catch (error) {
      debugError('Error initializing global leaderboard:', error, 'PersistentPlayerStatsManager');
    }
  }

  /**
   * Ensure player is added to global leaderboard when they first join
   */
  public async ensurePlayerInGlobalLeaderboard(player: Player): Promise<void> {
    try {
      const playerStats = await this.getPlayerStats(player);
      
      // Check if player is already in global leaderboard
      const rawGlobalData = await PersistenceManager.instance.getGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY);
      
      if (rawGlobalData && typeof rawGlobalData === 'object' && 'players' in rawGlobalData && Array.isArray(rawGlobalData.players)) {
        const globalLeaderboardData = rawGlobalData as unknown as GlobalLeaderboardData;
        
        const playerExists = globalLeaderboardData.players.some(p => p.playerId === player.id);
        
        if (!playerExists) {
          // Add player to global leaderboard
          await this._updateGlobalLeaderboard(playerStats);
          debugLog(`Added ${player.username} to global leaderboard`, 'PersistentPlayerStatsManager');
        }
      } else {
        // No global leaderboard exists, initialize it and add player
        await this.initializeGlobalLeaderboard();
        await this._updateGlobalLeaderboard(playerStats);
        debugLog(`Created global leaderboard and added ${player.username}`, 'PersistentPlayerStatsManager');
      }
    } catch (error) {
      debugError(`Error ensuring player ${player.username} is in global leaderboard:`, error, 'PersistentPlayerStatsManager');
    }
  }

  /**
   * Clear cache for a player (useful when they disconnect)
   */
  public clearPlayerFromCache(playerId: string): void {
    this._playerStatsCache.delete(playerId);
    this._dirtyPlayers.delete(playerId);
    debugLog(`Cleared cache for player ${playerId}`, 'PersistentPlayerStatsManager');
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