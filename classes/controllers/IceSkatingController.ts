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
} from 'hytopia';
import type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
} from 'hytopia';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { PlayerManager } from '../managers/PlayerManager';
import * as CONSTANTS from '../utils/constants';
import type { IceSkatingControllerOptions } from '../utils/types';
import { HockeyGameState, HockeyPosition } from '../utils/types';

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
  private readonly HOCKEY_STOP_MOMENTUM_PRESERVATION = CONSTANTS.HOCKEY_STOP.MOMENTUM_PRESERVATION;
  private readonly HOCKEY_STOP_SPEED_BOOST = CONSTANTS.HOCKEY_STOP.SPEED_BOOST;
  private readonly HOCKEY_STOP_MAX_ANGLE = CONSTANTS.HOCKEY_STOP.MAX_ANGLE;
  
  // Spin move properties
  private _isSpinning = false;
  private _spinStartTime = 0;
  private readonly SPIN_DURATION = 300; // 300ms for one quick spin
  private readonly SPIN_COOLDOWN = 7000; // 7 seconds cooldown
  private readonly SPIN_MIN_SPEED = 4; // Minimum speed required to spin
  private readonly SPIN_MOMENTUM_PRESERVATION = 0.85;
  private readonly SPIN_BOOST_MULTIPLIER = 1.2; // 20% speed boost after spin
  private _initialSpinVelocity = { x: 0, z: 0 };
  private _initialSpinYaw = 0;
  private _lastSpinTime = 0;
  private _spinProgress = 0;

  // Dash properties
  private _canDash = false; // Becomes true during hockey stop
  private _isDashing = false;
  private _dashStartTime = 0;
  private readonly DASH_DURATION = 200; // Quick dash duration in milliseconds
  private readonly DASH_FORCE = 30; // Reduced from 60 for more natural feel
  private readonly DASH_COOLDOWN = 2000; // Time before can dash again
  private _lastDashTime = 0;
  private _dashDirection = { x: 0, z: 0 }; // Store the dash direction
  private readonly DASH_INITIAL_BOOST = 1.0; // Reduced from 1.5 for more natural boost
  
  // Skating sound effect
  private _skatingSound: Audio | null = null;
  private _skatingSoundStartTime: number = 0;
  private readonly SKATING_SOUND_VOLUME = 0.2;
  private readonly SKATING_SOUND_MIN_SPEED = 0.5;
  private readonly SKATING_SOUND_DURATION = 800;
  private readonly MIN_PLAYBACK_RATE = 0.7;
  private readonly MAX_PLAYBACK_RATE = 1.3;
  
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
  private readonly PUCK_SOUND_COOLDOWN = 200; // 200ms cooldown between puck sounds
  private readonly PUCK_SOUND_VOLUME = 0.4; // Volume for puck movement sounds

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
  public _groundContactCount: number = 0;
  public _wallContactCount: number = 0;

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
      console.log('Puck attachment blocked due to cooldown. Time since release:', currentTime - this._puckReleaseTime);
      return;
    }
    if (this._isControllingPuck) return;
    this._controlledPuck = puck;
    this._isControllingPuck = true;
    this._controllingPlayer = player;
    IceSkatingController._globalPuckController = this;
    if (this._initialPuckHeight === null && puck) {
      this._initialPuckHeight = puck.position.y;
    }
    
    // Track who last touched the puck for goal and assist detection
    if (puck && player && player.id) {
      try {
        const customProps = (puck as any).customProperties;
        if (customProps) {
          // Get current touch history
          const currentHistory = customProps.get('touchHistory') || [];
          const lastTouchedBy = customProps.get('lastTouchedBy');
          
          // Only add to history if it's a different player than the last one
          if (lastTouchedBy !== player.id) {
            // Add current player to the front of the history
            const newHistory = [player.id, ...currentHistory].slice(0, 3); // Keep only last 3 players
            
            customProps.set('touchHistory', newHistory);
            customProps.set('lastTouchedBy', player.id);
            
            console.log(`[IceSkatingController] Puck touched by player: ${player.id}`);
            console.log(`[IceSkatingController] Touch history: ${JSON.stringify(newHistory)}`);
          }
        } else {
          console.warn(`[IceSkatingController] Puck has no customProperties object`);
        }
      } catch (error) {
        console.warn(`[IceSkatingController] Could not set puck custom property:`, error);
      }
    }
    
    if (puck.world) {
      const attachSound = new Audio({
        uri: 'audio/sfx/hockey/puck-attach.mp3',
        volume: 0.7,
        attachedToEntity: puck
      });
      attachSound.play(puck.world, true);
    }
    if (player && player.ui) {
      player.ui.sendData({ type: 'puck-control', hasPuck: true });
    }
    console.log('Puck attached to player');
    if (player.world) {
      player.world.chatManager.sendPlayerMessage(player, 'You have the puck! Left click to release it.', '00FF00');
    }
  }

  // Method to release the puck
  public releasePuck(): void {
    if (this._isControllingPuck && this._controllingPlayer && this._controllingPlayer.ui) {
      this._controllingPlayer.ui.sendData({ type: 'puck-control', hasPuck: false });
    }
    this._isControllingPuck = false;
    this._controlledPuck = null;
    this._controllingPlayer = null;
    if (IceSkatingController._globalPuckController === this) {
      IceSkatingController._globalPuckController = null;
    }
    this._puckReleaseTime = Date.now();
    this._puckReattachCooldown = 1000;
  }

  // Check if this controller is controlling the puck
  public get isControllingPuck(): boolean {
    return this._isControllingPuck;
  }

  // Method to execute a pass with given power (0-100)
  public executePuckPass(power: number, yaw: number): void {
    console.log('executePuckPass called with power:', power, 'yaw:', yaw);
    console.log('Controlling puck?', this._isControllingPuck, 'Puck exists?', !!this._controlledPuck);
    
    if (!this._isControllingPuck || !this._controlledPuck) {
      console.log('Early return: not controlling puck or puck does not exist');
      return;
    }

    // Play stick swing sound effect if world exists
    if (this._controlledPuck.world) {
      const stickSwingSound = new Audio({
        uri: 'audio/sfx/hockey/pass-puck.mp3',
        volume: 1,
        attachedToEntity: this._controlledPuck
      });
      stickSwingSound.play(this._controlledPuck.world, true);
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

    console.log('Pass force:', passForce, 'Forward direction:', forward, 'Yaw:', yaw);

    // Store references before releasing puck
    const puck = this._controlledPuck;
    const player = this._controllingPlayer;

    // Calculate impulse based on puck mass for consistent physics
    const impulse = {
      x: forward.x * passForce * puck.mass,
      y: saucerLift * puck.mass,
      z: forward.z * passForce * puck.mass
    };
    
    console.log('Applying pass impulse to puck:', impulse, 'puck mass:', puck.mass);
    
    // Release puck BEFORE applying impulse to prevent interference
    this.releasePuck();
    
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
        console.log('Puck velocity after pass:', puck.linearVelocity);
      }
    }, 50);

    if (player && puck.world) {
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
    console.log('executeShot called with power:', power, 'yaw:', yaw);
    console.log('Controlling puck?', this._isControllingPuck, 'Puck exists?', !!this._controlledPuck);
    
    if (!this._isControllingPuck || !this._controlledPuck) {
      console.log('Early return: not controlling puck or puck does not exist');
      return;
    }

    // Play wrist shot sound effect if world exists
    if (this._controlledPuck.world) {
      const wristShotSound = new Audio({
        uri: 'audio/sfx/hockey/wrist-shot.mp3',
        volume: 1,
        attachedToEntity: this._controlledPuck
      });
      wristShotSound.play(this._controlledPuck.world, true);
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

    console.log('Shot force:', shotForce, 'Lift force:', liftForce, 'Forward direction:', forward, 'Yaw:', yaw);

    // Store references before releasing puck
    const puck = this._controlledPuck;
    const player = this._controllingPlayer;

    // Calculate impulse based on puck mass for consistent physics
    const impulse = {
      x: forward.x * shotForce * puck.mass,
      y: liftForce * puck.mass,
      z: forward.z * shotForce * puck.mass
    };
    
    console.log('Applying shot impulse to puck:', impulse, 'puck mass:', puck.mass);
    
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
        console.log('Puck velocity after shot:', puck.linearVelocity);
      }
    }, 50);

    if (player && puck.world) {
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
    if (!entity.isSpawned || !entity.world) return;
    
    // --- MOVEMENT LOCK STATES: Prevent movement during goal reset, match start, and period transitions ---
    const gameState = HockeyGameManager.instance.state;
    if (gameState === HockeyGameState.GOAL_SCORED || gameState === HockeyGameState.MATCH_START || gameState === HockeyGameState.PERIOD_END) {
      // Stop all movement and prevent input during goal celebration or match start
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
      console.log('[IceSkatingController] Right-click detected! mr:', mr, 'controlling puck:', this._isControllingPuck);
    }
    const currentVelocity = entity.linearVelocity;
    const isRunning = !!sh;
    const hasMovementInput = !!(w || a || s || d);
    
    // Calculate current speed (moved to top)
    const currentSpeed = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z);

    // Handle hockey stop initiation
    if (sp && currentSpeed > this.HOCKEY_STOP_MIN_SPEED && !this._isHockeyStop && !this._isDashing) {
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
        this._canDash = true; // Enable dashing during hockey stop
        
        // Send immediate cooldown update when hockey stop is triggered
        if (entity.player) {
          entity.player.ui.sendData({
            type: 'hockey-stop-cooldown',
            cooldownRemaining: this.HOCKEY_STOP_COOLDOWN
          });
          
          // Play hockey stop sound effect
          if (entity.world) {
            const stopSound = new Audio({
              uri: 'audio/sfx/hockey/ice-stop.mp3',
              volume: 0.5,
              attachedToEntity: entity
            });
            stopSound.play(entity.world, true);
          }
        }
      }
    }

    // Handle hockey stop state and potential dash
    if (this._isHockeyStop || this._isDashing) {
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
          
          // Play dash sound effect
          if (entity.world) {
            const dashSound = new Audio({
              uri: 'audio/sfx/hockey/ice-skating.mp3',
              volume: 0.3,
              playbackRate: 1.5,
              attachedToEntity: entity
            });
            dashSound.play(entity.world, true);
          }
          
          // End hockey stop immediately if it was active
          this._isHockeyStop = false;
          this._hockeyStopRotation = 0;
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
        } else {
          // Calculate rotation progress (0 to 1) with smoother initial rotation
          const rotationProgress = Math.min(elapsedTime / this.HOCKEY_STOP_DURATION, 1);
          
          // Use a custom easing function for smoother rotation
          const easeInOutQuad = rotationProgress < 0.5 
            ? 2 * rotationProgress * rotationProgress 
            : 1 - Math.pow(-2 * rotationProgress + 2, 2) / 2;
          
          // Apply smoother rotation with reduced max angle
          this._hockeyStopRotation = (this.HOCKEY_STOP_MAX_ANGLE * easeInOutQuad) * this._hockeyStopDirection;
          
          // Calculate deceleration with a smoother curve
          const decelerationProgress = Math.pow(rotationProgress, 1.5);
          const decelerationFactor = this.HOCKEY_STOP_DECELERATION + 
            (1 - decelerationProgress) * 0.05; // Gentler deceleration curve
          
          // Store current velocity magnitude before deceleration
          const currentSpeed = Math.sqrt(this._iceVelocity.x * this._iceVelocity.x + this._iceVelocity.z * this._iceVelocity.z);
          
          // Apply gradual deceleration during hockey stop
          this._iceVelocity.x *= decelerationFactor;
          this._iceVelocity.z *= decelerationFactor;
          
          // Calculate speed boost based on turn progress
          const boostCurve = Math.sin(rotationProgress * Math.PI); // Peak boost in middle of turn
          const speedBoost = 1 + (this.HOCKEY_STOP_SPEED_BOOST - 1) * boostCurve;
          
          // Calculate preserved momentum with a smoother transition
          const momentumCurve = Math.sin((1 - rotationProgress) * Math.PI / 2); // Smooth sine curve for momentum
          const preservedSpeed = currentSpeed * this.HOCKEY_STOP_MOMENTUM_PRESERVATION * momentumCurve * speedBoost;
          
          // Calculate new direction with smoothed rotation
          const newDirection = {
            x: Math.sin(yaw + (this._hockeyStopRotation * Math.PI / 180)),
            z: Math.cos(yaw + (this._hockeyStopRotation * Math.PI / 180))
          };
          
          // Blend velocities with smoother transition
          const blendFactor = (1 - easeInOutQuad) * (1 - Math.pow(rotationProgress, 1.5));
          this._iceVelocity.x += newDirection.x * preservedSpeed * blendFactor;
          this._iceVelocity.z += newDirection.z * preservedSpeed * blendFactor;
          
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
          if (!theirTeamPos || theirTeamPos.team === teamPos.team) continue; // Only opponents
          
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
            
            console.log('[BodyCheck] TRIGGERED for player', entity.player?.id);
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
            // Check if on opposing team
            if (myTeamPos && theirTeamPos && myTeamPos.team !== theirTeamPos.team) {
              // If they are controlling the puck, detach it
              if (otherEntity.controller instanceof IceSkatingController && otherEntity.controller.isControllingPuck) {
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
              
              // Play body check sound effect
              if (entity.world && !this._bodyCheckSoundPlayed) {
                const bodyCheckSound = new Audio({ 
                  uri: CONSTANTS.AUDIO_PATHS.BODY_CHECK, 
                  volume: 1.0, 
                  attachedToEntity: otherEntity 
                });
                bodyCheckSound.play(entity.world, true);
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
    const now = Date.now();
    
    // Reduce stick check cooldown
    if (this._stickCheckCooldown > 0) {
      this._stickCheckCooldown = Math.max(0, this._stickCheckCooldown - deltaTimeMs);
    }
    
    // Handle stick check input (right click when not controlling puck)
    if (mr && !this._isControllingPuck) {
      console.log('[IceSkatingController] Stick check input detected! mr:', mr, 'controlling puck:', this._isControllingPuck);
      
      // Input debounce to prevent spam
      if (now - this._lastStickCheckInputTime >= this.STICK_CHECK_INPUT_DEBOUNCE) {
        console.log('[IceSkatingController] Stick check input passed debounce, playing swing sound');
        
        // Play stick swing sound effect for all stick check attempts (using whoosh.mp3)
        if (entity.world) {
          new Audio({ uri: 'audio/sfx/hockey/swing-stick.mp3', volume: 0.6, attachedToEntity: entity }).play(entity.world, true);
        }
        
        this._lastStickCheckInputTime = now;
        
        // Check if we can perform stick check (cooldown and puck collision)
        console.log('[IceSkatingController] Stick check conditions:', {
          mr,
          isControllingPuck: this._isControllingPuck,
          stickCheckCooldown: this._stickCheckCooldown,
          isCollidingWithPuck: this._isCollidingWithPuck
        });
        
                // Stick check should work when near puck - removed collision requirement for better playability
        if (mr && !this._isControllingPuck && this._stickCheckCooldown === 0) {
          console.log('[IceSkatingController] All conditions met - attempting stick check...');
          
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
          
          console.log('[IceSkatingController] Found controller:', !!foundController, 'Found puck:', !!foundPuck, 'Distance:', foundDist);
          
          if (foundController && foundPuck) {
            // Steal the puck
            foundController.releasePuck();
            foundController._puckReleaseTime = now;
            foundController._puckReattachCooldown = 1000;
            setTimeout(() => {
              this._pendingPuckPickup = true;
              this.attachPuck(foundPuck, entity.player);
              this._pendingPuckPickup = false;
            }, 100);
            
            // Play sound for both
            if (entity.world) {
              new Audio({ uri: 'audio/sfx/hockey/stick-check.mp3', volume: 0.8, attachedToEntity: entity }).play(entity.world, true);
            }
            if (foundController._controllingPlayer && foundController._controllingPlayer.world) {
              new Audio({ uri: 'audio/sfx/hockey/puck-attach.mp3', volume: 0.5, attachedToEntity: foundController._controllingPlayer }).play(foundController._controllingPlayer.world, true);
            }
            
            // Feedback
            if (entity.player) {
              entity.player.ui.sendData({ type: 'notification', message: 'Stick check! You stole the puck!' });
            }
            if (foundController._controllingPlayer && foundController._controllingPlayer.ui) {
              foundController._controllingPlayer.ui.sendData({ type: 'notification', message: 'You lost the puck to a stick check!' });
            }
            this._stickCheckCooldown = this.STICK_CHECK_COOLDOWN;
            this._lastStickCheckTime = now;
            this._lastStickCheckTarget = foundController;
          } else {
            // Play miss sound
            if (entity.world) {
              new Audio({ uri: 'audio/sfx/hockey/stick-check-miss.mp3', volume: 0.5, attachedToEntity: entity }).play(entity.world, true);
            }
            if (entity.player) {
              entity.player.ui.sendData({ type: 'notification', message: 'Stick check missed!' });
            }
            this._stickCheckCooldown = this.STICK_CHECK_COOLDOWN / 2;
          }
          
          input.mr = false; // Consume input only after stick check logic
        }
      }
    }
    // --- END STICK CHECK LOGIC ---

    // Handle spin move initiation
    if (r && !this._isSpinning && this._isControllingPuck && w && !s) {
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
        // Play spin move sound effect
        if (entity.world) {
          const spinSound = new Audio({
            uri: 'audio/sfx/hockey/ice-skating.mp3',
            volume: 0.3,
            playbackRate: 1.5,
            attachedToEntity: entity
          });
          spinSound.play(entity.world, true);
          // Play whoosh sound effect for spin move
          const whooshSound = new Audio({
            uri: 'audio/sfx/hockey/whoosh.mp3',
            volume: 0.7,
            attachedToEntity: entity
          });
          whooshSound.play(entity.world, true);
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
        // Give a short forward speed boost, capped at 1.2x run speed
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

    // Apply rotation based on movement direction
    const halfYaw = yaw / 2;
    entity.setRotation({
      x: 0,
      y: Math.fround(Math.sin(halfYaw)),
      z: 0,
      w: Math.fround(Math.cos(halfYaw)),
    });

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
    const maxVelocity = isRunning ? this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER : this.walkVelocity * this.ICE_MAX_SPEED_MULTIPLIER;
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

  // Helper method to play puck movement sounds
  private playPuckMovementSound(entity: PlayerEntity, newDirection: string): void {
    if (!this._isControllingPuck || !entity.world) return;

    const currentTime = Date.now();
    if (currentTime - this._lastPuckSoundTime < this.PUCK_SOUND_COOLDOWN) return;

    // Only play sound if direction has changed
    if (newDirection !== this._lastPuckMoveDirection) {
      let soundUri = '';
      // Only play forward sound if we're not moving laterally
      if (newDirection === 'forward' && !this._lastPuckMoveDirection.includes('lateral')) {
        soundUri = 'audio/sfx/hockey/puck-catch.mp3';
      }
      // Play lateral movement sounds
      else if (newDirection.includes('lateral-left')) {
        soundUri = 'audio/sfx/hockey/puck-left.mp3';
      }
      else if (newDirection.includes('lateral-right')) {
        soundUri = 'audio/sfx/hockey/puck-right.mp3';
      }
      if (soundUri) {
        const puckSound = new Audio({
          uri: soundUri,
          volume: this.PUCK_SOUND_VOLUME,
          attachedToEntity: entity
        });
        puckSound.play(entity.world, true);
        this._lastPuckSoundTime = currentTime;
      }
    }
    this._lastPuckMoveDirection = newDirection;
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
      console.log('IceSkatingController: Collision detected', 'started:', started, 'player:', entity.player?.id);
      
      this._isCollidingWithPuck = started;
      
      if (started && this._canPickupPuck && !this._isControllingPuck && !this._pendingPuckPickup) {
        // Check if no one else is controlling this puck
        if (!IceSkatingController._globalPuckController) {
          console.log('IceSkatingController: Attempting to pick up puck');
          this._pendingPuckPickup = true;
          this.attachPuck(other as Entity, entity.player);
          this._pendingPuckPickup = false;
        }
      }
         }
   }
}
