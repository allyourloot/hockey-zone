/**
 * IceSkatingController - Advanced ice skating physics controller for hockey gameplay
 * Extracted from index.ts - Contains all ice skating mechanics, puck control, and special moves
 */

import {
  Audio,
  DefaultPlayerEntityController,
  PlayerEntity,
  Entity,
  SceneUI,
  BlockType,
  CollisionGroup,
  EntityEvent,
} from 'hytopia';
import type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
} from 'hytopia';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { PlayerManager } from '../managers/PlayerManager';
import { AFKManager } from '../managers/AFKManager';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';
import type { IceSkatingControllerOptions } from '../utils/types';
import { HockeyGameState, HockeyPosition, HockeyTeam } from '../utils/types';
import { AudioManager } from '../managers/AudioManager';
import { IceFloorEntity } from '../entities/IceFloorEntity';
import { SaveDetectionService } from '../services/SaveDetectionService';
import { ShootoutManager } from '../managers/ShootoutManager';

export class IceSkatingController extends DefaultPlayerEntityController {
  private _iceVelocity = { x: 0, z: 0 };
  private _lastMoveDirection: Vector3Like = { x: 0, y: 0, z: 0 };
  private _currentSpeedFactor = 0;
  private readonly ICE_ACCELERATION = CONSTANTS.ICE_SKATING.ICE_ACCELERATION;
  private readonly ICE_DECELERATION = CONSTANTS.ICE_SKATING.ICE_DECELERATION;
  private readonly ICE_MAX_SPEED_MULTIPLIER = CONSTANTS.ICE_SKATING.ICE_MAX_SPEED_MULTIPLIER;
  private readonly DIRECTION_CHANGE_PENALTY = CONSTANTS.ICE_SKATING.DIRECTION_CHANGE_PENALTY;
  private readonly SPRINT_ACCELERATION_RATE = CONSTANTS.ICE_SKATING.SPRINT_ACCELERATION_RATE;
  private readonly SPRINT_DECELERATION_RATE = CONSTANTS.ICE_SKATING.SPRINT_DECELERATION_RATE;
  private readonly MIN_SPEED_FACTOR = CONSTANTS.ICE_SKATING.MIN_SPEED_FACTOR;
  private readonly ACCELERATION_CURVE_POWER = CONSTANTS.ICE_SKATING.ACCELERATION_CURVE_POWER;
  private readonly BACKWARD_SPEED_PENALTY = CONSTANTS.ICE_SKATING.BACKWARD_SPEED_PENALTY;
  private readonly BACKWARD_ACCELERATION_PENALTY = CONSTANTS.ICE_SKATING.BACKWARD_ACCELERATION_PENALTY;
  
  // Hockey stop properties
  private _isHockeyStop = false;
  private _hockeyStopStartTime = 0;
  private _lastHockeyStopTime = 0;
  private readonly HOCKEY_STOP_DURATION = CONSTANTS.HOCKEY_STOP.DURATION;
  private readonly HOCKEY_STOP_DECELERATION = CONSTANTS.HOCKEY_STOP.DECELERATION;
  private readonly HOCKEY_STOP_TURN_SPEED = CONSTANTS.HOCKEY_STOP.TURN_SPEED;
  private readonly HOCKEY_STOP_MIN_SPEED = CONSTANTS.HOCKEY_STOP.MIN_SPEED;
  private readonly HOCKEY_STOP_COOLDOWN = CONSTANTS.HOCKEY_STOP.COOLDOWN;
  private _hockeyStopDirection = 1; // 1 for right, -1 for left
  private _hockeyStopRotation = 0; // Current rotation during hockey stop
  private _hockeyStopSoundPlayed = false; // Track if sound has been played for current hockey stop
  private readonly HOCKEY_STOP_MOMENTUM_PRESERVATION = CONSTANTS.HOCKEY_STOP.MOMENTUM_PRESERVATION;
  private readonly HOCKEY_STOP_SPEED_BOOST = CONSTANTS.HOCKEY_STOP.SPEED_BOOST;
  private readonly HOCKEY_STOP_MAX_ANGLE = CONSTANTS.HOCKEY_STOP.MAX_ANGLE;
  
  // Goalie slide properties
  private _isGoalieSlide = false;
  private _goalieSlideStartTime = 0;
  private _lastGoalieSlideTime = 0;
  private readonly GOALIE_SLIDE_DURATION = CONSTANTS.GOALIE_SLIDE.DURATION;
  private readonly GOALIE_SLIDE_DECELERATION = CONSTANTS.GOALIE_SLIDE.DECELERATION;
  private readonly GOALIE_SLIDE_TURN_SPEED = CONSTANTS.GOALIE_SLIDE.TURN_SPEED;
  private readonly GOALIE_SLIDE_MIN_SPEED = CONSTANTS.GOALIE_SLIDE.MIN_SPEED;
  private readonly GOALIE_SLIDE_COOLDOWN = CONSTANTS.GOALIE_SLIDE.COOLDOWN;
  private _goalieSlideDirection = 1; // 1 for right, -1 for left
  private _goalieSlideRotation = 0; // Current rotation during goalie slide
  private _goalieSlideSoundPlayed = false; // Track if sound has been played for current goalie slide
  private readonly GOALIE_SLIDE_MOMENTUM_PRESERVATION = CONSTANTS.GOALIE_SLIDE.MOMENTUM_PRESERVATION;
  private readonly GOALIE_SLIDE_SPEED_BOOST = CONSTANTS.GOALIE_SLIDE.SPEED_BOOST;
  private readonly GOALIE_SLIDE_MAX_ANGLE = CONSTANTS.GOALIE_SLIDE.MAX_ANGLE;
  private readonly GOALIE_SLIDE_DASH_FORCE = CONSTANTS.GOALIE_SLIDE.DASH_FORCE;
  
  // Spin move properties
  private _isSpinning = false;
  private _spinStartTime = 0;
  private readonly SPIN_DURATION = CONSTANTS.SPIN_MOVE.DURATION;
  private readonly SPIN_COOLDOWN = CONSTANTS.SPIN_MOVE.COOLDOWN;
  private readonly SPIN_MIN_SPEED = CONSTANTS.SPIN_MOVE.MIN_SPEED;
  private readonly SPIN_MOMENTUM_PRESERVATION = CONSTANTS.SPIN_MOVE.MOMENTUM_PRESERVATION;
  private readonly SPIN_BOOST_MULTIPLIER = CONSTANTS.SPIN_MOVE.BOOST_MULTIPLIER;
  private readonly SPIN_BOOST_DURATION = CONSTANTS.SPIN_MOVE.BOOST_DURATION;
  private _initialSpinVelocity = { x: 0, z: 0 };
  private _initialSpinYaw = 0;
  private _lastSpinTime = 0;
  private _spinProgress = 0;
  private _spinBoostEndTime = 0; // Track when the speed boost should end

  // Dash properties
  private _canDash = false; // Becomes true during hockey stop
  private _isDashing = false;
  private _dashStartTime = 0;
  private readonly DASH_DURATION = 250; // Shorter dash duration for more subtle movement
  private readonly DASH_FORCE = 12; // Significantly reduced from 30 to prevent teleportation
  private readonly DASH_COOLDOWN = 2000; // Time before can dash again
  private _lastDashTime = 0;
  private _dashDirection = { x: 0, z: 0 }; // Store the dash direction
  private readonly DASH_INITIAL_BOOST = 1.0; // Further reduced for subtle movement
  
  // Skating sound effect - simplified to walking vs running
  private readonly SKATING_SOUND_VOLUME = CONSTANTS.SKATING_SOUND.VOLUME;
  private readonly SKATING_SOUND_MIN_SPEED = CONSTANTS.SKATING_SOUND.MIN_SPEED;
  private readonly WALK_LOOP_DURATION = CONSTANTS.SKATING_SOUND.WALK_LOOP_DURATION;
  private readonly RUN_LOOP_DURATION = CONSTANTS.SKATING_SOUND.RUN_LOOP_DURATION;
  
  // NEW: Simple skating sound management
  private _isSkatingAudioPlaying: boolean = false;
  private _skatingLoopTimer: NodeJS.Timeout | null = null;
  private _currentMovementState: 'idle' | 'walking' | 'running' = 'idle';
  private _isCleanedUp: boolean = false; // Flag to prevent audio after cleanup
  
  // Puck control properties
  private _controlledPuck: Entity | null = null;
  private _isControllingPuck: boolean = false;
  private _puckOffset: number = 0.8; // Reduced from 1.2 to bring puck closer to player
  private _initialPuckHeight: number | null = null;
  private _controllingPlayer: any = null; // Player reference for chat messages
  private _puckReleaseTime: number = 0; // When the puck was last released
  private _puckReattachCooldown: number = 1000; // Cooldown in milliseconds before puck can be re-attached
  
  // Pass and shot mechanics
  private _minPassForce: number = 10; // Reduced from 20
  private _maxPassForce: number = 25; // Reduced from 45
  private _minShotForce: number = 15; // Reduced from 35
  private _maxShotForce: number = 35; // Reduced from 70
  private _shotLiftMultiplier: number = 0.4; // Slightly reduced from 0.5 for more controlled lift
  private _saucerPassLiftMultiplier: number = 0.1; // Slightly reduced from 0.15 for more controlled saucer passes

  // Puck movement sound properties
  private _lastPuckMoveDirection: string = ''; // Tracks last movement direction for puck sounds
  private _lastPuckSoundTime: number = 0; // Tracks when the last puck sound was played
  private _lastLateralPuckSoundTime: number = 0; // Tracks when the last lateral puck sound was played
  private readonly PUCK_SOUND_COOLDOWN = CONSTANTS.PUCK_SOUND.COOLDOWN; // General puck sound cooldown
  private readonly LATERAL_PUCK_SOUND_COOLDOWN = CONSTANTS.PUCK_SOUND.LATERAL_COOLDOWN; // Lateral puck movement cooldown
  private readonly PUCK_SOUND_VOLUME = CONSTANTS.PUCK_SOUND.VOLUME; // Volume for puck movement sounds

  // Stick check properties
  private _stickCheckCooldown: number = 0; // ms remaining
  private readonly STICK_CHECK_COOLDOWN = 500; // ms (reduced for more responsive checks)
  private readonly STICK_CHECK_RANGE = 2.2; // meters
  private readonly STICK_CHECK_ANGLE = Math.PI / 3; // 60 degrees cone
  private _lastStickCheckTime: number = 0;
  private _lastStickCheckTarget: any = null;
  private _lastStickCheckTargetReleaseTime: number = 0;
  public _lastStickCheckInputTime: number = 0;
  private readonly STICK_CHECK_INPUT_DEBOUNCE = 250; // ms

  // --- Body Check properties ---
  private _bodyCheckCooldown: number = 0;
  private readonly BODY_CHECK_COOLDOWN = CONSTANTS.BODY_CHECK.COOLDOWN;
  private readonly BODY_CHECK_DASH_FORCE = CONSTANTS.BODY_CHECK.DASH_FORCE;
  private readonly BODY_CHECK_DURATION = CONSTANTS.BODY_CHECK.DURATION;
  private _isBodyChecking: boolean = false;
  private _bodyCheckStartTime: number = 0;
  private _bodyCheckDirection: { x: number, z: number } = { x: 0, z: 0 };
  private _bodyCheckPreSpeed: number = 0;
  private _bodyCheckSoundPlayed: boolean = false;
  private _lastBodyCheckInputTime: number = 0;
  private readonly BODY_CHECK_INPUT_DEBOUNCE = 250; // ms

  // Track last SceneUI for this defender
  private _bodyCheckSceneUI: SceneUI | null = null;

  // Goalie puck control timer (5 second limit)
  private _goaliePuckControlStartTime: number = 0;
  private readonly GOALIE_PUCK_CONTROL_LIMIT: number = CONSTANTS.GOALIE_BALANCE.PUCK_CONTROL_LIMIT;
  private _goaliePassWarningShown: boolean = false;

  private _passingPower: number = 1.0;

  public _isCollidingWithPuck: boolean = false;
  public _canPickupPuck: boolean = true;
  public static _globalPuckController: IceSkatingController | null = null;
  public _pendingPuckPickup: boolean = false;
  public _passTargetPuck: Entity | null = null;
  public _passPickupWindow: number = 0;
  public _stunnedUntil: number = 0;
  public _isPlayingSleep: boolean = false;
  public _lastBodyCheckTarget: PlayerEntity | null = null;
  private _lastBodyCheckAvailabilityState: boolean | null = null;
  private _lastSpinMoveAvailabilityState: boolean | null = null;
  private _lastHockeyStopAvailabilityState: boolean | null = null;
  private _lastGoalieSlideAvailabilityState: boolean | null = null;
  public _groundContactCount: number = 0;
  public _wallContactCount: number = 0;
  
  // Faceoff rotation preservation
  private _preserveFaceoffRotationUntil: number = 0;
  private _faceoffRotation: { x: number, y: number, z: number, w: number } | null = null;

  // Add at the top of the class, with other static properties
  public static _showGameplayMessages: boolean = false; // Disabled by default to reduce spam

  public get isGrounded(): boolean {
    return (this._groundContactCount || 0) > 0;
  }

  public get isTouchingWall(): boolean {
    return (this._wallContactCount || 0) > 0;
  }

  constructor(options?: IceSkatingControllerOptions) {
    super({
      walkVelocity: options?.walkVelocity ?? CONSTANTS.PLAYER_DEFAULTS.WALK_VELOCITY,
      runVelocity: options?.runVelocity ?? CONSTANTS.PLAYER_DEFAULTS.RUN_VELOCITY,
      jumpVelocity: CONSTANTS.PLAYER_DEFAULTS.JUMP_VELOCITY,
      idleLoopedAnimations: [...CONSTANTS.PLAYER_DEFAULTS.IDLE_ANIMATIONS],
      walkLoopedAnimations: [...CONSTANTS.PLAYER_DEFAULTS.WALK_ANIMATIONS],
      runLoopedAnimations: [...CONSTANTS.PLAYER_DEFAULTS.RUN_ANIMATIONS],
    });
    if (options?.minShotForce !== undefined) this._minShotForce = options.minShotForce;
    if (options?.maxShotForce !== undefined) this._maxShotForce = options.maxShotForce;
    if (options?.passingPower !== undefined) this._passingPower = options.passingPower;
    
    // Set up entity despawn listener to ensure cleanup
    this.on('entityAssigned', (entity: PlayerEntity) => {
      if (entity) {
        CONSTANTS.debugEntityState(`Entity assigned to IceSkatingController - playerId: ${entity.player?.id}`, 'IceSkatingController');
        entity.on(EntityEvent.DESPAWN, () => {
          CONSTANTS.debugCleanup(`Entity despawned for player ${entity.player?.id}, cleaning up IceSkatingController`, 'IceSkatingController');
          this.cleanupSkatingAudio();
        });
      }
    });
  }

  // Reset spin state
  private resetSpinState(): void {
    this._isSpinning = false;
    this._spinProgress = 0;
    this._initialSpinVelocity = { x: 0, z: 0 };
    this._initialSpinYaw = 0;
  }
  
  // Helper function for smooth easing with better curve
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  // Helper function to smoothly interpolate between angles
  private smoothLerpAngle(current: number, target: number, factor: number): number {
    let diff = target - current;
    // Ensure we take the shortest path
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * factor;
  }
  
  // Helper function to smoothly interpolate velocities
  private smoothLerpVelocity(current: { x: number, z: number }, target: { x: number, z: number }, factor: number): { x: number, z: number } {
    return {
      x: current.x + (target.x - current.x) * factor,
      z: current.z + (target.z - current.z) * factor
    };
  }

  // Method to attach the puck to this player
  public attachPuck(puck: Entity, player: any): void {
    const currentTime = Date.now();
    if (currentTime - this._puckReleaseTime < this._puckReattachCooldown) {
      debugLog(`Puck attachment blocked due to cooldown. Time since release: ${currentTime - this._puckReleaseTime}`, 'IceSkatingController');
      return;
    }
    if (this._isControllingPuck) return;
    
    debugLog(`🏒 Player ${player.id} picking up puck - checking for save...`, 'IceSkatingController');
    
    this._controlledPuck = puck;
    this._isControllingPuck = true;
    this._controllingPlayer = player;
    IceSkatingController._globalPuckController = this;
    if (this._initialPuckHeight === null && puck) {
      this._initialPuckHeight = puck.position.y;
    }
    
        // Check for save detection FIRST (before updating touch history to preserve previous state)
    if (puck && player && player.id) {
      try {
        debugLog(`🏒 Player ${player.id} picking up puck - checking for save...`, 'IceSkatingController');
        
        // Check if this player picking up the puck should count as a save
        const isSave = SaveDetectionService.instance.checkForSave(player.id, puck);
        if (isSave) {
          debugLog(`✅ SAVE RECORDED for player ${player.id}!`, 'IceSkatingController');
          
          // Play save sound effect if available
          if (puck.world) {
            AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.PUCK_CATCH, {
              volume: 1.0,
              attachedToEntity: puck,
              duration: 1500 // 1.5 second duration
            });
          }
          
          // Give feedback to goalie
          if (player.world && IceSkatingController._showGameplayMessages) {
            player.world.chatManager.sendPlayerMessage(player, 'GREAT SAVE!', '00FF00');
          }
        }
      } catch (error) {
        debugWarn('Error in save detection: ' + error, 'IceSkatingController');
      }
    }

    // Track who last touched the puck for goal and assist detection (AFTER save detection)
    if (puck && player && player.id) {
      try {
        const customProps = (puck as any).customProperties;
        if (customProps) {
          // Get current touch history (array of {playerId, timestamp} objects)
          const currentHistory = customProps.get('touchHistory') || [];
          const lastTouchedBy = customProps.get('lastTouchedBy');
          // Use the currentTime already declared above
          
          debugLog(`📋 PUCK PICKUP EVENT: Player ${player.id} at ${new Date().toLocaleTimeString()}`, 'IceSkatingController');
          debugLog(`BEFORE: currentHistory = ${JSON.stringify(currentHistory)}`, 'IceSkatingController');
          debugLog(`BEFORE: lastTouchedBy = ${lastTouchedBy}, player.id = ${player.id}`, 'IceSkatingController');
          
          // Only add to history if it's a different player than the last one
          if (lastTouchedBy !== player.id) {
            debugLog(`✅ Different player detected - updating touch history`, 'IceSkatingController');
            
            // Add current player with timestamp to the front of the history
            const newTouch = { playerId: player.id, timestamp: currentTime };
            const updatedHistory = [newTouch, ...currentHistory];
            
            debugLog(`AFTER adding new touch: updatedHistory = ${JSON.stringify(updatedHistory)}`, 'IceSkatingController');
            
            // Clean up old touches (older than 60 seconds) and limit to last 5 meaningful touches
            const validHistory = updatedHistory
              .filter(touch => {
                const age = currentTime - touch.timestamp;
                debugLog(`Touch ${touch.playerId} age: ${age}ms (keeping if < 60000ms)`, 'IceSkatingController');
                return age < 60000; // Keep touches from last 60 seconds
              })
              .slice(0, 5); // Keep only last 5 touches
            
            debugLog(`FINAL validHistory after filtering: ${JSON.stringify(validHistory)}`, 'IceSkatingController');
            
            customProps.set('touchHistory', validHistory);
            customProps.set('lastTouchedBy', player.id);
            
            debugLog(`✅ Touch history updated successfully`, 'IceSkatingController');
            debugLog(`Puck touched by player: ${player.id}`, 'IceSkatingController');
            debugLog(`Touch history: ${JSON.stringify(validHistory.map(t => `${t.playerId}@${new Date(t.timestamp).toLocaleTimeString()}`))}`, 'IceSkatingController');
          } else {
            debugLog(`⚠️ Same player touched puck again - NOT updating history (${player.id} already last touched)`, 'IceSkatingController');
          }
          
          // Verify what's actually stored
          const storedHistory = customProps.get('touchHistory') || [];
          const storedLastTouched = customProps.get('lastTouchedBy');
          debugLog(`VERIFICATION: stored touchHistory = ${JSON.stringify(storedHistory)}`, 'IceSkatingController');
          debugLog(`VERIFICATION: stored lastTouchedBy = ${storedLastTouched}`, 'IceSkatingController');
          
          // Set puck as controlled to prevent hit-post sounds during skating
          customProps.set('isControlled', true);
        } else {
          debugWarn(`Puck has no customProperties object`, 'IceSkatingController');
        }
      } catch (error) {
        debugWarn(`Could not set puck custom property: ${error}`, 'IceSkatingController');
      }
    }
    
    // Check if this is a goalie and start the 5-second timer
    if (player) {
      const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
      if (teamPos && teamPos.position === HockeyPosition.GOALIE) {
        this._goaliePuckControlStartTime = Date.now();
        this._goaliePassWarningShown = false;
        debugLog(`Goalie ${player.id} picked up puck - 5 second timer started`, 'IceSkatingController');
      }
    }

    // OPTIMIZED: Use pooled audio system for puck attachment
    if (puck.world) {
      AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.PUCK_ATTACH, {
        volume: 0.7,
        attachedToEntity: puck,
        duration: 1000 // 1 second duration
      });
    }
    if (player && player.ui) {
      player.ui.sendData({ type: 'puck-control', hasPuck: true });
    }
    debugLog('Puck attached to player', 'IceSkatingController');
    if (player.world && IceSkatingController._showGameplayMessages) {
      const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
      if (teamPos && teamPos.position === HockeyPosition.GOALIE) {
        player.world.chatManager.sendPlayerMessage(player, 'You have the puck! Pass within 5 seconds or it will auto-pass!', 'FFAA00');
      }
    }
  }

  // Method to release the puck
  public releasePuck(): void {
    debugLog(`🔓 PUCK RELEASE: Player ${this._controllingPlayer?.id} releasing puck at ${new Date().toLocaleTimeString()}`, 'IceSkatingController');
    
    if (this._isControllingPuck && this._controllingPlayer && this._controllingPlayer.ui) {
      this._controllingPlayer.ui.sendData({ type: 'puck-control', hasPuck: false });
    }
    
    // Clear puck controlled status to allow hit-post sounds after release
    if (this._controlledPuck) {
      try {
        const customProps = (this._controlledPuck as any).customProperties;
        if (customProps) {
          customProps.set('isControlled', false);
          
          // Log current touch history at release
          const touchHistory = customProps.get('touchHistory') || [];
          const lastTouchedBy = customProps.get('lastTouchedBy');
          debugLog(`AT RELEASE: touchHistory = ${JSON.stringify(touchHistory)}`, 'IceSkatingController');
          debugLog(`AT RELEASE: lastTouchedBy = ${lastTouchedBy}`, 'IceSkatingController');
        }
      } catch (error) {
        debugWarn(`Could not clear puck isControlled property: ${error}`, 'IceSkatingController');
      }
    }
    
    this._isControllingPuck = false;
    this._controlledPuck = null;
    this._controllingPlayer = null;
    if (IceSkatingController._globalPuckController === this) {
      IceSkatingController._globalPuckController = null;
    }
    this._puckReleaseTime = Date.now();
    this._puckReattachCooldown = 1000;
    
    // Reset goalie timer when puck is released
    this._goaliePuckControlStartTime = 0;
    this._goaliePassWarningShown = false;
    
    debugLog(`✅ Puck release complete - global controller cleared`, 'IceSkatingController');
  }

  // Check if this controller is controlling the puck
  public get isControllingPuck(): boolean {
    return this._isControllingPuck;
  }

  /**
   * Preserve the current faceoff rotation for a specified duration
   * This prevents the normal camera-based rotation from overriding faceoff positioning
   * @param durationMs - How long to preserve the rotation (in milliseconds)
   */
  public preserveFaceoffRotation(durationMs: number = 2000): void {
    this._preserveFaceoffRotationUntil = Date.now() + durationMs;
  }

  /**
   * Set the faceoff rotation to preserve
   * @param rotation - The quaternion rotation to preserve
   */
  public setFaceoffRotation(rotation: { x: number, y: number, z: number, w: number }): void {
    this._faceoffRotation = { ...rotation };
  }

  // Method to execute a pass with given power (0-100)
  public executePuckPass(power: number, yaw: number): void {
    debugLog(`executePuckPass called with power: ${power} yaw: ${yaw}`, 'IceSkatingController');
    debugLog(`Controlling puck? ${this._isControllingPuck} Puck exists? ${!!this._controlledPuck}`, 'IceSkatingController');
    
    if (!this._isControllingPuck || !this._controlledPuck) {
      debugLog('Early return: not controlling puck or puck does not exist', 'IceSkatingController');
      return;
    }

    debugLog(`🏒 PASS EVENT: Player ${this._controllingPlayer?.id} passing puck at ${new Date().toLocaleTimeString()}`, 'IceSkatingController');
    
    // Check current touch history before pass
    try {
      const customProps = (this._controlledPuck as any).customProperties;
      if (customProps) {
        const touchHistory = customProps.get('touchHistory') || [];
        const lastTouchedBy = customProps.get('lastTouchedBy');
        debugLog(`BEFORE PASS: touchHistory = ${JSON.stringify(touchHistory)}`, 'IceSkatingController');
        debugLog(`BEFORE PASS: lastTouchedBy = ${lastTouchedBy}`, 'IceSkatingController');
      }
    } catch (error) {
      debugLog(`Could not read puck properties before pass: ${error}`, 'IceSkatingController');
    }

    // Play stick swing sound effect using pooled audio system
    if (this._controlledPuck.world) {
      AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.PASS_PUCK, {
        volume: 1,
        attachedToEntity: this._controlledPuck,
        duration: 800 // 0.8 second duration
      });
    }

    const powerPercent = Math.max(0, Math.min(100, power)) / 100;
    const passForce = (this._minPassForce + (powerPercent * (this._maxPassForce - this._minPassForce))) * this._passingPower;
    const saucerLift = powerPercent * this._saucerPassLiftMultiplier * passForce;

    // Calculate forward direction based on camera facing
    const forward = {
      x: Math.sin(yaw),
      y: 0,
      z: Math.cos(yaw)
    };

          debugLog(`Pass force: ${passForce} Forward direction: ${JSON.stringify(forward)} Yaw: ${yaw}`, 'IceSkatingController');

    // Store references before releasing puck
    const puck = this._controlledPuck;
    const player = this._controllingPlayer;

    // Calculate impulse based on puck mass for consistent physics
    const impulse = {
      x: forward.x * passForce * puck.mass,
      y: saucerLift * puck.mass,
      z: forward.z * passForce * puck.mass
    };
    
          debugLog(`Applying pass impulse to puck: ${JSON.stringify(impulse)} puck mass: ${puck.mass}`, 'IceSkatingController');
    
    debugLog(`🚀 Releasing puck for pass - player ${player?.id} no longer controlling`, 'IceSkatingController');
    
    // Release puck BEFORE applying impulse to prevent interference
    this.releasePuck();
    
    // Check touch history after release
    setTimeout(() => {
      try {
        const customProps = (puck as any).customProperties;
        if (customProps) {
          const touchHistory = customProps.get('touchHistory') || [];
          const lastTouchedBy = customProps.get('lastTouchedBy');
          debugLog(`AFTER PASS RELEASE: touchHistory = ${JSON.stringify(touchHistory)}`, 'IceSkatingController');
          debugLog(`AFTER PASS RELEASE: lastTouchedBy = ${lastTouchedBy}`, 'IceSkatingController');
        }
      } catch (error) {
        debugLog(`Could not read puck properties after pass: ${error}`, 'IceSkatingController');
      }
    }, 10);
    
    // Apply the impulse in the next frame to ensure clean release
    setTimeout(() => {
      if (puck.isSpawned) {
        puck.applyImpulse(impulse);
        
        // Add a slight spin for more realistic puck physics
        puck.applyTorqueImpulse({ 
          x: 0,
          y: (Math.random() - 0.5) * passForce * 0.1,
          z: 0 
        });
      }
    }, 0);

    // Log velocities for debugging - only if speed is significant
    setTimeout(() => {
      if (puck.isSpawned && Math.sqrt(puck.linearVelocity.x * puck.linearVelocity.x + puck.linearVelocity.z * puck.linearVelocity.z) > 5) {
        debugLog(`Puck velocity after pass: ${JSON.stringify(puck.linearVelocity)}`, 'IceSkatingController');
      }
    }, 50);

    if (player && puck.world && IceSkatingController._showGameplayMessages) {
      const passType = powerPercent > 0.7 ? 'HARD PASS' : powerPercent > 0.3 ? 'Medium pass' : 'Soft pass';
      puck.world.chatManager.sendPlayerMessage(
        player,
        `${passType}! Power: ${Math.round(powerPercent * 100)}%`,
        powerPercent > 0.7 ? 'FF4444' : powerPercent > 0.3 ? 'FFFF00' : '00FF00'
      );
    }
  }

  // Method to execute a shot with given power (0-100)
  public executeShot(power: number, yaw: number): void {
    debugLog(`executeShot called with power: ${power} yaw: ${yaw}`, 'IceSkatingController');
          debugLog(`Controlling puck? ${this._isControllingPuck} Puck exists? ${!!this._controlledPuck}`, 'IceSkatingController');
    
    if (!this._isControllingPuck || !this._controlledPuck) {
      debugLog('Early return: not controlling puck or puck does not exist', 'IceSkatingController');
      return;
    }

    // Play wrist shot sound effect using pooled audio system
    if (this._controlledPuck.world) {
      AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.WRIST_SHOT, {
        volume: 1,
        attachedToEntity: this._controlledPuck,
        duration: 1200 // 1.2 second duration
      });
    }

    const powerPercent = Math.max(0, Math.min(100, power)) / 100;
    const shotForce = this._minShotForce + (powerPercent * (this._maxShotForce - this._minShotForce));
    const liftForce = shotForce * this._shotLiftMultiplier * powerPercent;

    // Calculate forward direction based on camera facing
    const forward = {
      x: Math.sin(yaw),
      y: 0,
      z: Math.cos(yaw)
    };

            debugLog(`Shot force: ${shotForce} Lift force: ${liftForce} Forward direction: ${JSON.stringify(forward)} Yaw: ${yaw}`, 'IceSkatingController');

    // Store references before releasing puck
    const puck = this._controlledPuck;
    const player = this._controllingPlayer;

    // Calculate impulse based on puck mass for consistent physics
    const impulse = {
      x: forward.x * shotForce * puck.mass,
      y: liftForce * puck.mass,
      z: forward.z * shotForce * puck.mass
    };
    
          debugLog(`Applying shot impulse to puck: ${JSON.stringify(impulse)} puck mass: ${puck.mass}`, 'IceSkatingController');
    
    // Release puck BEFORE applying impulse to prevent interference
    this.releasePuck();
    
    // Apply the impulse in the next frame to ensure clean release
    setTimeout(() => {
      if (puck.isSpawned) {
        puck.applyImpulse(impulse);
        
        // Add spin for more realistic shot physics
        puck.applyTorqueImpulse({ 
          x: 0,
          y: powerPercent * shotForce * 0.2,
          z: 0 
        });
      }
    }, 0);

    // Log velocities for debugging - only if speed is significant
    setTimeout(() => {
      if (puck.isSpawned && Math.sqrt(puck.linearVelocity.x * puck.linearVelocity.x + puck.linearVelocity.z * puck.linearVelocity.z) > 5) {
        debugLog(`Puck velocity after shot: ${JSON.stringify(puck.linearVelocity)}`, 'IceSkatingController');
      }
    }, 50);

    if (player && puck.world && IceSkatingController._showGameplayMessages) {
      const shotType = powerPercent > 0.7 ? 'POWERFUL SHOT' : powerPercent > 0.3 ? 'Medium shot' : 'Light shot';
      puck.world.chatManager.sendPlayerMessage(
        player,
        `${shotType}! Power: ${Math.round(powerPercent * 100)}% (Lift: ${Math.round(liftForce * 10) / 10})`,
        powerPercent > 0.7 ? 'FF4444' : powerPercent > 0.3 ? 'FFFF00' : '00FF00'
      );
    }
  }

  // Main movement processing method - complete ice skating physics implementation
  public tickWithPlayerInput(
    entity: PlayerEntity,
    input: PlayerInput,
    cameraOrientation: PlayerCameraOrientation,
    deltaTimeMs: number
  ): void {
    // CRITICAL: Check cleanup flag FIRST - if cleaned up, don't process anything
    if (this._isCleanedUp) {
      CONSTANTS.debugCleanup(`tickWithPlayerInput - Controller cleaned up, skipping tick`, 'IceSkatingController');
      return;
    }
    
    // CRITICAL: Enhanced entity validation - ensure entity is still spawned and valid
    if (!entity || !entity.isSpawned || !entity.world) {
      CONSTANTS.debugEntityState(`Entity validation failed in tickWithPlayerInput - entity: ${!!entity}, isSpawned: ${entity?.isSpawned}, world: ${!!entity?.world}`, 'IceSkatingController');
      this.cleanupSkatingAudio();
      return;
    }
    
    // CRITICAL: Check if this controller is orphaned (entity exists but player might have disconnected)
    if (!entity.player) {
      CONSTANTS.debugEntityState(`Entity has no player reference in tickWithPlayerInput, cleaning up controller`, 'IceSkatingController');
      this.cleanupSkatingAudio();
      return;
    }

    // DEBUG: Log tick with player info periodically
    const now = Date.now();
    if (now % 1000 < 50) { // Log roughly once per second (when deltaTime aligns)
      CONSTANTS.debugEntityState(`tickWithPlayerInput processing for player ${entity.player.id}, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');
    }
    
    // Track player activity for AFK detection
    const hasAnyInput = !!(input.w || input.a || input.s || input.d || input.sh || input.sp || input.r || input.mr || input.ml);
    const entityVelocity = entity.linearVelocity;
    const entitySpeed = Math.sqrt(entityVelocity.x * entityVelocity.x + entityVelocity.z * entityVelocity.z);
    const hasMovement = entitySpeed > CONSTANTS.AFK_DETECTION.ACTIVITY_THRESHOLD;
    
    // Record activity if there's any input or movement
    if (hasAnyInput || hasMovement) {
      AFKManager.instance.recordActivity(entity.player.id);
    }
    
    // --- MOVEMENT LOCK STATES: Prevent movement during goal reset, match start, period transitions, and shootout countdowns ---
    const gameState = HockeyGameManager.instance.state;
    const isShootoutCountdown = gameState === HockeyGameState.SHOOTOUT_IN_PROGRESS && 
                               HockeyGameManager.instance.isShootoutMode() && 
                               ShootoutManager.instance.isCountdownActive();
                               
    if (gameState === HockeyGameState.GOAL_SCORED || 
        gameState === HockeyGameState.MATCH_START || 
        gameState === HockeyGameState.PERIOD_END ||
        isShootoutCountdown) {
      // Stop all movement and prevent input during goal celebration, match start, or shootout countdown
      entity.setLinearVelocity({ x: 0, y: entity.linearVelocity.y, z: 0 });
      this._iceVelocity = { x: 0, z: 0 };
      this._currentSpeedFactor = 0;
      
      // Force idle animation during movement lock
      entity.stopAllModelAnimations();
      entity.startModelLoopedAnimations(['idle-upper', 'idle-lower']);
      
      // Prevent puck interactions during locked states
      if (this._isControllingPuck) {
        this.releasePuck();
      }
      this._canPickupPuck = false;
      
      return; // Skip all other input processing
    } else {
      // Re-enable puck pickup when not in locked states
      this._canPickupPuck = true;
    }
    
    // --- STUNNED STATE: Prevent movement and play sleep animation ---
    if (this._stunnedUntil > Date.now()) {
      if (!this._isPlayingSleep) {
        entity.stopAllModelAnimations();
        entity.startModelLoopedAnimations(['sleep']);
        this._isPlayingSleep = true;
      }
      // Prevent movement and all other animation changes while stunned
      return;
    } else {
      this._isPlayingSleep = false;
    }
    
    const isPuckController = IceSkatingController._globalPuckController === this;

    // Extract input values and handle potential undefined yaw
    const { w, a, s, d, sh, sp, r, mr } = input;
    const yaw = cameraOrientation.yaw || 0;
    
    // Debug right-click input
    if (mr) {
      debugLog(`Right-click detected! mr: ${mr} controlling puck: ${this._isControllingPuck}`, 'IceSkatingController');
    }
    const currentVelocity = entity.linearVelocity;
    const isRunning = !!sh;
    const hasMovementInput = !!(w || a || s || d);
    
    // Calculate current speed (moved to top)
    const currentSpeed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);

    // Get player team and position for move restrictions
    const teamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player?.id || '');
    const isGoalie = teamPos && teamPos.position === HockeyPosition.GOALIE;
    
    // --- GOALIE AUTO-PASS TIMER ---
    if (isGoalie && this._isControllingPuck && this._goaliePuckControlStartTime > 0) {
      const currentTime = Date.now();
      const timeHoldingPuck = currentTime - this._goaliePuckControlStartTime;
      const timeRemaining = this.GOALIE_PUCK_CONTROL_LIMIT - timeHoldingPuck;
      
      // Show warning at configured time remaining
      if (timeRemaining <= CONSTANTS.GOALIE_BALANCE.WARNING_TIME && !this._goaliePassWarningShown && entity.player) {
        this._goaliePassWarningShown = true;
        if (entity.player.world && IceSkatingController._showGameplayMessages) {
          entity.player.world.chatManager.sendPlayerMessage(entity.player, `WARNING: Auto-pass in ${Math.ceil(timeRemaining / 1000)} seconds!`, 'FF0000');
        }
                  debugLog(`Goalie ${entity.player.id} warned - auto-pass in ${Math.ceil(timeRemaining / 1000)} seconds`, 'IceSkatingController');
      }
      
      // Send UI countdown updates when under countdown threshold
      if (timeRemaining <= CONSTANTS.GOALIE_BALANCE.COUNTDOWN_THRESHOLD && entity.player) {
        entity.player.ui.sendData({
          type: 'goalie-pass-countdown',
          timeRemaining: Math.max(0, timeRemaining)
        });
      }
      
      // Auto-pass when timer expires
      if (timeRemaining <= 0) {
        debugLog(`Goalie ${entity.player?.id} auto-pass triggered - 5 seconds expired`, 'IceSkatingController');
        
        // Execute automatic pass with very light power in current camera direction
        // This gives goalies a gentle nudge to release the puck without being overpowered
        this.executePuckPass(15, yaw); // 15% power - very light pass in current camera direction
        
        debugLog(`Auto-pass executed for goalie ${entity.player?.id} with light power (15%)`, 'IceSkatingController');
        
        // Notify the goalie
        if (entity.player && entity.player.world && IceSkatingController._showGameplayMessages) {
          entity.player.world.chatManager.sendPlayerMessage(entity.player, 'AUTO-PASS! Goalies must pass within 5 seconds!', 'FF4444');
        }
        
        // Reset timer
        this._goaliePuckControlStartTime = 0;
        this._goaliePassWarningShown = false;
        
        // Clear UI countdown
        if (entity.player) {
          entity.player.ui.sendData({
            type: 'goalie-pass-countdown',
            timeRemaining: 0
          });
        }
      }
    }
    
    // Handle goalie slide initiation (Goalies only)
    if (sp && isGoalie && currentSpeed >= this.GOALIE_SLIDE_MIN_SPEED && !this._isGoalieSlide && !this._isDashing) {
      const currentTime = Date.now();
      
      // Calculate movement direction relative to camera
      const moveDirection = { x: 0, z: 0 };
      if (w) { moveDirection.x -= Math.sin(yaw); moveDirection.z -= Math.cos(yaw); }
      if (s) { moveDirection.x += Math.sin(yaw); moveDirection.z += Math.cos(yaw); }
      if (a) { moveDirection.x -= Math.cos(yaw); moveDirection.z += Math.sin(yaw); }
      if (d) { moveDirection.x += Math.cos(yaw); moveDirection.z -= Math.sin(yaw); }
      
      // Normalize movement direction if any input
      const moveLength = Math.sqrt(moveDirection.x * moveDirection.x + moveDirection.z * moveDirection.z);
      if (moveLength > 0) {
        moveDirection.x /= moveLength;
        moveDirection.z /= moveLength;
      }
      
      // For goalies, allow slide in any direction (no forward movement restriction)
      const goalieCooldownRemaining = Math.max(0, this.GOALIE_SLIDE_COOLDOWN - (currentTime - this._lastGoalieSlideTime));
      
      // Always update UI with cooldown status when player exists
      if (entity.player) {
        // Send cooldown update
        entity.player.ui.sendData({
          type: 'goalie-slide-cooldown',
          cooldownRemaining: goalieCooldownRemaining
        });
      }
      
      if (currentTime - this._lastDashTime >= this.DASH_COOLDOWN && 
          goalieCooldownRemaining === 0) {
        // If we have movement input, slide in that direction, otherwise slide based on current velocity
        let slideDirection = { x: 0, z: 0 };
        
        if (moveLength > 0) {
          // Use input direction if player is inputting movement
          slideDirection = moveDirection;
        } else {
          // Use current velocity direction if no input
          const velocityLength = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
          if (velocityLength > 0) {
            slideDirection.x = currentVelocity.x / velocityLength;
            slideDirection.z = currentVelocity.z / velocityLength;
          } else {
            // Default to forward if no velocity
            slideDirection.x = -Math.sin(yaw);
            slideDirection.z = -Math.cos(yaw);
          }
        }
        
        this._isGoalieSlide = true;
        this._goalieSlideStartTime = currentTime;
        this._lastGoalieSlideTime = currentTime;
        this._goalieSlideDirection = a ? -1 : 1; // Determine slide direction based on A/D input
        this._canDash = true; // Enable dashing during goalie slide
        this._goalieSlideSoundPlayed = false; // Reset sound flag for new goalie slide
        
        // Send immediate cooldown update when goalie slide is triggered
        if (entity.player) {
          entity.player.ui.sendData({
            type: 'goalie-slide-cooldown',
            cooldownRemaining: this.GOALIE_SLIDE_COOLDOWN
          });
          
          // Play goalie slide sound effect using pooled audio (only once per slide)
          if (entity.world && !this._goalieSlideSoundPlayed) {
            AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.GOALIE_SLIDE, {
              volume: 0.5,
              attachedToEntity: entity,
              duration: 800 // 0.8 second duration
            });
            this._goalieSlideSoundPlayed = true;
          }
        }
      }
    }
    // Handle hockey stop initiation (Non-Goalies only)
    else if (sp && !isGoalie && currentSpeed > this.HOCKEY_STOP_MIN_SPEED && !this._isHockeyStop && !this._isDashing) {
      const currentTime = Date.now();
      
      // Calculate movement direction relative to camera
      const moveDirection = { x: 0, z: 0 };
      if (w) { moveDirection.x -= Math.sin(yaw); moveDirection.z -= Math.cos(yaw); }
      if (s) { moveDirection.x += Math.sin(yaw); moveDirection.z += Math.cos(yaw); }
      if (a) { moveDirection.x -= Math.cos(yaw); moveDirection.z += Math.sin(yaw); }
      if (d) { moveDirection.x += Math.cos(yaw); moveDirection.z -= Math.sin(yaw); }
      
      // Normalize movement direction if any input
      const moveLength = Math.sqrt(moveDirection.x * moveDirection.x + moveDirection.z * moveDirection.z);
      if (moveLength > 0) {
        moveDirection.x /= moveLength;
        moveDirection.z /= moveLength;
      }
      
      // Calculate dot product between movement and velocity to determine if moving forward
      const velocityDir = {
        x: currentVelocity.x / currentSpeed,
        z: currentVelocity.z / currentSpeed
      };
      const moveDotVelocity = moveDirection.x * velocityDir.x + moveDirection.z * velocityDir.z;
      
      // Only allow hockey stop if not moving primarily forward and cooldown is over
      const hockeyCooldownRemaining = Math.max(0, this.HOCKEY_STOP_COOLDOWN - (currentTime - this._lastHockeyStopTime));
      
      // Always update UI with cooldown status when player exists
      if (entity.player) {
        // Send cooldown update
        entity.player.ui.sendData({
          type: 'hockey-stop-cooldown',
          cooldownRemaining: hockeyCooldownRemaining
        });
      }
      
      if (moveDotVelocity < 0.7 && 
          currentTime - this._lastDashTime >= this.DASH_COOLDOWN && 
          hockeyCooldownRemaining === 0) {
        this._isHockeyStop = true;
        this._hockeyStopStartTime = currentTime;
        this._lastHockeyStopTime = currentTime;
        this._hockeyStopDirection = a ? -1 : 1; // Determine stop direction based on A/D input
        this._canDash = true; // Re-enable dashing during hockey stop with reduced force
        this._hockeyStopSoundPlayed = false; // Reset sound flag for new hockey stop
        
        // Send immediate cooldown update when hockey stop is triggered
        if (entity.player) {
          entity.player.ui.sendData({
            type: 'hockey-stop-cooldown',
            cooldownRemaining: this.HOCKEY_STOP_COOLDOWN
          });
          
          // Play hockey stop sound effect using pooled audio (only once per hockey stop)
          if (entity.world && !this._hockeyStopSoundPlayed) {
            AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.ICE_STOP, {
              volume: 0.4,
              attachedToEntity: entity,
              duration: 800 // 0.8 second duration
            });
            this._hockeyStopSoundPlayed = true;
          }
        }
      }
    }

    // Handle hockey stop, goalie slide state and potential dash
    if (this._isHockeyStop || this._isGoalieSlide || this._isDashing) {
      const currentTime = Date.now();
      
      // Handle dash initiation during hockey stop
      if (this._canDash && hasMovementInput && !this._isDashing) {
        // Calculate dash direction based on input and camera orientation
        const moveVector = { x: 0, z: 0 };
        if (w) { moveVector.x -= Math.sin(yaw); moveVector.z -= Math.cos(yaw); }
        if (s) { moveVector.x += Math.sin(yaw); moveVector.z += Math.cos(yaw); }
        if (a) { moveVector.x -= Math.cos(yaw); moveVector.z += Math.sin(yaw); }
        if (d) { moveVector.x += Math.cos(yaw); moveVector.z -= Math.sin(yaw); }
        
        // Normalize the direction vector
        const length = Math.sqrt(moveVector.x * moveVector.x + moveVector.z * moveVector.z);
        if (length > 0) {
          this._dashDirection = {
            x: moveVector.x / length,
            z: moveVector.z / length
          };
          
          // Start the dash
          this._isDashing = true;
          this._dashStartTime = currentTime;
          this._canDash = false;
          this._lastDashTime = currentTime;
          
          // Play dash sound effect using pooled audio
          if (entity.world) {
            AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.ICE_STOP, {
              volume: 0.4,
              playbackRate: 1.2,
              attachedToEntity: entity,
              duration: 600 // 0.6 second duration
            });
          }
          
          // End hockey stop immediately if it was active
          this._isHockeyStop = false;
          this._hockeyStopRotation = 0;
          this._hockeyStopSoundPlayed = false; // Reset sound flag when hockey stop ends
        }
      }
      
      // Handle active dash
      if (this._isDashing) {
        const dashElapsed = currentTime - this._dashStartTime;
        if (dashElapsed >= this.DASH_DURATION) {
          // End dash
          this._isDashing = false;
          this._dashDirection = { x: 0, z: 0 };
        } else {
          // Apply dash force with initial boost and smooth falloff
          const dashProgress = dashElapsed / this.DASH_DURATION;
          const boostMultiplier = this.DASH_INITIAL_BOOST * (1 - dashProgress) + 1;
          const dashPower = this.DASH_FORCE * boostMultiplier * (1 - Math.pow(dashProgress, 2));
          
          // Set velocity directly for more responsive dash
          const newVelocity = {
            x: this._dashDirection.x * dashPower,
            y: currentVelocity.y,
            z: this._dashDirection.z * dashPower
          };
          
          entity.setLinearVelocity(newVelocity);
          
          // Update ice velocity to match dash for smooth transition
          this._iceVelocity.x = newVelocity.x;
          this._iceVelocity.z = newVelocity.z;
          
          // Handle puck control during dash
          if (this._isControllingPuck && this._controlledPuck && this._controlledPuck.isSpawned && isPuckController) {
            // Calculate forward direction from camera yaw and dash direction
            const puckOffset = this._puckOffset;
            const targetPosition = {
              x: entity.position.x + (this._dashDirection.x * puckOffset),
              y: this._initialPuckHeight || entity.position.y,
              z: entity.position.z + (this._dashDirection.z * puckOffset)
            };
            
            // Set puck position and velocity to match the dash
            this._controlledPuck.setPosition(targetPosition);
            this._controlledPuck.setLinearVelocity(newVelocity);
          }
          
          // Skip rest of the movement code during dash
          return;
        }
      }
      // Handle hockey stop if no dash is happening
      else if (this._isHockeyStop) {
        const elapsedTime = currentTime - this._hockeyStopStartTime;
        
        if (elapsedTime >= this.HOCKEY_STOP_DURATION) {
          // End hockey stop
          this._isHockeyStop = false;
          this._hockeyStopRotation = 0;
          this._canDash = false;
          this._hockeyStopSoundPlayed = false; // Reset sound flag when hockey stop ends
        } else {
          // Calculate rotation progress (0 to 1) with smoother initial rotation
          const rotationProgress = Math.min(elapsedTime / this.HOCKEY_STOP_DURATION, 1);
          
          // Use a custom easing function for smoother rotation
          const easeInOutQuad = rotationProgress < 0.5 
            ? 2 * rotationProgress * rotationProgress 
            : 1 - Math.pow(-2 * rotationProgress + 2, 2) / 2;
          
          // Apply smoother rotation with reduced max angle
          this._hockeyStopRotation = (this.HOCKEY_STOP_MAX_ANGLE * easeInOutQuad) * this._hockeyStopDirection;
          
          // SIMPLIFIED HOCKEY STOP - just decelerate and slightly redirect
          // Apply strong deceleration during hockey stop
          this._iceVelocity.x *= this.HOCKEY_STOP_DECELERATION;
          this._iceVelocity.z *= this.HOCKEY_STOP_DECELERATION;
          
          // Only apply minimal directional change at the very end of the hockey stop
          if (rotationProgress > 0.8) {
            const currentSpeed = Math.sqrt(this._iceVelocity.x * this._iceVelocity.x + this._iceVelocity.z * this._iceVelocity.z);
            const redirectionStrength = (rotationProgress - 0.8) * 5; // Only in last 20% of duration
            
            // Calculate new direction
            const newDirection = {
              x: Math.sin(yaw + (this._hockeyStopRotation * Math.PI / 180)),
              z: Math.cos(yaw + (this._hockeyStopRotation * Math.PI / 180))
            };
            
            // Apply very subtle redirection
            const redirectionSpeed = currentSpeed * 0.3 * redirectionStrength; // Very small redirection
            this._iceVelocity.x = this._iceVelocity.x * (1 - redirectionStrength) + newDirection.x * redirectionSpeed * redirectionStrength;
            this._iceVelocity.z = this._iceVelocity.z * (1 - redirectionStrength) + newDirection.z * redirectionSpeed * redirectionStrength;
          }
          
          // Calculate the player's actual body rotation angle
          const stopAngle = this._hockeyStopRotation * Math.PI / 180;
          const bodyYaw = yaw + stopAngle;
          const halfYaw = bodyYaw / 2;
          
          // Set player rotation
          entity.setRotation({
            x: 0,
            y: Math.fround(Math.sin(halfYaw)),
            z: 0,
            w: Math.fround(Math.cos(halfYaw)),
          });
          
          // Handle puck control during hockey stop
          if (this._isControllingPuck && this._controlledPuck && this._controlledPuck.isSpawned && isPuckController) {
            // Determine puck attachment side based on movement input
            // During hockey stop, use the direction that triggered the stop
            const attachmentAngle = this._hockeyStopDirection === -1 ? 
              Math.PI / 2 :  // Left side (-1)
              -Math.PI / 2;  // Right side (1)
            
            // Calculate puck position based on the attachment angle relative to player's body
            const puckDirection = {
              x: Math.sin(bodyYaw + attachmentAngle),
              z: Math.cos(bodyYaw + attachmentAngle)
            };
            
            // Calculate target position relative to player's body orientation
            const targetPosition = {
              x: entity.position.x + (puckDirection.x * this._puckOffset),
              y: this._initialPuckHeight || entity.position.y,
              z: entity.position.z + (puckDirection.z * this._puckOffset)
            };
            
            // Apply position update with minimal smoothing
            const smoothingFactor = 0.5;
            const currentPuckPos = this._controlledPuck.position;
            
            this._controlledPuck.setPosition({
              x: currentPuckPos.x + (targetPosition.x - currentPuckPos.x) * smoothingFactor,
              y: targetPosition.y,
              z: currentPuckPos.z + (targetPosition.z - currentPuckPos.z) * smoothingFactor
            });
            
            // Match velocity to maintain control
            this._controlledPuck.setLinearVelocity({
              x: this._iceVelocity.x,
              y: 0,
              z: this._iceVelocity.z
            });
          }
          
          return; // Skip regular movement code during hockey stop
        }
      }
      // Handle goalie slide if no dash is happening
      else if (this._isGoalieSlide) {
        const elapsedTime = currentTime - this._goalieSlideStartTime;
        
        if (elapsedTime >= this.GOALIE_SLIDE_DURATION) {
          // End goalie slide
          this._isGoalieSlide = false;
          this._goalieSlideRotation = 0;
          this._canDash = false;
          this._goalieSlideSoundPlayed = false; // Reset sound flag when goalie slide ends
        } else {
          // Calculate rotation progress (0 to 1) with smoother initial rotation
          const rotationProgress = Math.min(elapsedTime / this.GOALIE_SLIDE_DURATION, 1);
          
          // Use a custom easing function for smoother rotation
          const easeInOutQuad = rotationProgress < 0.5 
            ? 2 * rotationProgress * rotationProgress 
            : 1 - Math.pow(-2 * rotationProgress + 2, 2) / 2;
          
          // Apply smoother rotation with goalie slide max angle
          this._goalieSlideRotation = (this.GOALIE_SLIDE_MAX_ANGLE * easeInOutQuad) * this._goalieSlideDirection;
          
          // GOALIE SLIDE - minimal deceleration with dash-like movement
          // Apply minimal deceleration during goalie slide (maintain more momentum)
          this._iceVelocity.x *= this.GOALIE_SLIDE_DECELERATION;
          this._iceVelocity.z *= this.GOALIE_SLIDE_DECELERATION;
          
          // Apply dash-like forward movement during the slide
          const slideProgress = elapsedTime / this.GOALIE_SLIDE_DURATION;
          const dashForce = this.GOALIE_SLIDE_DASH_FORCE * (1 - slideProgress); // Reduce force over time
          
          // Calculate movement direction based on input
          let slideDirection = { x: 0, z: 0 };
          if (hasMovementInput) {
            // Use current input direction
            if (w) { slideDirection.x -= Math.sin(yaw); slideDirection.z -= Math.cos(yaw); }
            if (s) { slideDirection.x += Math.sin(yaw); slideDirection.z += Math.cos(yaw); }
            if (a) { slideDirection.x -= Math.cos(yaw); slideDirection.z += Math.sin(yaw); }
            if (d) { slideDirection.x += Math.cos(yaw); slideDirection.z -= Math.sin(yaw); }
            
            const length = Math.sqrt(slideDirection.x * slideDirection.x + slideDirection.z * slideDirection.z);
            if (length > 0) {
              slideDirection.x /= length;
              slideDirection.z /= length;
            }
          } else {
            // Use forward direction if no input
            slideDirection.x = -Math.sin(yaw);
            slideDirection.z = -Math.cos(yaw);
          }
          
          // Apply slide force
          this._iceVelocity.x += slideDirection.x * dashForce * 0.1;
          this._iceVelocity.z += slideDirection.z * dashForce * 0.1;
          
          // Calculate the player's actual body rotation angle
          const slideAngle = this._goalieSlideRotation * Math.PI / 180;
          const bodyYaw = yaw + slideAngle;
          const halfYaw = bodyYaw / 2;
          
          // Set player rotation
          entity.setRotation({
            x: 0,
            y: Math.fround(Math.sin(halfYaw)),
            z: 0,
            w: Math.fround(Math.cos(halfYaw)),
          });
          
          // Handle puck control during goalie slide
          if (this._isControllingPuck && this._controlledPuck && this._controlledPuck.isSpawned && isPuckController) {
            // Determine puck attachment side based on movement input
            // During goalie slide, use the direction that triggered the slide
            const attachmentAngle = this._goalieSlideDirection === -1 ? 
              Math.PI / 2 :  // Left side (-1)
              -Math.PI / 2;  // Right side (1)
            
            // Calculate puck position based on the attachment angle relative to player's body
            const puckDirection = {
              x: Math.sin(bodyYaw + attachmentAngle),
              z: Math.cos(bodyYaw + attachmentAngle)
            };
            
            // Calculate target position relative to player's body orientation
            const targetPosition = {
              x: entity.position.x + (puckDirection.x * this._puckOffset),
              y: this._initialPuckHeight || entity.position.y,
              z: entity.position.z + (puckDirection.z * this._puckOffset)
            };
            
            // Apply position update with minimal smoothing
            const smoothingFactor = 0.5;
            const currentPuckPos = this._controlledPuck.position;
            
            this._controlledPuck.setPosition({
              x: currentPuckPos.x + (targetPosition.x - currentPuckPos.x) * smoothingFactor,
              y: targetPosition.y,
              z: currentPuckPos.z + (targetPosition.z - currentPuckPos.z) * smoothingFactor
            });
            
            // Match velocity to maintain control
            this._controlledPuck.setLinearVelocity({
              x: this._iceVelocity.x,
              y: 0,
              z: this._iceVelocity.z
            });
          }
          
          return; // Skip regular movement code during goalie slide
        }
      }
    }

    // Handle Body Check (Defender-only ability)
    if (!this._isControllingPuck && !this._isBodyChecking && this._bodyCheckCooldown <= 0 && entity.player) {
      const teamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player.id);
      
      // Only defenders can body check
      if (teamPos && (teamPos.position === HockeyPosition.DEFENDER1 || teamPos.position === HockeyPosition.DEFENDER2)) {
        // Find nearest opponent in front within UI range and angle
        let bodyCheckTarget: PlayerEntity | null = null;
        let bodyCheckTargetDist = Infinity;
        
        const yaw = cameraOrientation.yaw || 0;
        const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        
        for (const otherEntity of entity.world.entityManager.getAllPlayerEntities()) {
          if (otherEntity === entity) continue;
          if (!(otherEntity.controller instanceof IceSkatingController)) continue;
          
          const theirTeamPos = HockeyGameManager.instance.getTeamAndPosition(otherEntity.player.id);
          if (!theirTeamPos || theirTeamPos.team === teamPos.team || theirTeamPos.position === HockeyPosition.GOALIE) continue; // Only opponents who are NOT goalies
          
          // Vector from self to other
          const dx = otherEntity.position.x - entity.position.x;
          const dz = otherEntity.position.z - entity.position.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist > CONSTANTS.BODY_CHECK.UI_RANGE) continue;
          
          // Angle between forward and target
          const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          
          if (angle > CONSTANTS.BODY_CHECK.ANGLE / 2) continue;
          
          if (dist < bodyCheckTargetDist) {
            bodyCheckTarget = otherEntity;
            bodyCheckTargetDist = dist;
          }
        }
        
        // Attach SceneUI to the opponent if in range
        if (bodyCheckTarget) {
          if (this._lastBodyCheckTarget !== bodyCheckTarget) {
            // Remove SceneUI from previous target
            if (this._bodyCheckSceneUI) {
              this._bodyCheckSceneUI.unload();
              this._bodyCheckSceneUI = null;
            }
            
            // Attach SceneUI to new target
            const sceneUI = new SceneUI({
              templateId: 'body-check-indicator',
              attachedToEntity: bodyCheckTarget,
              state: { visible: true },
              offset: { x: 0, y: 1.4, z: 0 },
            });
            sceneUI.load(entity.world);
            this._bodyCheckSceneUI = sceneUI;
            this._lastBodyCheckTarget = bodyCheckTarget;
            
            // Enable body check icon in UI
            if (entity.player && this._lastBodyCheckAvailabilityState !== true) {
              entity.player.ui.sendData({ type: 'body-check-available', available: true });
              this._lastBodyCheckAvailabilityState = true;
            }
          } else if (this._bodyCheckSceneUI) {
            // Update state to ensure visible
            this._bodyCheckSceneUI.setState({ visible: true });
            
            // Enable body check icon in UI
            if (entity.player && this._lastBodyCheckAvailabilityState !== true) {
              entity.player.ui.sendData({ type: 'body-check-available', available: true });
              this._lastBodyCheckAvailabilityState = true;
            }
          }
        } else {
          // No target, remove SceneUI from previous target
          if (this._bodyCheckSceneUI) {
            this._bodyCheckSceneUI.unload();
            this._bodyCheckSceneUI = null;
            this._lastBodyCheckTarget = null;
          }
          
          // Disable body check icon in UI
          if (entity.player && this._lastBodyCheckAvailabilityState !== false) {
            entity.player.ui.sendData({ type: 'body-check-available', available: false });
            this._lastBodyCheckAvailabilityState = false;
          }
        }
        
        // Handle body check input (left click)
        if (input.ml && bodyCheckTarget && bodyCheckTargetDist <= CONSTANTS.BODY_CHECK.UI_RANGE) {
          const now = Date.now();
          
          // Input debounce to prevent multiple body checks from holding down mouse button
          if (now - this._lastBodyCheckInputTime >= this.BODY_CHECK_INPUT_DEBOUNCE) {
            // Start body check with magnetization toward target
            const dx = bodyCheckTarget.position.x - entity.position.x;
            const dz = bodyCheckTarget.position.z - entity.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            this._isBodyChecking = true;
            this._bodyCheckStartTime = Date.now();
            this._bodyCheckCooldown = CONSTANTS.BODY_CHECK.COOLDOWN;
            this._bodyCheckSoundPlayed = false;
            this._lastBodyCheckInputTime = now;
            
            // Magnetize dash direction to target
            this._bodyCheckDirection = { 
              x: dx / (dist || 1), 
              z: dz / (dist || 1) 
            };
            
            // Store pre-body-check speed for knockback calculation
            this._bodyCheckPreSpeed = Math.sqrt(entity.linearVelocity.x * entity.linearVelocity.x + entity.linearVelocity.z * entity.linearVelocity.z);
            
            // Update UI cooldown immediately
            if (entity.player) {
              entity.player.ui.sendData({
                type: 'body-check-cooldown',
                cooldownRemaining: CONSTANTS.BODY_CHECK.COOLDOWN
              });
            }
            
            debugLog(`[BodyCheck] TRIGGERED for player ${entity.player?.id}`, 'IceSkatingController');
          }
          
          input.ml = false; // Always consume input to prevent other actions
        }
      } else if (input.ml) {
        // Not a defender, show feedback
        if (entity.player && entity.player.ui) {
          entity.player.ui.sendData({ type: 'notification', message: 'Only Defenders can Body Check!' });
        }
        input.ml = false; // Consume input
      }
    } else {
      // Not eligible for body check, remove SceneUI from previous target
      if (this._bodyCheckSceneUI) {
        this._bodyCheckSceneUI.unload();
        this._bodyCheckSceneUI = null;
        this._lastBodyCheckTarget = null;
      }
      
      // Disable body check icon in UI
      if (entity.player && this._lastBodyCheckAvailabilityState !== false) {
        entity.player.ui.sendData({ type: 'body-check-available', available: false });
        this._lastBodyCheckAvailabilityState = false;
      }
    }
    
    // Handle active body check
    if (this._isBodyChecking) {
      const elapsed = Date.now() - this._bodyCheckStartTime;
      
      if (elapsed < CONSTANTS.BODY_CHECK.DURATION) {
        // Apply strong forward velocity during body check
        entity.setLinearVelocity({
          x: this._bodyCheckDirection.x * CONSTANTS.BODY_CHECK.DASH_FORCE,
          y: entity.linearVelocity.y,
          z: this._bodyCheckDirection.z * CONSTANTS.BODY_CHECK.DASH_FORCE
        });
        
        // Check for collision with opposing players
        for (const otherEntity of entity.world.entityManager.getAllPlayerEntities()) {
          if (otherEntity === entity) continue;
          if (!(otherEntity.controller instanceof IceSkatingController)) continue;
          
                      // Check if close enough for body check hit
            const dx = otherEntity.position.x - entity.position.x;
            const dz = otherEntity.position.z - entity.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            const myTeamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player.id);
            const theirTeamPos = HockeyGameManager.instance.getTeamAndPosition(otherEntity.player.id);
            
            if (dist < CONSTANTS.BODY_CHECK.RANGE) {
              // Check if on opposing team and target is NOT a goalie
              if (myTeamPos && theirTeamPos && myTeamPos.team !== theirTeamPos.team && theirTeamPos.position !== HockeyPosition.GOALIE) {
              // Check if the target player is controlling the puck
              const wasControllingPuck = otherEntity.controller instanceof IceSkatingController && otherEntity.controller.isControllingPuck;
              
              // TRACK HIT STAT: Only record hit if the body-checked player was controlling the puck
              if (wasControllingPuck) {
                const PlayerStatsManager = require('../managers/PlayerStatsManager').PlayerStatsManager;
                if (PlayerStatsManager.instance && entity.player) {
                  PlayerStatsManager.instance.recordHit(entity.player.id).catch((error: any) => {
                    debugError('Error recording hit stat:', error, 'IceSkatingController');
                  });
                  debugLog(`[BodyCheck] Recorded hit for player ${entity.player.id} - target was controlling puck`, 'IceSkatingController');
                }
              } else {
                debugLog(`[BodyCheck] No hit recorded for player ${entity.player.id} - target was not controlling puck`, 'IceSkatingController');
              }
              
              // If they are controlling the puck, detach it
              if (wasControllingPuck) {
                const ctrl = otherEntity.controller as IceSkatingController;
                ctrl.releasePuck();
                ctrl._isControllingPuck = false;
                ctrl._controlledPuck = null;
                if (IceSkatingController._globalPuckController === ctrl) {
                  IceSkatingController._globalPuckController = null;
                }
                ctrl._puckReleaseTime = Date.now();
                ctrl._puckReattachCooldown = 1200;
                ctrl._canPickupPuck = false;
                setTimeout(() => { ctrl._canPickupPuck = true; }, 1500);
                
                if (otherEntity.player && otherEntity.player.ui) {
                  otherEntity.player.ui.sendData({ 
                    type: 'notification', 
                    message: 'You were body checked! Lost the puck!' 
                  });
                }
              }
              
              // Apply knockback to the hit player
              const pushDir = { x: dx / (dist || 1), z: dz / (dist || 1) };
              
              // Calculate knockback force based on attacker's speed
              const minScale = 0.3, maxScale = 1.0;
              const speedNorm = Math.min(1, this._bodyCheckPreSpeed / (this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER));
              const forceScale = minScale + (maxScale - minScale) * speedNorm;
              
              let knockbackForce = CONSTANTS.BODY_CHECK.DASH_FORCE * 1.2 * forceScale;
              knockbackForce = Math.max(1, Math.min(knockbackForce, 8)); // Clamp for gentler effect
              
              otherEntity.setLinearVelocity({
                x: pushDir.x * knockbackForce,
                y: 0.5 * forceScale, // Minimal vertical lift
                z: pushDir.z * knockbackForce
              });
              
              // Apply stunned state and sleep animation
              if (otherEntity.controller instanceof IceSkatingController) {
                otherEntity.controller._stunnedUntil = Date.now() + 2000;
                otherEntity.controller._isPlayingSleep = false; // Force re-trigger
              }
              
              // Stop current animations and start sleep animation
              otherEntity.stopAllModelAnimations();
              otherEntity.startModelLoopedAnimations(['sleep']);
              
              // Apply additional knockback after a short delay
              setTimeout(() => {
                otherEntity.setLinearVelocity({
                  x: pushDir.x * knockbackForce,
                  y: 0.5 * forceScale,
                  z: pushDir.z * knockbackForce
                });
              }, 50);
              
              // Prevent attacker from picking up puck immediately
              this._canPickupPuck = false;
              setTimeout(() => { this._canPickupPuck = true; }, 500);
              
              // Play body check sound effect using pooled audio system
              if (entity.world && !this._bodyCheckSoundPlayed) {
                AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.BODY_CHECK, {
                  volume: 1.0,
                  attachedToEntity: otherEntity,
                  duration: 1000 // 1 second duration
                });
                this._bodyCheckSoundPlayed = true;
              }
              
              this._isBodyChecking = false;
              break;
            }
          }
        }
        
        return; // Skip rest of movement code during body check
      } else {
        // End body check
        this._isBodyChecking = false;
        this._bodyCheckSoundPlayed = false;
      }
    }
    
    // Reduce body check cooldown
    if (this._bodyCheckCooldown > 0) {
      this._bodyCheckCooldown = Math.max(0, this._bodyCheckCooldown - deltaTimeMs);
    }

    // --- STICK CHECK LOGIC ---
    const stickCheckTime = Date.now();
    
    // Reduce stick check cooldown
    if (this._stickCheckCooldown > 0) {
      this._stickCheckCooldown = Math.max(0, this._stickCheckCooldown - deltaTimeMs);
    }
    
    // Handle stick check input (right click when not controlling puck)
    if (mr && !this._isControllingPuck) {
      debugLog(`Stick check input detected! mr: ${mr} controlling puck: ${this._isControllingPuck}`, 'IceSkatingController');
      
      // Input debounce to prevent spam
      if (stickCheckTime - this._lastStickCheckInputTime >= this.STICK_CHECK_INPUT_DEBOUNCE) {
        debugLog('Stick check input passed debounce, playing swing sound', 'IceSkatingController');
        
        // Play stick swing sound effect for all stick check attempts (using whoosh.mp3)
        if (entity.world) {
          AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.SWING_STICK, {
            volume: 0.4,
            attachedToEntity: entity,
            duration: 600 // 0.6 second duration
          });
        }
        
        this._lastStickCheckInputTime = stickCheckTime;
        
        // Check if we can perform stick check (cooldown and puck collision)
        debugLog('Stick check conditions:', 'IceSkatingController');
        debugLog(`  mr: ${mr}`, 'IceSkatingController');
        debugLog(`  isControllingPuck: ${this._isControllingPuck}`, 'IceSkatingController');
        debugLog(`  stickCheckCooldown: ${this._stickCheckCooldown}`, 'IceSkatingController');
        debugLog(`  isCollidingWithPuck: ${this._isCollidingWithPuck}`, 'IceSkatingController');
        
                // Stick check should work when near puck - removed collision requirement for better playability
        if (mr && !this._isControllingPuck && this._stickCheckCooldown === 0) {
          debugLog('All conditions met - attempting stick check...', 'IceSkatingController');
          
          // Stick check logic matching backup implementation
          let foundController = null;
          let foundPuck = null;
          let foundDist = 999;
          let foundYaw = 0;
          
          for (const otherEntity of entity.world.entityManager.getAllPlayerEntities()) {
            if (otherEntity === entity) continue;
            if (!(otherEntity.controller instanceof IceSkatingController)) continue;
            const ctrl = otherEntity.controller as IceSkatingController;
            if (!ctrl.isControllingPuck || !ctrl._controlledPuck) continue;
            
            // Check if the target player is a goalie - goalies cannot be stick checked
            const targetTeamPos = HockeyGameManager.instance.getTeamAndPosition(otherEntity.player.id);
            if (targetTeamPos && targetTeamPos.position === HockeyPosition.GOALIE) continue;
            
                         // Calculate defender's stick tip position (in front of defender)
             const stickOffset = 1.0; // meters in front of defender (balanced for good playability)
             const stickTip = {
               x: entity.position.x - Math.sin(yaw) * stickOffset,
               y: entity.position.y,
               z: entity.position.z - Math.cos(yaw) * stickOffset
             };
             
             // Check distance from stick tip to puck
             const dx = ctrl._controlledPuck.position.x - stickTip.x;
             const dz = ctrl._controlledPuck.position.z - stickTip.z;
             const dist = Math.sqrt(dx*dx + dz*dz);
             
             if (dist < 0.8 && dist < foundDist) {
              foundController = ctrl;
              foundPuck = ctrl._controlledPuck;
              foundDist = dist;
              foundYaw = yaw;
            }
          }
          
          debugLog(`Found controller: ${!!foundController} Found puck: ${!!foundPuck} Distance: ${foundDist}`, 'IceSkatingController');
          
          if (foundController && foundPuck) {
            // Steal the puck
            foundController.releasePuck();
            foundController._puckReleaseTime = stickCheckTime;
            foundController._puckReattachCooldown = 1000;
            setTimeout(() => {
              this._pendingPuckPickup = true;
              this.attachPuck(foundPuck, entity.player);
              this._pendingPuckPickup = false;
            }, 100);
            
            // Play sound for both using pooled audio system
            if (entity.world) {
              AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.STICK_CHECK, {
                volume: 0.2,
                attachedToEntity: entity,
                duration: 800 // 0.8 second duration
              });
            }
            if (foundController._controllingPlayer && foundController._controllingPlayer.world) {
              AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.PUCK_ATTACH, {
                volume: 0.5,
                attachedToEntity: foundController._controllingPlayer,
                duration: 1000 // 1 second duration
              });
            }
            
            // Feedback
            if (entity.player) {
              entity.player.ui.sendData({ type: 'notification', message: 'Stick check! You stole the puck!' });
            }
            if (foundController._controllingPlayer && foundController._controllingPlayer.ui) {
              foundController._controllingPlayer.ui.sendData({ type: 'notification', message: 'You lost the puck to a stick check!' });
            }
            this._stickCheckCooldown = this.STICK_CHECK_COOLDOWN;
            this._lastStickCheckTime = stickCheckTime;
            this._lastStickCheckTarget = foundController;
          } else {
            // Play miss sound using pooled audio system
            if (entity.world) {
              AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.STICK_CHECK_MISS, {
                volume: 0.2,
                attachedToEntity: entity,
                duration: 600 // 0.6 second duration
              });
            }
            if (entity.player) {
              entity.player.ui.sendData({ type: 'notification', message: 'Stick check missed!' });
            }
            this._stickCheckCooldown = this.STICK_CHECK_COOLDOWN / 2;
          }
          
          input.mr = false; // Consume input only after stick check logic executes
        }
      }
    }
    // --- END STICK CHECK LOGIC ---

    // Handle spin move initiation - requires running (not just walking) and minimum speed
    if (r && !this._isSpinning && this._isControllingPuck && w && !s && isRunning) {
      const currentTime = Date.now();
      const spinCooldownRemaining = Math.max(0, this.SPIN_COOLDOWN - (currentTime - this._lastSpinTime));
      if (entity.player) {
        entity.player.ui.sendData({
          type: 'spin-move-cooldown',
          cooldownRemaining: spinCooldownRemaining
        });
      }
      if (currentSpeed >= this.SPIN_MIN_SPEED && spinCooldownRemaining === 0) {
        this.resetSpinState();
        this._isSpinning = true;
        this._spinStartTime = currentTime;
        this._lastSpinTime = currentTime;
        this._spinProgress = 0;
        // Always spin forward: use current velocity direction
        const velocityMag = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);
        const forwardDir = velocityMag > 0 ? {
          x: currentVelocity.x / velocityMag,
          z: currentVelocity.z / velocityMag
        } : { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        this._initialSpinVelocity = {
          x: forwardDir.x * currentSpeed * this.SPIN_MOMENTUM_PRESERVATION,
          z: forwardDir.z * currentSpeed * this.SPIN_MOMENTUM_PRESERVATION
        };
        this._initialSpinYaw = Math.atan2(forwardDir.x, forwardDir.z);
        // Play spin move sound effects using pooled audio system
        if (entity.world) {
          AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.ICE_STOP, {
            volume: 0.3,
            playbackRate: 1.8,
            attachedToEntity: entity,
            duration: 600 // 0.6 second duration
          });
          // Play whoosh sound effect for spin move
          AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.WHOOSH, {
            volume: 0.4,
            attachedToEntity: entity,
            duration: 800 // 0.8 second duration
          });
        }
        if (entity.player) {
          entity.player.ui.sendData({
            type: 'spin-move-cooldown',
            cooldownRemaining: this.SPIN_COOLDOWN
          });
        }
      }
    }

    // Handle active spin move
    if (this._isSpinning) {
      const currentTime = Date.now();
      const spinElapsed = currentTime - this._spinStartTime;
      const progress = Math.min(1, spinElapsed / this.SPIN_DURATION);
      this._spinProgress = progress;
      // 360 degree rotation forward
      const spinAngle = this._initialSpinYaw + (progress * Math.PI * 2); // 0 to 2PI
      const halfYaw = spinAngle / 2;
      entity.setRotation({
        x: 0,
        y: Math.fround(Math.sin(halfYaw)),
        z: 0,
        w: Math.fround(Math.cos(halfYaw)),
      });
      // Maintain velocity during spin
      const velocity = {
        x: Math.sin(spinAngle) * this._initialSpinVelocity.x + Math.cos(spinAngle) * this._initialSpinVelocity.z,
        y: currentVelocity.y,
        z: Math.cos(spinAngle) * this._initialSpinVelocity.z - Math.sin(spinAngle) * this._initialSpinVelocity.x
      };
      entity.setLinearVelocity({ x: velocity.x, y: velocity.y, z: velocity.z });
      // Handle puck control during spin
      if (this._isControllingPuck && this._controlledPuck && this._controlledPuck.isSpawned && isPuckController) {
        const puckOffset = this._puckOffset * 1.2;
        const puckDir = { x: Math.sin(spinAngle), z: Math.cos(spinAngle) };
        const targetPosition = {
          x: entity.position.x + (puckDir.x * puckOffset),
          y: this._initialPuckHeight || entity.position.y,
          z: entity.position.z + (puckDir.z * puckOffset)
        };
        const smoothingFactor = 0.5;
        const currentPuckPos = this._controlledPuck.position;
        this._controlledPuck.setPosition({
          x: currentPuckPos.x + (targetPosition.x - currentPuckPos.x) * smoothingFactor,
          y: targetPosition.y,
          z: currentPuckPos.z + (targetPosition.z - currentPuckPos.z) * smoothingFactor
        });
        this._controlledPuck.setLinearVelocity({ x: velocity.x, y: 0, z: velocity.z });
      }
      // End spin
      if (progress >= 1) {
        // Start the temporary speed boost (2 seconds)
        this._spinBoostEndTime = Date.now() + this.SPIN_BOOST_DURATION;
        debugLog(`Spin move completed - speed boost active for ${this.SPIN_BOOST_DURATION}ms`, 'IceSkatingController');
        
        // Apply initial boosted velocity to give immediate feedback
        const boostSpeed = Math.min(this.runVelocity * this.SPIN_BOOST_MULTIPLIER, Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z));
        const forward = { x: Math.sin(this._initialSpinYaw), z: Math.cos(this._initialSpinYaw) };
        entity.setLinearVelocity({ x: forward.x * boostSpeed, y: currentVelocity.y, z: forward.z * boostSpeed });
        
        // Animation: force running animation if moving, else idle
        if (this.isGrounded && entity.isSpawned) {
          if (boostSpeed > 0.1) {
            entity.stopAllModelAnimations();
            entity.startModelLoopedAnimations(['run-upper', 'run-lower']);
          } else {
            entity.stopAllModelAnimations();
            entity.startModelLoopedAnimations(['idle-upper', 'idle-lower']);
          }
        }
        this.resetSpinState();
        return;
      }
      return; // Skip rest of movement code during spin
    }

    // Handle puck control if we have the puck (complete version with lateral movement)
    if (this._isControllingPuck && this._controlledPuck && this._controlledPuck.isSpawned && isPuckController) {
      // Always keep puck in front, but add lateral offset based on movement
      let lateralOffset = 0; // Default to center
      let newDirection = '';
      
      // Determine movement direction with priority for lateral movement
      if (a && !d) {
        // Moving left - shift puck left
        lateralOffset = -0.4;
        newDirection = w ? 'lateral-left-forward' : 'lateral-left';
      } else if (d && !a) {
        // Moving right - shift puck right
        lateralOffset = 0.4;
        newDirection = w ? 'lateral-right-forward' : 'lateral-right';
      } else if (w && !s) {
        // Only set forward if no lateral movement
        newDirection = 'forward';
      }
      
      // Play puck movement sound if direction has changed
      if (newDirection) {
        this.playPuckMovementSound(entity, newDirection);
      }
      
      // Rotate hockey stick based on puck movement direction
      this.updateHockeyStickRotation(entity, newDirection, lateralOffset);
      
      // Calculate forward direction from camera yaw
      const forward = {
        x: -Math.sin(yaw),
        y: 0,
        z: -Math.cos(yaw)
      };
      
      // Calculate right vector for lateral movement
      const right = {
        x: Math.cos(yaw),
        y: 0,
        z: -Math.sin(yaw)
      };

      // Calculate new position based on forward position plus lateral offset
      const targetPosition = {
        x: entity.position.x + (forward.x * this._puckOffset) + (right.x * lateralOffset),
        y: this._initialPuckHeight || entity.position.y,
        z: entity.position.z + (forward.z * this._puckOffset) + (right.z * lateralOffset)
      };

      // Apply position update with smoothing for more natural movement
      const currentPuckPos = this._controlledPuck.position;
      const smoothingFactor = 0.5;
      
      this._controlledPuck.setPosition({
        x: currentPuckPos.x + (targetPosition.x - currentPuckPos.x) * smoothingFactor,
        y: targetPosition.y,
        z: currentPuckPos.z + (targetPosition.z - currentPuckPos.z) * smoothingFactor
      });

      // Match velocity to maintain control
      this._controlledPuck.setLinearVelocity({
        x: entity.linearVelocity.x,
        y: 0,
        z: entity.linearVelocity.z
      });
    }
    
    // Ice skating movement physics
    const targetVelocity = this._calculateIceMovement(!!w, !!a, !!s, !!d, yaw, isRunning);
    
    // Gradually accelerate towards target velocity (ice feel)
    if (targetVelocity.x !== 0 || targetVelocity.z !== 0) {
      // Accelerate towards target
      this._iceVelocity.x += (targetVelocity.x - this._iceVelocity.x) * this.ICE_ACCELERATION;
      this._iceVelocity.z += (targetVelocity.z - this._iceVelocity.z) * this.ICE_ACCELERATION;
    } else {
      // Decelerate when no input (ice sliding)
      this._iceVelocity.x *= this.ICE_DECELERATION;
      this._iceVelocity.z *= this.ICE_DECELERATION;
    }

    // Apply the ice velocity while preserving vertical velocity
    entity.setLinearVelocity({
      x: this._iceVelocity.x,
      y: currentVelocity.y,
      z: this._iceVelocity.z,
    });

    // Apply rotation based on movement direction, unless preserving faceoff rotation
    const currentTime = Date.now();
    if (this._preserveFaceoffRotationUntil > currentTime && this._faceoffRotation) {
      // Preserve faceoff rotation during protection period
      entity.setRotation(this._faceoffRotation);
    } else {
      // Normal camera-based rotation
      const halfYaw = yaw / 2;
      entity.setRotation({
        x: 0,
        y: Math.fround(Math.sin(halfYaw)),
        z: 0,
        w: Math.fround(Math.cos(halfYaw)),
      });
    }

    // Handle simplified ice skating sound effect (walking vs running)
    if (this.isGrounded && !this._isHockeyStop && !this._isDashing) {
      // Calculate actual player speed to check minimum threshold
      const playerVelocity = entity.linearVelocity;
      const actualSpeed = Math.sqrt(playerVelocity.x * playerVelocity.x + playerVelocity.z * playerVelocity.z);
      
      // Determine movement state based on input AND speed threshold
      let newMovementState: 'idle' | 'walking' | 'running' = 'idle';
      
      if (hasMovementInput && actualSpeed >= this.SKATING_SOUND_MIN_SPEED) {
        newMovementState = isRunning ? 'running' : 'walking';
      }
      
      // Update skating sound if movement state changed
      if (newMovementState !== this._currentMovementState) {
        this.updateSkatingSound(entity, newMovementState);
        this._currentMovementState = newMovementState;
      }
    } else {
      // Stop skating sound when not grounded or during special moves
      if (this._currentMovementState !== 'idle') {
        this.updateSkatingSound(entity, 'idle');
        this._currentMovementState = 'idle';
      }
    }

    // Update spin move availability UI based on conditions (only when state changes)
    if (entity.player) {
      const currentTime = Date.now();
      const spinCooldownRemaining = Math.max(0, this.SPIN_COOLDOWN - (currentTime - this._lastSpinTime));
      const canSpinMove = this._isControllingPuck && 
                         isRunning && 
                         currentSpeed >= this.SPIN_MIN_SPEED && 
                         spinCooldownRemaining === 0 && 
                         !this._isSpinning;
      
      // Only send UI update if availability state changed
      if (canSpinMove !== this._lastSpinMoveAvailabilityState) {
        entity.player.ui.sendData({
          type: 'spin-move-available',
          available: canSpinMove
        });
        this._lastSpinMoveAvailabilityState = canSpinMove;
      }

      // Update availability based on player position
      if (isGoalie) {
        // Update goalie slide availability UI based on conditions (only when state changes)
        const goalieCooldownRemaining = Math.max(0, this.GOALIE_SLIDE_COOLDOWN - (currentTime - this._lastGoalieSlideTime));
        const canGoalieSlide = currentSpeed >= this.GOALIE_SLIDE_MIN_SPEED && 
                              goalieCooldownRemaining === 0 && 
                              !this._isGoalieSlide && 
                              !this._isDashing;
        
        // Only send UI update if availability state changed
        if (canGoalieSlide !== this._lastGoalieSlideAvailabilityState) {
          entity.player.ui.sendData({
            type: 'goalie-slide-available',
            available: canGoalieSlide
          });
          this._lastGoalieSlideAvailabilityState = canGoalieSlide;
        }
        
        // Hide hockey stop for goalies
        if (this._lastHockeyStopAvailabilityState !== false) {
          entity.player.ui.sendData({
            type: 'hockey-stop-available',
            available: false
          });
          this._lastHockeyStopAvailabilityState = false;
        }
      } else {
        // Update hockey stop availability UI based on conditions (only when state changes)
        const hockeyCooldownRemaining = Math.max(0, this.HOCKEY_STOP_COOLDOWN - (currentTime - this._lastHockeyStopTime));
        const canHockeyStop = currentSpeed >= this.HOCKEY_STOP_MIN_SPEED && 
                             hockeyCooldownRemaining === 0 && 
                             !this._isHockeyStop && 
                             !this._isDashing;
        
        // Only send UI update if availability state changed
        if (canHockeyStop !== this._lastHockeyStopAvailabilityState) {
          entity.player.ui.sendData({
            type: 'hockey-stop-available',
            available: canHockeyStop
          });
          this._lastHockeyStopAvailabilityState = canHockeyStop;
        }
        
        // Hide goalie slide for non-goalies
        if (this._lastGoalieSlideAvailabilityState !== false) {
          entity.player.ui.sendData({
            type: 'goalie-slide-available',
            available: false
          });
          this._lastGoalieSlideAvailabilityState = false;
        }
      }
    }

    // Handle player animations based on movement state
    if (this.isGrounded && hasMovementInput) {
      if (isRunning) {
        // Determine direction-specific run animations
        let runAnimations = ['run-upper', 'run-lower'];
        if (s && !w) {
          // Running backwards
          runAnimations = ['run-backwards-upper', 'run-backwards-lower'];
        } else if (a && !d) {
          // Running left
          runAnimations = ['run-strafe-left-upper', 'run-strafe-left-lower'];
        } else if (d && !a) {
          // Running right
          runAnimations = ['run-strafe-right-upper', 'run-strafe-right-lower'];
        }
        entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !runAnimations.includes(v)));
        entity.startModelLoopedAnimations(runAnimations);
      } else {
        // Determine direction-specific walk animations
        let walkAnimations = ['walk-upper', 'walk-lower'];
        if (s && !w) {
          // Walking backwards
          walkAnimations = ['walk-backwards-upper', 'walk-backwards-lower'];
        } else if (a && !d) {
          // Walking left
          walkAnimations = ['walk-strafe-left-upper', 'walk-strafe-left-lower'];
        } else if (d && !a) {
          // Walking right
          walkAnimations = ['walk-strafe-right-upper', 'walk-strafe-right-lower'];
        }
        entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !walkAnimations.includes(v)));
        entity.startModelLoopedAnimations(walkAnimations);
      }
    } else {
      // Idle state
      const idleAnimations = ['idle-upper', 'idle-lower'];
      entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !idleAnimations.includes(v)));
      entity.startModelLoopedAnimations(idleAnimations);
    }
  }

  // Helper method to calculate ice movement
  private _calculateIceMovement(w: boolean, a: boolean, s: boolean, d: boolean, yaw: number, isRunning: boolean): Vector3Like {
    let maxVelocity = isRunning ? this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER : this.walkVelocity * this.ICE_MAX_SPEED_MULTIPLIER;
    
    // Apply spin move boost multiplier if boost is active
    const currentTime = Date.now();
    if (this._spinBoostEndTime > currentTime) {
      maxVelocity *= this.SPIN_BOOST_MULTIPLIER;
      const remainingTime = this._spinBoostEndTime - currentTime;
                debugLog(`Spin boost active - max velocity: ${maxVelocity.toFixed(2)} (boosted by ${this.SPIN_BOOST_MULTIPLIER}x), ${remainingTime}ms remaining`, 'IceSkatingController');
    } else if (this._spinBoostEndTime > 0 && this._spinBoostEndTime <= currentTime) {
      // Boost just expired, log it once and reset the timer
                debugLog(`Spin boost expired - returning to normal velocity`, 'IceSkatingController');
      this._spinBoostEndTime = 0;
    }
    
    const targetVelocities = { x: 0, z: 0 };

    // Calculate raw movement direction based on input and camera orientation
    if (w) {
      targetVelocities.x -= Math.sin(yaw);
      targetVelocities.z -= Math.cos(yaw);
    }
    if (s) {
      targetVelocities.x += Math.sin(yaw);
      targetVelocities.z += Math.cos(yaw);
    }
    if (a) {
      targetVelocities.x -= Math.cos(yaw);
      targetVelocities.z += Math.sin(yaw);
    }
    if (d) {
      targetVelocities.x += Math.cos(yaw);
      targetVelocities.z -= Math.sin(yaw);
    }

    // Normalize direction vector
    const length = Math.sqrt(targetVelocities.x * targetVelocities.x + targetVelocities.z * targetVelocities.z);
    if (length > 0) {
      targetVelocities.x /= length;
      targetVelocities.z /= length;

      // Calculate dot product between current and new direction to detect direction changes
      const dotProduct = this._lastMoveDirection.x * targetVelocities.x + this._lastMoveDirection.z * targetVelocities.z;
      const directionChangeFactor = (dotProduct + 1) / 2; // Convert from [-1,1] to [0,1] range
      
      // Update last move direction
      this._lastMoveDirection = { x: targetVelocities.x, y: 0, z: targetVelocities.z };

      // Update speed factor with non-linear acceleration curve
      if (isRunning) {
        // Apply non-linear acceleration curve
        const accelerationFactor = Math.pow(1 - this._currentSpeedFactor, this.ACCELERATION_CURVE_POWER);
        this._currentSpeedFactor = Math.min(1, this._currentSpeedFactor + (this.SPRINT_ACCELERATION_RATE * accelerationFactor));
      } else {
        // Decelerate more quickly when not sprinting
        this._currentSpeedFactor = Math.max(
          this.MIN_SPEED_FACTOR,
          this._currentSpeedFactor - this.SPRINT_DECELERATION_RATE
        );
      }

      // Apply speed and direction change factors
      const finalVelocity = maxVelocity * this._currentSpeedFactor;
      
      // Calculate acceleration modifier with direction change penalty
      const directionPenalty = 1 - ((1 - directionChangeFactor) * this.DIRECTION_CHANGE_PENALTY);
      const accelerationModifier = Math.max(0.3, directionPenalty) * (isRunning ? 0.8 : 1);

      targetVelocities.x *= finalVelocity * accelerationModifier;
      targetVelocities.z *= finalVelocity * accelerationModifier;
    } else {
      // Reset speed factor when not moving, but maintain some momentum
      this._currentSpeedFactor = Math.max(
        this.MIN_SPEED_FACTOR,
        this._currentSpeedFactor - this.SPRINT_DECELERATION_RATE
      );
      this._lastMoveDirection = { x: 0, y: 0, z: 0 };
    }

    return { x: targetVelocities.x, y: 0, z: targetVelocities.z };
  }

  // Helper method to play puck movement sounds with anti-spam optimization
  private playPuckMovementSound(entity: PlayerEntity, newDirection: string): void {
    // Check cleanup flag first
    if (this._isCleanedUp) return;
    
    // Enhanced entity validation
    if (!this._isControllingPuck || !entity || !entity.world || !entity.isSpawned) return;

    try {
      const currentTime = Date.now();
      
      // Only play sound if direction has changed
      if (newDirection !== this._lastPuckMoveDirection) {
        let soundUri = '';
        let isLateralMovement = false;
        
        // OPTIMIZED: Only play puck-attach sound for initial attachment, not during dangling
        // Remove the forward/catch sound that was causing spam during normal movement
        
        // Play lateral movement sounds only
        if (newDirection.includes('lateral-left')) {
          soundUri = CONSTANTS.AUDIO_PATHS.PUCK_LEFT;
          isLateralMovement = true;
        }
        else if (newDirection.includes('lateral-right')) {
          soundUri = CONSTANTS.AUDIO_PATHS.PUCK_RIGHT;
          isLateralMovement = true;
        }
        
        // Use appropriate cooldown based on movement type
        if (soundUri) {
          const relevantCooldown = isLateralMovement ? this.LATERAL_PUCK_SOUND_COOLDOWN : this.PUCK_SOUND_COOLDOWN;
          const lastSoundTime = isLateralMovement ? this._lastLateralPuckSoundTime : this._lastPuckSoundTime;
          
          // Check cooldown before playing sound
          if (currentTime - lastSoundTime >= relevantCooldown) {
            try {
              // Use pooled audio system to prevent accumulation
              AudioManager.instance.playPooledSoundEffect(soundUri, {
                volume: this.PUCK_SOUND_VOLUME,
                attachedToEntity: entity,
                duration: 400 // 0.4 second duration
              });
              
              // Update appropriate timestamp
              if (isLateralMovement) {
                this._lastLateralPuckSoundTime = currentTime;
              } else {
                this._lastPuckSoundTime = currentTime;
              }
            } catch (audioError) {
              // Handle audio errors gracefully - entity might have become invalid
              debugLog('Error playing puck sound, ignoring', 'IceSkatingController');
            }
          }
        }
      }
      this._lastPuckMoveDirection = newDirection;
    } catch (error) {
      // Handle any errors gracefully - entity might have become invalid during execution
      debugLog('Error in playPuckMovementSound, silently ignoring', 'IceSkatingController');
    }
  }
  
  // NEW: Simplified skating sound management (walking vs running)
  private updateSkatingSound(entity: PlayerEntity, movementState: 'idle' | 'walking' | 'running'): void {
    // CRITICAL: Check cleanup flag first - if cleaned up, stop immediately
    if (this._isCleanedUp) {
      CONSTANTS.debugCleanup(`updateSkatingSound - Controller already cleaned up, stopping audio`, 'IceSkatingController');
      this._isSkatingAudioPlaying = false;
      return;
    }
    
    // CRITICAL: Enhanced entity validation with immediate cleanup and detailed debugging
    if (!entity || !entity.world || !entity.isSpawned || !entity.player) {
      CONSTANTS.debugEntityState(`Entity validation failed in updateSkatingSound - entity: ${!!entity}, world: ${!!entity?.world}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}`, 'IceSkatingController');
      this.cleanupSkatingAudio();
      return;
    }

    CONSTANTS.debugEntityState(`updateSkatingSound called - playerId: ${entity.player.id}, state: ${movementState}, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');

    // Stop any existing loop
    if (this._skatingLoopTimer) {
      clearTimeout(this._skatingLoopTimer);
      this._skatingLoopTimer = null;
      CONSTANTS.debugEntityState(`Cleared existing skating loop timer`, 'IceSkatingController');
    }

    if (movementState === 'idle') {
      // Stop skating sound
      this._isSkatingAudioPlaying = false;
      CONSTANTS.debugEntityState(`Movement is idle, stopping skating audio`, 'IceSkatingController');
      return;
    }

    // Start skating sound loop with appropriate duration
    const loopDuration = movementState === 'running' ? this.RUN_LOOP_DURATION : this.WALK_LOOP_DURATION;
    CONSTANTS.debugEntityState(`Starting skating loop - duration: ${loopDuration}ms, movement: ${movementState}`, 'IceSkatingController');
    this.startSkatingLoop(entity, loopDuration);
  }

  // Helper method to start the skating sound loop
  private startSkatingLoop(entity: PlayerEntity, loopDuration: number): void {
    // CRITICAL: Check cleanup flag first - if cleaned up, stop immediately
    if (this._isCleanedUp) {
      CONSTANTS.debugCleanup(`startSkatingLoop - Controller already cleaned up, stopping audio`, 'IceSkatingController');
      this._isSkatingAudioPlaying = false;
      return;
    }
    
    // CRITICAL: Enhanced entity validation with immediate cleanup and detailed debugging
    if (!entity || !entity.world || !entity.isSpawned || !entity.player) {
      CONSTANTS.debugEntityState(`Entity validation failed in startSkatingLoop - entity: ${!!entity}, world: ${!!entity?.world}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}`, 'IceSkatingController');
      this.cleanupSkatingAudio();
      return;
    }

    CONSTANTS.debugEntityState(`startSkatingLoop called - playerId: ${entity.player.id}, duration: ${loopDuration}ms, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');

    try {
      // CRITICAL: Final multi-layer entity validation right before audio call
      if (!entity || !entity.isSpawned || !entity.player || !entity.world) {
        CONSTANTS.debugEntityState(`Final entity check failed before audio call - entity: ${!!entity}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}, world: ${!!entity?.world}`, 'IceSkatingController');
        this.cleanupSkatingAudio();
        return;
      }

      // CRITICAL: Check if this controller has been cleaned up (final safety check)
      if (this._isCleanedUp) {
        CONSTANTS.debugCleanup(`Controller was cleaned up during startSkatingLoop execution, aborting audio`, 'IceSkatingController');
        this._isSkatingAudioPlaying = false;
        return;
      }

      // CRITICAL: Enhanced pre-audio validation
      if (!entity || !entity.isSpawned || !entity.player || !entity.world || this._isCleanedUp) {
        CONSTANTS.debugEntityState(`Pre-audio validation failed - entity: ${!!entity}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}, world: ${!!entity?.world}, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');
        this.cleanupSkatingAudio();
        return;
      }

      // Play the initial skating sound with additional safety check
      CONSTANTS.debugEntityState(`About to play audio for player ${entity.player.id}`, 'IceSkatingController');
      const audioSuccessful = AudioManager.instance.playPooledSoundEffect(CONSTANTS.AUDIO_PATHS.ICE_SKATING, {
        volume: this.SKATING_SOUND_VOLUME,
        attachedToEntity: entity,
        referenceDistance: 8,
        duration: 600, // Sound duration
      });

      // CRITICAL: Check if audio was successful and entity is still valid
      if (!audioSuccessful || !entity.isSpawned || !entity.player || this._isCleanedUp) {
        CONSTANTS.debugEntityState(`Audio failed or entity became invalid - audioSuccess: ${audioSuccessful}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');
        this._isSkatingAudioPlaying = false;
        this.cleanupSkatingAudio();
        return;
      }

      this._isSkatingAudioPlaying = true;
      CONSTANTS.debugEntityState(`Successfully played skating audio for player ${entity.player.id}`, 'IceSkatingController');
    } catch (error) {
      // Handle audio errors gracefully - entity might have become invalid
      CONSTANTS.debugAudioError(`Error playing skating sound for player ${entity?.player?.id || 'unknown'}, stopping skating audio: ${error}`, error, 'IceSkatingController');
      this._isSkatingAudioPlaying = false;
      // Also cleanup to prevent further attempts
      this.cleanupSkatingAudio();
      return;
    }

    // Schedule the next loop iteration
    this._skatingLoopTimer = setTimeout(() => {
      try {
        // CRITICAL: Check cleanup flag first - if cleaned up, stop immediately
        if (this._isCleanedUp) {
          CONSTANTS.debugCleanup(`Timer callback - Controller cleaned up, stopping skating audio`, 'IceSkatingController');
          this._isSkatingAudioPlaying = false;
          this._skatingLoopTimer = null;
          return;
        }
        
        // CRITICAL: Enhanced entity validation with stronger safety checks
        if (!this._isSkatingAudioPlaying || !entity || !entity.world || !entity.isSpawned || !entity.player || this._currentMovementState === 'idle' || this._isCleanedUp) {
          CONSTANTS.debugEntityState(`Timer callback stopping - audioPlaying: ${this._isSkatingAudioPlaying}, entity: ${!!entity}, world: ${!!entity?.world}, isSpawned: ${entity?.isSpawned}, player: ${!!entity?.player}, movement: ${this._currentMovementState}, cleanedUp: ${this._isCleanedUp}`, 'IceSkatingController');
          this._isSkatingAudioPlaying = false;
          this._skatingLoopTimer = null;
          // CRITICAL: Call cleanup to ensure complete cleanup
          if (this._isCleanedUp || !entity?.isSpawned) {
            this.cleanupSkatingAudio();
          }
          return;
        }

        // CRITICAL: Check if this controller is still the global puck controller (for additional safety)
        if (this._isControllingPuck && IceSkatingController._globalPuckController !== this) {
          CONSTANTS.debugEntityState(`Timer callback stopping - controller is no longer the global puck controller`, 'IceSkatingController');
          this._isSkatingAudioPlaying = false;
          this._skatingLoopTimer = null;
          return;
        }

        CONSTANTS.debugEntityState(`Timer callback continuing skating loop for player ${entity.player.id}`, 'IceSkatingController');

        // Determine current loop duration based on movement state
        const currentLoopDuration = this._currentMovementState === 'running' ? this.RUN_LOOP_DURATION : this.WALK_LOOP_DURATION;
        this.startSkatingLoop(entity, currentLoopDuration);
      } catch (error) {
        // Handle any errors gracefully - entity might have become invalid during timer execution
        CONSTANTS.debugAudioError(`Error in skating loop timer callback, stopping skating audio: ${error}`, error, 'IceSkatingController');
        this._isSkatingAudioPlaying = false;
        this._skatingLoopTimer = null;
      }
    }, loopDuration);
    
    CONSTANTS.debugEntityState(`Scheduled next skating loop in ${loopDuration}ms for player ${entity.player.id}`, 'IceSkatingController');
  }

  // ENHANCED: Cleanup method for ice skating audio when player disconnects
  public cleanupSkatingAudio(): void {
    CONSTANTS.debugCleanup(`cleanupSkatingAudio called - cleanedUp: ${this._isCleanedUp}, timer: ${!!this._skatingLoopTimer}, audioPlaying: ${this._isSkatingAudioPlaying}, isGlobalController: ${IceSkatingController._globalPuckController === this}`, 'IceSkatingController');
    
    // CRITICAL: Set cleanup flag FIRST to prevent any future audio calls
    this._isCleanedUp = true;
    
    // CRITICAL: Clear any pending loop timer immediately and multiple times for safety
    if (this._skatingLoopTimer) {
      clearTimeout(this._skatingLoopTimer);
      this._skatingLoopTimer = null;
      CONSTANTS.debugCleanup(`Cleared skating loop timer`, 'IceSkatingController');
    }
    
    // CRITICAL: Schedule additional timer clearance to catch any race conditions
    setTimeout(() => {
      if (this._skatingLoopTimer) {
        clearTimeout(this._skatingLoopTimer);
        this._skatingLoopTimer = null;
        CONSTANTS.debugCleanup(`Secondary timer cleanup executed`, 'IceSkatingController');
      }
    }, 10);
    
    // CRITICAL: Final timer cleanup after longer delay
    setTimeout(() => {
      if (this._skatingLoopTimer) {
        clearTimeout(this._skatingLoopTimer);
        this._skatingLoopTimer = null;
        CONSTANTS.debugCleanup(`Final timer cleanup executed`, 'IceSkatingController');
      }
    }, 100);
    
    // CRITICAL: If this controller is the global puck controller, clear it immediately
    if (IceSkatingController._globalPuckController === this) {
      IceSkatingController._globalPuckController = null;
      CONSTANTS.debugCleanup(`Cleared global puck controller during cleanup`, 'IceSkatingController');
    }
    
    // CRITICAL: Release puck if we're controlling it
    if (this._isControllingPuck && this._controlledPuck) {
      try {
        this.releasePuck();
        CONSTANTS.debugCleanup(`Released puck during cleanup`, 'IceSkatingController');
      } catch (error) {
        CONSTANTS.debugError(`Error releasing puck during cleanup: ${error}`, error, 'IceSkatingController');
      }
    }
    
    // Reset all audio and state related properties
    this._isSkatingAudioPlaying = false;
    this._currentMovementState = 'idle';
    this._isControllingPuck = false;
    this._controlledPuck = null;
    this._pendingPuckPickup = false;
    this._canPickupPuck = false;
    
    // CRITICAL: Notify AudioManager to clean up any references to this entity
    // Note: This will be called additionally by PlayerManager, but double cleanup is safer than missing cleanup
    
    CONSTANTS.debugCleanup('Enhanced ice skating audio cleanup completed - all timers cleared, global controller cleared, and state reset', 'IceSkatingController');
  }
  
  // Helper method to update hockey stick model based on puck control and movement direction
  private updateHockeyStickRotation(entity: PlayerEntity, direction: string, lateralOffset: number): void {
    // Enhanced entity validation
    if (!entity || !entity.isSpawned) return;
    
    // Get references to all three hockey stick entities
    const hockeyStickIdleEntity = (entity as any)._hockeyStickIdleEntity;
    const hockeyStickControlledLeftEntity = (entity as any)._hockeyStickControlledLeftEntity;
    const hockeyStickControlledRightEntity = (entity as any)._hockeyStickControlledRightEntity;
    
    if (!hockeyStickIdleEntity || !hockeyStickControlledLeftEntity || !hockeyStickControlledRightEntity || 
        !hockeyStickIdleEntity.isSpawned || !hockeyStickControlledLeftEntity.isSpawned || !hockeyStickControlledRightEntity.isSpawned) return;
    
    try {
      let targetStickState = 'idle'; // Default state
      
      // Only use controlled sticks when controlling the puck AND moving laterally
      if (this._isControllingPuck) {
        // Determine which controlled stick to use based on movement direction
        if (direction.includes('lateral-right') || lateralOffset > 0) {
          // Use controlled right stick for right-side movement
          targetStickState = 'controlled-right';
        } else if (direction.includes('lateral-left') || lateralOffset < 0) {
          // Use controlled left stick for left-side movement
          targetStickState = 'controlled-left';
        } else {
          // For forward movement or no lateral movement, keep idle stick
          targetStickState = 'idle';
        }
      }
      
      // Get current stick state to avoid unnecessary updates
      const currentStickState = (entity as any)._currentStickState || 'idle';
      
      // Only update if we need to switch sticks
      if (currentStickState !== targetStickState) {
        const normalPosition = { x: 0, y: -0.2, z: 0.8 }; // Normal stick position
        const hiddenPosition = { x: 0, y: -100, z: 0.8 }; // Hidden position (far below)
        
        // Hide all sticks first
        hockeyStickIdleEntity.setPosition(hiddenPosition);
        hockeyStickControlledLeftEntity.setPosition(hiddenPosition);
        hockeyStickControlledRightEntity.setPosition(hiddenPosition);
        
        // Show the appropriate stick
        if (targetStickState === 'idle') {
          hockeyStickIdleEntity.setPosition(normalPosition);
        } else if (targetStickState === 'controlled-left') {
          hockeyStickControlledLeftEntity.setPosition(normalPosition);
        } else if (targetStickState === 'controlled-right') {
          hockeyStickControlledRightEntity.setPosition(normalPosition);
        }
        
        // Update current stick state
        (entity as any)._currentStickState = targetStickState;
      }
      
    } catch (error) {
      // Silently handle errors to prevent console spam
      debugWarn(`Failed to update hockey stick model: ${error}`, 'IceSkatingController');
    }
  }

  // Collision detection for puck pickup
  public onCollision(
    entity: PlayerEntity,
    other: Entity | BlockType,
    started: boolean
  ): void {
    // Handle puck collision for pickup
    if (other && typeof other === 'object' && 'position' in other) {
      // This is likely the puck entity
      debugLog(`Collision detected - started: ${started}, player: ${entity.player?.id}`, 'IceSkatingController');
      
      this._isCollidingWithPuck = started;
      
      if (started && this._canPickupPuck && !this._isControllingPuck && !this._pendingPuckPickup) {
        // Check if no one else is controlling this puck
        if (!IceSkatingController._globalPuckController) {
          debugLog('Attempting to pick up puck', 'IceSkatingController');
          this._pendingPuckPickup = true;
          this.attachPuck(other as Entity, entity.player);
          this._pendingPuckPickup = false;
        }
      }
         }
   }
}
