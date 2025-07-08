/**
 * AudioManager handles all ambient sound scheduling and background music
 * Enhanced with proper audio object lifecycle management and memory cleanup
 * Now includes pooled audio system for efficient sound effect reuse
 * Extracted from index.ts section 9. AUDIO MANAGEMENT
 */

import { Audio, Entity, World } from 'hytopia';
import { debugLog, debugError, debugWarn, setAudioDebugFilter } from '../utils/constants';
import { HockeyGameState } from '../utils/types';
import * as CONSTANTS from '../utils/constants';

interface ManagedAudio {
  audio: Audio;
  createdAt: number;
  type: 'ambient' | 'effect' | 'music';
  uri: string;
  cleanup?: () => void;
  id: string; // Unique identifier for tracking
}

interface PooledAudio {
  audio: Audio;
  uri: string;
  isPlaying: boolean;
  lastUsed: number;
  attachedEntity?: Entity;
}

interface AudioDebugInfo {
  totalAudiosInWorld: number;
  managedAudios: number;
  unmanagedAudios: number;
  entityAttachedAudios: number;
  loopedAudios: number;
  oneshotAudios: number;
  memoryEstimate: number; // Estimated memory usage in MB
  oldestAudio: { age: number; uri: string } | null;
  typeBreakdown: Record<string, number>;
  pooledAudios?: number;
  poolUtilization?: Record<string, number>;
  continuousAudios?: number;
}

export class AudioManager {
  private static _instance: AudioManager | null = null;
  
  // Ambient sound scheduling state
  private nextCrowdChantTime: number = 0;
  private nextPercussionTime: number = 0;
  private nextStompBeatTime: number = 0;
  private world: World | null = null;
  
  // Audio object management
  private activeAudioInstances: Set<ManagedAudio> = new Set();
  private lastGlobalSoundTime: number = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // NEW: Audio pooling system
  private audioPool: Map<string, PooledAudio[]> = new Map();
  private maxPoolSize: number = 2; // Reduced from 3 to 2 to limit memory usage
  private poolCleanupInterval: NodeJS.Timeout | null = null;
  
  // NEW: Continuous looped audio system for global sounds (not entity-specific)
  private continuousAudios: Map<string, Audio> = new Map(); // soundUri -> Audio (global sounds only)
  
  // Track which players are currently skating for global ice skating sound
  private skatingPlayers: Set<string> = new Set(); // player entity IDs
  
  // Enhanced debugging
  private debugInterval: NodeJS.Timeout | null = null;
  private audioCreationCount: number = 0;
  private audioCleanupCount: number = 0;
  private maxSimultaneousAudios: number = 0;
  private degradationDetected: boolean = false;
  private lastAudioAnalysis: AudioDebugInfo | null = null;
  
  // NEW: Multi-player scaling optimizations
  private playerCount: number = 1; // Track active player count for dynamic scaling
  
  // Initialization state
  private isInitialized: boolean = false;
  
  // NEW: Dynamic scaling constants based on player count
  private readonly MAX_TOTAL_AUDIO_INSTANCES = 15; // Base limit for 1-2 players
  private readonly AGGRESSIVE_CLEANUP_THRESHOLD = 20; // Base threshold
  private readonly POOL_CLEANUP_FREQUENCY = 10000; // Clean up pools every 10 seconds
  private readonly ENTITY_AUDIO_MAX_AGE = 15000; // Maximum age for entity audio (15 seconds)
  
  // NEW: Multi-player scaling methods
  private getScaledMaxInstances(): number {
    // Scale more conservatively for multiplayer
    const baseLimit = this.MAX_TOTAL_AUDIO_INSTANCES;
    if (this.playerCount <= 2) return baseLimit;
    if (this.playerCount <= 6) return Math.min(baseLimit + 5, 20); // Max 20 for 3-6 players
    return Math.min(baseLimit + 8, 25); // Max 25 for 7+ players (much more conservative)
  }
  
  private getScaledCleanupThreshold(): number {
    const scaledMax = this.getScaledMaxInstances();
    return Math.max(scaledMax - 5, 10); // Trigger cleanup 5 instances before limit
  }
  
  private getScaledEntityAudioMaxAge(): number {
    // Shorter entity audio lifespan with more players
    const baseAge = this.ENTITY_AUDIO_MAX_AGE;
    if (this.playerCount <= 2) return baseAge;
    if (this.playerCount <= 6) return baseAge * 0.75; // 11.25 seconds for 3-6 players
    return baseAge * 0.5; // 7.5 seconds for 7+ players
  }
  
  // Private constructor for singleton pattern
  private constructor() {}
  
  public static get instance(): AudioManager {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager();
    }
    return AudioManager._instance;
  }
  
  /**
   * Initialize the audio manager with a world instance
   * @param world - The game world instance
   */
  public initialize(world: World): void {
    if (this.isInitialized) {
      CONSTANTS.debugWarn('AudioManager already initialized - skipping duplicate initialization to prevent ambient sound duplication', 'AudioManager');
      return;
    }
    
    this.world = world;
    this.startAmbientSounds();
    this.startCleanupTimer();
    this.startDebugMonitoring();
    this.startPoolCleanup();
    this.isInitialized = true;
    CONSTANTS.debugLog('Audio manager initialized with pooled audio system and enhanced memory management', 'AudioManager');
    
    // Show helpful console instructions for audio debugging
    setTimeout(() => {
          debugLog('🎵 AUDIO DEBUG HELPER:');
    debugLog('💡 To show ONLY AudioManager logs, type: audioon');
    debugLog('💡 To show all logs again, type: audiooff');
    debugLog('💡 Alternative: setAudioDebugFilter(true/false)');
    }, 1000); // Delay so it shows after initial startup logs
  }
  
  /**
   * Start comprehensive audio debugging and monitoring
   */
  private startDebugMonitoring(): void {
    // Monitor audio health every 3 seconds (more frequent for better optimization)
    this.debugInterval = setInterval(() => {
      this.performAudioAnalysis();
    }, 3000);
    
    CONSTANTS.debugLog('Audio debugging monitoring started', 'AudioManager');
  }

  /**
   * Start pool cleanup timer to manage pooled audio instances
   */
  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(() => {
      this.cleanupAudioPool();
    }, this.POOL_CLEANUP_FREQUENCY); // Clean up pool every 10 seconds (more aggressive)
    
    CONSTANTS.debugLog('Audio pool cleanup started with aggressive 10s frequency', 'AudioManager');
  }

  /**
   * Clean up old pooled audio instances using official AudioManager methods
   */
  private cleanupOldPooledAudios(): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      // Get all oneshot audios from the official AudioManager
      const oneshotAudios = this.world.audioManager.getAllOneshotAudios();
      const now = Date.now();
      const maxAge = 30000; // 30 seconds
      
      // Find old pooled audio instances
      const oldPooledAudios = [];
      
      for (const [uri, pool] of this.audioPool.entries()) {
        for (const pooled of pool) {
          if (!pooled.isPlaying && (now - pooled.lastUsed > maxAge)) {
            // Find the corresponding audio in the world's audio manager
            const worldAudio = oneshotAudios.find((audio: any) => {
              return audio.uri === uri && !audio.isLooped;
            });
            
            if (worldAudio) {
              oldPooledAudios.push({ pooled, worldAudio });
            }
          }
        }
      }
      
      // Unregister old pooled audios using the official method
      for (const { pooled, worldAudio } of oldPooledAudios) {
        try {
          this.world.audioManager.unregisterAudio(worldAudio);
          
          // Remove from our pool tracking
          const pool = this.audioPool.get(pooled.uri);
          if (pool) {
            const updatedPool = pool.filter(p => p !== pooled);
            if (updatedPool.length === 0) {
              this.audioPool.delete(pooled.uri);
            } else {
              this.audioPool.set(pooled.uri, updatedPool);
            }
          }
        } catch (error) {
          CONSTANTS.debugError(`Error unregistering pooled audio ${pooled.uri}`, error, 'AudioManager');
        }
      }
      
      if (oldPooledAudios.length > 0) {
        CONSTANTS.debugLog(`Cleaned up ${oldPooledAudios.length} old pooled audio instances using official AudioManager`, 'AudioManager');
      }
    } catch (error) {
      CONSTANTS.debugError('Error in cleanupOldPooledAudios', error, 'AudioManager');
    }
  }

  /**
   * Clean up unused pooled audio instances
   */
     private cleanupAudioPool(): void {
     // First try the enhanced cleanup using official AudioManager methods
     this.cleanupOldPooledAudios();
     
     // Clean up continuous audios
     this.cleanupContinuousAudios();
     
     // NEW: Clean up entity-attached audios based on player count
     this.cleanupEntityAttachedAudios();
     
     // Less aggressive pool cleanup - keep instances longer for better reuse
     const now = Date.now();
     const maxAge = 45000; // Increased from 20 seconds to 45 seconds
    
    for (const [uri, pool] of this.audioPool.entries()) {
      const activePool = pool.filter(pooled => {
        const isOld = now - pooled.lastUsed > maxAge;
        const shouldKeep = pooled.isPlaying || !isOld;
        
        if (!shouldKeep) {
          try {
            pooled.audio.pause();
          } catch (error) {
            // Audio might already be cleaned up
          }
        }
        
        return shouldKeep;
      });
      
      // Always keep at least 1 instance per pool for better reuse
      if (activePool.length === 0 && pool.length > 0) {
        // Keep the most recently used instance
        const mostRecent = pool.reduce((newest, current) => 
          current.lastUsed > newest.lastUsed ? current : newest
        );
        activePool.push(mostRecent);
        CONSTANTS.debugLog(`Kept 1 instance of ${uri.split('/').pop()} pool for reuse`, 'AudioManager');
      }
      
      if (activePool.length === 0) {
        this.audioPool.delete(uri);
      } else {
        this.audioPool.set(uri, activePool);
      }
    }
    
    // NEW: Check total audio instance count and trigger aggressive cleanup if needed
    if (this.world) {
      const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
      if (allAudios.length > this.getScaledCleanupThreshold()) {
        CONSTANTS.debugLog(`Total audio instances (${allAudios.length}) exceeds threshold (${this.getScaledCleanupThreshold()}), triggering aggressive cleanup`, 'AudioManager');
        this.aggressiveInstanceCleanup();
      }
    }
  }

  /**
   * Aggressive cleanup when too many audio instances exist
   */
  private aggressiveInstanceCleanup(): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      // Get all audio instances
      const allAudios = this.world.audioManager.getAllAudios();
      const oneshotAudios = this.world.audioManager.getAllOneshotAudios();
      
      // Sort oneshot audios by age (oldest first)
      const sortedOneshots = oneshotAudios
        .filter((audio: any) => audio.createdAt)
        .sort((a: any, b: any) => a.createdAt - b.createdAt);
      
      // Remove oldest 60% of oneshot audios if we have too many
      const targetCleanupCount = Math.min(
        Math.floor(sortedOneshots.length * 0.6), 
        allAudios.length - this.getScaledMaxInstances()
      );
      
      const toCleanup = sortedOneshots.slice(0, targetCleanupCount);
      
      for (const audio of toCleanup) {
        try {
          this.world.audioManager.unregisterAudio(audio);
        } catch (error) {
          // Continue with cleanup even if one fails
        }
      }
      
      // Also clean up old entity-attached audios
      const entityAudios = allAudios.filter((audio: any) => 
        audio.attachedToEntity && 
        audio.createdAt && 
        (Date.now() - audio.createdAt > this.getScaledEntityAudioMaxAge())
      );
      
      for (const audio of entityAudios) {
        try {
          this.world.audioManager.unregisterAudio(audio);
        } catch (error) {
          // Continue with cleanup
        }
      }
      
      const totalCleaned = toCleanup.length + entityAudios.length;
      if (totalCleaned > 0) {
        CONSTANTS.debugLog(`Aggressive cleanup: removed ${totalCleaned} audio instances (${toCleanup.length} oneshots, ${entityAudios.length} entity audios)`, 'AudioManager');
      }
    } catch (error) {
      CONSTANTS.debugError('Error in aggressive instance cleanup', error, 'AudioManager');
    }
  }

  /**
   * Get or create a pooled audio instance for reuse
   */
  private getPooledAudio(uri: string, config: any): PooledAudio | null {
    if (!this.world) return null;

    // Get existing pool for this URI
    let pool = this.audioPool.get(uri) || [];
    
    // Clean up any pooled audio with invalid entity references
    pool = pool.filter(pooled => {
      if (pooled.attachedEntity && !pooled.attachedEntity.isSpawned) {
        CONSTANTS.debugLog(`Cleaning up pooled audio with invalid entity reference for ${uri.split('/').pop()}`, 'AudioManager');
        try {
          pooled.audio.pause();
        } catch (error) {
          // Continue with cleanup
        }
        return false; // Remove this pooled audio
      }
      return true; // Keep this pooled audio
    });
    
    // Update the pool after cleanup
    if (pool.length === 0) {
      this.audioPool.delete(uri);
    } else {
      this.audioPool.set(uri, pool);
    }
    
    // Find an available (not playing) audio instance - prioritize reuse
    let availableAudio = pool.find(pooled => !pooled.isPlaying);
    
    if (availableAudio) {
      // Reuse the available audio instance
      availableAudio.isPlaying = true;
      availableAudio.lastUsed = Date.now();
      // Update entity reference if provided - with validation
      if (config.attachedToEntity && config.attachedToEntity.isSpawned) {
        availableAudio.attachedEntity = config.attachedToEntity;
      } else {
        availableAudio.attachedEntity = undefined; // Clear invalid entity reference
      }
      return availableAudio;
    }
    
    // Check total audio instance count before creating new ones
    const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
    if (allAudios.length >= this.getScaledMaxInstances()) {
      // Force reuse of an existing instance if we're at the limit
      if (pool.length > 0) {
        const oldestAudio = pool.reduce((oldest, current) => 
          current.lastUsed < oldest.lastUsed ? current : oldest
        );
        
        try {
          oldestAudio.audio.pause(); // Stop the current playback
        } catch (error) {
          // Continue with reuse
        }
        
        oldestAudio.isPlaying = true;
        oldestAudio.lastUsed = Date.now();
        // Update entity reference if provided - with validation
        if (config.attachedToEntity && config.attachedToEntity.isSpawned) {
          oldestAudio.attachedEntity = config.attachedToEntity;
        } else {
          oldestAudio.attachedEntity = undefined; // Clear invalid entity reference
        }
        CONSTANTS.debugLog(`Forced reuse of pooled audio for ${uri.split('/').pop()} (at instance limit)`, 'AudioManager');
        return oldestAudio;
      }
      
      // No pool exists and we're at limit - deny creation
      CONSTANTS.debugLog(`Cannot create new pooled audio for ${uri.split('/').pop()} - at instance limit (${allAudios.length}/${this.getScaledMaxInstances()})`, 'AudioManager');
      return null;
    }
    
    // Create new audio instance if pool isn't full and we're under the global limit
    if (pool.length < this.maxPoolSize) {
      try {
        // Validate entity before creating audio
        const entityToAttach = config.attachedToEntity;
        if (entityToAttach && !entityToAttach.isSpawned) {
          CONSTANTS.debugLog(`Entity not spawned when creating pooled audio for ${uri.split('/').pop()}, creating as global sound`, 'AudioManager');
          // Remove entity attachment for this creation
          config = { ...config };
          delete config.attachedToEntity;
        }
        
        // Create audio instance directly - bypass managed audio system for pooled audio
        const newAudio = new Audio({
          uri: uri,
          volume: config.volume || 0.5,
          playbackRate: config.playbackRate || 1.0,
          attachedToEntity: config.attachedToEntity,
          referenceDistance: config.referenceDistance
        });
        
        const pooledAudio: PooledAudio = {
          audio: newAudio,
          uri: uri,
          isPlaying: true,
          lastUsed: Date.now(),
          attachedEntity: config.attachedToEntity
        };
        
        pool.push(pooledAudio);
        this.audioPool.set(uri, pool);
        
        CONSTANTS.debugLog(`Created pooled audio for ${uri.split('/').pop()} (pool: ${pool.length}/${this.maxPoolSize}, total: ${allAudios.length + 1}/${this.getScaledMaxInstances()})`, 'AudioManager');
        return pooledAudio;
      } catch (error) {
        CONSTANTS.debugError('Error creating new pooled audio', error, 'AudioManager');
        return null;
      }
    }
    
    // Pool is full - force reuse of the least recently used instance
    if (pool.length > 0) {
      // Find the least recently used instance (prefer non-playing ones)
      let oldestAudio = pool.find(p => !p.isPlaying);
      if (!oldestAudio) {
        // All are playing, use the oldest one
        oldestAudio = pool.reduce((oldest, current) => 
          current.lastUsed < oldest.lastUsed ? current : oldest
        );
      }
      
      try {
        oldestAudio.audio.pause(); // Stop the current playback before reuse
      } catch (error) {
        // Continue with reuse
      }
      
      // Reuse this instance
      oldestAudio.isPlaying = true;
      oldestAudio.lastUsed = Date.now();
      // Update entity reference if provided - with validation
      if (config.attachedToEntity && config.attachedToEntity.isSpawned) {
        oldestAudio.attachedEntity = config.attachedToEntity;
      } else {
        oldestAudio.attachedEntity = undefined; // Clear invalid entity reference
      }
      CONSTANTS.debugLog(`Reusing pooled audio for ${uri.split('/').pop()} (pool full)`, 'AudioManager');
      return oldestAudio;
    }
    
    return null;
  }

  /**
   * Play a sound effect using the pooled audio system
   */
  public playPooledSoundEffect(uri: string, config: any = {}): boolean {
    if (!this.world) return false;
    
    // CRITICAL: Enhanced entity validation before proceeding
    if (config.attachedToEntity) {
      const entity = config.attachedToEntity;
      
      // Check if entity exists and is spawned
      if (!entity || !entity.isSpawned) {
        CONSTANTS.debugLog(`Entity not spawned for ${uri.split('/').pop()}, skipping audio (entity cleanup)`, 'AudioManager');
        // Don't play as global sound - just skip to prevent audio spam from despawned entities
        return false;
      }
    }
    
    // Get pooled audio instance (no cooldown or limit checks for pooled audio)
    const pooledAudio = this.getPooledAudio(uri, config);
    if (!pooledAudio) {
      return false;
    }
    
    try {
      // CRITICAL: Final entity validity check with more robust validation
      const hasValidEntity = pooledAudio.attachedEntity && 
                            typeof pooledAudio.attachedEntity === 'object' && 
                            pooledAudio.attachedEntity.isSpawned === true;
      
      if (hasValidEntity) {
        // Entity is valid, play attached audio
        try {
          pooledAudio.audio.play(this.world, true);
        } catch (entityError) {
          // Entity became invalid during play call - check if it's a despawned entity error
          const errorMessage = entityError instanceof Error ? entityError.message : String(entityError);
          if (errorMessage.includes('not spawned') || errorMessage.includes('undefined')) {
            CONSTANTS.debugLog(`Entity despawned during play for ${uri.split('/').pop()}, skipping audio`, 'AudioManager');
            pooledAudio.isPlaying = false;
            return false;
          }
          // For other errors, fall back to global sound
          CONSTANTS.debugLog(`Entity became invalid during play for ${uri.split('/').pop()}, playing as global sound`, 'AudioManager');
          pooledAudio.audio.play(this.world, true);
        }
      } else {
        // Entity is undefined, null, or not spawned
        if (pooledAudio.attachedEntity) {
          CONSTANTS.debugLog(`Pooled audio entity not spawned for ${uri.split('/').pop()}, skipping audio (entity cleanup)`, 'AudioManager');
          pooledAudio.isPlaying = false;
          return false;
        }
        // If no entity was attached, play as global sound
        pooledAudio.audio.play(this.world, true);
      }
      
      // Set up completion handler to mark as not playing - use shorter durations
      const duration = config.duration || 1500; // Reduced from 2000 to 1500ms default
      setTimeout(() => {
        pooledAudio.isPlaying = false;
      }, duration);
      
      // Don't update lastGlobalSoundTime for pooled audio - keep it independent
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      CONSTANTS.debugAudioError(`Error playing pooled audio for ${uri.split('/').pop()}: ${errorMessage}`, error, 'AudioManager');
      pooledAudio.isPlaying = false;
      return false;
    }
  }
  
  /**
   * Perform comprehensive audio analysis using Hytopia's built-in methods
   */
  private performAudioAnalysis(): void {
    if (!this.world) return;
    
    try {
      // Use Hytopia's built-in audio analysis methods
      const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
      const loopedAudios = (this.world as any).audioManager?.getAllLoopedAudios() || [];
      const oneshotAudios = (this.world as any).audioManager?.getAllOneshotAudios() || [];
      
      const debugInfo: AudioDebugInfo = {
        totalAudiosInWorld: allAudios.length,
        managedAudios: this.activeAudioInstances.size,
        unmanagedAudios: Math.max(0, allAudios.length - this.activeAudioInstances.size - this.getTotalPooledAudios()),
        entityAttachedAudios: this.countEntityAttachedAudios(allAudios),
        loopedAudios: loopedAudios.length,
        oneshotAudios: oneshotAudios.length,
        memoryEstimate: this.estimateAudioMemoryUsage(allAudios),
        oldestAudio: this.findOldestManagedAudio(),
        typeBreakdown: this.getTypeBreakdown(),
               pooledAudios: this.getTotalPooledAudios(),
       poolUtilization: this.getPoolUtilization(),
       continuousAudios: this.continuousAudios.size
     };
      
      this.lastAudioAnalysis = debugInfo;
      
      // Track maximum simultaneous audios
      if (debugInfo.totalAudiosInWorld > this.maxSimultaneousAudios) {
        this.maxSimultaneousAudios = debugInfo.totalAudiosInWorld;
      }
      
      // Detect audio degradation and take corrective action
      this.detectAudioDegradation(debugInfo, allAudios);
      
      // Log detailed info every 30 seconds or if issues detected
      const shouldLogDetailed = Date.now() % 30000 < 5000 || this.degradationDetected;
      
      if (shouldLogDetailed) {
        this.logDetailedAudioInfo(debugInfo);
      }
      
    } catch (error) {
      CONSTANTS.debugError('Error during audio analysis', error, 'AudioManager');
    }
  }
  
  /**
   * Count entity-attached audio instances
   */
  private countEntityAttachedAudios(allAudios: any[]): number {
    return allAudios.filter(audio => {
      return audio.attachedToEntity !== undefined && audio.attachedToEntity !== null;
    }).length;
  }
  
  /**
   * Estimate memory usage of audio instances
   */
  private estimateAudioMemoryUsage(allAudios: any[]): number {
    // Rough estimate: each audio instance uses ~0.5-2MB depending on length and quality
    // This is a heuristic estimation
    return Math.round((allAudios.length * 1.2) * 100) / 100; // Average 1.2MB per audio
  }
  
  /**
   * Find the oldest managed audio for debugging
   */
  private findOldestManagedAudio(): { age: number; uri: string } | null {
    if (this.activeAudioInstances.size === 0) return null;
    
    const oldest = Array.from(this.activeAudioInstances)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    
    return {
      age: Date.now() - oldest.createdAt,
      uri: oldest.uri
    };
  }
  
  /**
   * Get type breakdown of managed audios
   */
  private getTypeBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    this.activeAudioInstances.forEach(managed => {
      breakdown[managed.type] = (breakdown[managed.type] || 0) + 1;
    });
    return breakdown;
  }

  /**
   * Get total number of pooled audio instances
   */
  private getTotalPooledAudios(): number {
    let total = 0;
    for (const pool of this.audioPool.values()) {
      total += pool.length;
    }
    return total;
  }

  /**
   * Get pool utilization statistics
   */
  private getPoolUtilization(): Record<string, number> {
    const utilization: Record<string, number> = {};
    for (const [uri, pool] of this.audioPool.entries()) {
      const playing = pool.filter(p => p.isPlaying).length;
      utilization[uri] = pool.length > 0 ? Math.round((playing / pool.length) * 100) : 0;
    }
    return utilization;
  }
  
  /**
   * Detect audio degradation and take corrective action
   */
  private detectAudioDegradation(debugInfo: AudioDebugInfo, allAudios: any[]): void {
    const isMemoryHigh = debugInfo.memoryEstimate > 15; // Reduced from 20MB to 15MB threshold
    const tooManyInstances = allAudios.length > this.getScaledCleanupThreshold(); // Use scaled threshold
    const tooManyUnmanaged = debugInfo.unmanagedAudios > debugInfo.managedAudios + 5; // Allow fewer unmanaged
    const tooManyLooped = debugInfo.loopedAudios > 8; // Reduced from higher threshold
    
    if (isMemoryHigh || tooManyInstances || tooManyUnmanaged || tooManyLooped) {
      if (!this.degradationDetected) {
        CONSTANTS.debugWarn('🚨 AUDIO DEGRADATION DETECTED:', 'AudioManager');
        if (isMemoryHigh) CONSTANTS.debugWarn(`  - High memory usage: ${debugInfo.memoryEstimate.toFixed(1)}MB`, 'AudioManager');
        if (tooManyInstances) CONSTANTS.debugWarn(`  - Too many audio instances: ${allAudios.length}`, 'AudioManager');
        if (tooManyUnmanaged) CONSTANTS.debugWarn(`  - More unmanaged audios (${debugInfo.unmanagedAudios}) than managed (${debugInfo.managedAudios})`, 'AudioManager');
        if (tooManyLooped) CONSTANTS.debugWarn(`  - Many looped audios: ${debugInfo.loopedAudios}`, 'AudioManager');
        CONSTANTS.debugWarn('Performing emergency audio cleanup...', 'AudioManager');
        this.degradationDetected = true;
      }
      
      // Always perform aggressive cleanup when degradation is detected
      this.aggressiveInstanceCleanup();
      this.emergencyAudioCleanup();
    } else if (this.degradationDetected) {
      // Audio system has recovered
      CONSTANTS.debugLog('✅ Audio system recovered from degradation', 'AudioManager');
      this.degradationDetected = false;
    }
  }
  
  /**
   * Emergency cleanup when degradation is detected
   */
  private emergencyAudioCleanup(): void {
    CONSTANTS.debugWarn('Performing emergency audio cleanup...', 'AudioManager');
    
    // First try the enhanced cleanup using official AudioManager methods
    this.enhancedEmergencyCleanup();
    
    // Then clean up very old managed audios immediately
    const now = Date.now();
    const oldInstances = Array.from(this.activeAudioInstances).filter(
      managed => now - managed.createdAt > 120000 // Older than 2 minutes
    );

    oldInstances.forEach(managed => {
      CONSTANTS.debugWarn(`Emergency cleanup of old audio: ${managed.uri} (${Math.round((now - managed.createdAt) / 1000)}s old)`, 'AudioManager');
      this.cleanupManagedAudio(managed);
    });

    // If we still have too many, force cleanup of effect sounds
    if (this.activeAudioInstances.size > CONSTANTS.AUDIO_PERFORMANCE.MAX_CONCURRENT_SOUNDS) {
      const effectSounds = Array.from(this.activeAudioInstances)
        .filter(managed => managed.type === 'effect')
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, Math.floor(this.activeAudioInstances.size / 2));
      
      effectSounds.forEach(managed => {
        CONSTANTS.debugWarn(`Emergency cleanup of effect sound: ${managed.uri}`, 'AudioManager');
        this.cleanupManagedAudio(managed);
      });
    }
  }
  
  /**
   * Log detailed audio information
   */
  private logDetailedAudioInfo(debugInfo: AudioDebugInfo): void {
    CONSTANTS.debugLog('📊 DETAILED AUDIO ANALYSIS:', 'AudioManager');
    CONSTANTS.debugLog(`  Total Audios in World: ${debugInfo.totalAudiosInWorld}`, 'AudioManager');
    CONSTANTS.debugLog(`  Managed: ${debugInfo.managedAudios} | Unmanaged: ${debugInfo.unmanagedAudios}`, 'AudioManager');
    CONSTANTS.debugLog(`  Pooled Instances: ${debugInfo.pooledAudios || 0}`, 'AudioManager');
    CONSTANTS.debugLog(`  Entity Attached: ${debugInfo.entityAttachedAudios}`, 'AudioManager');
    CONSTANTS.debugLog(`  Looped: ${debugInfo.loopedAudios} | One-shot: ${debugInfo.oneshotAudios}`, 'AudioManager');
    CONSTANTS.debugLog(`  Estimated Memory: ${debugInfo.memoryEstimate}MB`, 'AudioManager');
    CONSTANTS.debugLog(`  Max Simultaneous (session): ${this.maxSimultaneousAudios}`, 'AudioManager');
    CONSTANTS.debugLog(`  Creation Count: ${this.audioCreationCount} | Cleanup Count: ${this.audioCleanupCount}`, 'AudioManager');
    
    if (debugInfo.oldestAudio) {
      const ageInSeconds = Math.round(debugInfo.oldestAudio.age / 1000);
      CONSTANTS.debugLog(`  Oldest Audio: ${ageInSeconds}s (${debugInfo.oldestAudio.uri})`, 'AudioManager');
    }
    
         CONSTANTS.debugLog(`  Type Breakdown: ${JSON.stringify(debugInfo.typeBreakdown)}`, 'AudioManager');
     
     // Show continuous audios if any
     if (debugInfo.continuousAudios && debugInfo.continuousAudios > 0) {
       CONSTANTS.debugLog(`  Continuous Audios: ${debugInfo.continuousAudios}`, 'AudioManager');
     }
     
     // Show pool utilization if available
     if (debugInfo.poolUtilization && Object.keys(debugInfo.poolUtilization).length > 0) {
       CONSTANTS.debugLog(`  Pool Utilization:`, 'AudioManager');
       for (const [uri, utilization] of Object.entries(debugInfo.poolUtilization)) {
         const shortUri = uri.split('/').pop() || uri;
         CONSTANTS.debugLog(`    ${shortUri}: ${utilization}%`, 'AudioManager');
       }
     }
  }
  
  /**
   * Create a managed audio instance with automatic cleanup
   * @param config - Audio configuration
   * @param type - Type of audio for management purposes
   * @returns Managed audio instance
   */
  public createManagedAudio(config: any, type: 'ambient' | 'effect' | 'music' = 'effect'): Audio | null {
    // Global sound cooldown check
    const now = Date.now();
    if (now - this.lastGlobalSoundTime < CONSTANTS.AUDIO_PERFORMANCE.SOUND_COOLDOWN_GLOBAL) {
      CONSTANTS.debugLog(`Audio creation skipped due to global cooldown`, 'AudioManager');
      return null;
    }
    
    // Check if we're at max concurrent sounds - just skip creation instead of forcing cleanup
    if (this.activeAudioInstances.size >= CONSTANTS.AUDIO_PERFORMANCE.MAX_CONCURRENT_SOUNDS) {
      CONSTANTS.debugLog(`Audio creation skipped - max concurrent sounds reached (${this.activeAudioInstances.size})`, 'AudioManager');
      return null; // Don't force cleanup, just skip creation
    }
    
    try {
      const audio = new Audio(config);
      const audioId = `${type}_${this.audioCreationCount}_${Date.now()}`;
      const managedAudio: ManagedAudio = {
        audio,
        createdAt: now,
        type,
        uri: config.uri || 'unknown',
        id: audioId
      };
      
      this.activeAudioInstances.add(managedAudio);
      this.lastGlobalSoundTime = now;
      this.audioCreationCount++;
      
      CONSTANTS.debugLog(`Created managed audio [${audioId}] (${type}). Active: ${this.activeAudioInstances.size}`, 'AudioManager');
      return audio;
    } catch (error) {
      CONSTANTS.debugError('Failed to create managed audio', error, 'AudioManager');
      return null;
    }
  }
  
  /**
   * Play a single global audio effect (no per-player duplication)
   * @param uri - Audio file URI
   * @param volume - Volume level
   * @param attachedToEntity - Optional entity to attach to
   * @returns Whether the audio was played successfully
   */
  public playGlobalSoundEffect(uri: string, volume: number = 0.5, attachedToEntity?: Entity): boolean {
    if (!this.world) {
      CONSTANTS.debugWarn('Cannot play global sound - world not initialized', 'AudioManager');
      return false;
    }
    
    // Use pooled audio system for better performance
    return this.playPooledSoundEffect(uri, {
      volume,
      attachedToEntity,
      duration: 2000 // Default duration for sound effects
    });
  }
  
  /**
   * Clean up the oldest audio instance to make room for new ones
   * NOTE: This method is now unused - we prefer to skip creation rather than force cleanup
   */
  private cleanupOldestAudio(): void {
    if (this.activeAudioInstances.size === 0) return;
    
    const oldest = Array.from(this.activeAudioInstances)
      .filter(managed => managed.type === 'effect') // Only cleanup effect sounds, not ambient/music
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    
    if (oldest) {
      this.cleanupManagedAudio(oldest);
      CONSTANTS.debugLog('Cleaned up oldest audio instance to make room', 'AudioManager');
    }
  }
  
  /**
   * Clean up a specific managed audio instance
   * @param managedAudio - The managed audio to clean up
   */
  private cleanupManagedAudio(managedAudio: ManagedAudio): void {
    try {
      // Stop the audio if it has a stop method
      if ((managedAudio.audio as any).stop) {
        (managedAudio.audio as any).stop();
      }
      
      // Run custom cleanup if provided
      if (managedAudio.cleanup) {
        managedAudio.cleanup();
      }
      
      this.activeAudioInstances.delete(managedAudio);
      this.audioCleanupCount++;
    } catch (error) {
      CONSTANTS.debugError('Error cleaning up managed audio', error, 'AudioManager');
    }
  }
  
  /**
   * Start periodic cleanup of old audio instances
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      // Only cleanup if we have way too many managed instances (1.5x the limit)
      const excessThreshold = Math.floor(CONSTANTS.AUDIO_PERFORMANCE.MAX_CONCURRENT_SOUNDS * 1.5);
      if (this.activeAudioInstances.size > excessThreshold) {
        const now = Date.now();
        // Only clean up very old instances (older than 30 seconds)
        const instancesToCleanup = Array.from(this.activeAudioInstances)
          .filter(managed => now - managed.createdAt > 30000) // 30 seconds
          .sort((a, b) => a.createdAt - b.createdAt) // Oldest first
          .slice(0, Math.floor(this.activeAudioInstances.size * 0.1)); // Clean up at most 10% at a time
        
        instancesToCleanup.forEach(managed => this.cleanupManagedAudio(managed));
        
        if (instancesToCleanup.length > 0) {
          CONSTANTS.debugLog(`Cleaned up ${instancesToCleanup.length} very old audio instances. Active: ${this.activeAudioInstances.size}`, 'AudioManager');
        }
      }
    }, 10000); // Check every 10 seconds for much less aggressive cleanup
  }
  
  /**
   * Schedule crowd chant sound effect
   */
  private scheduleCrowdChant = (): void => {
    if (!this.world || this.nextCrowdChantTime === 0) return; // Stop if ambient sounds disabled
    
    const now = Date.now();
    
    // Use pooled audio system for better performance
    this.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.CROWD_HEY, {
      volume: CONSTANTS.AUDIO.CROWD_CHANT_VOLUME,
      duration: 3000 // Crowd chants are typically longer
    });
    
    // Pick a random interval within allowed range
    let nextDelay = CONSTANTS.AUDIO.CROWD_CHANT_MIN + 
      Math.random() * (CONSTANTS.AUDIO.CROWD_CHANT_MAX - CONSTANTS.AUDIO.CROWD_CHANT_MIN);
    let proposedNextTime = now + nextDelay;
    
    // Check against percussion time
    if (proposedNextTime > this.nextPercussionTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextPercussionTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Check against stomp beat time
    if (proposedNextTime > this.nextStompBeatTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextStompBeatTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Ensure we don't play before our minimum interval
    if (proposedNextTime - now < CONSTANTS.AUDIO.CROWD_CHANT_MIN) {
      proposedNextTime = now + CONSTANTS.AUDIO.CROWD_CHANT_MIN;
    }
    nextDelay = proposedNextTime - now;
    
    this.nextCrowdChantTime = proposedNextTime;
    setTimeout(this.scheduleCrowdChant, nextDelay);
  };
  
  /**
   * Schedule percussion beat sound effect
   */
  private schedulePercussionBeat = (): void => {
    if (!this.world || this.nextPercussionTime === 0) return; // Stop if ambient sounds disabled
    
    const now = Date.now();
    
    // Use pooled audio system for better performance
    this.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.PERCUSSION_BEAT, {
      volume: CONSTANTS.AUDIO.PERCUSSION_VOLUME,
      duration: 2000 // Percussion beats are shorter
    });
    
    // Pick a random interval within allowed range
    let nextDelay = CONSTANTS.AUDIO.PERCUSSION_MIN + 
      Math.random() * (CONSTANTS.AUDIO.PERCUSSION_MAX - CONSTANTS.AUDIO.PERCUSSION_MIN);
    let proposedNextTime = now + nextDelay;
    
    // Check against crowd chant time
    if (proposedNextTime > this.nextCrowdChantTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextCrowdChantTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Check against stomp beat time
    if (proposedNextTime > this.nextStompBeatTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextStompBeatTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Ensure we don't play before our minimum interval
    if (proposedNextTime - now < CONSTANTS.AUDIO.PERCUSSION_MIN) {
      proposedNextTime = now + CONSTANTS.AUDIO.PERCUSSION_MIN;
    }
    nextDelay = proposedNextTime - now;
    
    this.nextPercussionTime = proposedNextTime;
    setTimeout(this.schedulePercussionBeat, nextDelay);
  };

  /**
   * Schedule stomp beat sound effect
   */
  private scheduleStompBeat = (): void => {
    if (!this.world || this.nextStompBeatTime === 0) return; // Stop if ambient sounds disabled
    
    const now = Date.now();
    
    // Use pooled audio system for better performance
    this.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.STOMP_BEAT, {
      volume: CONSTANTS.AUDIO.STOMP_BEAT_VOLUME,
      duration: 1500 // Stomp beats are quick
    });
    
    // Pick a random interval within allowed range
    let nextDelay = CONSTANTS.AUDIO.STOMP_BEAT_MIN + 
      Math.random() * (CONSTANTS.AUDIO.STOMP_BEAT_MAX - CONSTANTS.AUDIO.STOMP_BEAT_MIN);
    let proposedNextTime = now + nextDelay;
    
    // Check against crowd chant time
    if (proposedNextTime > this.nextCrowdChantTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextCrowdChantTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Check against percussion time
    if (proposedNextTime > this.nextPercussionTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextPercussionTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
    }
    
    // Ensure we don't play before our minimum interval
    if (proposedNextTime - now < CONSTANTS.AUDIO.STOMP_BEAT_MIN) {
      proposedNextTime = now + CONSTANTS.AUDIO.STOMP_BEAT_MIN;
    }
    nextDelay = proposedNextTime - now;
    
    this.nextStompBeatTime = proposedNextTime;
    setTimeout(this.scheduleStompBeat, nextDelay);
  };
  
  /**
   * Start ambient sound scheduling with initial delays
   */
  private startAmbientSounds(): void {
    const now = Date.now();
    
    let firstChantDelay = CONSTANTS.AUDIO.CROWD_CHANT_MIN + 
      Math.random() * (CONSTANTS.AUDIO.CROWD_CHANT_MAX - CONSTANTS.AUDIO.CROWD_CHANT_MIN);
    let firstPercDelay = CONSTANTS.AUDIO.PERCUSSION_MIN + 
      Math.random() * (CONSTANTS.AUDIO.PERCUSSION_MAX - CONSTANTS.AUDIO.PERCUSSION_MIN);
    let firstStompDelay = CONSTANTS.AUDIO.STOMP_BEAT_MIN + 
      Math.random() * (CONSTANTS.AUDIO.STOMP_BEAT_MAX - CONSTANTS.AUDIO.STOMP_BEAT_MIN);
    
    // Sort delays to ensure proper spacing
    const delays = [
      { name: 'chant', delay: firstChantDelay },
      { name: 'percussion', delay: firstPercDelay },
      { name: 'stomp', delay: firstStompDelay }
    ].sort((a, b) => a.delay - b.delay);
    
    // Ensure minimum gap between all sounds
    for (let i = 1; i < delays.length; i++) {
      const timeBetween = Math.abs(delays[i].delay - delays[i-1].delay);
      if (timeBetween < CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
        delays[i].delay = delays[i-1].delay + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS;
      }
    }
    
    // Apply the adjusted delays
    const chantData = delays.find(d => d.name === 'chant')!;
    const percData = delays.find(d => d.name === 'percussion')!;
    const stompData = delays.find(d => d.name === 'stomp')!;
    
    this.nextCrowdChantTime = now + chantData.delay;
    this.nextPercussionTime = now + percData.delay;
    this.nextStompBeatTime = now + stompData.delay;
    
    setTimeout(this.scheduleCrowdChant, chantData.delay);
    setTimeout(this.schedulePercussionBeat, percData.delay);
    setTimeout(this.scheduleStompBeat, stompData.delay);
    
    CONSTANTS.debugLog('Ambient sounds scheduled', 'AudioManager');
    CONSTANTS.debugLog(`- First crowd chant in ${Math.round(chantData.delay / 1000)}s`, 'AudioManager');
    CONSTANTS.debugLog(`- First percussion beat in ${Math.round(percData.delay / 1000)}s`, 'AudioManager');
    CONSTANTS.debugLog(`- First stomp beat in ${Math.round(stompData.delay / 1000)}s`, 'AudioManager');
  }
  
  /**
   * Stop all ambient sound timers (without stopping other audio)
   */
  public stopAmbientSounds(): void {
    CONSTANTS.debugLog('Stopping ambient sound timers...', 'AudioManager');
    
    // Clear any pending timeouts for ambient sounds
    // Note: We can't directly clear the timeouts since they're not stored,
    // but we can set flags to prevent them from rescheduling
    this.nextCrowdChantTime = 0;
    this.nextPercussionTime = 0;
    this.nextStompBeatTime = 0;
    
    CONSTANTS.debugLog('Ambient sound timers stopped', 'AudioManager');
  }

  /**
   * Stop all audio and cleanup resources
   */
  public stop(): void {
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Stop debug monitoring
    if (this.debugInterval) {
      clearInterval(this.debugInterval);
      this.debugInterval = null;
    }
    
    // Stop pool cleanup
    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval);
      this.poolCleanupInterval = null;
    }
    
    // Stop ambient sounds
    this.stopAmbientSounds();
    
    // Cleanup all active audio instances
    this.activeAudioInstances.forEach(managed => this.cleanupManagedAudio(managed));
    this.activeAudioInstances.clear();
    
    // Clean up audio pool
    for (const pool of this.audioPool.values()) {
      pool.forEach(pooled => {
        try {
          pooled.audio.pause();
        } catch (error) {
          // Audio might already be stopped
        }
      });
    }
    this.audioPool.clear();
    
    // Stop all continuous audios
    this.continuousAudios.forEach((audio, uri) => {
      try {
        audio.pause();
        CONSTANTS.debugLog(`Stopped continuous audio: ${uri}`, 'AudioManager');
      } catch (error) {
        CONSTANTS.debugError(`Error stopping continuous audio ${uri}`, error, 'AudioManager');
      }
    });
    this.continuousAudios.clear();
    this.skatingPlayers.clear();
    
    // Reset initialization flag
    this.isInitialized = false;
    
    CONSTANTS.debugLog('All audio stopped and cleaned up', 'AudioManager');
    CONSTANTS.debugLog(`Session stats - Created: ${this.audioCreationCount}, Cleaned: ${this.audioCleanupCount}, Max Simultaneous: ${this.maxSimultaneousAudios}`, 'AudioManager');
  }
  
  /**
   * Play the goal horn sound effect (single global instance)
   */
  public playGoalHorn(): void {
    this.playGlobalSoundEffect(
      CONSTANTS.AUDIO_PATHS.GOAL_HORN,
      CONSTANTS.AUDIO.GOAL_HORN_VOLUME
    );
    CONSTANTS.debugLog('Goal horn played', 'AudioManager');
  }
  
  /**
   * Play referee whistle sound effect (single global instance)
   */
  public playRefereeWhistle(): void {
    this.playGlobalSoundEffect(
      CONSTANTS.AUDIO_PATHS.REFEREE_WHISTLE,
      CONSTANTS.AUDIO.REFEREE_WHISTLE_VOLUME
    );
    CONSTANTS.debugLog('Referee whistle played', 'AudioManager');
  }
  
  /**
   * Play countdown sound effect (single global instance)
   */
  public playCountdownSound(): void {
    this.playGlobalSoundEffect(
      CONSTANTS.AUDIO_PATHS.COUNTDOWN_SOUND,
      0.5
    );
    CONSTANTS.debugLog('Countdown sound played', 'AudioManager');
  }

  /**
   * Get the current background music instance (for debugging)
   */
  public getBackgroundMusic(): Audio | null {
    return null; // Background music is no longer managed by AudioManager
  }
  
  /**
   * Get audio performance stats (for debugging)
   */
  public getAudioStats(): { active: number; types: Record<string, number> } {
    const types: Record<string, number> = {};
    this.activeAudioInstances.forEach(managed => {
      types[managed.type] = (types[managed.type] || 0) + 1;
    });
    
    return {
      active: this.activeAudioInstances.size,
      types
    };
  }
  
  /**
   * Get comprehensive audio debugging information
   */
  public getAudioDebugInfo(): AudioDebugInfo | null {
    return this.lastAudioAnalysis;
  }
  
  /**
   * Force a manual audio analysis (for on-demand debugging)
   */
  public performManualAudioAnalysis(): AudioDebugInfo | null {
    this.performAudioAnalysis();
    return this.lastAudioAnalysis;
  }
  
  /**
   * Get all audio instances using the official AudioManager method
   */
  public getAllWorldAudios(): any[] {
    if (!this.world?.audioManager) {
      return [];
    }
    
    try {
      // Use the official AudioManager method instead of our custom implementation
      return this.world.audioManager.getAllAudios();
    } catch (error) {
      CONSTANTS.debugError('Error getting world audios from AudioManager', error, 'AudioManager');
      return [];
    }
  }
  
  /**
   * Get all looped audio instances using the official AudioManager method
   */
  public getAllLoopedAudios(): any[] {
    if (!this.world?.audioManager) {
      return [];
    }
    
    try {
      // Use the official AudioManager method
      return this.world.audioManager.getAllLoopedAudios();
    } catch (error) {
      CONSTANTS.debugError('Error getting looped audios from AudioManager', error, 'AudioManager');
      return [];
    }
  }
  
  /**
   * Get all oneshot audio instances using the official AudioManager method
   */
  public getAllOneshotAudios(): any[] {
    if (!this.world?.audioManager) {
      return [];
    }
    
    try {
      // Use the official AudioManager method
      return this.world.audioManager.getAllOneshotAudios();
    } catch (error) {
      CONSTANTS.debugError('Error getting oneshot audios from AudioManager', error, 'AudioManager');
      return [];
    }
  }
  
  /**
   * Get entity-attached audio instances using the official AudioManager method
   */
  public getEntityAttachedAudios(entity: Entity): any[] {
    if (!this.world?.audioManager) {
      return [];
    }
    
    try {
      // Use the official AudioManager method
      return this.world.audioManager.getAllEntityAttachedAudios(entity);
    } catch (error) {
      CONSTANTS.debugError('Error getting entity-attached audios from AudioManager', error, 'AudioManager');
      return [];
    }
  }
  
  /**
   * Manual cleanup trigger for testing
   */
  public forceCleanup(): void {
    CONSTANTS.debugLog('Manual cleanup triggered', 'AudioManager');
    this.emergencyAudioCleanup();
  }
  
    /**
   * Reset degradation detection flag (for testing)
   */
  public resetDegradationFlag(): void {
    this.degradationDetected = false;
    CONSTANTS.debugLog('Degradation detection flag reset', 'AudioManager');
  }
  
  /**
   * Helper function to create and immediately play a managed audio effect
   * This is a drop-in replacement for: new Audio(config).play(world, force)
   * @param config - Audio configuration
   * @param world - World instance to play in
   * @param force - Whether to force play
   * @param type - Type of audio for management
   * @returns Whether the audio was successfully created and played
   */
  public createAndPlayManagedAudio(
    config: any, 
    world: World, 
    force: boolean = false, 
    type: 'ambient' | 'effect' | 'music' = 'effect'
  ): boolean {
    const audio = this.createManagedAudio(config, type);
    if (audio) {
      audio.play(world, force);
      return true;
    }
    return false;
  }

  /**
   * Clean up entity-attached audios that are too old or have invalid entities
   */
  private cleanupEntityAttachedAudios(): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      const allAudios = this.world.audioManager.getAllAudios();
      const entityAttachedAudios = allAudios.filter((audio: any) => 
        audio.attachedToEntity !== undefined && audio.attachedToEntity !== null
      );
      
      const now = Date.now();
      const maxAge = this.getScaledEntityAudioMaxAge();
      let cleanedCount = 0;
      
      // Clean up entity-attached audios that are too old or have invalid entities
      for (const audio of entityAttachedAudios) {
        let shouldCleanup = false;
        let reason = '';
        
        // Check if entity is invalid (undefined or not spawned)
        if (!audio.attachedToEntity || !audio.attachedToEntity.isSpawned) {
          shouldCleanup = true;
          reason = 'invalid entity';
        }
        // Check if audio is too old (if we can determine age)
        else if ((audio as any).createdAt && (now - (audio as any).createdAt > maxAge)) {
          shouldCleanup = true;
          reason = `too old (${Math.round((now - (audio as any).createdAt) / 1000)}s)`;
        }
        
        if (shouldCleanup) {
          try {
            audio.pause();
            cleanedCount++;
            CONSTANTS.debugLog(`Cleaned up entity audio: ${audio.uri?.split('/').pop() || 'unknown'} (${reason})`, 'AudioManager');
          } catch (error) {
            // Continue with other cleanups
          }
        }
      }
      
      if (cleanedCount > 0) {
        CONSTANTS.debugLog(`Cleaned up ${cleanedCount} entity-attached audio instances`, 'AudioManager');
      }
      
      // Also clean up pooled audio with invalid entities
      let poolCleanedCount = 0;
      for (const [uri, pool] of this.audioPool.entries()) {
        const originalLength = pool.length;
        const cleanedPool = pool.filter(pooled => {
          if (pooled.attachedEntity && !pooled.attachedEntity.isSpawned) {
            try {
              pooled.audio.pause();
            } catch (error) {
              // Continue with cleanup
            }
            poolCleanedCount++;
            return false;
          }
          return true;
        });
        
        if (cleanedPool.length !== originalLength) {
          if (cleanedPool.length === 0) {
            this.audioPool.delete(uri);
          } else {
            this.audioPool.set(uri, cleanedPool);
          }
        }
      }
      
      if (poolCleanedCount > 0) {
        CONSTANTS.debugLog(`Cleaned up ${poolCleanedCount} pooled audio instances with invalid entities`, 'AudioManager');
      }
      
    } catch (error) {
      CONSTANTS.debugError('Error during entity-attached audio cleanup', error, 'AudioManager');
    }
  }

  /**
   * Clean up invalid global continuous audio instances
   */
  private cleanupContinuousAudios(): void {
    const keysToRemove: string[] = [];
    
    for (const [uri, audio] of this.continuousAudios.entries()) {
      try {
        // Check if audio is still valid by accessing properties
        const volume = audio.volume;
        
        // Additional check: verify the audio is still registered with the world
        if (this.world) {
          const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
          const audioStillExists = allAudios.some((worldAudio: any) => 
            worldAudio.uri === uri && worldAudio.loop === true
          );
          
          if (!audioStillExists) {
            CONSTANTS.debugLog(`Continuous audio ${uri} no longer exists in world, removing reference`, 'AudioManager');
            keysToRemove.push(uri);
          }
        }
      } catch (error) {
        CONSTANTS.debugLog(`Continuous audio ${uri} is invalid, removing`, 'AudioManager');
        keysToRemove.push(uri);
      }
    }
    
    keysToRemove.forEach(uri => this.continuousAudios.delete(uri));
    
    if (keysToRemove.length > 0) {
      CONSTANTS.debugLog(`Cleaned up ${keysToRemove.length} invalid global continuous audio instances`, 'AudioManager');
    }
  }

  /**
   * Enhanced emergency cleanup using official AudioManager methods
   */
  private enhancedEmergencyCleanup(): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      const allAudios = this.world.audioManager.getAllAudios();
      const oneshotAudios = this.world.audioManager.getAllOneshotAudios();
      
      // Strategy 1: Clean up oldest oneshot audios
      if (oneshotAudios.length > 3) {
        const targetRemoval = Math.min(oneshotAudios.length - 3, 5);
        const toRemove = oneshotAudios.slice(0, targetRemoval);
        
        for (const audio of toRemove) {
          try {
            this.world.audioManager.unregisterAudio(audio);
          } catch (error) {
            // Continue with cleanup
          }
        }
        
        if (toRemove.length > 0) {
          CONSTANTS.debugLog(`Enhanced emergency cleanup: removed ${toRemove.length} oldest audio instances`, 'AudioManager');
          return;
        }
      }
      
      // Strategy 2: Clean up entity-attached audios
      const entityAudios = allAudios.filter((audio: any) => audio.attachedToEntity);
      if (entityAudios.length > 3) {
        const targetRemoval = Math.min(entityAudios.length - 3, 3);
        const toRemove = entityAudios.slice(0, targetRemoval);
        
        for (const audio of toRemove) {
          try {
            this.world.audioManager.unregisterAudio(audio);
          } catch (error) {
            // Continue with cleanup
          }
        }
        
        if (toRemove.length > 0) {
          CONSTANTS.debugLog(`Enhanced emergency cleanup: removed ${toRemove.length} entity-attached audio instances`, 'AudioManager');
          return;
        }
      }
      
    } catch (error) {
      CONSTANTS.debugError('Error in enhanced emergency cleanup', error, 'AudioManager');
    }
  }

  /**
   * Start a global continuous looped sound (not attached to any entity)
   */
  public startGlobalContinuousSound(uri: string, config: any = {}): boolean {
    if (!this.world) {
      CONSTANTS.debugLog(`Cannot start global continuous sound - no world`, 'AudioManager');
      return false;
    }
    
    // If already playing, just return true - prevent duplicates
    const existingAudio = this.continuousAudios.get(uri);
    if (existingAudio) {
      try {
        const volume = existingAudio.volume;
        CONSTANTS.debugLog(`Global continuous sound ${uri} already playing - preventing duplicate`, 'AudioManager');
        return true;
      } catch (error) {
        CONSTANTS.debugLog(`Existing global continuous audio invalid for ${uri}, removing`, 'AudioManager');
        this.continuousAudios.delete(uri);
      }
    }
    
    // Check if we're at the total instance limit
    const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
    if (allAudios.length >= this.getScaledMaxInstances()) {
      CONSTANTS.debugLog(`Cannot start global continuous sound ${uri} - at instance limit (${allAudios.length}/${this.getScaledMaxInstances()})`, 'AudioManager');
      return false;
    }
    
    try {
      const audio = new Audio({
        uri: uri,
        volume: config.volume || 0.5,
        playbackRate: config.playbackRate || 1.0,
        loop: true
      });
      
      audio.play(this.world);
      this.continuousAudios.set(uri, audio);
      
      CONSTANTS.debugLog(`Started global continuous sound ${uri} (total: ${allAudios.length + 1}/${this.getScaledMaxInstances()})`, 'AudioManager');
      return true;
    } catch (error) {
      CONSTANTS.debugError(`Failed to start global continuous sound ${uri}`, error, 'AudioManager');
      return false;
    }
  }
  
  /**
   * Stop a global continuous looped sound
   */
  public stopGlobalContinuousSound(uri: string): void {
    const audio = this.continuousAudios.get(uri);
    
    if (audio) {
      try {
        audio.pause();
        CONSTANTS.debugLog(`Stopped global continuous sound ${uri}`, 'AudioManager');
      } catch (error) {
        CONSTANTS.debugError(`Error stopping global continuous sound ${uri}`, error, 'AudioManager');
      }
      
      this.continuousAudios.delete(uri);
    }
  }

  /**
   * @deprecated This method is deprecated. Ice skating sounds are now handled per-player in IceSkatingController.
   * Set a player's skating status and manage global ice skating sound
   */
  public setPlayerSkatingStatus(playerId: string, isSkating: boolean): void {
    const wasSkating = this.skatingPlayers.has(playerId);
    
    if (isSkating && !wasSkating) {
      this.skatingPlayers.add(playerId);
      
      if (this.skatingPlayers.size === 1) {
        if (this.world) {
          const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
          const existingIceSkatingCount = allAudios.filter((audio: any) => 
            audio.uri && audio.uri.includes('ice-skating')
          ).length;
          
          if (existingIceSkatingCount === 0) {
            this.startGlobalContinuousSound(CONSTANTS.AUDIO_PATHS.ICE_SKATING, {
              volume: CONSTANTS.SKATING_SOUND.VOLUME,
              playbackRate: 1.0
            });
          } else {
            CONSTANTS.debugLog(`Ice skating sound already exists (${existingIceSkatingCount} instances), not creating duplicate`, 'AudioManager');
          }
        }
      }
    } else if (!isSkating && wasSkating) {
      this.skatingPlayers.delete(playerId);
      
      if (this.skatingPlayers.size === 0) {
        this.stopGlobalContinuousSound(CONSTANTS.AUDIO_PATHS.ICE_SKATING);
        
        if (this.world) {
          const allAudios = (this.world as any).audioManager?.getAllAudios() || [];
          const iceSkatingAudios = allAudios.filter((audio: any) => 
            audio.uri && audio.uri.includes('ice-skating')
          );
          
          for (const audio of iceSkatingAudios) {
            try {
              this.world.audioManager.unregisterAudio(audio);
            } catch (error) {
              // Continue cleanup
            }
          }
          
          if (iceSkatingAudios.length > 0) {
            CONSTANTS.debugLog(`Cleaned up ${iceSkatingAudios.length} duplicate ice skating sounds`, 'AudioManager');
          }
        }
      }
    }
  }

  /**
   * Update the active player count for dynamic scaling
   */
  public updatePlayerCount(count: number): void {
    const oldCount = this.playerCount;
    this.playerCount = Math.max(1, count);
    
    if (oldCount !== this.playerCount) {
      CONSTANTS.debugLog(`Player count updated: ${oldCount} → ${this.playerCount} (max instances: ${this.getScaledMaxInstances()}, cleanup threshold: ${this.getScaledCleanupThreshold()})`, 'AudioManager');
      
      if (this.playerCount > oldCount + 2) {
        this.forceCleanup();
      }
    }
  }

  /**
   * Get current player count
   */
  public getPlayerCount(): number {
    return this.playerCount;
  }

  /**
   * @deprecated This method is deprecated. Ice skating sounds are now handled per-player in IceSkatingController.
   * Clear all skating players and stop global ice skating sound
   * Used during match resets to ensure clean audio state
   */
  public clearSkatingPlayers(): void {
    if (this.skatingPlayers.size > 0) {
      CONSTANTS.debugLog(`Clearing ${this.skatingPlayers.size} skating players for match reset`, 'AudioManager');
      this.skatingPlayers.clear();
      
      // Stop the global ice skating sound if it's playing
      this.stopGlobalContinuousSound('audio/sfx/hockey/ice-skating.mp3');
    }
  }

  /**
   * Clean up all audio references for a specific entity (called when player disconnects)
   */
  public cleanupEntityAudio(entity: Entity): void {
    if (!entity || !this.world) return;

    CONSTANTS.debugCleanup(`Starting audio cleanup for entity ${(entity as any).id || 'unknown'}`, 'AudioManager');
    let cleanedCount = 0;

    try {
      // Clean up pooled audio with this entity
      for (const [uri, pool] of this.audioPool.entries()) {
        const originalLength = pool.length;
        const cleanedPool = pool.filter(pooled => {
          if (pooled.attachedEntity === entity) {
            try {
              pooled.audio.pause();
              pooled.isPlaying = false;
            } catch (error) {
              // Continue with cleanup
            }
            cleanedCount++;
            return false;
          }
          return true;
        });
        
        if (cleanedPool.length !== originalLength) {
          if (cleanedPool.length === 0) {
            this.audioPool.delete(uri);
          } else {
            this.audioPool.set(uri, cleanedPool);
          }
        }
      }

      // Clean up world audio instances attached to this entity
      const allAudios = this.world.audioManager?.getAllAudios() || [];
      const entityAudios = allAudios.filter((audio: any) => 
        audio.attachedToEntity === entity
      );

      for (const audio of entityAudios) {
        try {
          audio.pause();
          this.world.audioManager?.unregisterAudio(audio);
          cleanedCount++;
        } catch (error) {
          // Continue with cleanup
        }
      }

      // Clean up managed audio instances
      const managedToRemove: any[] = [];
      this.activeAudioInstances.forEach(managed => {
        if ((managed.audio as any).attachedToEntity === entity) {
          managedToRemove.push(managed);
        }
      });

      managedToRemove.forEach(managed => {
        this.cleanupManagedAudio(managed);
        cleanedCount++;
      });

      CONSTANTS.debugCleanup(`Cleaned up ${cleanedCount} audio instances for entity`, 'AudioManager');

    } catch (error) {
      CONSTANTS.debugError('Error during entity audio cleanup', error, 'AudioManager');
    }
  }

  /**
   * Clean up all audio references for a specific player (called when player disconnects)
   */
  public cleanupPlayerAudio(playerId: string): void {
    if (!playerId || !this.world) return;

    CONSTANTS.debugCleanup(`Starting audio cleanup for player ${playerId}`, 'AudioManager');
    
    try {
      // Remove from skating players
      this.skatingPlayers.delete(playerId);

      // Get all entities for this player and clean up their audio
      // Note: We can't easily get entities by player ID in Hytopia, 
      // so we'll rely on the PlayerManager to call cleanupEntityAudio for each entity

      CONSTANTS.debugCleanup(`Completed audio cleanup for player ${playerId}`, 'AudioManager');

    } catch (error) {
      CONSTANTS.debugError(`Error during player audio cleanup for ${playerId}`, error, 'AudioManager');
    }
  }
} 