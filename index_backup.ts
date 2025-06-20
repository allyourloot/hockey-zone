/**
 * HYTOPIA SDK Boilerplate
 * 
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 * 
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 * 
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 * 
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 * 
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 * 
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 * 
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

// =========================
// 1. IMPORTS & TYPE DEFINITIONS
// =========================
import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  PlayerEvent,
  PlayerUIEvent,
  PlayerCameraMode,
  PlayerEntity,
  Entity,
  ChatManager,
  Collider,
  ColliderShape,
  RigidBodyType,
  BaseEntityController,
  CollisionGroup,
  CoefficientCombineRule,
  DefaultPlayerEntityController,
  EntityEvent,
  BlockType,
  BaseEntityControllerEvent,
  SceneUI,
  ModelRegistry,
} from 'hytopia';
import type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
} from 'hytopia';
import worldMap from './assets/maps/hockey-zone.json';
import { HockeyGameManager, HockeyGameState } from './HockeyGameManager';

// Import our new constants and types
import * as CONSTANTS from './classes/utils/constants';
import type {
  HockeyTeam,
  HockeyPosition,
  IceSkatingControllerOptions,
  PuckMovementDirection,
} from './classes/utils/types';

// Import managers
import { AudioManager } from './classes/managers/AudioManager';
import { ChatCommandManager } from './classes/managers/ChatCommandManager';
import { PlayerManager } from './classes/managers/PlayerManager';

// Import controllers
import { IceSkatingController } from './classes/controllers/IceSkatingController';

// Import systems
import { WorldInitializer } from './classes/systems/WorldInitializer';


// =========================
// 2. MAP & WORLD INITIALIZATION
// =========================
ModelRegistry.instance.optimize = false;
startServer(world => {
  /**
   * Enable debug rendering of the physics simulation.
   * This will overlay lines in-game representing colliders,
   * rigid bodies, and raycasts. This is useful for debugging
   * physics-related issues in a development environment.
   * Enabling this can cause performance issues, which will
   * be noticed as dropped frame rates and higher RTT times.
   * It is intended for development environments only and
   * debugging physics.
   */
  
  // Initialize world with map, goals, and entities
  WorldInitializer.instance.initialize(world);

  // Initialize the game manager ONCE at server start
  HockeyGameManager.instance.setupGame(world);

  // --- Puck Creation Helper ---
  const createPuckEntity = WorldInitializer.createPuckEntity;

  // =========================
  // 3. PLAYER MANAGEMENT (Join/Leave, Team/Position, Lock-in)
  // =========================
  // Create a reference object for the puck that can be shared with managers
  const puckRef: { current: Entity | null } = { current: null };
  
  // Initialize player manager (will be done after IceSkatingController is defined)

  // =========================
  // 4. CHAT COMMANDS
  // =========================
  // Initialize chat command manager
  ChatCommandManager.instance.initialize(world, puckRef, createPuckEntity);

  // =========================
  // 5. PLAYER ENTITY & COLLIDERS
  // =========================
  // (Player entity creation and collider setup is handled inside the PlayerEvent.JOINED_WORLD handler above)
  // ... existing code ...

  // =========================
  // 6. ICESKATINGCONTROLLER (All Logic, Methods, Helpers)
  // =========================
  // IceSkatingController has been extracted to classes/controllers/IceSkatingController.ts

    


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
    private readonly BODY_CHECK_COOLDOWN = 5000; // 5 seconds
    private readonly BODY_CHECK_DASH_FORCE = 18; // Forward impulse
    private readonly BODY_CHECK_DURATION = 180; // ms
    private _isBodyChecking: boolean = false;
    private _bodyCheckStartTime: number = 0;
    private _bodyCheckDirection: { x: number, z: number } = { x: 0, z: 0 };
    private _bodyCheckPreSpeed: number = 0;
    private _bodyCheckSoundPlayed: boolean = false;

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
        stickSwingSound.play(this._controlledPuck.world, true); // Force play even if recently played
      }

      const powerPercent = Math.max(0, Math.min(100, power)) / 100;
      const passForce = (this._minPassForce + (powerPercent * (this._maxPassForce - this._minPassForce))) * this._passingPower;
      const saucerLift = powerPercent * this._saucerPassLiftMultiplier * passForce;

      // Calculate forward direction based on camera facing
      const forward = {
        x: Math.sin(yaw), // Removed negative sign
        y: 0,
        z: Math.cos(yaw)  // Removed negative sign
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
        wristShotSound.play(this._controlledPuck.world, true); // Force play even if recently played
      }

      const powerPercent = Math.max(0, Math.min(100, power)) / 100;
      const shotForce = this._minShotForce + (powerPercent * (this._maxShotForce - this._minShotForce));
      const liftForce = shotForce * this._shotLiftMultiplier * powerPercent;

      // Calculate forward direction based on camera facing
      const forward = {
        x: Math.sin(yaw), // Removed negative sign
        y: 0,
        z: Math.cos(yaw)  // Removed negative sign
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

    // Check if this controller is controlling the puck
    public get isControllingPuck(): boolean {
      return this._isControllingPuck;
    }

    public tickWithPlayerInput(
      entity: PlayerEntity,
      input: PlayerInput,
      cameraOrientation: PlayerCameraOrientation,
      deltaTimeMs: number
    ): void {
      if (!entity.isSpawned || !entity.world) return;
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
          
          // Debug log
          if (process.env.NODE_ENV === 'development') {
            console.log('Hockey stop cooldown update:', {
              cooldownRemaining: hockeyCooldownRemaining,
              lastStopTime: this._lastHockeyStopTime,
              currentTime,
              canStop: hockeyCooldownRemaining === 0
            });
          }
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

      // Handle puck control if we have the puck (regular movement)
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

      // Handle skating sound effect
      // Debug log to check speed and grounded state - reduced frequency to 0.1%
      if (Math.random() < 0.001) {
        console.log('Movement debug:', {
          speed: currentSpeed,
          isGrounded: this.isGrounded,
          minSpeed: this.SKATING_SOUND_MIN_SPEED,
          hasSound: !!this._skatingSound
        });
      }

      // Handle skating sound
      if (this.isGrounded && currentSpeed > this.SKATING_SOUND_MIN_SPEED && hasMovementInput) {
        const currentTime = Date.now();
        
        // Calculate playback rate based on speed
        const speedRatio = Math.min(currentSpeed / (this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER), 1);
        const playbackRate = this.MIN_PLAYBACK_RATE + 
          (speedRatio * (this.MAX_PLAYBACK_RATE - this.MIN_PLAYBACK_RATE));
        
        // Start a new sound instance slightly before the current one ends
        // or if there's no sound playing
        if (!this._skatingSound || 
            (currentTime - this._skatingSoundStartTime) >= (this.SKATING_SOUND_DURATION * 0.75 / playbackRate)) {
          
          // Create new skating sound
          const newSound = new Audio({
            uri: 'audio/sfx/hockey/ice-skating.mp3',
            volume: this.SKATING_SOUND_VOLUME,
            attachedToEntity: entity,
            playbackRate: playbackRate
          });
          
          if (entity.world) {
            newSound.play(entity.world, true);
            
            // If we already have a sound playing, keep it going for a bit to ensure overlap
            if (this._skatingSound) {
              setTimeout(() => {
                if (this._skatingSound) {
                  this._skatingSound.pause();
                  this._skatingSound = null;
                }
              }, 200 / playbackRate); // Adjust overlap duration based on playback rate
            }
            
            this._skatingSound = newSound;
            this._skatingSoundStartTime = currentTime;
            
            if (Math.random() < 0.01) { // Log occasionally
              console.log('Skating sound playback rate:', playbackRate, 'Speed ratio:', speedRatio);
            }
          }
        }
      } else if (this._skatingSound) {
        // Stop sound when not moving, in the air, or no movement input
        this._skatingSound.pause();
        this._skatingSound = null;
      }

      // --- WALL/FLOATING/PUCK ANIMATION SAFETY (REFINED) ---
      if (
        this._isControllingPuck &&
        !this.isGrounded &&
        (this.isTouchingWall || (entity.position.y > (this._controlledPuck?.position.y ?? 0) + 0.25))
      ) {
        // Only force idle if controlling puck, not grounded, and (touching wall or floating above puck)
        const idleAnimations = ['idle-upper', 'idle-lower'];
        entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !idleAnimations.includes(v)));
        entity.startModelLoopedAnimations(idleAnimations);
      } else if (this.isGrounded && hasMovementInput) {
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

      // Handle jumping with default controller logic
      if (sp && this.canJump(this)) {
        if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
          entity.applyImpulse({ x: 0, y: entity.mass * this.jumpVelocity, z: 0 });
          input.sp = false;
        }
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

      // Apply the ice velocity while preserving vertical velocity and platform movement
      const platformVelocity = this.platform ? this.platform.linearVelocity : { x: 0, y: 0, z: 0 };
      
      entity.setLinearVelocity({
        x: this._iceVelocity.x + platformVelocity.x,
        y: currentVelocity.y + platformVelocity.y,
        z: this._iceVelocity.z + platformVelocity.z,
      });

      // Apply rotation based on movement direction
      const halfYaw = yaw / 2;
      entity.setRotation({
        x: 0,
        y: Math.fround(Math.sin(halfYaw)),
        z: 0,
        w: Math.fround(Math.cos(halfYaw)),
      });

      // --- STICK CHECK LOGIC ---
      const now = Date.now();
      // Reduce cooldown
      if (this._stickCheckCooldown > 0) {
        this._stickCheckCooldown = Math.max(0, this._stickCheckCooldown - deltaTimeMs);
      }
      if (mr && !this._isControllingPuck) {
        const now = Date.now();
        if (now - this._lastStickCheckInputTime >= this.STICK_CHECK_INPUT_DEBOUNCE) {
          // Play stick swing sound effect for all stick check attempts
          if (entity.world) {
            new Audio({ uri: 'audio/sfx/hockey/swing-stick.mp3', volume: 0.7, attachedToEntity: entity }).play(entity.world, true);
          }
          this._lastStickCheckInputTime = now;
        }
      }
      if (mr && !this._isControllingPuck && this._stickCheckCooldown === 0 && this._isCollidingWithPuck) {
        const now = Date.now();
        // Stick check logic (no debounce, just cooldown)
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
          const stickOffset = 0.7; // meters in front of defender
          const yaw = cameraOrientation.yaw || 0;
          const stickTip = {
            x: entity.position.x - Math.sin(yaw) * stickOffset,
            y: entity.position.y,
            z: entity.position.z - Math.cos(yaw) * stickOffset
          };
          // Check distance from stick tip to puck
          const dx = ctrl._controlledPuck.position.x - stickTip.x;
          const dz = ctrl._controlledPuck.position.z - stickTip.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist < 0.5 && dist < foundDist) {
            foundController = ctrl;
            foundPuck = ctrl._controlledPuck;
            foundDist = dist;
            foundYaw = yaw;
          }
        }
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
      // --- END STICK CHECK LOGIC ---

      // BODY CHECK LOGIC
      // --- BODY CHECK MAGNETIZATION & UI OVERLAY ---
      // Only for defenders
      let bodyCheckTarget: PlayerEntity | null = null;
      let bodyCheckTargetDist = Infinity;
      let bodyCheckTargetAngle = 0;
      const BODY_CHECK_UI_RANGE = 3.5; // meters (increased range for UI overlay and magnetization)
      const BODY_CHECK_RANGE = 2.5; // meters (actual hitbox/collision range, unchanged)
      const BODY_CHECK_ANGLE = Math.PI / 3; // 60 degrees cone
      // Track last SceneUI target and instance for this defender
      if (!this._lastBodyCheckTarget) this._lastBodyCheckTarget = null;
      if (!this._bodyCheckSceneUI) this._bodyCheckSceneUI = null;
      if (!this._isControllingPuck && !this._isBodyChecking && this._bodyCheckCooldown <= 0 && entity.player) {
        const teamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player.id);
        if (teamPos && (teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2')) {
          // Find nearest opponent in front within UI range and angle
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
            if (dist > BODY_CHECK_UI_RANGE) continue;
            // Angle between forward and target
            const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (angle > BODY_CHECK_ANGLE / 2) continue;
            if (dist < bodyCheckTargetDist) {
              bodyCheckTarget = otherEntity;
              bodyCheckTargetDist = dist;
              bodyCheckTargetAngle = angle;
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
              if (entity.player) {
                entity.player.ui.sendData({ type: 'body-check-available', available: true });
              }
            } else if (this._bodyCheckSceneUI) {
              // Update state to ensure visible
              this._bodyCheckSceneUI.setState({ visible: true });
              // Enable body check icon in UI
              if (entity.player) {
                entity.player.ui.sendData({ type: 'body-check-available', available: true });
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
            if (entity.player) {
              entity.player.ui.sendData({ type: 'body-check-available', available: false });
            }
          }
        }
      } else {
        // Not eligible, remove SceneUI from previous target
        if (this._bodyCheckSceneUI) {
          this._bodyCheckSceneUI.unload();
          this._bodyCheckSceneUI = null;
          this._lastBodyCheckTarget = null;
        }
        // Disable body check icon in UI
        if (entity.player) {
          entity.player.ui.sendData({ type: 'body-check-available', available: false });
        }
      }
      // --- END BODY CHECK MAGNETIZATION & UI OVERLAY ---
      // Only allow body check if a target is in range (SceneUI is visible)
      if (!this._isControllingPuck && input.ml && !this._isBodyChecking && this._bodyCheckCooldown <= 0 && entity.player && bodyCheckTarget) {
        // Check if player is a Defender
        const teamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player.id);
        console.log('[BodyCheck] Attempted by player', entity.player?.id, 'teamPos:', teamPos);
        // Debug: print entity.player and teams
        console.log('[BodyCheck] entity.player.id:', entity.player?.id);
        console.log('[BodyCheck] HockeyGameManager.teams:', HockeyGameManager.instance.teams);
        if (teamPos && (teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2')) {
          // --- BODY CHECK MAGNETIZATION: If a target is in UI range, dash toward them ---
          let dashDirection = null;
          if (bodyCheckTarget && bodyCheckTargetDist <= BODY_CHECK_UI_RANGE) {
            // Magnetize dash direction to target
            const dx = bodyCheckTarget.position.x - entity.position.x;
            const dz = bodyCheckTarget.position.z - entity.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            dashDirection = { x: dx / (dist || 1), z: dz / (dist || 1) };
          }
          // Start body check
          this._isBodyChecking = true;
          this._bodyCheckStartTime = Date.now();
          this._bodyCheckCooldown = this.BODY_CHECK_COOLDOWN;
          this._bodyCheckSoundPlayed = false;
          // Immediately update UI cooldown
          if (entity.player) {
            entity.player.ui.sendData({
              type: 'body-check-cooldown',
              cooldownRemaining: this.BODY_CHECK_COOLDOWN
            });
          }
          // Calculate forward direction from camera or magnetized direction
          const yaw = cameraOrientation.yaw || 0;
          this._bodyCheckDirection = dashDirection || { x: -Math.sin(yaw), z: -Math.cos(yaw) };
          // Do NOT play audio here anymore
          // entity.startModelOneshotAnimations(['dodge-roll']); // Removed roll animation for Body Check
          // Debug output
          if (entity.player && entity.player.world) {
            entity.player.world.chatManager.sendPlayerMessage(entity.player, '[DEBUG] Body Check triggered!', '00FFFF');
          }
          console.log('[BodyCheck] TRIGGERED for player', entity.player?.id);
          console.log('[BodyCheck] entity.player.id:', entity.player?.id);
          const teamsSummary: { [key: string]: { [key: string]: any } } = {};
          const teamsObj: any = HockeyGameManager.instance.teams;
          for (const team of Object.keys(teamsObj)) {
            teamsSummary[team] = {};
            for (const pos of Object.keys(teamsObj[team])) {
              const player = teamsObj[team][pos];
              teamsSummary[team][pos] = player ? player.id : null;
            }
          }
          console.log('[BodyCheck] Teams summary:', teamsSummary);
        } else {
          // Not a defender, show feedback
          if (entity.player && entity.player.ui) {
            entity.player.ui.sendData({ type: 'notification', message: 'Only Defenders can Body Check!' });
          }
          if (entity.player && entity.player.world) {
            entity.player.world.chatManager.sendPlayerMessage(entity.player, '[DEBUG] Body Check failed: not a Defender', 'FF00FF');
          }
          console.log('[BodyCheck] FAILED: not a Defender for player', entity.player?.id, 'teamPos:', teamPos);
        }
        input.ml = false; // Consume input
      }
      // Handle active body check dash
      if (this._isBodyChecking) {
        const elapsed = Date.now() - this._bodyCheckStartTime;
        if (elapsed < this.BODY_CHECK_DURATION) {
          // Apply strong forward velocity
          entity.setLinearVelocity({
            x: this._bodyCheckDirection.x * this.BODY_CHECK_DASH_FORCE,
            y: entity.linearVelocity.y,
            z: this._bodyCheckDirection.z * this.BODY_CHECK_DASH_FORCE
          });
          // Check for collision with opposing players
          for (const otherEntity of entity.world.entityManager.getAllPlayerEntities()) {
            if (otherEntity === entity) continue;
            if (!(otherEntity.controller instanceof IceSkatingController)) continue;
            // Check if close enough (body check hitbox ~1.5m for testing)
            const dx = otherEntity.position.x - entity.position.x;
            const dz = otherEntity.position.z - entity.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            const myTeamPos = HockeyGameManager.instance.getTeamAndPosition(entity.player.id);
            const theirTeamPos = HockeyGameManager.instance.getTeamAndPosition(otherEntity.player.id);
            if (dist < 1.5) {
              // Check if on opposing team
              if (myTeamPos && theirTeamPos && myTeamPos.team !== theirTeamPos.team) {
                // If they are controlling the puck, detach it
                if (
                  otherEntity.controller &&
                  otherEntity.controller instanceof IceSkatingController &&
                  otherEntity.controller.isControllingPuck
                ) {
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
                    otherEntity.player.ui.sendData({ type: 'notification', message: 'You were body checked! Lost the puck!' });
                  }
                }
                // Always apply knockback to any opposing player hit by a body check
                const pushDir = { x: dx / (dist || 1), z: dz / (dist || 1) };
                // Calculate attacker's speed at the moment of collision
                const attackerSpeed = Math.sqrt(entity.linearVelocity.x * entity.linearVelocity.x + entity.linearVelocity.z * entity.linearVelocity.z);
                // Tone down the force and scale with speed
                const minScale = 0.3, maxScale = 1.0; // Lowered maxScale for gentler knockback
                const speedNorm = Math.min(1, attackerSpeed / (this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER));
                const forceScale = minScale + (maxScale - minScale) * speedNorm;
                let knockbackForce = this.BODY_CHECK_DASH_FORCE * 1.2 * forceScale; // Lowered multiplier
                knockbackForce = Math.max(1, Math.min(knockbackForce, 8)); // Clamp to [1, 8] for softer effect
                otherEntity.setLinearVelocity({
                  x: pushDir.x * knockbackForce,
                  y: 0.5 * forceScale, // Minimal vertical lift
                  z: pushDir.z * knockbackForce
                });
                // --- STUNNED STATE & SLEEP ANIMATION ---
                if (otherEntity.controller instanceof IceSkatingController) {
                  otherEntity.controller._stunnedUntil = Date.now() + 2000;
                  otherEntity.controller._isPlayingSleep = false; // Force re-trigger
                }
                if (typeof otherEntity.stopAllModelAnimations === 'function') {
                  otherEntity.stopAllModelAnimations();
                }
                if (typeof otherEntity.startModelLoopedAnimations === 'function') {
                  otherEntity.startModelLoopedAnimations(['sleep']);
                }
                setTimeout(() => {
                  otherEntity.setLinearVelocity({
                    x: pushDir.x * knockbackForce,
                    y: 0.5 * forceScale, // Minimal vertical lift
                    z: pushDir.z * knockbackForce
                  });
                }, 50);
                if (this instanceof IceSkatingController) {
                  this._canPickupPuck = false;
                  setTimeout(() => { this._canPickupPuck = true; }, 500);
                }
                if (entity.world && !this._bodyCheckSoundPlayed) {
                   new Audio({ uri: 'audio/sfx/hockey/body-check.mp3', volume: 1, attachedToEntity: otherEntity }).play(entity.world, true);
                   this._bodyCheckSoundPlayed = true;
                }
                this._isBodyChecking = false;
                break;
              }
            }
          }
          return; // Skip rest of movement code during body check
        } else {
          this._isBodyChecking = false;
          this._bodyCheckSoundPlayed = false;
        }
      }
      // Reduce body check cooldown
      if (this._bodyCheckCooldown > 0) {
        this._bodyCheckCooldown = Math.max(0, this._bodyCheckCooldown - deltaTimeMs);
      }

      // --- ANTI-FLOATING LOGIC ---
      if (this._isControllingPuck && !this.isGrounded && this._controlledPuck && entity.position.y > this._controlledPuck.position.y + 0.25) {
        // Gently force the player down toward the puck/ice
        entity.setLinearVelocity({
          x: entity.linearVelocity.x,
          y: Math.min(entity.linearVelocity.y, -4), // Pull down if not already falling
          z: entity.linearVelocity.z,
        });
      }
      // --- END ANTI-FLOATING LOGIC ---
    }

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

        // Calculate current speed as a percentage of max speed
        const currentSpeed = Math.sqrt(this._iceVelocity.x * this._iceVelocity.x + this._iceVelocity.z * this._iceVelocity.z);
        const currentSpeedPercent = currentSpeed / maxVelocity;

        // Determine if moving backwards (only S pressed, no W)
        const isMovingBackwards = s && !w;
        
        // Apply backward movement penalties if moving backwards
        const backwardSpeedMultiplier = isMovingBackwards ? this.BACKWARD_SPEED_PENALTY : 1;
        const backwardAccelerationMultiplier = isMovingBackwards ? this.BACKWARD_ACCELERATION_PENALTY : 1;

        // Update speed factor with non-linear acceleration curve
        if (isRunning) {
          // Apply non-linear acceleration curve with backward penalty if applicable
          const accelerationFactor = Math.pow(1 - this._currentSpeedFactor, this.ACCELERATION_CURVE_POWER);
          this._currentSpeedFactor = Math.min(1, this._currentSpeedFactor + (this.SPRINT_ACCELERATION_RATE * accelerationFactor * backwardAccelerationMultiplier));
        } else {
          // Decelerate more quickly when not sprinting
          this._currentSpeedFactor = Math.max(
            this.MIN_SPEED_FACTOR,
            this._currentSpeedFactor - this.SPRINT_DECELERATION_RATE
          );
        }

        // Apply speed and direction change factors
        const finalVelocity = maxVelocity * this._currentSpeedFactor * backwardSpeedMultiplier;
        
        // Calculate acceleration modifier with direction change penalty
        // When direction change is large (directionChangeFactor close to 0), 
        // the penalty will have more effect, making it harder to change direction
        const directionPenalty = 1 - ((1 - directionChangeFactor) * this.DIRECTION_CHANGE_PENALTY);
        const accelerationModifier = Math.max(0.3, directionPenalty) * (isRunning ? 0.8 : 1) * backwardAccelerationMultiplier;

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
  }

  // Initialize player manager now that IceSkatingController is defined
  PlayerManager.instance.initialize(world, puckRef, createPuckEntity, IceSkatingController);

  // =========================
  // 7. GAME MANAGER INITIALIZATION
  // =========================
  HockeyGameManager.instance.setupGame(world);

  // =========================
  // 8. MISCELLANEOUS/UTILITY
  // =========================
  // (Any additional utility functions or code not covered above)
  // ... existing code ...

  
  // =========================
  // 9. AUDIO MANAGEMENT (Ambient, Music, SFX Scheduling)
  // =========================
  // Initialize audio manager for ambient sounds and background music
  AudioManager.instance.initialize(world);
});
