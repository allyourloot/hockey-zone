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
import { startServer, Entity, Audio } from 'hytopia';
import { HockeyGameManager } from './classes/managers/HockeyGameManager';

// Import managers
import { AudioManager } from './classes/managers/AudioManager';
import { ChatCommandManager } from './classes/managers/ChatCommandManager';
import { PlayerManager } from './classes/managers/PlayerManager';
import { PuckTrailManager } from './classes/managers/PuckTrailManager';

// Import controllers
import { IceSkatingController } from './classes/controllers/IceSkatingController';

// Import systems
import { WorldInitializer } from './classes/systems/WorldInitializer';

// Import services
import { GoalDetectionService } from './classes/services/GoalDetectionService';

// Import managers
import { PlayerSpawnManager } from './classes/managers/PlayerSpawnManager';

// Import constants
import * as CONSTANTS from './classes/utils/constants';


// =========================
// 2. SERVER INITIALIZATION
// =========================

startServer(world => {
  // Create shared references for managers
  const puckRef: { current: Entity | null } = { current: null };
  const createPuckEntity = WorldInitializer.createPuckEntity;

  // Initialize all game systems in order
  WorldInitializer.instance.initialize(world);
  HockeyGameManager.instance.setupGame(world);
  ChatCommandManager.instance.initialize(world, puckRef, createPuckEntity);
  PlayerManager.instance.initialize(world, puckRef, createPuckEntity, IceSkatingController);
  
  // Initialize AudioManager for ambient sounds and SFX
  AudioManager.instance.initialize(world);
  
  // Simple background music following HYTOPIA SDK pattern
  const gameMusic = new Audio({
    uri: 'audio/music/ready-for-this.mp3',
    loop: true,
    volume: CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME,
  });
  
  // Music will start when user interacts (browser autoplay policy)
  (world as any)._gameMusic = gameMusic; // Store reference for user activation
  PuckTrailManager.instance.initialize(world);

  // Initialize goal detection service
  const goalDetectionService = GoalDetectionService.instance;
  
  // Initialize player spawn manager
  const playerSpawnManager = PlayerSpawnManager.instance;
  playerSpawnManager.initialize(world);
  playerSpawnManager.validateSpawnPositions();
  
  // Start goal detection monitoring loop
  // Check for goals every 50ms (20 times per second) for responsive detection
  const goalDetectionInterval = setInterval(() => {
    const goalResult = goalDetectionService.checkForGoal(puckRef.current);
    if (goalResult) {
      console.log(`[Main] Goal detected! ${goalResult.scoringTeam} team scored!${goalResult.isOwnGoal ? ' (OWN GOAL)' : ''}`);
      HockeyGameManager.instance.goalScored(goalResult.scoringTeam, puckRef.current, goalResult.isOwnGoal);
    }
  }, 50);

  // Start monitoring when the world is ready
  console.log('[Main] Goal detection service initialized');
  console.log('[Main] Player spawn manager initialized');
  goalDetectionService.startMonitoring();

  // Clean up on server shutdown
  process.on('SIGINT', () => {
    console.log('[Main] Shutting down goal detection service...');
    goalDetectionService.stopMonitoring();
    clearInterval(goalDetectionInterval);
    process.exit(0);
  });
}); 