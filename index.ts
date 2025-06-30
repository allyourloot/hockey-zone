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
import { OffsideDetectionService } from './classes/services/OffsideDetectionService';
import { PuckControlIndicatorService } from './classes/services/PuckControlIndicatorService';
import { PuckBoundaryService } from './classes/services/PuckBoundaryService';

// Import managers
import { PlayerSpawnManager } from './classes/managers/PlayerSpawnManager';

// Import constants
import * as CONSTANTS from './classes/utils/constants';


// =========================
// 2. SERVER INITIALIZATION
// =========================

startServer(world => {
  // Enable debug rendering for all physics objects (including goal colliders)
  world.simulation.enableDebugRendering(false);
  
  // Create shared references for managers
  const puckRef: { current: Entity | null } = { current: null };
  const createPuckEntity = WorldInitializer.createPuckEntity;

  // Initialize all game systems in order
  WorldInitializer.instance.initialize(world);
  
  // Create debug visualization for goal colliders (only when DEBUG_MODE is true)
  WorldInitializer.instance.createGoalColliderDebugEntities();
  
  HockeyGameManager.instance.setupGame(world);
  ChatCommandManager.instance.initialize(world, puckRef, createPuckEntity);
  PlayerManager.instance.initialize(world, puckRef, createPuckEntity, IceSkatingController);
  
  // Initialize AudioManager for ambient sounds and SFX
  AudioManager.instance.initialize(world);
  
  // Simple background music setup - works for all players
  const gameMusic = new Audio({
    uri: 'audio/music/ready-for-this.mp3',
    loop: true,
    volume: CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME,
  });
  
  gameMusic.play(world);
  
  // Store reference to original volume for mute/unmute functionality
  let originalMusicVolume = CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME;
  let isMusicMuted = false;
  
  // Background music mute functionality will be handled by PlayerManager
  // Store gameMusic reference globally for access by other managers
  (global as any).gameMusic = gameMusic;
  
  PuckTrailManager.instance.initialize(world);

  // Initialize goal detection service
  const goalDetectionService = GoalDetectionService.instance;
  
  // Initialize offside detection service
  const offsideDetectionService = OffsideDetectionService.instance;
  
  // Initialize player spawn manager
  const playerSpawnManager = PlayerSpawnManager.instance;
  playerSpawnManager.initialize(world);
  playerSpawnManager.validateSpawnPositions();
  
  // Initialize puck control indicator service
  PuckControlIndicatorService.instance.initialize(world);
  
  // Initialize puck boundary service for automatic respawn
  const puckBoundaryService = PuckBoundaryService.instance;
  puckBoundaryService.initialize(world);
  
  // Start goal detection monitoring loop
  // Check for goals every 50ms (20 times per second) for responsive detection
  const goalDetectionInterval = setInterval(() => {
    const goalResult = goalDetectionService.checkForGoal(puckRef.current);
    if (goalResult) {
      CONSTANTS.debugLog(`Goal detected! ${goalResult.scoringTeam} team scored!${goalResult.isOwnGoal ? ' (OWN GOAL)' : ''}`, 'Main');
      if (goalResult.lastTouchedBy) {
        CONSTANTS.debugLog(`Goal scored by player: ${goalResult.lastTouchedBy}`, 'Main');
        if (goalResult.primaryAssist) {
          CONSTANTS.debugLog(`Primary assist by player: ${goalResult.primaryAssist}`, 'Main');
        }
        if (goalResult.secondaryAssist) {
          CONSTANTS.debugLog(`Secondary assist by player: ${goalResult.secondaryAssist}`, 'Main');
        }
      } else {
        CONSTANTS.debugWarn(`Goal scored but no lastTouchedBy information!`, 'Main');
        // Debug: Check puck custom properties
        if (puckRef.current) {
          try {
            const lastTouched = (puckRef.current as any).customProperties?.get('lastTouchedBy');
            CONSTANTS.debugLog(`lastTouchedBy from puck: ${lastTouched}`, 'Main');
          } catch (error) {
            CONSTANTS.debugError(`Could not access puck custom properties`, error, 'Main');
          }
        }
      }
      HockeyGameManager.instance.goalScored(
        goalResult.scoringTeam, 
        puckRef.current, 
        goalResult.isOwnGoal, 
        goalResult.lastTouchedBy,  // Pass the scorer ID
        goalResult.primaryAssist  // Pass the primary assist ID
      );
    }
  }, 50);

  // Start offside detection monitoring loop
  // Check for offside violations every 100ms (10 times per second) for good performance
  const offsideDetectionInterval = setInterval(() => {
    const offsideViolation = offsideDetectionService.checkForOffside(puckRef.current, world);
    if (offsideViolation) {
      CONSTANTS.debugLog(`Offside detected! ${offsideViolation.violatingTeam} team violated, faceoff at ${offsideViolation.faceoffLocation}`, 'Main');
      CONSTANTS.debugLog(`Offside violation: ${offsideViolation.violatingPlayerIds.length} players involved`, 'Main');
      HockeyGameManager.instance.offsideCalled(offsideViolation);
    }
  }, 100);

  // Start monitoring when the world is ready
  CONSTANTS.debugLog('Goal detection service initialized', 'Main');
  CONSTANTS.debugLog('Offside detection service initialized', 'Main');
  CONSTANTS.debugLog('Player spawn manager initialized', 'Main');
  CONSTANTS.debugLog('Puck boundary service initialized', 'Main');
  goalDetectionService.startMonitoring();
  offsideDetectionService.startMonitoring();

  // Set up automatic puck boundary monitoring
  // Monitor the puck reference and start/stop boundary monitoring as needed
  const checkPuckBoundaryMonitoring = () => {
    if (puckRef.current && puckRef.current.isSpawned) {
      if (!puckBoundaryService.isMonitoring || puckBoundaryService.monitoredPuck !== puckRef.current) {
        // Start monitoring the current puck
        puckBoundaryService.startMonitoring(puckRef.current);
        CONSTANTS.debugLog('Started automatic puck boundary monitoring', 'Main');
      }
    } else if (puckBoundaryService.isMonitoring) {
      // Stop monitoring if puck is gone
      puckBoundaryService.stopMonitoring();
      CONSTANTS.debugLog('Stopped puck boundary monitoring (no puck)', 'Main');
    }
  };

  // Check puck boundary monitoring every 2 seconds
  const puckBoundaryMonitoringInterval = setInterval(checkPuckBoundaryMonitoring, 2000);
  
  // Initial check
  setTimeout(checkPuckBoundaryMonitoring, 1000);

  // Clean up on server shutdown
  process.on('SIGINT', () => {
    CONSTANTS.debugLog('Shutting down services...', 'Main');
    goalDetectionService.stopMonitoring();
    offsideDetectionService.stopMonitoring();
    puckBoundaryService.stopMonitoring();
    PuckControlIndicatorService.instance.cleanup();
    AudioManager.instance.stop(); // Clean up all audio resources
    clearInterval(goalDetectionInterval);
    clearInterval(offsideDetectionInterval);
    clearInterval(puckBoundaryMonitoringInterval);
    process.exit(0);
  });
}); 