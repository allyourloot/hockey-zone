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

/**
 * startServer is always the entry point for our game.
 * It accepts a single function where we should do any
 * setup necessary for our game. The init function is
 * passed a World instance which is the default
 * world created by the game server on startup.
 * 
 * Documentation: https://github.com/hytopiagg/sdk/blob/main/docs/server.startserver.md
 */
ModelRegistry.instance.optimize = false;

startServer(world => {
  world.simulation.enableDebugRendering(true);
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
  
  /**
   * Load our map.
   * You can build your own map using https://build.hytopia.com
   * After building, hit export and drop the .json file in
   * the assets folder as map.json.
   */
  world.loadMap(worldMap);

  // --- Hockey Goals ---
  // Red Team Goal (placed at one end of the rink)
  const redGoal = new Entity({
    modelUri: 'models/structures/hockey-goal.gltf',
    modelScale: 0.5,
    rigidBodyOptions: {
      type: RigidBodyType.FIXED,
      colliders: [
        // Left post
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.65, y: 1.1, z: 0.65 },
          relativePosition: { x: -0.85, y: 1.1, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Right post
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.65, y: 1.1, z: 0.65 },
          relativePosition: { x: 0.85, y: 1.1, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Crossbar
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.8, y: 0.09, z: 0.09 },
          relativePosition: { x: 0, y: 2.2, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Bottom bar
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1, y: 0.09, z: 0.09 },
          relativePosition: { x: 0, y: 0, z: 1.0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Netting (back of goal)
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1.50, y: 1.1, z: 0.05 },
          relativePosition: { x: 0, y: 1.1, z: -0.5 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        }
      ]
    }
  });
  redGoal.spawn(world, { x: 0, y: 2, z: -32 }, { x: 0, y: 1, z: 0, w: 0 });

  // Blue Team Goal (placed at the opposite end of the rink)
  const blueGoal = new Entity({
    modelUri: 'models/structures/hockey-goal.gltf',
    modelScale: 0.5,
    rigidBodyOptions: {
      type: RigidBodyType.FIXED,
      colliders: [
        // Left post
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.65, y: 1.1, z: 0.65 },
          relativePosition: { x: -0.85, y: 1.1, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Right post
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.65, y: 1.1, z: 0.65 },
          relativePosition: { x: 0.85, y: 1.1, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Crossbar
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 0.8, y: 0.09, z: 0.09 },
          relativePosition: { x: 0, y: 2.2, z: 0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Bottom bar
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1, y: 0.09, z: 0.09 },
          relativePosition: { x: 0, y: 0, z: -1.0 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        },
        // Netting (back of goal)
        {
          shape: ColliderShape.BLOCK,
          halfExtents: { x: 1.50, y: 1.1, z: 0.05 },
          relativePosition: { x: 0, y: 1.1, z: -0.5 },
          collisionGroups: {
            belongsTo: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
          }
        }
      ]
    }
  });
  blueGoal.spawn(world, { x: 0, y: 2, z: 32 });

  // Initialize the game manager ONCE at server start
  HockeyGameManager.instance.setupGame(world);

  // --- Ambient Crowd Chant Sound Effect ---
  function scheduleCrowdChant() {
    // Play the crowd chant sound effect globally
    const chant = new Audio({
      uri: 'audio/sfx/hockey/crowd-hey.mp3',
      volume: 0.5, // Adjust as needed for ambience
    });
    chant.play(world);
    // Schedule the next chant at a random interval between 20 and 40 seconds
    const nextDelay = 20000 + Math.random() * 20000;
    setTimeout(scheduleCrowdChant, nextDelay);
  }
  // Start the first chant after a random delay (to avoid overlap with music)
  setTimeout(scheduleCrowdChant, 10000 + Math.random() * 10000);

  // --- Ambient Percussion Beat Sound Effect ---
  function schedulePercussionBeat() {
    // Play the percussion beat sound effect globally
    const percussion = new Audio({
      uri: 'audio/sfx/hockey/percussion-beat.mp3',
      volume: 0.7, // Lower volume for ambience
    });
    percussion.play(world);
    // Schedule the next percussion at a random interval between 12 and 28 seconds
    const nextDelay = 12000 + Math.random() * 16000;
    setTimeout(schedulePercussionBeat, nextDelay);
  }
  // Start the first percussion beat after a random delay (to avoid overlap with other sounds)
  setTimeout(schedulePercussionBeat, 8000 + Math.random() * 8000);

  /**
   * Handle player joining the game. The PlayerEvent.JOINED_WORLD
   * event is emitted to the world when a new player connects to
   * the game. From here, we create a basic player
   * entity instance which automatically handles mapping
   * their inputs to control their in-game entity and
   * internally uses our player entity controller.
   * 
   * The HYTOPIA SDK is heavily driven by events, you
   * can find documentation on how the event system works,
   * here: https://dev.hytopia.com/sdk-guides/events
   */
  let initialized = false;

  // Track connected players manually
  const connectedPlayers: any[] = [];

  let puckSpawned = false;
  let puck: Entity | null = null;

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    // Remove any old entities for this player
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());

    // Load UI but don't spawn player yet - they need to lock in first
    player.ui.load('ui/index.html');
    world.chatManager.sendPlayerMessage(player, 'Please select your team and position, then click Lock In to join the game!', '00FF00');

    connectedPlayers.push(player);

    // Spawn the puck at center ice when the game initializes
    if (!puckSpawned) {
      puck = new Entity({
        modelUri: 'models/items/cookie.gltf',
        modelScale: 0.8,
        rigidBodyOptions: {
          type: RigidBodyType.DYNAMIC,
          linearDamping: 0.05, // Increased linear damping to reduce overall energy
          angularDamping: 0.8, // Increased angular damping to reduce spinning
          enabledRotations: { x: false, y: true, z: false },
          gravityScale: 1.0,
          colliders: [
            {
              shape: ColliderShape.ROUND_CYLINDER,
              radius: 0.6,
              halfHeight: 0.05, // Increased thickness for better stability
              borderRadius: 0.1, // Increased border radius for better collision handling
              friction: 0.15, // Doubled friction to help slow down after bounces
              bounciness: 0.3, // Reduced bounciness for more controlled rebounds
              bouncinessCombineRule: CoefficientCombineRule.Max, // Changed to Max to allow puck's bounciness to dominate
              collisionGroups: {
                belongsTo: [CollisionGroup.ENTITY],
                collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
              }
            }
          ]
        }
      });
      // Spawn the puck at center ice
      puck.spawn(world, { x: 0, y: 1.8, z: 0 });
      puckSpawned = true;
      console.log('Puck spawned at center ice:', { x: 0, y: 10.2, z: 0 });
      
      // Add a delayed check to see if puck spawned successfully
      setTimeout(() => {
        console.log('Puck spawn check - isSpawned:', puck?.isSpawned, 'position:', puck?.position);
      }, 1000);
    }
    
    player.ui.on(PlayerUIEvent.DATA, ({ data }) => {
      if (data.type === 'team-position-select') {
        const { team, position } = data;
        console.log(`[UI] team-position-select received: team=${team}, position=${position}, player.id=${player.id}`);
        // Store the last selected team/position on the player object for use during lock-in
        (player as any)._lastSelectedTeam = team;
        (player as any)._lastSelectedPosition = position;
        const assigned = HockeyGameManager.instance.assignPlayerToTeam(player, team, position);
        console.log(`[UI] assignPlayerToTeam returned: ${assigned}`);
        // Do NOT send 'team-position-confirmed' here; wait for lock-in
        if (assigned) {
          // Optionally, send a different message if you want to update the UI but keep overlay open
          // player.ui.sendData({ type: 'team-position-selected', team, position });
          world.chatManager.sendPlayerMessage(player, `You joined ${team} as ${position}. Click Lock In when ready!`, '00FF00');
          // Update all players' UIs to disable taken positions
          for (const p of connectedPlayers) {
            p.ui.sendData({
              type: 'team-positions-update',
              teams: HockeyGameManager.instance.teams
            });
          }
        } else {
          // Position already taken
          player.ui.sendData({ type: 'team-position-error', message: 'That position is already taken.' });
          world.chatManager.sendPlayerMessage(player, 'That position is already taken. Please choose another.', 'FF4444');
        }
      }
      
      // Handle puck pass from UI power meter
      if (data.type === 'puck-pass') {
        console.log('Received puck-pass event with power:', data.power);
        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
        console.log('Found player entities:', playerEntities.length);
        
        for (const entity of playerEntities) {
          if (entity.controller instanceof IceSkatingController) {
            console.log('Found IceSkatingController, checking puck control:', entity.controller.isControllingPuck);
            // Calculate yaw from camera facing direction
            const facingDir = player.camera.facingDirection;
            const yaw = Math.atan2(facingDir.x, facingDir.z);
            console.log('Executing pass with power:', data.power, 'yaw:', yaw);
            entity.controller.executePuckPass(data.power, yaw);
          }
        }
      }
      
      // Handle puck shot from UI power meter
      if (data.type === 'puck-shoot') {
        console.log('Received puck-shoot event with power:', data.power);
        const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
        console.log('Found player entities:', playerEntities.length);
        
        for (const entity of playerEntities) {
          if (entity.controller instanceof IceSkatingController) {
            console.log('Found IceSkatingController, checking puck control:', entity.controller.isControllingPuck);
            // Calculate yaw from camera facing direction
            const facingDir = player.camera.facingDirection;
            const yaw = Math.atan2(facingDir.x, facingDir.z);
            console.log('Executing shot with power:', data.power, 'yaw:', yaw);
            entity.controller.executeShot(data.power, yaw);
          }
        }
      }
      // Handle lock in event
      if (data.type === 'lock-in') {
        console.log(`[UI] lock-in received for player.id=${player.id}, _lastSelectedTeam=${(player as any)._lastSelectedTeam}, _lastSelectedPosition=${(player as any)._lastSelectedPosition}`);
        // On lock-in, only assign if not already assigned
        if ((player as any)._lastSelectedTeam && (player as any)._lastSelectedPosition) {
          const team = (player as any)._lastSelectedTeam as import('./HockeyGameManager').HockeyTeam;
          const position = (player as any)._lastSelectedPosition as import('./HockeyGameManager').HockeyPosition;
          if (HockeyGameManager.instance.teams[team][position] !== player.id) {
            const assigned = HockeyGameManager.instance.assignPlayerToTeam(player, team, position);
            console.log(`[UI] assignPlayerToTeam (lock-in) returned: ${assigned}`);
          }
        }
        HockeyGameManager.instance.lockInPlayer(player);
        // Now send 'team-position-confirmed' to hide overlay and spawn player
        player.ui.sendData({ type: 'team-position-confirmed', team: (player as any)._lastSelectedTeam, position: (player as any)._lastSelectedPosition });
        
        // First despawn any existing entities
        world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
          entity.despawn();
        });

        // Create new player entity with proper physics setup
        const spawn = { x: 0, y: 10, z: 0 }; // Move player back from center ice
        
        // Get team/position assignment once
        const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
        
        // Create the controller with puck control capabilities
        let controllerOptions = {};
        if (teamPos) {
          switch (teamPos.position) {
            case 'DEFENDER1':
            case 'DEFENDER2':
              controllerOptions = { runVelocity: 10, walkVelocity: 6, minShotForce: 15, maxShotForce: 30, passingPower: 1.3 };
              break;
            case 'WINGER1':
            case 'WINGER2':
              controllerOptions = { runVelocity: 14, walkVelocity: 8, minShotForce: 20, maxShotForce: 35, passingPower: 1.6 };
              break;
            case 'CENTER':
              controllerOptions = { runVelocity: 12, walkVelocity: 7, minShotForce: 25, maxShotForce: 40, passingPower: 1.1 };
              break;
            // GOALIE and default use base stats
          }
        }
        const iceController = new IceSkatingController(controllerOptions);
        
        const playerEntity = new DefaultPlayerEntity({
          player,
          name: String(player),
          modelUri: 'models/players/player.gltf',
          modelScale: 1,
          controller: iceController,
          rigidBodyOptions: {
            type: RigidBodyType.DYNAMIC,
            linearDamping: 0.0001, // Extremely low damping for very long glides
            angularDamping: 0.95, // High angular damping to prevent spinning
            enabledRotations: { x: false, y: true, z: false }, // Only allow Y rotation for turning
            gravityScale: 1.0, // Normal gravity
            colliders: [
              {
                ...Collider.optionsFromModelUri('models/players/player.gltf', 1),
                collisionGroups: {
                  belongsTo: [CollisionGroup.PLAYER, CollisionGroup.ENTITY],
                  collidesWith: [CollisionGroup.BLOCK, CollisionGroup.PLAYER, CollisionGroup.ENTITY]
                },
                onCollision: (other: Entity | BlockType, started: boolean) => {
                  // Check if we collided with the puck
                  if (other === puck) {
                    console.log('Player collision detected with: PUCK', 'started:', started, 'player:', player?.id);
                    if (iceController instanceof IceSkatingController) {
                      iceController._isCollidingWithPuck = started;
                    }
                    // Debug: print controller instance and state
                    const entityController = playerEntity.controller;
                    console.log('[DEBUG] onCollision iceController === entity.controller:', iceController === entityController);
                    console.log('[DEBUG] iceController._canPickupPuck:', iceController._canPickupPuck);
                    console.log('[DEBUG] iceController._pendingPuckPickup:', iceController._pendingPuckPickup);
                    console.log('[DEBUG] iceController.isControllingPuck:', iceController.isControllingPuck);
                    if (started && puck && iceController instanceof IceSkatingController) {
                      const now = Date.now();
                      // Only allow pickup if canPickupPuck is true
                      console.log('[PUCK COLLISION] _canPickupPuck:', iceController._canPickupPuck, 'player:', player?.id);
                      if (!iceController._canPickupPuck) {
                        console.log('Pickup blocked: _canPickupPuck is false for player', player?.id);
                        return;
                      }
                      // If puck is uncontrolled, allow auto-pickup
                      if (IceSkatingController._globalPuckController === null) {
                        console.log('Puck is uncontrolled - auto-pickup allowed for player', player?.id);
                        iceController.attachPuck(puck, player);
                        iceController._pendingPuckPickup = false;
                        iceController._passTargetPuck = null;
                        iceController._passPickupWindow = 0;
                      } else if (
                        iceController._pendingPuckPickup ||
                        (iceController._passTargetPuck === puck && now < iceController._passPickupWindow)
                      ) {
                        console.log('Player collided with puck - attempting to attach (allowed by flag) for player', player?.id);
                        iceController.attachPuck(puck, player);
                        iceController._pendingPuckPickup = false;
                        iceController._passTargetPuck = null;
                        iceController._passPickupWindow = 0;
                      } else {
                        console.log('Player collided with puck - attach NOT allowed (no flag, puck controlled) for player', player?.id);
                      }
                    }
                  }
                }
              }
            ]
          }
        });

        // --- GROUND SENSOR COLLIDER ---
        playerEntity.createAndAddChildCollider({
          shape: ColliderShape.CYLINDER,
          radius: 0.23,
          halfHeight: 0.125,
          collisionGroups: {
            belongsTo: [CollisionGroup.ENTITY_SENSOR],
            collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
          },
          isSensor: true,
          relativePosition: { x: 0, y: -0.75, z: 0 }, // Adjust as needed for your model
          tag: 'groundSensor',
          onCollision: (other: Entity | BlockType, started: boolean) => {
            iceController._groundContactCount = (iceController._groundContactCount || 0) + (started ? 1 : -1);
          },
        });
        // --- END GROUND SENSOR COLLIDER ---

        // --- WALL SENSOR COLLIDER ---
        playerEntity.createAndAddChildCollider({
          shape: ColliderShape.CAPSULE,
          halfHeight: 0.30,
          radius: 0.37,
          collisionGroups: {
            belongsTo: [CollisionGroup.ENTITY_SENSOR],
            collidesWith: [CollisionGroup.BLOCK],
          },
          friction: 0,
          frictionCombineRule: CoefficientCombineRule.Min,
          tag: 'wallSensor',
          isSensor: true,
          onCollision: (other: Entity | BlockType, started: boolean) => {
            iceController._wallContactCount = (iceController._wallContactCount || 0) + (started ? 1 : -1);
          },
        });
        // --- END WALL SENSOR COLLIDER ---

        // Spawn the entity and wait for it to be ready
        playerEntity.spawn(world, spawn);
        console.log('Player entity spawned at:', spawn);
        
        // Set body check UI visibility based on position
        player.ui.sendData({
          type: 'set-body-check-visibility',
          visible: teamPos && (teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2')
        });

        // Add a delayed check to see if player spawned successfully
        if (process.env.NODE_ENV === 'development') {
          setTimeout(() => {
            console.log('Player spawn check - isSpawned:', playerEntity?.isSpawned, 'position:', playerEntity?.position);
            if (puck && puck.isSpawned) {
              const distance = Math.sqrt(
                Math.pow(playerEntity.position.x - puck.position.x, 2) + 
                Math.pow(playerEntity.position.z - puck.position.z, 2)
              );
              console.log('Distance between player and puck:', distance);
            }
          }, 1000);
        }
        
        // Set up camera after entity is spawned
        player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
        player.camera.setAttachedToEntity(playerEntity);
        player.camera.setOffset({ x: 0, y: 1, z: 0 });

        // Hide the team selection UI and show waiting overlay and scoreboard
        player.ui.sendData({ 
          type: 'show-waiting-overlay',
          message: 'Waiting for other players to join...',
          playersLockedIn: HockeyGameManager.instance.lockedIn.size,
          playersTotal: 12
        });

        // Show initial scoreboard state
        player.ui.sendData({ 
          type: 'game-start',
          redScore: 0,
          blueScore: 0,
          period: 1
        });

        world.chatManager.sendPlayerMessage(player, 'You have joined the game!', '00FF00');

        // Update game state
        if (HockeyGameManager.instance.state !== HockeyGameState.WAITING_FOR_PLAYERS) {
          HockeyGameManager.instance.startWaitingForPlayers();
          world.chatManager.sendBroadcastMessage('Waiting for all players to join teams...');
        }

        if (
          HockeyGameManager.instance.areAllPositionsLockedIn() &&
          HockeyGameManager.instance.state !== HockeyGameState.MATCH_START &&
          HockeyGameManager.instance.state !== HockeyGameState.IN_PERIOD
        ) {
          HockeyGameManager.instance.startMatchCountdown(world);
          // Show scoreboard UI for all players
          connectedPlayers.forEach(p => {
            p.ui.sendData({ 
              type: 'game-start',
              redScore: 0,
              blueScore: 0,
              period: 1
            });
          });
        }
      }
    });
  });

  /**
   * Handle player leaving the game. The PlayerEvent.LEFT_WORLD
   * event is emitted to the world when a player leaves the game.
   * Because HYTOPIA is not opinionated on join and
   * leave game logic, we are responsible for cleaning
   * up the player and any entities associated with them
   * after they leave. We can easily do this by 
   * getting all the known PlayerEntity instances for
   * the player who left by using our world's EntityManager
   * instance.
   * 
   * The HYTOPIA SDK is heavily driven by events, you
   * can find documentation on how the event system works,
   * here: https://dev.hytopia.com/sdk-guides/events
   */
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Remove player from teams if present
    HockeyGameManager.instance.removePlayer(player);
    // Remove from connectedPlayers
    const idx = connectedPlayers.indexOf(player);
    if (idx !== -1) connectedPlayers.splice(idx, 1);
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });

  /**
   * A silly little easter egg command. When a player types
   * "/rocket" in the game, they'll get launched into the air!
   */
  world.chatManager.registerCommand('/rocket', player => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.applyImpulse({ x: 0, y: 20, z: 0 });
    });
  });

  /**
   * Debug command to check puck status
   */
  world.chatManager.registerCommand('/puck', player => {
    if (puck) {
      world.chatManager.sendPlayerMessage(player, `Puck status: spawned=${puck.isSpawned}, position=${JSON.stringify(puck.position)}`, '00FF00');
      console.log('Puck debug - spawned:', puck.isSpawned, 'position:', puck.position);
    } else {
      world.chatManager.sendPlayerMessage(player, 'Puck not found!', 'FF0000');
      console.log('Puck debug - puck is null');
    }
    
    const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
    playerEntities.forEach((entity, i) => {
      if (entity.controller instanceof IceSkatingController) {
        const controlling = entity.controller.isControllingPuck;
        world.chatManager.sendPlayerMessage(player, `Player entity ${i}: controlling puck = ${controlling}`, '00FF00');
        console.log(`Player entity ${i}: controlling puck =`, controlling);
      }
    });
  });

  /**
   * Command to spawn a new puck at center ice
   */
  world.chatManager.registerCommand('/spawnpuck', player => {
    // First despawn existing puck if any
    if (puck && puck.isSpawned) {
      puck.despawn();
    }

    // Create new puck entity
    puck = new Entity({
      modelUri: 'models/items/cookie.gltf',
      modelScale: 0.8,
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        linearDamping: 0.05,
        angularDamping: 0.8,
        enabledRotations: { x: false, y: true, z: false },
        gravityScale: 1.0,
        colliders: [
          {
            shape: ColliderShape.ROUND_CYLINDER,
            radius: 0.6,
            halfHeight: 0.15, // Increased thickness for better stability
            borderRadius: 0.1, // Increased border radius for better collision handling
            friction: 0.1, // Increased friction for better stability
            bounciness: 0.3,
            bouncinessCombineRule: CoefficientCombineRule.Max,
            collisionGroups: {
              belongsTo: [CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY]
            }
          }
        ]
      }
    });

    // Spawn at center ice
    puck.spawn(world, { x: 0, y: 1.8, z: 0 });
    world.chatManager.sendPlayerMessage(player, 'New puck spawned at center ice!', '00FF00');
    console.log('New puck spawned at center ice');
  });

  /**
   * Play some peaceful ambient music to
   * set the mood!
   */
  


  /**
   * Test command to trigger the sleep animation for all players
   */
  world.chatManager.registerCommand('/testsleep', player => {
    world.entityManager.getAllPlayerEntities().forEach(entity => {
      if (entity.controller instanceof IceSkatingController) {
        entity.controller._stunnedUntil = Date.now() + 2000;
        entity.controller._isPlayingSleep = false;
        if (typeof entity.stopAllModelAnimations === 'function') {
          entity.stopAllModelAnimations();
          console.log('[TESTSLEEP] Stopped all animations for', entity.player?.id);
        }
        if (typeof entity.startModelOneshotAnimations === 'function') {
          entity.startModelOneshotAnimations(['sleep']);
          console.log('[TESTSLEEP] Started oneshot animation [sleep] for', entity.player?.id);
        }
      }
    });
    world.chatManager.sendBroadcastMessage('Triggered sleep animation for all players!', 'FFFF00');
  });
});

// Custom ice skating controller that extends DefaultPlayerEntityController
class IceSkatingController extends DefaultPlayerEntityController {
  private _iceVelocity = { x: 0, z: 0 };
  private _lastMoveDirection: Vector3Like = { x: 0, y: 0, z: 0 };
  private _currentSpeedFactor = 0;
  private readonly ICE_ACCELERATION = 0.08;
  private readonly ICE_DECELERATION = 0.985;
  private readonly ICE_MAX_SPEED_MULTIPLIER = 1.8;
  private readonly DIRECTION_CHANGE_PENALTY = 0.5;
  private readonly SPRINT_ACCELERATION_RATE = 0.008;
  private readonly SPRINT_DECELERATION_RATE = 0.02;
  private readonly MIN_SPEED_FACTOR = 0.4;
  private readonly ACCELERATION_CURVE_POWER = 1.8;
  private readonly BACKWARD_SPEED_PENALTY = 0.8;
  private readonly BACKWARD_ACCELERATION_PENALTY = 0.8;
  
  // Hockey stop properties
  private _isHockeyStop = false;
  private _hockeyStopStartTime = 0;
  private _lastHockeyStopTime = 0;
  private readonly HOCKEY_STOP_DURATION = 400; // Increased duration for smoother transition
  private readonly HOCKEY_STOP_DECELERATION = 0.95; // Less aggressive deceleration
  private readonly HOCKEY_STOP_TURN_SPEED = 15; // Reduced turn speed for smoother rotation
  private readonly HOCKEY_STOP_MIN_SPEED = 4; // Keep the same minimum speed requirement
  private readonly HOCKEY_STOP_COOLDOWN = 2000; // Reduced cooldown for better responsiveness
  private _hockeyStopDirection = 1; // 1 for right, -1 for left
  private _hockeyStopRotation = 0; // Current rotation during hockey stop
  private readonly HOCKEY_STOP_MOMENTUM_PRESERVATION = 0.9; // Increased momentum preservation
  private readonly HOCKEY_STOP_SPEED_BOOST = 1.10; // Speed boost during direction change
  private readonly HOCKEY_STOP_MAX_ANGLE = 45; // Reduced max angle for more natural feel
  
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

  constructor(options?: {
    walkVelocity?: number;
    runVelocity?: number;
    minShotForce?: number;
    maxShotForce?: number;
    passingPower?: number;
  }) {
    super({
      walkVelocity: options?.walkVelocity ?? 6,
      runVelocity: options?.runVelocity ?? 12,
      jumpVelocity: 10,
      idleLoopedAnimations: ['idle-upper', 'idle-lower'],
      walkLoopedAnimations: ['walk-upper', 'walk-lower'],
      runLoopedAnimations: ['run-upper', 'run-lower'],
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
          console.log('[BODY CHECK DEBUG] Checking otherEntity:', {
            otherPlayerId: otherEntity.player?.id,
            dx, dz, dist,
            myTeamPos, theirTeamPos,
            isControllingPuck: otherEntity.controller.isControllingPuck
          });
          // DEBUG LOGS FOR TEAM ASSIGNMENT
          console.log('[BODY CHECK DEBUG] myTeamPos:', myTeamPos, 'theirTeamPos:', theirTeamPos);
          console.log('[BODY CHECK DEBUG] teams:', JSON.stringify(HockeyGameManager.instance.teams));
          console.log('[BODY CHECK DEBUG] entity.player.id:', entity.player?.id, 'otherEntity.player.id:', otherEntity.player?.id);
          // ADD THIS LOG:
          console.log('[BODY CHECK] Checking collision: attacker', entity.player?.id, 'target', otherEntity.player?.id, 'myTeamPos', myTeamPos, 'theirTeamPos', theirTeamPos, 'dist', dist);
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
                console.log('[BODY CHECK] Attempting to detach puck from player', otherEntity.player?.id, 'isControllingPuck:', ctrl.isControllingPuck);
                ctrl.releasePuck();
                // Forcibly clear puck control state in case of desync
                ctrl._isControllingPuck = false;
                ctrl._controlledPuck = null;
                if (IceSkatingController._globalPuckController === ctrl) {
                  IceSkatingController._globalPuckController = null;
                }
                // Prevent immediate re-attachment after body check
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
              const minScale = 0.2, maxScale = 1.5;
              const speedNorm = Math.min(1, attackerSpeed / (this.runVelocity * this.ICE_MAX_SPEED_MULTIPLIER));
              const forceScale = minScale + (maxScale - minScale) * speedNorm;
              let knockbackForce = this.BODY_CHECK_DASH_FORCE * 2 * forceScale;
              knockbackForce = Math.max(1, Math.min(knockbackForce, 14)); // Clamp to [1, 14]
              console.log('[BODY CHECK] Applying knockback to player', otherEntity.player?.id, 'pushDir:', pushDir, 'force:', knockbackForce, 'attackerSpeed (at collision):', attackerSpeed, 'forceScale:', forceScale);
              console.log('[BODY CHECK] Target velocity before:', otherEntity.linearVelocity);
              // Set the target's horizontal velocity for knockback, zero y to prevent upward launch
              otherEntity.setLinearVelocity({
                x: pushDir.x * knockbackForce,
                y: 0, // Prevent upward launch
                z: pushDir.z * knockbackForce
              });
              console.log('[BODY CHECK] Target velocity set for knockback:', otherEntity.linearVelocity);
              // Play 'sleep' animation on the hit player
              if (otherEntity.controller instanceof IceSkatingController) {
                // Set stunned state for 2 seconds
                otherEntity.controller._stunnedUntil = Date.now() + 2000;
                otherEntity.controller._isPlayingSleep = false; // Force re-trigger
                console.log('[BODY CHECK] Set stunnedUntil for', otherEntity.player?.id, 'until', otherEntity.controller._stunnedUntil);
              }
              console.log('[BODY CHECK] About to stop all animations for', otherEntity.player?.id);
              if (typeof otherEntity.stopAllModelAnimations === 'function') {
                otherEntity.stopAllModelAnimations();
                console.log('[BODY CHECK] Stopped all animations for', otherEntity.player?.id);
              }
              console.log('[BODY CHECK] About to start oneshot animation [sleep] for', otherEntity.player?.id);
              if (typeof otherEntity.startModelOneshotAnimations === 'function') {
                otherEntity.startModelOneshotAnimations(['sleep']);
                console.log('[BODY CHECK] Started oneshot animation [sleep] for', otherEntity.player?.id);
              }
              setTimeout(() => {
                console.log('[BODY CHECK] Target velocity after:', otherEntity.linearVelocity);
                // DEBUG: Directly set velocity for one frame to test effect
                otherEntity.setLinearVelocity({
                  x: pushDir.x * knockbackForce,
                  y: 6 * forceScale,
                  z: pushDir.z * knockbackForce
                });
                console.log('[BODY CHECK] Target velocity forcibly set for debug:', otherEntity.linearVelocity);
              }, 50);
              // Prevent the body checking player from picking up the puck instantly
              if (this instanceof IceSkatingController) {
                this._canPickupPuck = false;
                setTimeout(() => { this._canPickupPuck = true; }, 500);
              }
              // Play hit sound ONCE per body check
              if (entity.world && !this._bodyCheckSoundPlayed) {
                 new Audio({ uri: 'audio/sfx/hockey/body-check.mp3', volume: 1, attachedToEntity: otherEntity }).play(entity.world, true);
                 this._bodyCheckSoundPlayed = true;
              }
              // End body check after first hit
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
