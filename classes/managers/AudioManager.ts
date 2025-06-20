/**
 * AudioManager handles all ambient sound scheduling and background music
 * Extracted from index.ts section 9. AUDIO MANAGEMENT
 */

import { Audio } from 'hytopia';
import type { World } from 'hytopia';
import * as CONSTANTS from '../utils/constants';

export class AudioManager {
  private static _instance: AudioManager | null = null;
  
  // Ambient sound scheduling state
  private nextCrowdChantTime: number = 0;
  private nextPercussionTime: number = 0;
  private world: World | null = null;
  private backgroundMusic: Audio | null = null;
  
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
    // Don't start background music here - handled separately in index.ts
    // this.startBackgroundMusic();
    this.startAmbientSounds();
  }
  
  /**
   * Start background music
   */
  private startBackgroundMusic(): void {
    if (!this.world) {
      console.warn('AudioManager: Cannot start background music - world not initialized');
      return;
    }
    
    this.backgroundMusic = new Audio({
      uri: CONSTANTS.AUDIO_PATHS.READY_FOR_THIS,
      loop: true,
      volume: CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME,
    });
    
    this.backgroundMusic.play(this.world);
    console.log('AudioManager: Background music started');
  }
  
  /**
   * Schedule crowd chant sound effect
   */
  private scheduleCrowdChant = (): void => {
    if (!this.world) return;
    
    const now = Date.now();
    
    // Play the crowd chant sound effect globally
    const chant = new Audio({
      uri: CONSTANTS.AUDIO_PATHS.CROWD_HEY,
      volume: CONSTANTS.AUDIO.CROWD_CHANT_VOLUME,
    });
    chant.play(this.world);
    
    // Pick a random interval within allowed range
    let nextDelay = CONSTANTS.AUDIO.CROWD_CHANT_MIN + 
      Math.random() * (CONSTANTS.AUDIO.CROWD_CHANT_MAX - CONSTANTS.AUDIO.CROWD_CHANT_MIN);
    let proposedNextTime = now + nextDelay;
    
    // If the next percussion is scheduled too close, push this forward
    if (proposedNextTime > this.nextPercussionTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextPercussionTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
      // But also ensure we don't play before our minimum interval
      if (proposedNextTime - now < CONSTANTS.AUDIO.CROWD_CHANT_MIN) {
        proposedNextTime = now + CONSTANTS.AUDIO.CROWD_CHANT_MIN;
      }
      nextDelay = proposedNextTime - now;
    }
    
    this.nextCrowdChantTime = proposedNextTime;
    setTimeout(this.scheduleCrowdChant, nextDelay);
  };
  
  /**
   * Schedule percussion beat sound effect
   */
  private schedulePercussionBeat = (): void => {
    if (!this.world) return;
    
    const now = Date.now();
    
    // Play the percussion beat sound effect globally
    const percussion = new Audio({
      uri: CONSTANTS.AUDIO_PATHS.PERCUSSION_BEAT,
      volume: CONSTANTS.AUDIO.PERCUSSION_VOLUME,
    });
    percussion.play(this.world);
    
    // Pick a random interval within allowed range
    let nextDelay = CONSTANTS.AUDIO.PERCUSSION_MIN + 
      Math.random() * (CONSTANTS.AUDIO.PERCUSSION_MAX - CONSTANTS.AUDIO.PERCUSSION_MIN);
    let proposedNextTime = now + nextDelay;
    
    // If the next crowd chant is scheduled too close, push this forward
    if (proposedNextTime > this.nextCrowdChantTime - CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      proposedNextTime = Math.max(proposedNextTime, this.nextCrowdChantTime + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS);
      // But also ensure we don't play before our minimum interval
      if (proposedNextTime - now < CONSTANTS.AUDIO.PERCUSSION_MIN) {
        proposedNextTime = now + CONSTANTS.AUDIO.PERCUSSION_MIN;
      }
      nextDelay = proposedNextTime - now;
    }
    
    this.nextPercussionTime = proposedNextTime;
    setTimeout(this.schedulePercussionBeat, nextDelay);
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
    
    // Ensure no overlap at start
    if (Math.abs((now + firstChantDelay) - (now + firstPercDelay)) < CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS) {
      if (firstChantDelay < firstPercDelay) {
        firstPercDelay = firstChantDelay + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS;
      } else {
        firstChantDelay = firstPercDelay + CONSTANTS.AUDIO.MIN_GAP_BETWEEN_SOUNDS;
      }
    }
    
    this.nextCrowdChantTime = now + firstChantDelay;
    this.nextPercussionTime = now + firstPercDelay;
    
    setTimeout(this.scheduleCrowdChant, firstChantDelay);
    setTimeout(this.schedulePercussionBeat, firstPercDelay);
    
    console.log('AudioManager: Ambient sounds scheduled');
    console.log(`- First crowd chant in ${Math.round(firstChantDelay / 1000)}s`);
    console.log(`- First percussion beat in ${Math.round(firstPercDelay / 1000)}s`);
  }
  
  /**
   * Stop all audio (cleanup method)
   */
  public stop(): void {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }
    console.log('AudioManager: All audio stopped');
  }
  
  /**
   * Get the current background music instance (for debugging)
   */
  public getBackgroundMusic(): Audio | null {
    return this.backgroundMusic;
  }
} 