/**
 * AudioManager handles all ambient sound scheduling and background music
 * Enhanced with proper audio object lifecycle management and memory cleanup
 * Now includes pooled audio system for efficient sound effect reuse
 * Extracted from index.ts section 9. AUDIO MANAGEMENT
 */

import { Audio } from 'hytopia';
import type { World, Entity } from 'hytopia';
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
  private backgroundMusic: Audio | null = null;
  
  // Audio object management
  private activeAudioInstances: Set<ManagedAudio> = new Set();
  private lastGlobalSoundTime: number = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // NEW: Audio pooling system
  private audioPool: Map<string, PooledAudio[]> = new Map();
  private maxPoolSize: number = 3; // Increased to 3 to handle ambient + gameplay sounds
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
  
  // Prevent duplicate initialization
  private isInitialized: boolean = false;
  
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
  }
  
  /**
   * Start comprehensive audio debugging and monitoring
   */
  private startDebugMonitoring(): void {
    // Monitor audio health every 5 seconds
    this.debugInterval = setInterval(() => {
      this.performAudioAnalysis();
    }, 5000);
    
    CONSTANTS.debugLog('Audio debugging monitoring started', 'AudioManager');
  }

  /**
   * Start pool cleanup timer to manage pooled audio instances
   */
  private startPoolCleanup(): void {
    this.poolCleanupInterval = setInterval(() => {
      this.cleanupAudioPool();
    }, 30000); // Clean up pool every 30 seconds
    
    CONSTANTS.debugLog('Audio pool cleanup started', 'AudioManager');
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
     
     // Then do our regular pool cleanup
     const now = Date.now();
     const maxAge = 60000; // 60 seconds
    
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
      
      if (activePool.length === 0) {
        this.audioPool.delete(uri);
      } else {
        this.audioPool.set(uri, activePool);
      }
    }
  }

  /**
   * Get or create a pooled audio instance for reuse
   */
  private getPooledAudio(uri: string, config: any): PooledAudio | null {
    if (!this.world) return null;

    // Get existing pool for this URI
    let pool = this.audioPool.get(uri) || [];
    
    // Find an available (not playing) audio instance
    let availableAudio = pool.find(pooled => !pooled.isPlaying);
    
    if (availableAudio) {
      // Reuse the available audio instance
      // Note: We can't change volume/playbackRate after creation, but for gameplay
      // sound effects, slight variations are acceptable for better performance
      availableAudio.isPlaying = true;
      availableAudio.lastUsed = Date.now();
      return availableAudio;
    }
    
    // Create new audio instance if pool isn't full
    if (pool.length < this.maxPoolSize) {
      try {
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
        
        CONSTANTS.debugLog(`Created pooled audio for ${uri.split('/').pop()} (pool size: ${pool.length}/${this.maxPoolSize})`, 'AudioManager');
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
      
      // Reuse this instance
      oldestAudio.isPlaying = true;
      oldestAudio.lastUsed = Date.now();
      CONSTANTS.debugLog(`Reusing pooled audio for ${uri.split('/').pop()} (forced reuse)`, 'AudioManager');
      return oldestAudio;
    }
    
    return null;
  }

  /**
   * Play a sound effect using the pooled audio system
   */
  public playPooledSoundEffect(uri: string, config: any = {}): boolean {
    if (!this.world) return false;
    
    // Get pooled audio instance (no cooldown or limit checks for pooled audio)
    const pooledAudio = this.getPooledAudio(uri, config);
    if (!pooledAudio) {
      return false;
    }
    
    try {
      // Play the audio
      pooledAudio.audio.play(this.world, true);
      
      // Set up completion handler to mark as not playing
      setTimeout(() => {
        pooledAudio.isPlaying = false;
      }, config.duration || 2000); // Default 2 second duration for sound effects
      
      // Don't update lastGlobalSoundTime for pooled audio - keep it independent
      return true;
      
    } catch (error) {
      CONSTANTS.debugError('Error playing pooled audio', error, 'AudioManager');
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
      
      // Detect potential issues
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
   * Detect audio degradation patterns
   */
  private detectAudioDegradation(debugInfo: AudioDebugInfo, allAudios: any[]): void {
    const issues: string[] = [];
    
    // Check for too many audio instances (more lenient threshold)
    if (debugInfo.totalAudiosInWorld > CONSTANTS.AUDIO_PERFORMANCE.EMERGENCY_CLEANUP_THRESHOLD) {
      issues.push(`Excessive audio instances: ${debugInfo.totalAudiosInWorld} (limit: ${CONSTANTS.AUDIO_PERFORMANCE.EMERGENCY_CLEANUP_THRESHOLD})`);
    }
    
    // Check for memory concerns
    if (debugInfo.memoryEstimate > CONSTANTS.AUDIO_PERFORMANCE.MAX_AUDIO_MEMORY_MB * 1.5) { // 1.5x the limit
      issues.push(`High estimated audio memory: ${debugInfo.memoryEstimate}MB`);
    }
    
    // Check for unmanaged audio leaks
    if (debugInfo.unmanagedAudios > debugInfo.managedAudios) {
      issues.push(`More unmanaged audios (${debugInfo.unmanagedAudios}) than managed (${debugInfo.managedAudios})`);
    }
    
    // Check for very old audio instances
    if (debugInfo.oldestAudio && debugInfo.oldestAudio.age > 300000) { // Older than 5 minutes
      issues.push(`Very old audio detected: ${Math.round(debugInfo.oldestAudio.age / 1000)}s old (${debugInfo.oldestAudio.uri})`);
    }
    
    // Check for stuck looped audios
    if (debugInfo.loopedAudios > 5) { // More than 5 looped sounds
      issues.push(`Many looped audios: ${debugInfo.loopedAudios}`);
    }
    
    if (issues.length > 0) {
      this.degradationDetected = true;
      CONSTANTS.debugWarn('🚨 AUDIO DEGRADATION DETECTED:', 'AudioManager');
      issues.forEach(issue => CONSTANTS.debugWarn(`  - ${issue}`, 'AudioManager'));
      
      // Attempt emergency cleanup
      this.emergencyAudioCleanup();
    } else {
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
    
    // Stop background music
    if (this.backgroundMusic) {
      if ((this.backgroundMusic as any).stop) {
        (this.backgroundMusic as any).stop();
      }
      this.backgroundMusic = null;
    }
    
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
      0.6
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
    return this.backgroundMusic;
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
   * Clean up entity-attached audios using the official AudioManager method
   * @param entity - The entity whose audios should be cleaned up
   */
  public cleanupEntityAudios(entity: Entity): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      // Use the official AudioManager method to unregister all entity-attached audios
      this.world.audioManager.unregisterEntityAttachedAudios(entity);
      CONSTANTS.debugLog(`Cleaned up all audios for entity`, 'AudioManager');
    } catch (error) {
      CONSTANTS.debugError('Error cleaning up entity audios', error, 'AudioManager');
    }
  }

  /**
   * Unregister a specific audio instance using the official AudioManager method
   * @param audio - The audio instance to unregister
   */
  public unregisterSpecificAudio(audio: Audio): void {
    if (!this.world?.audioManager) {
      return;
    }
    
    try {
      // Use the official AudioManager method to unregister the specific audio
      this.world.audioManager.unregisterAudio(audio);
      CONSTANTS.debugLog(`Unregistered specific audio instance`, 'AudioManager');
    } catch (error) {
      CONSTANTS.debugError('Error unregistering specific audio', error, 'AudioManager');
    }
  }

  /**
   * Start a global continuous looped sound (not attached to any entity)
   * @param uri - The audio URI
   * @param config - Audio configuration (volume, playbackRate, etc.)
   * @returns true if the sound was started successfully
   */
  public startGlobalContinuousSound(uri: string, config: any = {}): boolean {
    if (!this.world) {
      CONSTANTS.debugLog(`Cannot start global continuous sound - no world`, 'AudioManager');
      return false;
    }
    
    // If already playing, just return true
    const existingAudio = this.continuousAudios.get(uri);
    if (existingAudio) {
      try {
        // Check if audio is still valid by accessing a property
        const volume = existingAudio.volume;
        CONSTANTS.debugLog(`Global continuous sound ${uri} already playing`, 'AudioManager');
        return true;
      } catch (error) {
        // Audio might be invalid, remove it and create new one
        CONSTANTS.debugLog(`Existing global continuous audio invalid for ${uri}, removing`, 'AudioManager');
        this.continuousAudios.delete(uri);
      }
    }
    
    try {
      // Create new global looped audio (not attached to entity)
      const audio = new Audio({
        uri: uri,
        volume: config.volume || 0.5,
        playbackRate: config.playbackRate || 1.0,
        loop: true
      });
      
      // Start playing
      audio.play(this.world);
      
      // Store in continuous audio tracking
      this.continuousAudios.set(uri, audio);
      
      CONSTANTS.debugLog(`Started global continuous sound ${uri}`, 'AudioManager');
      return true;
    } catch (error) {
      CONSTANTS.debugError(`Failed to start global continuous sound ${uri}`, error, 'AudioManager');
      return false;
    }
  }
  
  /**
   * Stop a global continuous looped sound
   * @param uri - The audio URI to stop
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
   * Check if a global continuous sound is playing
   * @param uri - The audio URI to check
   * @returns true if the sound is currently playing
   */
  public isGlobalContinuousSoundPlaying(uri: string): boolean {
    return this.continuousAudios.has(uri);
  }
  
  /**
   * Stop all global continuous sounds
   */
  public stopAllGlobalContinuousSounds(): void {
    const keysToRemove: string[] = [];
    
    for (const [uri, audio] of this.continuousAudios.entries()) {
      try {
        audio.pause();
      } catch (error) {
        // Audio might already be cleaned up
      }
      keysToRemove.push(uri);
    }
    
    keysToRemove.forEach(uri => this.continuousAudios.delete(uri));
    
    if (keysToRemove.length > 0) {
      CONSTANTS.debugLog(`Stopped ${keysToRemove.length} global continuous sounds`, 'AudioManager');
    }
  }
  
  /**
   * Set a player's skating status and manage global ice skating sound
   * @param playerId - The player entity ID
   * @param isSkating - Whether the player is currently skating
   */
  public setPlayerSkatingStatus(playerId: string, isSkating: boolean): void {
    const wasSkating = this.skatingPlayers.has(playerId);
    
    if (isSkating && !wasSkating) {
      // Player started skating
      this.skatingPlayers.add(playerId);
      
      // Start global ice skating sound if this is the first player skating
      if (this.skatingPlayers.size === 1) {
        this.startGlobalContinuousSound(CONSTANTS.AUDIO_PATHS.ICE_SKATING, {
          volume: CONSTANTS.SKATING_SOUND.VOLUME,
          playbackRate: 1.0
        });
      }
    } else if (!isSkating && wasSkating) {
      // Player stopped skating
      this.skatingPlayers.delete(playerId);
      
      // Stop global ice skating sound if no players are skating
      if (this.skatingPlayers.size === 0) {
        this.stopGlobalContinuousSound(CONSTANTS.AUDIO_PATHS.ICE_SKATING);
      }
    }
  }
  
  /**
   * Get the number of players currently skating
   * @returns Number of skating players
   */
  public getSkatingPlayersCount(): number {
    return this.skatingPlayers.size;
  }
  
  /**
   * Clear all skating player tracking (useful for resets)
   */
  public clearSkatingPlayers(): void {
    this.skatingPlayers.clear();
    this.stopGlobalContinuousSound(CONSTANTS.AUDIO_PATHS.ICE_SKATING);
  }
  
  /**
   * Clean up invalid global continuous audio instances
   */
  private cleanupContinuousAudios(): void {
    const keysToRemove: string[] = [];
    
    for (const [uri, audio] of this.continuousAudios.entries()) {
      try {
        // Check if audio is still valid by accessing a property
        const volume = audio.volume;
        // Audio is still valid, keep it
      } catch (error) {
        // Audio is invalid, remove it
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
      // Get all oneshot audios and clean up the oldest ones
      const oneshotAudios = this.world.audioManager.getAllOneshotAudios();
      const sortedByAge = oneshotAudios
        .filter((audio: any) => audio.createdAt)
        .sort((a: any, b: any) => a.createdAt - b.createdAt);
      
      // Clean up the oldest 50% of oneshot audios
      const toCleanup = sortedByAge.slice(0, Math.floor(sortedByAge.length * 0.5));
      
      for (const audio of toCleanup) {
        this.world.audioManager.unregisterAudio(audio);
      }
      
      CONSTANTS.debugLog(`Enhanced emergency cleanup: removed ${toCleanup.length} oldest audio instances`, 'AudioManager');
    } catch (error) {
      CONSTANTS.debugError('Error in enhanced emergency cleanup', error, 'AudioManager');
    }
  }
} 