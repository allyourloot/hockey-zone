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
  // Initialize player manager now that IceSkatingController is defined
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
