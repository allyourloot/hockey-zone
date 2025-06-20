/**
 * PlayerManager handles all player lifecycle management, team assignment, and entity creation
 * Extracted from index.ts section 3. PLAYER MANAGEMENT
 */

import {
  Entity,
  DefaultPlayerEntity,
  PlayerEvent,
  PlayerUIEvent,
  PlayerCameraMode,
  RigidBodyType,
  ColliderShape,
  CoefficientCombineRule,
  CollisionGroup,
  Collider,
  BlockType
} from 'hytopia';
import type { World, PlayerEntity as HytopiaPlayerEntity } from 'hytopia';
import { HockeyGameManager } from './HockeyGameManager';
import { PuckTrailManager } from './PuckTrailManager';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { HockeyGameState } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import type { IceSkatingControllerOptions } from '../utils/types';

export class PlayerManager {
  private static _instance: PlayerManager | null = null;
  
  private world: World | null = null;
  private connectedPlayers: any[] = [];
  private puckSpawned = false;
  private puck: Entity | null = null;
  private puckRef: { current: Entity | null } | null = null;
  private createPuckEntity: (() => Entity) | null = null;
  private IceSkatingController: any = null;
  private audioActivated: boolean = false;
  
  private constructor() {}
  
  public static get instance(): PlayerManager {
    if (!PlayerManager._instance) {
      PlayerManager._instance = new PlayerManager();
    }
    return PlayerManager._instance;
  }
  
  public initialize(
    world: World, 
    puckRef: { current: Entity | null }, 
    puckFactory: () => Entity,
    iceSkatingControllerClass: any
  ): void {
    this.world = world;
    this.puckRef = puckRef;
    this.createPuckEntity = puckFactory;
    this.IceSkatingController = iceSkatingControllerClass;
    
    // Set up getter/setter for puck reference
    Object.defineProperty(this, 'puck', {
      get: () => puckRef.current,
      set: (value: Entity | null) => { puckRef.current = value; }
    });
    
    this.setupPlayerEvents();
    console.log('PlayerManager: Player event handlers registered');
  }
  
  private setupPlayerEvents(): void {
    if (!this.world) return;
    
    this.world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
      this.handlePlayerJoin(player);
    });
    
    this.world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
      this.handlePlayerLeave(player);
    });
  }
  
  private handlePlayerJoin(player: any): void {
    if (!this.world) return;
    
    console.log('PlayerManager: Player joined -', player.id);
    
    this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
    player.ui.load('ui/index.html');
    this.world.chatManager.sendPlayerMessage(
      player, 
      'Please select your team and position, then click Lock In to join the game!', 
      '00FF00'
    );

    this.connectedPlayers.push(player);
    this.initializePuckIfNeeded();
    this.setupPlayerUIEvents(player);
    this.updateGameState();
  }
  
  private handlePlayerLeave(player: any): void {
    if (!this.world) return;
    
    console.log('PlayerManager: Player left -', player.id);
    HockeyGameManager.instance.removePlayer(player);
    const idx = this.connectedPlayers.indexOf(player);
    if (idx !== -1) this.connectedPlayers.splice(idx, 1);
    this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
    this.updateGameState();
  }
  
  private initializePuckIfNeeded(): void {
    if (!this.puckSpawned && this.createPuckEntity && this.world) {
      this.puck = this.createPuckEntity();
      this.puck.spawn(this.world, CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE);
      this.puckSpawned = true;
      
      // Attach trail effect to the newly spawned puck
      PuckTrailManager.instance.attachTrailToPuck(this.puck);
      
      console.log('PlayerManager: Puck spawned at center ice with trail effect:', CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE);
      
      setTimeout(() => {
        console.log('PlayerManager: Puck spawn check - isSpawned:', this.puck?.isSpawned, 'position:', this.puck?.position);
      }, 1000);
    }
  }
  
  private setupPlayerUIEvents(player: any): void {
    if (!this.world) return;
    
    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: any }) => {
      console.log('PlayerManager: Received UI data:', data.type, 'from player:', player.id);
      
      if (data.type === 'team-position-select') {
        this.handleTeamPositionSelect(player, data);
      } else if (data.type === 'puck-pass') {
        this.handlePuckPass(player, data);
      } else if (data.type === 'puck-shoot') {
        this.handlePuckShoot(player, data);
      } else if (data.type === 'lock-in') {
        this.handlePlayerLockIn(player);
      } else if (data.type === 'activate-audio') {
        this.handleAudioActivation(player);
      } else if (data.type === 'period-end') {
        this.handlePeriodEnd(player);
      } else if (data.type === 'request-stats') {
        this.handleStatsRequest(player);
      }
    });
  }
  
  private handleTeamPositionSelect(player: any, data: any): void {
    if (!this.world) return;
    
    const { team, position } = data;
    console.log(`[PlayerManager] team-position-select received: team=${team}, position=${position}, player.id=${player.id}`);
    
    (player as any)._lastSelectedTeam = team;
    (player as any)._lastSelectedPosition = position;
    
    const assigned = HockeyGameManager.instance.assignPlayerToTeam(player, team, position);
    console.log(`[PlayerManager] assignPlayerToTeam returned: ${assigned}`);
    
    if (assigned) {
      this.world.chatManager.sendPlayerMessage(
        player, 
        `You joined ${team} as ${position}. Click Lock In when ready!`, 
        '00FF00'
      );
      
      for (const p of this.connectedPlayers) {
        p.ui.sendData({
          type: 'team-positions-update',
          teams: HockeyGameManager.instance.teams
        });
      }
    } else {
      player.ui.sendData({ type: 'team-position-error', message: 'That position is already taken.' });
      this.world.chatManager.sendPlayerMessage(
        player, 
        'That position is already taken. Please choose another.', 
        'FF4444'
      );
    }
  }
  
  private handlePuckPass(player: any, data: any): void {
    if (!this.world) return;
    
    console.log('PlayerManager: Received puck-pass event with power:', data.power);
    const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log('PlayerManager: Found player entities:', playerEntities.length);
    
    for (const entity of playerEntities) {
      if (entity.controller && this.IceSkatingController && entity.controller instanceof this.IceSkatingController) {
        const controller = entity.controller as any; // Type assertion for IceSkatingController methods
        console.log('PlayerManager: Found IceSkatingController, checking puck control:', controller.isControllingPuck);
        const facingDir = player.camera.facingDirection;
        const yaw = Math.atan2(facingDir.x, facingDir.z);
        console.log('PlayerManager: Executing pass with power:', data.power, 'yaw:', yaw);
        controller.executePuckPass(data.power, yaw);
      }
    }
  }
  
  private handlePuckShoot(player: any, data: any): void {
    if (!this.world) return;
    
    console.log('PlayerManager: Received puck-shoot event with power:', data.power);
    const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log('PlayerManager: Found player entities:', playerEntities.length);
    
    for (const entity of playerEntities) {
      if (entity.controller && this.IceSkatingController && entity.controller instanceof this.IceSkatingController) {
        const controller = entity.controller as any; // Type assertion for IceSkatingController methods
        console.log('PlayerManager: Found IceSkatingController, checking puck control:', controller.isControllingPuck);
        const facingDir = player.camera.facingDirection;
        const yaw = Math.atan2(facingDir.x, facingDir.z);
        console.log('PlayerManager: Executing shot with power:', data.power, 'yaw:', yaw);
        controller.executeShot(data.power, yaw);
      }
    }
  }
  
  private handlePlayerLockIn(player: any): void {
    if (!this.world) return;
    
    console.log(`[PlayerManager] lock-in received for player.id=${player.id}`);
    
    if ((player as any)._lastSelectedTeam && (player as any)._lastSelectedPosition) {
      const team = (player as any)._lastSelectedTeam;
      const position = (player as any)._lastSelectedPosition;
      if ((HockeyGameManager.instance.teams as any)[team][position] !== player.id) {
        const assigned = HockeyGameManager.instance.assignPlayerToTeam(player, team, position);
        console.log(`[PlayerManager] assignPlayerToTeam (lock-in) returned: ${assigned}`);
      }
    }
    
    HockeyGameManager.instance.lockInPlayer(player);
    
    player.ui.sendData({ 
      type: 'team-position-confirmed', 
      team: (player as any)._lastSelectedTeam, 
      position: (player as any)._lastSelectedPosition 
    });
    
    this.createPlayerEntity(player);
    
    // Try to activate audio on lock-in as backup (in case UI activation didn't work)
    if (!this.audioActivated) {
      console.log('PlayerManager: Audio not yet activated, triggering on lock-in for player:', player.id);
      this.audioActivated = true;
      this.triggerBackgroundMusic();
    }
    
    this.updateGameState();
  }
  
  private createPlayerEntity(player: any): void {
    if (!this.world || !this.IceSkatingController) return;
    
    this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      entity.despawn();
    });

    const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
    
    // Always spawn at default position first, then teleport to correct position with rotation
    const spawn = CONSTANTS.SPAWN_POSITIONS.PLAYER_DEFAULT;
    
    let controllerOptions: IceSkatingControllerOptions = {};
    if (teamPos) {
      switch (teamPos.position) {
        case 'DEFENDER1':
        case 'DEFENDER2':
          controllerOptions = CONSTANTS.POSITION_STATS.DEFENDER;
          break;
        case 'WINGER1':
        case 'WINGER2':
          controllerOptions = CONSTANTS.POSITION_STATS.WINGER;
          break;
        case 'CENTER':
          controllerOptions = CONSTANTS.POSITION_STATS.CENTER;
          break;
        case 'GOALIE':
          controllerOptions = CONSTANTS.POSITION_STATS.GOALIE;
          break;
      }
    }
    
    const iceController = new this.IceSkatingController(controllerOptions);
    
    const playerEntity = new DefaultPlayerEntity({
      player,
      name: String(player),
      modelUri: 'models/players/player.gltf',
      modelScale: 1,
      controller: iceController,
      rigidBodyOptions: {
        type: RigidBodyType.DYNAMIC,
        linearDamping: 0.0001,
        angularDamping: 0.95,
        enabledRotations: { x: false, y: true, z: false },
        gravityScale: 1.0,
        colliders: [
          {
            ...Collider.optionsFromModelUri('models/players/player.gltf', 1),
            collisionGroups: {
              belongsTo: [CollisionGroup.PLAYER, CollisionGroup.ENTITY],
              collidesWith: [CollisionGroup.BLOCK, CollisionGroup.PLAYER, CollisionGroup.ENTITY]
            },
            onCollision: (other: Entity | BlockType, started: boolean) => {
              this.handlePlayerPuckCollision(iceController, other, started, player, playerEntity);
            }
          }
        ]
      }
    });

    this.addGroundSensorCollider(playerEntity, iceController);
    this.addWallSensorCollider(playerEntity, iceController);

    // If player has team assignment, spawn directly at correct position with rotation
    if (teamPos) {
      const spawnData = PlayerSpawnManager.instance.getSpawnData(teamPos.team, teamPos.position);
      
      // Convert yaw to quaternion for spawn
      const halfYaw = spawnData.yaw / 2;
      const spawnRotation = {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
      };
      
      // Spawn at correct position with correct rotation
      playerEntity.spawn(this.world, spawnData.position, spawnRotation);
      console.log(`PlayerManager: Player entity spawned at team position:`, spawnData.position, `with rotation: ${spawnData.yaw} radians`);
    } else {
      // Spawn at default position for players without team assignment
      playerEntity.spawn(this.world, spawn);
      console.log('PlayerManager: Player entity spawned at default position:', spawn);
    }
    
    this.setupPlayerUI(player, teamPos);
    this.setupPlayerCamera(player, playerEntity);
    
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        console.log('PlayerManager: Player spawn check - isSpawned:', playerEntity?.isSpawned, 'position:', playerEntity?.position);
        if (this.puck && this.puck.isSpawned) {
          const distance = Math.sqrt(
            Math.pow(playerEntity.position.x - this.puck.position.x, 2) + 
            Math.pow(playerEntity.position.z - this.puck.position.z, 2)
          );
          console.log('PlayerManager: Distance between player and puck:', distance);
        }
      }, 1000);
    }
    
    this.world.chatManager.sendPlayerMessage(player, 'You have joined the game!', '00FF00');
  }
  
  private handlePlayerPuckCollision(
    iceController: any, 
    other: Entity | BlockType, 
    started: boolean, 
    player: any, 
    playerEntity: HytopiaPlayerEntity
  ): void {
    if (other === this.puck) {
      console.log('PlayerManager: Player collision detected with PUCK', 'started:', started, 'player:', player?.id);
      
      if (iceController && this.IceSkatingController && iceController instanceof this.IceSkatingController) {
        iceController._isCollidingWithPuck = started;
      }
      
      const entityController = playerEntity.controller;
      console.log('[DEBUG] onCollision iceController === entity.controller:', iceController === entityController);
      console.log('[DEBUG] iceController._canPickupPuck:', iceController._canPickupPuck);
      console.log('[DEBUG] iceController._pendingPuckPickup:', iceController._pendingPuckPickup);
      console.log('[DEBUG] iceController.isControllingPuck:', iceController.isControllingPuck);
      
      if (started && this.puck && iceController && this.IceSkatingController && iceController instanceof this.IceSkatingController) {
        const now = Date.now();
        
        console.log('[PUCK COLLISION] _canPickupPuck:', iceController._canPickupPuck, 'player:', player?.id);
        if (!iceController._canPickupPuck) {
          console.log('PlayerManager: Pickup blocked: _canPickupPuck is false for player', player?.id);
          return;
        }
        
        if (this.IceSkatingController._globalPuckController === null) {
          console.log('PlayerManager: Puck is uncontrolled - auto-pickup allowed for player', player?.id);
          iceController.attachPuck(this.puck, player);
          iceController._pendingPuckPickup = false;
          iceController._passTargetPuck = null;
          iceController._passPickupWindow = 0;
        } else if (
          iceController._pendingPuckPickup ||
          (iceController._passTargetPuck === this.puck && now < iceController._passPickupWindow)
        ) {
          console.log('PlayerManager: Player collided with puck - attempting to attach (allowed by flag) for player', player?.id);
          iceController.attachPuck(this.puck, player);
          iceController._pendingPuckPickup = false;
          iceController._passTargetPuck = null;
          iceController._passPickupWindow = 0;
        } else {
          console.log('PlayerManager: Player collided with puck - attach NOT allowed (no flag, puck controlled) for player', player?.id);
        }
      }
    }
  }
  
  private addGroundSensorCollider(playerEntity: HytopiaPlayerEntity, iceController: any): void {
    playerEntity.createAndAddChildCollider({
      shape: ColliderShape.CYLINDER,
      radius: 0.23,
      halfHeight: 0.125,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.BLOCK, CollisionGroup.ENTITY],
      },
      isSensor: true,
      relativePosition: { x: 0, y: -0.75, z: 0 },
      tag: 'groundSensor',
      onCollision: (other: Entity | BlockType, started: boolean) => {
        iceController._groundContactCount = (iceController._groundContactCount || 0) + (started ? 1 : -1);
      },
    });
  }
  
  private addWallSensorCollider(playerEntity: HytopiaPlayerEntity, iceController: any): void {
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
  }
  
  private setupPlayerUI(player: any, teamPos: any): void {
    console.log('[PlayerManager] setupPlayerUI called for player:', player.id, 'teamPos:', teamPos);
    
    try {
      // Check current game state to send appropriate UI data
      const gameState = HockeyGameManager.instance.state;
      const connectedCount = this.connectedPlayers.length;
      const totalSlots = 12; // 6 per team
      
      if (gameState === HockeyGameState.WAITING_FOR_PLAYERS || gameState === HockeyGameState.LOBBY) {
        // Send waiting state UI data
        player.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: connectedCount,
          totalPlayers: totalSlots
        });
      } else {
        // Send normal game UI data
        player.ui.sendData({ 
          type: 'game-start',
          redScore: HockeyGameManager.instance.scores.RED || 0,
          blueScore: HockeyGameManager.instance.scores.BLUE || 0,
          period: (HockeyGameManager.instance as any)._period || 1
        });
      }

      // If player is a defender, enable body check UI
      console.log('[PlayerManager] Checking if player is defender. teamPos:', teamPos);
      if (teamPos && (teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2')) {
        console.log('[PlayerManager] Player is defender - enabling body check UI');
        console.log('[PlayerManager] Sending set-body-check-visibility: true to player', player.id);
        player.ui.sendData({ 
          type: 'set-body-check-visibility', 
          visible: true 
        });
        // Initially disabled until opponents are in range
        console.log('[PlayerManager] Sending body-check-available: false to player', player.id);
        player.ui.sendData({ 
          type: 'body-check-available', 
          available: false 
        });
      } else {
        console.log('[PlayerManager] Player is not defender - hiding body check UI. Position:', teamPos?.position);
        player.ui.sendData({ 
          type: 'set-body-check-visibility', 
          visible: false 
        });
      }
    } catch (error) {
      console.error('[PlayerManager] Error sending UI data:', error);
    }
  }
  
  private setupPlayerCamera(player: any, playerEntity: HytopiaPlayerEntity): void {
    const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
    
    player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
    player.camera.setAttachedToEntity(playerEntity);
    player.camera.setOffset({ x: 0, y: 1, z: 0 });
    
    // Use lookAtPosition to orient camera correctly based on team
    if (teamPos) {
      const playerPosition = playerEntity.position;
      
      // Calculate look-at position based on team
      let lookAtPosition;
      if (teamPos.team === 'RED') {
        // Red team should look towards Blue goal (positive Z direction)
        lookAtPosition = {
          x: playerPosition.x,
          y: playerPosition.y,
          z: playerPosition.z + 10 // Look 10 units forward towards Blue goal
        };
      } else {
        // Blue team should look towards Red goal (negative Z direction)
        lookAtPosition = {
          x: playerPosition.x,
          y: playerPosition.y,
          z: playerPosition.z - 10 // Look 10 units forward towards Red goal
        };
      }
      
      player.camera.lookAtPosition(lookAtPosition);
      console.log(`PlayerManager: Set camera lookAtPosition for ${teamPos.team} team:`, lookAtPosition);
    }
    
    console.log('PlayerManager: Camera setup complete - using lookAtPosition for orientation');
  }
  
  private handleAudioActivation(player: any): void {
    if (this.audioActivated) {
      console.log('PlayerManager: Audio already activated, ignoring request from player:', player.id);
      return;
    }
    
    console.log('PlayerManager: Audio activation requested by player:', player.id);
    this.audioActivated = true;
    this.triggerBackgroundMusic();
  }

  private handlePeriodEnd(player: any): void {
    if (!this.world) return;
    
    console.log('PlayerManager: Period end event received from UI (player:', player.id, ')');
    
    // Only trigger if the game is actually in progress
    const gameState = HockeyGameManager.instance.state;
    if (gameState === HockeyGameState.IN_PERIOD) {
      console.log('PlayerManager: Triggering period end from UI timer');
      HockeyGameManager.instance.endPeriod();
    } else {
      console.log('PlayerManager: Ignoring period end - game not in period (state:', gameState, ')');
    }
  }

  private handleStatsRequest(player: any): void {
    console.log(`[PlayerManager] Received stats request from player ${player.id}`);
    
    // Broadcast latest stats to all players
    HockeyGameManager.instance.broadcastStatsUpdate();
  }

  private triggerBackgroundMusic(): void {
    try {
      if (!this.world) return;
      
      // Get the game music instance from world and play it
      const gameMusic = (this.world as any)._gameMusic;
      if (gameMusic) {
        gameMusic.play(this.world);
        console.log('PlayerManager: Started background music on user interaction');
      } else {
        console.warn('PlayerManager: No game music instance found');
      }
    } catch (error) {
      console.error('PlayerManager: Error triggering background music:', error);
    }
  }
  
  private updateGameState(): void {
    if (!this.world) return;
    
    const gameState = HockeyGameManager.instance.state;
    const connectedCount = this.connectedPlayers.length;
    const totalSlots = 12; // 6 per team
    
    // Only transition to WAITING_FOR_PLAYERS from LOBBY state
    // Don't interrupt active games (IN_PERIOD, MATCH_START, GOAL_SCORED, etc.)
    if (gameState === HockeyGameState.LOBBY) {
      HockeyGameManager.instance.startWaitingForPlayers();
      this.world.chatManager.sendBroadcastMessage('Waiting for all players to join teams...');
    }

    // Only broadcast waiting state if we're actually in waiting/lobby state
    if (gameState === HockeyGameState.WAITING_FOR_PLAYERS || gameState === HockeyGameState.LOBBY) {
      this.connectedPlayers.forEach(p => {
        p.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: connectedCount,
          totalPlayers: totalSlots
        });
      });
      
      console.log(`[PlayerManager] Broadcasting waiting state: ${connectedCount}/${totalSlots} players connected`);
    }

    // Only auto-start match if we're in waiting state and all positions are filled
    if (
      gameState === HockeyGameState.WAITING_FOR_PLAYERS &&
      HockeyGameManager.instance.areAllPositionsLockedIn()
    ) {
      console.log('[PlayerManager] All positions locked in - starting match sequence with proper countdown!');
      HockeyGameManager.instance.startMatchSequence();
      // Note: startMatchSequence() handles all UI updates internally, so we don't need to send game-start data here
    }
    
    // Log when players leave during active games (for debugging)
    if (gameState === HockeyGameState.IN_PERIOD || 
        gameState === HockeyGameState.MATCH_START || 
        gameState === HockeyGameState.GOAL_SCORED) {
      console.log(`[PlayerManager] Player left during active game (${gameState}). Continuing game with ${connectedCount} players.`);
    }
  }
  
  public getConnectedPlayers(): any[] {
    return [...this.connectedPlayers];
  }
  
  public isPuckSpawned(): boolean {
    return this.puckSpawned;
  }

  public resetAllPlayersToLobby(): void {
    console.log('[PlayerManager] Resetting all players to lobby state');
    
    // Despawn all player entities
    this.connectedPlayers.forEach(player => {
      if (this.world) {
        this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
          console.log('[PlayerManager] Despawning entity for player', player.id);
          entity.despawn();
        });
      }
    });
    
    // Broadcast team selection to all players
    this.connectedPlayers.forEach(player => {
      player.ui.sendData({
        type: 'show-team-selection'
      });
    });
    
    // Small delay to ensure entities are despawned and UI is ready
    setTimeout(() => {
      // Update game state to waiting
      this.updateGameState();
      
      // Force broadcast waiting state to ensure proper UI
      const connectedCount = this.connectedPlayers.length;
      const totalSlots = 12;
      this.connectedPlayers.forEach(player => {
        player.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: connectedCount,
          totalPlayers: totalSlots
        });
      });
      
      console.log('[PlayerManager] Forced waiting state broadcast after reset');
    }, 200);
    
    console.log('[PlayerManager] All players reset to lobby - should see team selection');
  }
}
