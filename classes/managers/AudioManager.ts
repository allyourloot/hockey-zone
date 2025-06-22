/**
 * AudioManager handles all ambient sound scheduling and background music
 * Enhanced with proper audio object lifecycle management and memory cleanup
 * Extracted from index.ts section 9. AUDIO MANAGEMENT
 */

import { Audio } from 'hytopia';
import type { World, Entity } from 'hytopia';
import * as CONSTANTS from '../utils/constants';

interface ManagedAudio {
  audio: Audio;
  createdAt: number;
  type: 'ambient' | 'effect' | 'music';
  cleanup?: () => void;
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
    this.world = world;
    this.startAmbientSounds();
    this.startCleanupTimer();
    CONSTANTS.debugLog('Audio manager initialized with enhanced memory management', 'AudioManager');
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
    
    // Check if we're at max concurrent sounds
    if (this.activeAudioInstances.size >= CONSTANTS.AUDIO_PERFORMANCE.MAX_CONCURRENT_SOUNDS) {
      CONSTANTS.debugLog(`Audio creation skipped - max concurrent sounds reached (${this.activeAudioInstances.size})`, 'AudioManager');
      this.cleanupOldestAudio();
    }
    
    try {
      const audio = new Audio(config);
      const managedAudio: ManagedAudio = {
        audio,
        createdAt: now,
        type,
      };
      
      this.activeAudioInstances.add(managedAudio);
      this.lastGlobalSoundTime = now;
      
      CONSTANTS.debugLog(`Created managed audio (${type}). Active: ${this.activeAudioInstances.size}`, 'AudioManager');
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
    
    const audio = this.createManagedAudio({
      uri,
      volume,
      attachedToEntity
    }, 'effect');
    
    if (audio) {
      audio.play(this.world);
      return true;
    }
    
    return false;
  }
  
  /**
   * Clean up the oldest audio instance to make room for new ones
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
    } catch (error) {
      CONSTANTS.debugError('Error cleaning up managed audio', error, 'AudioManager');
    }
  }
  
  /**
   * Start periodic cleanup of old audio instances
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const instancesToCleanup = Array.from(this.activeAudioInstances).filter(
        managed => now - managed.createdAt > CONSTANTS.AUDIO_PERFORMANCE.CLEANUP_DELAY
      );
      
      instancesToCleanup.forEach(managed => this.cleanupManagedAudio(managed));
      
      if (instancesToCleanup.length > 0) {
        CONSTANTS.debugLog(`Cleaned up ${instancesToCleanup.length} old audio instances. Active: ${this.activeAudioInstances.size}`, 'AudioManager');
      }
    }, CONSTANTS.AUDIO_PERFORMANCE.CLEANUP_DELAY / 2); // Check twice as often as cleanup delay
  }
  
  /**
   * Schedule crowd chant sound effect
   */
  private scheduleCrowdChant = (): void => {
    if (!this.world) return;
    
    const now = Date.now();
    
    // Use managed audio creation
    const chant = this.createManagedAudio({
      uri: CONSTANTS.AUDIO_PATHS.CROWD_HEY,
      volume: CONSTANTS.AUDIO.CROWD_CHANT_VOLUME,
    }, 'ambient');
    
    if (chant) {
      chant.play(this.world);
    }
    
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
    if (!this.world) return;
    
    const now = Date.now();
    
    // Use managed audio creation
    const percussion = this.createManagedAudio({
      uri: CONSTANTS.AUDIO_PATHS.PERCUSSION_BEAT,
      volume: CONSTANTS.AUDIO.PERCUSSION_VOLUME,
    }, 'ambient');
    
    if (percussion) {
      percussion.play(this.world);
    }
    
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
    if (!this.world) return;
    
    const now = Date.now();
    
    // Use managed audio creation
    const stompBeat = this.createManagedAudio({
      uri: CONSTANTS.AUDIO_PATHS.STOMP_BEAT,
      volume: CONSTANTS.AUDIO.STOMP_BEAT_VOLUME,
    }, 'ambient');
    
    if (stompBeat) {
      stompBeat.play(this.world);
    }
    
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
   * Stop all audio and cleanup resources
   */
  public stop(): void {
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
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
    
    CONSTANTS.debugLog('All audio stopped and cleaned up', 'AudioManager');
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
} 