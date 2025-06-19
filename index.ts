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
import { startServer, Entity } from 'hytopia';
import { HockeyGameManager } from './classes/managers/HockeyGameManager';

// Import managers
import { AudioManager } from './classes/managers/AudioManager';
import { ChatCommandManager } from './classes/managers/ChatCommandManager';
import { PlayerManager } from './classes/managers/PlayerManager';

// Import controllers
import { IceSkatingController } from './classes/controllers/IceSkatingController';

// Import systems
import { WorldInitializer } from './classes/systems/WorldInitializer';


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
  AudioManager.instance.initialize(world);
}); 