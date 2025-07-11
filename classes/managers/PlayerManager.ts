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
  BlockType,
  Audio,
  EntityEvent
} from 'hytopia';


import type { World, PlayerEntity as HytopiaPlayerEntity } from 'hytopia';
import { HockeyGameManager } from './HockeyGameManager';
import { PuckTrailManager } from './PuckTrailManager';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { AudioManager } from './AudioManager';
import { PersistentPlayerStatsManager } from './PersistentPlayerStatsManager';
import { ShootoutManager } from './ShootoutManager';
import { AFKManager } from './AFKManager';
import { HockeyGameState, HockeyTeam, HockeyPosition, GameMode } from '../utils/types';
import * as CONSTANTS from '../utils/constants';
import type { IceSkatingControllerOptions } from '../utils/types';
import { PlayerStatsManager } from './PlayerStatsManager';
import { PuckBoundaryService } from '../services/PuckBoundaryService';
import { PersistenceManager } from 'hytopia';

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
  
  // --- Track players on game mode selection overlay ---
  private playersOnGameModeOverlay: Set<string> = new Set();
  
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
    
    // Set up countdown callback for HockeyGameManager
    HockeyGameManager.instance.setCountdownUpdateCallback(() => {
      this.updateGameStateForCountdown();
    });

    // Set up player manager callback for entity movement
    HockeyGameManager.instance.setPlayerManagerCallback((action: string, data: any) => {
      this.handlePlayerManagerAction(action, data);
    });
    
    // Initialize AFK Manager
    AFKManager.instance.initialize(world);
    
    this.setupPlayerEvents();
    CONSTANTS.debugLog('Player event handlers registered', 'PlayerManager');
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
    
    CONSTANTS.debugLog(`Player joined - ${player.id}`, 'PlayerManager');
    
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
    
    // Check if we need to immediately stop timer for goal celebration/countdown states
    const gameState = HockeyGameManager.instance.state;
    if (gameState === HockeyGameState.GOAL_SCORED || gameState === HockeyGameState.MATCH_START) {
      // Send timer stop IMMEDIATELY to prevent timer from starting
      setTimeout(() => {
        player.ui.sendData({
          type: 'timer-stop'
        });
        CONSTANTS.debugLog(`Sent immediate timer-stop to new player ${player.id} during ${gameState}`, 'PlayerManager');
      }, 100); // Very short delay just to ensure UI is loaded
    }
    
    // Send appropriate UI based on current game state
    setTimeout(() => {
      // Always show game mode selection overlay first
      player.ui.sendData({
        type: 'game-mode-selection-start'
      });
      CONSTANTS.debugLog(`Sent game-mode-selection-start to player ${player.id}`, 'PlayerManager');
    }, 500); // Small delay to ensure UI is loaded
    
    this.updateGameState();
  }
  
  private handlePlayerLeave(player: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`Player left - ${player.id}`, 'PlayerManager');
    
    // Stop tracking player for AFK detection
    AFKManager.instance.untrackPlayer(player.id);
    
    // CRITICAL: Clean up global puck controller if this player was controlling the puck
    if (this.IceSkatingController && this.IceSkatingController._globalPuckController) {
      const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
      let foundGlobalController = false;
      
      for (const entity of playerEntities) {
        if (entity.controller === this.IceSkatingController._globalPuckController) {
          CONSTANTS.debugLog(`Cleaning up global puck controller for departing player ${player.id}`, 'PlayerManager');
          
          // CRITICAL: Clean up the controller audio IMMEDIATELY and MULTIPLE times
          if (entity.controller && typeof (entity.controller as any).cleanupSkatingAudio === 'function') {
            // Call cleanup immediately
            (entity.controller as any).cleanupSkatingAudio();
            
            // Call cleanup again in a short timeout to catch any lingering timers
            setTimeout(() => {
              if (entity.controller && typeof (entity.controller as any).cleanupSkatingAudio === 'function') {
                (entity.controller as any).cleanupSkatingAudio();
              }
            }, 10);
            
            // Final cleanup after a longer delay
            setTimeout(() => {
              if (entity.controller && typeof (entity.controller as any).cleanupSkatingAudio === 'function') {
                (entity.controller as any).cleanupSkatingAudio();
              }
            }, 100);
          }
          
          // Release the puck first
          if (this.puck && entity.controller && entity.controller instanceof this.IceSkatingController) {
            (entity.controller as any).releasePuck();
          }
          
          // Then clear the global controller
          this.IceSkatingController._globalPuckController = null;
          foundGlobalController = true;
          break;
        }
      }
      
      // Safety check: if player entities are already despawned but global controller is still set,
      // clear it anyway to prevent stuck puck state
      if (!foundGlobalController && playerEntities.length === 0) {
        CONSTANTS.debugLog(`Safety cleanup: clearing global puck controller for player ${player.id} (entities already despawned)`, 'PlayerManager');
        this.IceSkatingController._globalPuckController = null;
      }
    }
    
    // CRITICAL: Enhanced audio cleanup for all player entities before despawning
    this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
      // Clean up controller audio
      if (entity.controller && entity.controller instanceof this.IceSkatingController) {
        (entity.controller as any).cleanupSkatingAudio();
      }
      
      // Clean up any audio attached to this entity
      try {
        AudioManager.instance.cleanupEntityAudio(entity);
      } catch (error) {
        CONSTANTS.debugError(`Error cleaning up entity audio for player ${player.id}: ${error}`, error, 'PlayerManager');
      }
      
      // Despawn the entity - this will trigger the EntityEvent.DESPAWNED event
      entity.despawn();
    });

    // Clean up any remaining player audio references
    try {
      AudioManager.instance.cleanupPlayerAudio(player.id);
    } catch (error) {
      CONSTANTS.debugError(`Error cleaning up player audio for player ${player.id}: ${error}`, error, 'PlayerManager');
    }

    // Check if we're in an active shootout and handle player leaving
    if (HockeyGameManager.instance.isShootoutMode()) {
      const { ShootoutManager } = require('./ShootoutManager');
      if (ShootoutManager.instance.isShootoutActive()) {
        CONSTANTS.debugLog(`Player ${player.id} left during active shootout - calling ShootoutManager.handlePlayerLeave`, 'PlayerManager');
        ShootoutManager.instance.handlePlayerLeave(player.id);
        
        // Remove from our tracking but don't do regular cleanup since shootout manager handles it
        HockeyGameManager.instance.removePlayer(player);
        const idx = this.connectedPlayers.indexOf(player);
        if (idx !== -1) this.connectedPlayers.splice(idx, 1);
        
        return; // Exit early - shootout manager handles the rest
      }
    }

    HockeyGameManager.instance.removePlayer(player);
    const idx = this.connectedPlayers.indexOf(player);
    if (idx !== -1) this.connectedPlayers.splice(idx, 1);
    
    // Update all remaining players with new team positions after player leaves (only for regulation mode)
    for (const p of this.connectedPlayers) {
      p.ui.sendData({
        type: 'team-positions-update',
        teams: HockeyGameManager.instance.getTeamsWithNamesForUI()
      });
    }
    
    this.updateGameState();
  }
  
  private initializePuckIfNeeded(): void {
    if (!this.puckSpawned && this.createPuckEntity && this.world) {
      this.puck = this.createPuckEntity();
      this.puck.spawn(this.world, CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE);
      this.puckSpawned = true;
      
      // Attach trail effect to the newly spawned puck
      PuckTrailManager.instance.attachTrailToPuck(this.puck);
      
      // Start boundary monitoring for automatic respawn
      PuckBoundaryService.instance.startMonitoring(this.puck);
      
      CONSTANTS.debugLog(`Puck spawned at center ice with trail effect and boundary monitoring: ${JSON.stringify(CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE)}`, 'PlayerManager');
      
      setTimeout(() => {
        CONSTANTS.debugLog(`Puck spawn check - isSpawned: ${this.puck?.isSpawned}, position: ${JSON.stringify(this.puck?.position)}`, 'PlayerManager');
      }, 1000);
    }
  }
  
  private setupPlayerUIEvents(player: any): void {
    if (!this.world) return;
    
    player.ui.on(PlayerUIEvent.DATA, ({ data }: { data: any }) => {
      CONSTANTS.debugLog(`Received UI data: ${data.type} from player: ${player.id}`, 'PlayerManager');
      if (data.type === 'request-game-mode-availability') {
        const lock = HockeyGameManager.instance.gameModeLock;
        const available = {
          REGULATION: lock === null || lock === GameMode.REGULATION,
          SHOOTOUT: lock === null || lock === GameMode.SHOOTOUT,
        };
        player.ui.sendData({ type: 'game-mode-availability', available, locked: lock });
        return;
      }
      
      // --- FIX: Show game mode selection overlay when event is received ---
      if (data.type === 'game-mode-selection-start') {
        // Mark player as on the overlay
        this.playersOnGameModeOverlay.add(player.id);
        player.ui.sendData({ type: 'show-game-mode-selection' });
        CONSTANTS.debugLog(`Showing game mode selection overlay to player ${player.id} (event received)`, 'PlayerManager');
        return;
      }
      
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
      } else if (data.type === 'toggle-background-music') {
        this.handleBackgroundMusicToggle(player, data);
      } else if (data.type === 'period-end') {
        this.handlePeriodEnd(player);
      } else if (data.type === 'request-stats') {
        this.handleStatsRequest(player);
      } else if (data.type === 'request-live-stats') {
        this.handleLiveStatsRequest(player);
      } else if (data.type === 'request-leaderboard') {
        this.handleLeaderboardRequest(player);
      } else if (data.type === 'request-top100') {
        this.handleTop100Request(player);
      } else if (data.type === 'position-switch-request') {
        this.handlePositionSwitchRequest(player, data);
      } else if (data.type === 'reopen-team-selection') {
        this.handleReopenTeamSelection(player);
      } else if (data.type === 'game-mode-select') {
        this.handleGameModeSelect(player, data);
      } else if (data.type === 'shootout-shot-timeout') {
        this.handleShootoutShotTimeout(player);
      } else if (data.type === 'shootout-return-to-game-mode-selection') {
        this.handleShootoutReturnToGameModeSelection(player);
      }
      if (data.type === 'show-team-selection' || data.type === 'hide-game-mode-selection') {
        // Player left the overlay
        this.playersOnGameModeOverlay.delete(player.id);
      }
    });
  }
  
  private handleTeamPositionSelect(player: any, data: any): void {
    if (!this.world) return;
    
    const { team, position } = data;
    CONSTANTS.debugLog(`team-position-select received: team=${team}, position=${position}, player.id=${player.id}`, 'PlayerManager');
    
    (player as any)._lastSelectedTeam = team;
    (player as any)._lastSelectedPosition = position;
    
    const assigned = HockeyGameManager.instance.assignPlayerToTeam(player, team, position);
    CONSTANTS.debugLog(`assignPlayerToTeam returned: ${assigned}`, 'PlayerManager');
    
    if (assigned) {
      this.world.chatManager.sendPlayerMessage(
        player, 
        `You selected ${team} ${position}. Click Lock In when ready!`, 
        '00FF00'
      );
      
      // Don't send team-positions-update for tentative selections
      // Only locked-in positions should show as "taken" to other players
      CONSTANTS.debugLog(`Player ${player.id} made tentative selection: ${team}-${position}`, 'PlayerManager');
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
    
            CONSTANTS.debugLog(`Received puck-pass event with power: ${data.power}`, 'PlayerManager');
    const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
    CONSTANTS.debugLog(`Found player entities: ${playerEntities.length}`, 'PlayerManager');
    
    for (const entity of playerEntities) {
      if (entity.controller && this.IceSkatingController && entity.controller instanceof this.IceSkatingController) {
        const controller = entity.controller as any; // Type assertion for IceSkatingController methods
        CONSTANTS.debugLog(`Found IceSkatingController, checking puck control: ${controller.isControllingPuck}`, 'PlayerManager');
        const facingDir = player.camera.facingDirection;
        const yaw = Math.atan2(facingDir.x, facingDir.z);
        CONSTANTS.debugLog(`Executing pass with power: ${data.power} yaw: ${yaw}`, 'PlayerManager');
        controller.executePuckPass(data.power, yaw);
      }
    }
  }
  
  private handlePuckShoot(player: any, data: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`Received puck-shoot event with power: ${data.power}`, 'PlayerManager');
    const playerEntities = this.world.entityManager.getPlayerEntitiesByPlayer(player);
    CONSTANTS.debugLog(`Found player entities: ${playerEntities.length}`, 'PlayerManager');
    
    for (const entity of playerEntities) {
      if (entity.controller && this.IceSkatingController && entity.controller instanceof this.IceSkatingController) {
        const controller = entity.controller as any; // Type assertion for IceSkatingController methods
        CONSTANTS.debugLog(`Found IceSkatingController, checking puck control: ${controller.isControllingPuck}`, 'PlayerManager');
        const facingDir = player.camera.facingDirection;
        const yaw = Math.atan2(facingDir.x, facingDir.z);
        CONSTANTS.debugLog(`Executing shot with power: ${data.power} yaw: ${yaw}`, 'PlayerManager');
        controller.executeShot(data.power, yaw);
      }
    }
  }
  
  private handlePlayerLockIn(player: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`lock-in received for player.id=${player.id}`, 'PlayerManager');
    
    // Check if player is currently browsing team selection
    const wasBrowsing = (player as any)._browsingTeamSelection;
    // Store the ORIGINAL position BEFORE lock-in changes it
    const originalTeamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
    
    const lockInSuccessful = HockeyGameManager.instance.lockInPlayer(player);
    
    if (lockInSuccessful) {
      // Get the NEW position AFTER lock-in
      const newTeamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
      
      // Clear browsing flag
      (player as any)._browsingTeamSelection = false;
      
      player.ui.sendData({ 
        type: 'team-position-confirmed', 
        team: newTeamPos?.team, 
        position: newTeamPos?.position 
      });
      
      this.world.chatManager.sendPlayerMessage(
        player, 
        `Locked in as ${newTeamPos?.team} ${newTeamPos?.position}!`, 
        '00FF00'
      );
      
      // Update all players with new team positions (only locked-in positions show as taken)
      CONSTANTS.debugLog(`Broadcasting team positions update after ${player.id} locked in`, 'PlayerManager');
      CONSTANTS.debugLog(`Locked-in teams: ${JSON.stringify(HockeyGameManager.instance.getTeamsWithNamesForUI())}`, 'PlayerManager');
      
      for (const p of this.connectedPlayers) {
        p.ui.sendData({
          type: 'team-positions-update',
          teams: HockeyGameManager.instance.getTeamsWithNamesForUI()
        });
      }
      
      // Only create new entity if:
      // 1. Player was not browsing (first time lock-in), OR
      // 2. Player was browsing AND actually changed position
      const positionChanged = originalTeamPos && newTeamPos && 
        (originalTeamPos.team !== newTeamPos.team || originalTeamPos.position !== newTeamPos.position);
      
      CONSTANTS.debugLog(`Position comparison: original=${JSON.stringify(originalTeamPos)}, new=${JSON.stringify(newTeamPos)}, changed=${positionChanged}`, 'PlayerManager');
      
      if (!wasBrowsing || positionChanged) {
        CONSTANTS.debugLog(`Creating new entity for ${player.id}: wasBrowsing=${wasBrowsing}, positionChanged=${positionChanged}`, 'PlayerManager');
        this.createPlayerEntity(player);
      } else {
        CONSTANTS.debugLog(`Player ${player.id} confirmed same position while browsing - no entity recreation needed`, 'PlayerManager');
        // Just hide the team selection overlay since they confirmed their current position
        player.ui.sendData({ type: 'hide-team-selection' });
      }
      
      // Try to activate audio on lock-in as backup (in case UI activation didn't work)
      if (!this.audioActivated) {
        CONSTANTS.debugLog(`Audio not yet activated, flagging as activated for player: ${player.id}`, 'PlayerManager');
        this.audioActivated = true;
        // Background music now handled globally with simple Hytopia approach
      }
      
      this.updateGameState();
    } else {
      // Clear browsing flag on failed lock-in
      (player as any)._browsingTeamSelection = false;
      
      // Lock-in failed - position probably taken by another player
      player.ui.sendData({ 
        type: 'team-position-error', 
        message: 'That position was just taken by another player. Please select another position.' 
      });
      
      this.world.chatManager.sendPlayerMessage(
        player, 
        'That position was just taken. Please select another position.', 
        'FF4444'
      );
    }
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
      CONSTANTS.debugLog(`Player entity spawned at team position: ${JSON.stringify(spawnData.position)} with rotation: ${spawnData.yaw} radians`, 'PlayerManager');
    } else {
      // Spawn at default position for players without team assignment
      playerEntity.spawn(this.world, spawn);
      CONSTANTS.debugLog(`Player entity spawned at default position: ${JSON.stringify(spawn)}`, 'PlayerManager');
    }
    
    // Set up entity despawn listener to ensure cleanup
    playerEntity.on(EntityEvent.DESPAWN, () => {
      CONSTANTS.debugLog(`Player entity despawned, cleaning up controller for player ${player.id}`, 'PlayerManager');
      if (iceController && typeof iceController.cleanupSkatingAudio === 'function') {
        iceController.cleanupSkatingAudio();
      }
    });
    
    // Start tracking player for AFK detection when they have an active entity
    AFKManager.instance.trackPlayer(player);
    
    // Add helmet cosmetic based on team assignment
    // Add delay to ensure entity is fully initialized and camera is set up first
    setTimeout(() => {
      // Add entity state check before adding cosmetics
      if (playerEntity && playerEntity.isSpawned) {
        this.addTeamHelmet(playerEntity, teamPos);
        this.addTeamVisor(playerEntity, teamPos);
        this.addIceSkates(playerEntity, teamPos);
        this.addTeamJersey(playerEntity, teamPos);
        this.addHockeyGloves(playerEntity, teamPos);
        this.addTeamSocks(playerEntity, teamPos);
        this.addTeamArmCosmetics(playerEntity, teamPos);
      } else {
        CONSTANTS.debugWarn(`Skipping cosmetics setup - player entity not spawned for player ${player.id}`, 'PlayerManager');
      }
    }, 500); // Increased timeout for better stability during auto-balancing
    
    this.setupPlayerUI(player, teamPos);
    
    // Add small delay to ensure entity is fully initialized before setting up camera
    setTimeout(() => {
      // Add entity state check before setting up camera
      if (playerEntity && playerEntity.isSpawned) {
        this.setupPlayerCamera(player, playerEntity);
      } else {
        CONSTANTS.debugWarn(`Skipping camera setup - player entity not spawned for player ${player.id}`, 'PlayerManager');
        // Retry camera setup after additional delay
        setTimeout(() => {
          if (playerEntity && playerEntity.isSpawned) {
            this.setupPlayerCamera(player, playerEntity);
          } else {
            CONSTANTS.debugError(`Failed to setup camera after retry for player ${player.id}`, undefined, 'PlayerManager');
          }
        }, 200);
      }
    }, 300); // Increased timeout for better stability
    
    // Always lock pointer when player spawns after locking in (they came from team selection)
    // This ensures proper game controls regardless of current game state
    setTimeout(() => {
      try {
        player.ui.lockPointer(true);
        CONSTANTS.debugLog(`Locked pointer for player ${player.id} after spawning (from team selection)`, 'PlayerManager');
      } catch (error) {
        CONSTANTS.debugError(`Error locking pointer for player ${player.id} after spawn:`, error, 'PlayerManager');
      }
    }, 200); // Small delay to ensure entity is fully initialized
    
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        CONSTANTS.debugLog(`Player spawn check - isSpawned: ${playerEntity?.isSpawned}, position: ${JSON.stringify(playerEntity?.position)}`, 'PlayerManager');
        if (this.puck && this.puck.isSpawned) {
          const distance = Math.sqrt(
            Math.pow(playerEntity.position.x - this.puck.position.x, 2) + 
            Math.pow(playerEntity.position.z - this.puck.position.z, 2)
          );
          CONSTANTS.debugLog(`Distance between player and puck: ${distance}`, 'PlayerManager');
        }
      }, 1000);
    }
    
    this.world.chatManager.sendPlayerMessage(player, 'You have joined the game!', '00FF00');
    this.world.chatManager.sendPlayerMessage(player, 'Press C to open the Controls menu', 'f3ed51');
    this.world.chatManager.sendPlayerMessage(player, 'Press K to open the Live Stats menu', 'f3ed51');
    this.world.chatManager.sendPlayerMessage(player, 'Press M to toggle the background music On/Off', 'f3ed51');
  }
  
  private handlePlayerPuckCollision(
    iceController: any, 
    other: Entity | BlockType, 
    started: boolean, 
    player: any, 
    playerEntity: HytopiaPlayerEntity
  ): void {
    if (other === this.puck) {
      CONSTANTS.debugLog(`Player collision detected with PUCK started: ${started} player: ${player?.id}`, 'PlayerManager');
      
      if (iceController && this.IceSkatingController && iceController instanceof this.IceSkatingController) {
        iceController._isCollidingWithPuck = started;
      }
      
      const entityController = playerEntity.controller;
      CONSTANTS.debugLog(`onCollision iceController === entity.controller: ${iceController === entityController}`, 'PlayerManager');
      CONSTANTS.debugLog(`iceController._canPickupPuck: ${iceController._canPickupPuck}`, 'PlayerManager');
      CONSTANTS.debugLog(`iceController._pendingPuckPickup: ${iceController._pendingPuckPickup}`, 'PlayerManager');
      CONSTANTS.debugLog(`iceController.isControllingPuck: ${iceController.isControllingPuck}`, 'PlayerManager');
      
      if (started && this.puck && iceController && this.IceSkatingController && iceController instanceof this.IceSkatingController) {
        const now = Date.now();
        
        CONSTANTS.debugLog(`[PUCK COLLISION] _canPickupPuck: ${iceController._canPickupPuck} player: ${player?.id}`, 'PlayerManager');
        if (!iceController._canPickupPuck) {
          CONSTANTS.debugLog(`Pickup blocked: _canPickupPuck is false for player ${player?.id}`, 'PlayerManager');
          return;
        }
        
        if (this.IceSkatingController._globalPuckController === null) {
          CONSTANTS.debugLog(`Puck is uncontrolled - auto-pickup allowed for player ${player?.id}`, 'PlayerManager');
          iceController.attachPuck(this.puck, player);
          iceController._pendingPuckPickup = false;
          iceController._passTargetPuck = null;
          iceController._passPickupWindow = 0;
        } else if (
          iceController._pendingPuckPickup ||
          (iceController._passTargetPuck === this.puck && now < iceController._passPickupWindow)
        ) {
          CONSTANTS.debugLog(`Player collided with puck - attempting to attach (allowed by flag) for player ${player?.id}`, 'PlayerManager');
          iceController.attachPuck(this.puck, player);
          iceController._pendingPuckPickup = false;
          iceController._passTargetPuck = null;
          iceController._passPickupWindow = 0;
        } else {
          CONSTANTS.debugLog(`Player collided with puck - attach NOT allowed (no flag, puck controlled) for player ${player?.id}`, 'PlayerManager');
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
    CONSTANTS.debugLog(`setupPlayerUI called for player: ${player.id}, teamPos: ${JSON.stringify(teamPos)}`, 'PlayerManager');
    
    try {
      // Check current game state to send appropriate UI data
      const gameState = HockeyGameManager.instance.state;
      const connectedCount = this.connectedPlayers.length;
      const lockedInCount = HockeyGameManager.instance.lockedIn.size; // Use locked-in count
      const totalSlots = 12; // 6 per team
      
      if (gameState === HockeyGameState.WAITING_FOR_PLAYERS || gameState === HockeyGameState.LOBBY) {
        // Send waiting state UI data (use locked-in count)
        player.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: lockedInCount, // Use locked-in count, not connected count
          totalPlayers: totalSlots
        });
      } else {
        // Player has locked in and game is in progress - send current game state with overlays
        CONSTANTS.debugLog(`setupPlayerUI - sending current game state to locked-in player ${player.id}`, 'PlayerManager');
        this.sendCurrentGameStateToPlayer(player);
      }

      // If player is a defender, enable body check UI
      CONSTANTS.debugLog(`Checking if player is defender. teamPos: ${JSON.stringify(teamPos)}`, 'PlayerManager');
      if (teamPos && (teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2')) {
        CONSTANTS.debugLog('Player is defender - enabling body check UI', 'PlayerManager');
        CONSTANTS.debugLog(`Sending set-body-check-visibility: true to player ${player.id}`, 'PlayerManager');
        player.ui.sendData({ 
          type: 'set-body-check-visibility', 
          visible: true 
        });
        // Initially disabled until opponents are in range
        CONSTANTS.debugLog(`Sending body-check-available: false to player ${player.id}`, 'PlayerManager');
        player.ui.sendData({ 
          type: 'body-check-available', 
          available: false 
        });
      } else {
        CONSTANTS.debugLog(`Player is not defender - hiding body check UI. Position: ${teamPos?.position}`, 'PlayerManager');
        player.ui.sendData({ 
          type: 'set-body-check-visibility', 
          visible: false 
        });
      }
    } catch (error) {
      CONSTANTS.debugError('Error sending UI data:', error, 'PlayerManager');
    }
  }
  
  private setupPlayerCamera(player: any, playerEntity: HytopiaPlayerEntity): void {
    // Safety check: Ensure entity is properly spawned before setting up camera
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugError(`Cannot setup camera - player entity not spawned for player ${player.id}`, undefined, 'PlayerManager');
      return;
    }
    
    const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
    
    try {
      player.camera.setMode(PlayerCameraMode.THIRD_PERSON);
      player.camera.setAttachedToEntity(playerEntity);
      player.camera.setOffset({ x: 0, y: 1, z: 0 });
    } catch (error) {
      CONSTANTS.debugError(`Error setting up camera for player ${player.id}:`, error, 'PlayerManager');
      return;
    }
    
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
      CONSTANTS.debugLog(`Set camera lookAtPosition for ${teamPos.team} team: ${JSON.stringify(lookAtPosition)}`, 'PlayerManager');
    }
    
          CONSTANTS.debugLog('Camera setup complete - using lookAtPosition for orientation', 'PlayerManager');
  }
  
  private handleAudioActivation(player: any): void {
    try {
      // Audio activation no longer needed for background music
      // Background music now starts automatically with the simple Hytopia approach
      CONSTANTS.debugLog(`Audio activation received from player: ${player.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugError('Error handling audio activation:', error, 'PlayerManager');
    }
  }

  private handleBackgroundMusicToggle(player: any, data: any): void {
    const gameMusic = (global as any).gameMusic;
    
    if (!gameMusic) {
      CONSTANTS.debugWarn(`Background music not found for player: ${player.id}`, 'PlayerManager');
      return;
    }
    
    if (data.muted) {
      // Mute the music by pausing it
      gameMusic.pause();
      CONSTANTS.debugLog(`Background music muted for player: ${player.id}`, 'PlayerManager');
    } else {
      // Unmute the music by creating a new Audio instance and playing it
      if (this.world) {
        // First pause the old instance to clean up
        gameMusic.pause();
        
        // Create a new Audio instance with the same settings
        const newGameMusic = new Audio({
          uri: 'audio/music/faceoff-theme.mp3',
          loop: true,
          volume: CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME,
        });
        
        // Play the new instance
        newGameMusic.play(this.world);
        
        // Update the global reference
        (global as any).gameMusic = newGameMusic;
        
        CONSTANTS.debugLog(`Background music unmuted (new instance) for player: ${player.id}`, 'PlayerManager');
      }
    }
  }

  private handlePeriodEnd(player: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`Period end event received from UI (player: ${player.id})`, 'PlayerManager');
    
    // Only trigger if the game is actually in progress
    const gameState = HockeyGameManager.instance.state;
    if (gameState === HockeyGameState.IN_PERIOD) {
      CONSTANTS.debugLog('Triggering period end from UI timer', 'PlayerManager');
      HockeyGameManager.instance.endPeriod();
    } else {
      CONSTANTS.debugLog(`Ignoring period end - game not in period (state: ${gameState})`, 'PlayerManager');
    }
  }

  private handleStatsRequest(player: any): void {
    CONSTANTS.debugLog(`Received stats request from player ${player.id}`, 'PlayerManager');
    
    // Broadcast latest stats to all players
    HockeyGameManager.instance.broadcastStatsUpdate();
  }

  private handleLiveStatsRequest(player: any): void {
    CONSTANTS.debugLog(`Received live stats request from player ${player.id}`, 'PlayerManager');
    
    // Send live stats specifically to the requesting player
    HockeyGameManager.instance.sendLiveStatsToPlayer(player);
  }

  private async handleLeaderboardRequest(player: any): Promise<void> {
    CONSTANTS.debugLog(`Received leaderboard request from player ${player.id}`, 'PlayerManager');
    
    try {
      // Get persistent stats for all connected players
      const leaderboardData = [];
      
      for (const connectedPlayer of this.connectedPlayers) {
        try {
          const persistentStats = await PersistentPlayerStatsManager.instance.loadPlayerStats(connectedPlayer);
          
          leaderboardData.push({
            playerId: connectedPlayer.id,
            playerName: connectedPlayer.username || connectedPlayer.id,
            goals: persistentStats.goals,
            assists: persistentStats.assists,
            saves: persistentStats.saves,
            hits: persistentStats.hits,
            shotsOnGoal: persistentStats.shotsOnGoal,
            wins: persistentStats.wins,
            losses: persistentStats.losses,
            gamesPlayed: persistentStats.gamesPlayed
          });
        } catch (error) {
          CONSTANTS.debugLog(`Error loading stats for player ${connectedPlayer.id}: ${error}`, 'PlayerManager');
          // Add default stats if loading fails
          leaderboardData.push({
            playerId: connectedPlayer.id,
            playerName: connectedPlayer.username || connectedPlayer.id,
            goals: 0,
            assists: 0,
            saves: 0,
            hits: 0,
            shotsOnGoal: 0,
            wins: 0,
            losses: 0,
            gamesPlayed: 0
          });
        }
      }
      
      // Send leaderboard data to the requesting player
      player.ui.sendData({
        type: 'leaderboard-response',
        leaderboardData: leaderboardData
      });
      
      CONSTANTS.debugLog(`Sent leaderboard data to player ${player.id} with ${leaderboardData.length} players`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugLog(`Error handling leaderboard request: ${error}`, 'PlayerManager');
      // Send empty leaderboard on error
      player.ui.sendData({
        type: 'leaderboard-response',
        leaderboardData: []
      });
    }
  }

  private async handleTop100Request(player: any): Promise<void> {
    CONSTANTS.debugLog(`Received Top 100 request from player ${player.id}`, 'PlayerManager');
    
    try {
      // Get all player stats from persistence
      const top100Data = await this.getAllPlayerStatsForTop100();
      
      // Send Top 100 data to the requesting player
      player.ui.sendData({
        type: 'top100-response',
        top100Data: top100Data
      });
      
      CONSTANTS.debugLog(`Sent Top 100 data to player ${player.id} with ${top100Data.length} players`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugLog(`Error handling Top 100 request: ${error}`, 'PlayerManager');
      // Send empty Top 100 on error
      player.ui.sendData({
        type: 'top100-response',
        top100Data: []
      });
    }
  }

  private async getAllPlayerStatsForTop100(): Promise<any[]> {
    CONSTANTS.debugLog('Starting Top 100 data collection using HYTOPIA persistence API', 'PlayerManager');
    
    try {
      // Use HYTOPIA's official persistence API to get global leaderboard data
      const rawGlobalData = await PersistenceManager.instance.getGlobalData(CONSTANTS.PERSISTENCE.GLOBAL_LEADERBOARD_KEY);
      
      if (rawGlobalData && typeof rawGlobalData === 'object' && 'players' in rawGlobalData && Array.isArray(rawGlobalData.players)) {
        const globalLeaderboardData = rawGlobalData as any;
        const allPlayerStats = globalLeaderboardData.players;
        
        // Sort by points (goals + assists) in descending order, then by goals as tiebreaker
        allPlayerStats.sort((a: any, b: any) => {
          const pointsA = (a.goals || 0) + (a.assists || 0);
          const pointsB = (b.goals || 0) + (b.assists || 0);
          
          if (pointsB !== pointsA) {
            return pointsB - pointsA; // Higher points first
          }
          
          // If points are equal, sort by goals (higher goals first)
          if (b.goals !== a.goals) {
            return b.goals - a.goals;
          }
          
          // If points and goals are equal, sort by games played (fewer games first - better efficiency)
          return a.gamesPlayed - b.gamesPlayed;
        });
        
        // Limit to top 100
        const top100 = allPlayerStats.slice(0, 100);
        
        CONSTANTS.debugLog(`Collected ${allPlayerStats.length} total players from global leaderboard, returning top ${top100.length} for Top 100`, 'PlayerManager');
        
        return top100;
      } else {
        CONSTANTS.debugLog('No global leaderboard data found, returning empty Top 100', 'PlayerManager');
        return [];
      }
    } catch (error) {
      CONSTANTS.debugLog(`Error reading global leaderboard data: ${error}`, 'PlayerManager');
      return [];
    }
  }

  private sendCurrentGameStateToPlayer(player: any): void {
    const gameState = HockeyGameManager.instance.state;
    const gameManager = HockeyGameManager.instance;
    
    // Send current game state if game is in progress
    if (gameState === HockeyGameState.IN_PERIOD) {
      const periodStartTime = gameManager.getCurrentPeriodStartTime();
      const hockeyManager = gameManager as any; // Access private properties
      
      // Check if goal celebration, offside, or countdown is active even if state is still IN_PERIOD
      const isGoalCelebrationActive = hockeyManager._goalCelebrationState?.isActive;
      const isOffsideActive = hockeyManager._offsideState?.isActive;
      const isCountdownActive = hockeyManager._countdownState?.isActive;
      const pausedTimerValue = gameManager.getPausedTimerValue();
      
      if (isGoalCelebrationActive || isOffsideActive || isCountdownActive || pausedTimerValue !== null) {
        // Timer is paused for goal celebration/countdown - send paused state
        player.ui.sendData({
          type: 'game-start',
          redScore: gameManager.scores.RED,
          blueScore: gameManager.scores.BLUE,
          period: gameManager.period,
          periodStartTime: periodStartTime,
          timerPaused: true, // Indicate timer should be paused
          pausedTimerValue: pausedTimerValue // Send the exact time when goal was scored
        });
        
        // Send appropriate overlay based on current state
        if (isGoalCelebrationActive) {
          // Goal celebration is active - show goal overlay
          player.ui.sendData({
            type: 'goal-scored',
            team: hockeyManager._goalCelebrationState.team,
            isOwnGoal: hockeyManager._goalCelebrationState.isOwnGoal,
            scorerName: hockeyManager._goalCelebrationState.scorerName,
            assistName: hockeyManager._goalCelebrationState.assistName
          });
          CONSTANTS.debugLog(`Sent goal celebration overlay to locked-in player ${player.id} during IN_PERIOD`, 'PlayerManager');
        } else if (isOffsideActive) {
          // Offside is active - show offside overlay
          player.ui.sendData({
            type: 'offside-called',
            violatingTeam: hockeyManager._offsideState.violatingTeam,
            faceoffLocation: hockeyManager._offsideState.faceoffLocation
          });
          CONSTANTS.debugLog(`Sent offside overlay to locked-in player ${player.id} during IN_PERIOD`, 'PlayerManager');
        } else if (isCountdownActive) {
          // Countdown is active - show countdown overlay
          player.ui.sendData({
            type: 'countdown-update',
            countdown: hockeyManager._countdownState.countdown,
            subtitle: hockeyManager._countdownState.subtitle
          });
                      CONSTANTS.debugLog(`Sent countdown overlay to locked-in player ${player.id} during IN_PERIOD: ${hockeyManager._countdownState.countdown}`, 'PlayerManager');
        }
        
        CONSTANTS.debugLog(`Sent paused IN_PERIOD state to locked-in player ${player.id} during goal celebration/countdown, pausedTimerValue: ${pausedTimerValue}`, 'PlayerManager');
      } else {
        // Normal game in progress - send regular state
        player.ui.sendData({
          type: 'game-start',
          redScore: gameManager.scores.RED,
          blueScore: gameManager.scores.BLUE,
          period: gameManager.period,
          periodStartTime: periodStartTime // Critical: sync timer with ongoing game
        });
        
        CONSTANTS.debugLog(`Sent normal IN_PERIOD state to locked-in player ${player.id}: period ${gameManager.period}, scores ${gameManager.scores.RED}-${gameManager.scores.BLUE}, periodStartTime: ${periodStartTime}`, 'PlayerManager');
      }
    } else if (gameState === HockeyGameState.GOAL_SCORED) {
      // Goal celebration or countdown in progress - send game state with paused timer
      const periodStartTime = gameManager.getCurrentPeriodStartTime();
      const pausedTimerValue = gameManager.getPausedTimerValue();
      
      player.ui.sendData({
        type: 'game-start',
        redScore: gameManager.scores.RED,
        blueScore: gameManager.scores.BLUE,
        period: gameManager.period,
        periodStartTime: periodStartTime,
        timerPaused: true, // Indicate timer should be paused during goal celebration
        pausedTimerValue: pausedTimerValue // Send the exact time when goal was scored
      });
      
      // Send appropriate overlay based on current state
      const hockeyManager = gameManager as any; // Access private properties
      
      if (hockeyManager._goalCelebrationState?.isActive) {
        // Goal celebration is active - show goal overlay
        player.ui.sendData({
          type: 'goal-scored',
          team: hockeyManager._goalCelebrationState.team,
          isOwnGoal: hockeyManager._goalCelebrationState.isOwnGoal,
          scorerName: hockeyManager._goalCelebrationState.scorerName,
          assistName: hockeyManager._goalCelebrationState.assistName
        });
        CONSTANTS.debugLog(`Sent goal celebration overlay to locked-in player ${player.id}`, 'PlayerManager');
      } else if (hockeyManager._offsideState?.isActive) {
        // Offside is active - show offside overlay
        player.ui.sendData({
          type: 'offside-called',
          violatingTeam: hockeyManager._offsideState.violatingTeam,
          faceoffLocation: hockeyManager._offsideState.faceoffLocation
        });
        CONSTANTS.debugLog(`Sent offside overlay to locked-in player ${player.id}`, 'PlayerManager');
      } else if (hockeyManager._countdownState?.isActive) {
        // Countdown is active - show countdown overlay
        player.ui.sendData({
          type: 'countdown-update',
          countdown: hockeyManager._countdownState.countdown,
          subtitle: hockeyManager._countdownState.subtitle
        });
                  CONSTANTS.debugLog(`Sent countdown overlay to locked-in player ${player.id}: ${hockeyManager._countdownState.countdown}`, 'PlayerManager');
      }
      
      CONSTANTS.debugLog(`Sent paused game state to locked-in player ${player.id} during goal celebration/countdown, periodStartTime: ${periodStartTime}`, 'PlayerManager');
    } else if (gameState === HockeyGameState.MATCH_START) {
      // Game is starting - send game state with paused timer
      const periodStartTime = gameManager.getCurrentPeriodStartTime();
      
      player.ui.sendData({
        type: 'game-start',
        redScore: gameManager.scores.RED,
        blueScore: gameManager.scores.BLUE,
        period: gameManager.period,
        periodStartTime: periodStartTime,
        timerPaused: true // Timer is paused during match start countdown
      });
      
      // Send countdown overlay if match start countdown is active
      const hockeyManager = gameManager as any; // Access private properties
      if (hockeyManager._countdownState?.isActive) {
        player.ui.sendData({
          type: 'countdown-update',
          countdown: hockeyManager._countdownState.countdown,
          subtitle: hockeyManager._countdownState.subtitle
        });
        CONSTANTS.debugLog(`Sent match start countdown overlay to locked-in player ${player.id}: ${hockeyManager._countdownState.countdown}`, 'PlayerManager');
      }
      
      CONSTANTS.debugLog(`Sent match start state to locked-in player ${player.id} during match start`, 'PlayerManager');
    } else if (gameState === HockeyGameState.LOBBY || 
               gameState === HockeyGameState.TEAM_SELECTION || 
               gameState === HockeyGameState.WAITING_FOR_PLAYERS) {
      // Send waiting/lobby state with scoreboard
      const lockedInCount = gameManager.lockedIn.size;
      const totalSlots = 12;
      
      player.ui.sendData({
        type: 'game-waiting',
        redScore: 0,
        blueScore: 0,
        connectedPlayers: lockedInCount,
        totalPlayers: totalSlots,
        minimumRequired: CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL,
        waitingMessage: `Waiting for players... ${lockedInCount}/${totalSlots}`
      });
      
      CONSTANTS.debugLog(`Sent waiting state to joining player ${player.id} during ${gameState}: ${lockedInCount}/${totalSlots} players`, 'PlayerManager');
    } else if (gameState === HockeyGameState.COUNTDOWN_TO_START) {
      // For countdown state, trigger the callback system to handle it properly
      // This ensures the joining player gets the current countdown state through the same system
      // that handles countdown updates for all players
      setTimeout(() => {
        this.updateGameState();
      }, 100);
      
      CONSTANTS.debugLog(`Triggered updateGameState for joining player ${player.id} during COUNTDOWN_TO_START`, 'PlayerManager');
    }
    // Game mode selection and shootout states are handled by their respective managers
  }

  private triggerBackgroundMusic(): void {
    // Background music is now handled globally with the simple Hytopia approach
    // No complex management needed
    CONSTANTS.debugLog('Background music handled globally with simple Hytopia approach', 'PlayerManager');
  }

  private triggerBackgroundMusicForPlayer(player: any): void {
    // Background music is now handled globally with the simple Hytopia approach
    // No per-player background music management needed
    CONSTANTS.debugLog(`Background music handled globally, no per-player setup needed for: ${player.id}`, 'PlayerManager');
  }
  
  private updateGameState(): void {
    if (!this.world) return;
    
    const gameState = HockeyGameManager.instance.state;
    const connectedCount = this.connectedPlayers.length;
    const lockedInCount = HockeyGameManager.instance.lockedIn.size; // Only count players who have locked in
    const totalSlots = 12; // 6 per team
    
    CONSTANTS.debugLog(`updateGameState called: state=${gameState}, connected=${connectedCount}, lockedIn=${lockedInCount}`, 'PlayerManager');
    
    // Only transition to WAITING_FOR_PLAYERS from LOBBY or TEAM_SELECTION state
    // Don't interrupt active games (IN_PERIOD, MATCH_START, GOAL_SCORED, etc.)
    // Transition as soon as any player locks in (just like the original system)
    if ((gameState === HockeyGameState.LOBBY || gameState === HockeyGameState.TEAM_SELECTION) && lockedInCount >= 1) {
      HockeyGameManager.instance.startWaitingForPlayers();
      this.world.chatManager.sendBroadcastMessage('Waiting for all players to join teams...');
    }

    // Handle the new flexible lobby system
    if (gameState === HockeyGameState.WAITING_FOR_PLAYERS) {
      // Check if minimum threshold is met for countdown
      const meetsThreshold = HockeyGameManager.instance.checkMinimumPlayersThreshold();
      CONSTANTS.debugLog(`Checking minimum threshold: ${meetsThreshold}, connected: ${connectedCount}, lockedIn: ${lockedInCount}`, 'PlayerManager');
      
      if (meetsThreshold) {
        CONSTANTS.debugLog('Minimum threshold met - starting countdown!', 'PlayerManager');
        HockeyGameManager.instance.startMinimumThresholdCountdown();
      } else {
        // Debug why threshold isn't met
        const teams = HockeyGameManager.instance.teams;
        const redCount = Object.values(teams[HockeyTeam.RED]).filter(Boolean).length;
        const blueCount = Object.values(teams[HockeyTeam.BLUE]).filter(Boolean).length;
        const redGoalie = teams[HockeyTeam.RED][HockeyPosition.GOALIE];
        const blueGoalie = teams[HockeyTeam.BLUE][HockeyPosition.GOALIE];
        const lockedIn = HockeyGameManager.instance.lockedIn;
        
        CONSTANTS.debugLog(`Threshold not met: Red=${redCount}, Blue=${blueCount}, RedGoalie=${redGoalie}, BlueGoalie=${blueGoalie}, RedGoalieLocked=${redGoalie ? lockedIn.has(redGoalie) : false}, BlueGoalieLocked=${blueGoalie ? lockedIn.has(blueGoalie) : false}`, 'PlayerManager');
        
        // Broadcast waiting state with updated player count info (use lockedIn count)
        this.connectedPlayers.forEach(p => {
          p.ui.sendData({ 
            type: 'game-waiting',
            redScore: 0,
            blueScore: 0,
            connectedPlayers: lockedInCount, // Use locked-in count, not connected count
            totalPlayers: totalSlots,
            minimumRequired: CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL,
            waitingMessage: `Waiting for players... ${lockedInCount}/${totalSlots}`
          });
        });
      }
    }

    // Handle countdown state - show countdown in scoreboard  
    if (gameState === HockeyGameState.COUNTDOWN_TO_START) {
      const timeRemaining = HockeyGameManager.instance.getCountdownTimeRemaining();
      CONSTANTS.debugLog(`COUNTDOWN STATE: Updating scoreboard with ${timeRemaining}s remaining, ${lockedInCount} locked-in players`, 'PlayerManager');
      
      // Send game-waiting with countdown flag to trigger "Game starting in X seconds" text (use lockedIn count)
      this.connectedPlayers.forEach(p => {
        p.ui.sendData({ 
          type: 'game-waiting', 
          redScore: 0,
          blueScore: 0,
          connectedPlayers: lockedInCount, // Use locked-in count, not connected count
          totalPlayers: totalSlots,
          minimumRequired: CONSTANTS.LOBBY_CONFIG.MINIMUM_PLAYERS_TOTAL,
          isCountdown: true,
          countdownTime: timeRemaining
        });
      });
      
      CONSTANTS.debugLog(`Sent countdown UI updates to ${this.connectedPlayers.length} players`, 'PlayerManager');
    }

    // Handle old system for full lobby (12/12)
    if (gameState === HockeyGameState.WAITING_FOR_PLAYERS && 
        HockeyGameManager.instance.areAllPositionsLockedIn()) {
      CONSTANTS.debugLog('All positions locked in - starting match sequence with proper countdown!', 'PlayerManager');
      HockeyGameManager.instance.startMatchSequence();
    }
    
    // Only broadcast basic waiting state if we're in lobby state and not in countdown
    if (gameState === HockeyGameState.LOBBY) {
      this.connectedPlayers.forEach(p => {
        p.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: lockedInCount, // Use locked-in count, not connected count
          totalPlayers: totalSlots,
          waitingMessage: `Waiting for players... ${lockedInCount}/${totalSlots}`
        });
      });
      
      CONSTANTS.debugLog(`Broadcasting waiting state: ${lockedInCount}/${totalSlots} players locked in (${connectedCount} connected)`, 'PlayerManager');
    }
    
    // Log when players leave during active games (for debugging)
    if (gameState === HockeyGameState.IN_PERIOD || 
        gameState === HockeyGameState.MATCH_START || 
        gameState === HockeyGameState.GOAL_SCORED) {
      CONSTANTS.debugLog(`Player left during active game (${gameState}). Continuing game with ${lockedInCount} locked-in players (${connectedCount} connected).`, 'PlayerManager');
    }
  }
  
  public getConnectedPlayers(): any[] {
    return [...this.connectedPlayers];
  }
  
  public isPuckSpawned(): boolean {
    return this.puckSpawned;
  }

  public resetAllPlayersToLobby(): void {
    CONSTANTS.debugLog('Resetting all players to lobby state', 'PlayerManager');
    
    // Despawn all player entities
    this.connectedPlayers.forEach(player => {
      if (this.world) {
        this.world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
          CONSTANTS.debugLog(`Despawning entity for player ${player.id}`, 'PlayerManager');
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
      // Send cleared team positions to all players to ensure UI shows all positions as available
      this.connectedPlayers.forEach(player => {
        player.ui.sendData({
          type: 'team-positions-update',
          teams: HockeyGameManager.instance.getTeamsWithNamesForUI() // Should be empty after reset
        });
      });
      CONSTANTS.debugLog('Sent cleared team positions after reset', 'PlayerManager');
      
      // Update game state to waiting
      this.updateGameState();
      
      // Force broadcast waiting state to ensure proper UI
      const connectedCount = this.connectedPlayers.length;
      const lockedInCount = HockeyGameManager.instance.lockedIn.size; // Should be 0 after reset
      const totalSlots = 12;
      this.connectedPlayers.forEach(player => {
        player.ui.sendData({ 
          type: 'game-waiting',
          redScore: 0,
          blueScore: 0,
          connectedPlayers: lockedInCount, // Use locked-in count (should be 0 after reset)
          totalPlayers: totalSlots
        });
      });
      
      CONSTANTS.debugLog('Forced waiting state broadcast after reset', 'PlayerManager');
    }, 200);
    
    CONSTANTS.debugLog('All players reset to lobby - should see team selection', 'PlayerManager');
  }

  private addTeamHelmet(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add helmet - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    // Debug: Check available node names in the player model
    if (process.env.NODE_ENV === 'development') {
      try {
        const { ModelRegistry } = require('hytopia');
        CONSTANTS.debugLog(`Available node names for player.gltf: ${JSON.stringify(ModelRegistry.instance.getNodeNames('models/players/player.gltf'))}`, 'PlayerManager');
      } catch (error) {
        CONSTANTS.debugWarn('Could not get node names:', 'PlayerManager');
      }
    }
    
    // Determine helmet model based on team
    const helmetModelUri = teamPos.team === 'RED' 
      ? 'models/cosmetics/red-helmet.gltf' 
      : 'models/cosmetics/blue-helmet.gltf';
    const helmetName = `${teamPos.team} Team Helmet`;
    
    try {
      // Create helmet as a Child Entity using the actual helmet model
      const helmetEntity = new Entity({
        name: helmetName,
        modelUri: helmetModelUri,
        modelScale: 1,
        // Specify the parent entity and attachment point
        parent: playerEntity,
        parentNodeName: 'head-anchor' // Use the correct node name
      });
      
      // Spawn the child entity with relative position and rotation
      helmetEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added ${teamPos.team} helmet to player ${playerEntity.player?.id} using head-anchor`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create helmet with head-anchor:`, 'PlayerManager');
      
      // Fallback: try without specific node attachment
      try {
        const helmetEntity = new Entity({
          name: `${helmetName} (fallback)`,
          modelUri: helmetModelUri,
          modelScale: 1,
          parent: playerEntity
          // No parentNodeName - will attach to entity center
        });
        
        helmetEntity.spawn(
          this.world,
          { x: 0, y: 1.0, z: 0 }, // Position above player center
          { x: 0, y: 0, z: 0, w: 1 }
        );
        
        CONSTANTS.debugLog(`Added ${teamPos.team} helmet without specific node attachment`, 'PlayerManager');
      } catch (finalError) {
        CONSTANTS.debugError(`All helmet creation methods failed:`, finalError, 'PlayerManager');
      }
    }
  }

  private addTeamVisor(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add visor - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    // Use the single visor model for both teams
    const visorModelUri = 'models/cosmetics/visor.gltf';
    const visorName = `${teamPos.team} Team Visor`;
    
    try {
      // Create visor as a Child Entity using the visor model
      const visorEntity = new Entity({
        name: visorName,
        modelUri: visorModelUri,
        modelScale: 1,
        // Specify the parent entity and attachment point
        parent: playerEntity,
        parentNodeName: 'eyes-anchor' // Use the correct node name for eyes
      });
      
      // Spawn the child entity with relative position and rotation
      visorEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added ${teamPos.team} visor to player ${playerEntity.player?.id} using eyes-anchor`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create visor with eyes-anchor:`, 'PlayerManager');
      
      // Fallback: try without specific node attachment
      try {
        const visorEntity = new Entity({
          name: `${visorName} (fallback)`,
          modelUri: visorModelUri,
          modelScale: 1,
          parent: playerEntity
          // No parentNodeName - will attach to entity center
        });
        
        visorEntity.spawn(
          this.world,
          { x: 0, y: 1.0, z: 0.2 }, // Position above player center, slightly forward
          { x: 0, y: 0, z: 0, w: 1 }
        );
        
        CONSTANTS.debugLog(`Added ${teamPos.team} visor without specific node attachment`, 'PlayerManager');
      } catch (finalError) {
        CONSTANTS.debugError(`All visor creation methods failed:`, finalError, 'PlayerManager');
      }
    }
  }

  private addIceSkates(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add ice skates - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    const skateName = `${teamPos.team} Team Ice Skates`;
    
    // Add ice skate to right foot using the right skate model
    try {
      const rightSkateEntity = new Entity({
        name: `${skateName} (Right)`,
        modelUri: 'models/cosmetics/ice-skate-right.gltf',
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'foot-right-anchor'
      });
      
      rightSkateEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added right ice skate to player ${playerEntity.player?.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create right ice skate:`, 'PlayerManager');
    }
    
    // Add ice skate to left foot using the left skate model
    try {
      const leftSkateEntity = new Entity({
        name: `${skateName} (Left)`,
        modelUri: 'models/cosmetics/ice-skate-left.gltf',
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'foot-left-anchor'
      });
      
      leftSkateEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added left ice skate to player ${playerEntity.player?.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create left ice skate:`, 'PlayerManager');
    }
  }

  private addTeamJersey(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add jersey - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    const jerseyModelUri = teamPos.team === 'RED' ? 'models/cosmetics/red-jersey.gltf' : 'models/cosmetics/blue-jersey.gltf';
    const jerseyName = `${teamPos.team} Team Jersey`;
    
    try {
      // Create jersey as a Child Entity using the jersey model
      const jerseyEntity = new Entity({
        name: jerseyName,
        modelUri: jerseyModelUri,
        modelScale: 1,
        // Specify the parent entity and attachment point
        parent: playerEntity,
        parentNodeName: 'torso-anchor' // Use the correct node name for torso
      });
      
      // Spawn the child entity with relative position and rotation
      jerseyEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added ${teamPos.team} jersey to player ${playerEntity.player?.id} using torso-anchor`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create jersey with torso-anchor:`, 'PlayerManager');
      
      // Fallback: try without specific node attachment
      try {
        const jerseyEntity = new Entity({
          name: `${jerseyName} (fallback)`,
          modelUri: jerseyModelUri,
          modelScale: 1,
          parent: playerEntity
          // No parentNodeName - will attach to entity center
        });
        
        jerseyEntity.spawn(
          this.world,
          { x: 0, y: 1.0, z: 0 }, // Position above player center
          { x: 0, y: 0, z: 0, w: 1 }
        );
        
        CONSTANTS.debugLog(`Added ${teamPos.team} jersey without specific node attachment`, 'PlayerManager');
      } catch (finalError) {
        CONSTANTS.debugError(`All jersey creation methods failed:`, finalError, 'PlayerManager');
      }
    }
  }

  private addHockeyGloves(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add hockey gloves - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    // Use the single hockey glove model for both hands
    const gloveModelUri = 'models/cosmetics/hockey-glove.gltf';
    const gloveName = `${teamPos.team} Team Hockey Gloves`;
    
    // Add glove to right hand
    try {
      const rightGloveEntity = new Entity({
        name: `${gloveName} (Right)`,
        modelUri: gloveModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'hand-right-anchor'
      });
      
      rightGloveEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
      // Store reference to right glove entity for later use
      (playerEntity as any)._rightGloveEntity = rightGloveEntity;
      
              CONSTANTS.debugLog(`Added right hockey glove to player ${playerEntity.player?.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create right hockey glove:`, 'PlayerManager');
    }
    
    // Add glove to left hand
    try {
      const leftGloveEntity = new Entity({
        name: `${gloveName} (Left)`,
        modelUri: gloveModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'hand-left-anchor'
      });
      
      leftGloveEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added left hockey glove to player ${playerEntity.player?.id}`, 'PlayerManager');
      
      // Add hockey stick as a nested child entity attached to the left glove
      // Small delay to ensure the glove is fully spawned before adding the stick
      setTimeout(() => {
        this.addHockeyStick(leftGloveEntity, teamPos, playerEntity);
      }, 100);
      
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create left hockey glove:`, 'PlayerManager');
    }
  }

  private addTeamSocks(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add team socks - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    // Determine sock models based on team - separate models for left and right
    const leftSockModelUri = teamPos.team === 'RED' 
      ? 'models/cosmetics/red-sock-left.gltf' 
      : 'models/cosmetics/blue-sock-left.gltf';
    const rightSockModelUri = teamPos.team === 'RED' 
      ? 'models/cosmetics/red-sock-right.gltf' 
      : 'models/cosmetics/blue-sock-right.gltf';
    const sockName = `${teamPos.team} Team Socks`;
    
    // Add sock to right leg
    try {
      const rightSockEntity = new Entity({
        name: `${sockName} (Right)`,
        modelUri: rightSockModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'leg-right-anchor'
      });
      
      rightSockEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added right ${teamPos.team} sock to player ${playerEntity.player?.id} using ${rightSockModelUri}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create right ${teamPos.team} sock:`, 'PlayerManager');
    }
    
    // Add sock to left leg
    try {
      const leftSockEntity = new Entity({
        name: `${sockName} (Left)`,
        modelUri: leftSockModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'leg-left-anchor'
      });
      
      leftSockEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added left ${teamPos.team} sock to player ${playerEntity.player?.id} using ${leftSockModelUri}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create left ${teamPos.team} sock:`, 'PlayerManager');
    }
  }

  private addTeamArmCosmetics(playerEntity: HytopiaPlayerEntity, teamPos: any): void {
    if (!teamPos || !this.world) return;
    
    // Safety check: Ensure parent entity is properly spawned before creating child entities
    if (!playerEntity || !playerEntity.isSpawned) {
      CONSTANTS.debugWarn(`Cannot add team arm cosmetics - parent entity not spawned for player ${playerEntity?.player?.id}`, 'PlayerManager');
      return;
    }
    
    // Determine arm model based on team (using left arm model for both arms as requested)
    const armModelUri = teamPos.team === 'RED' 
      ? 'models/cosmetics/red-arm-left.gltf' 
      : 'models/cosmetics/blue-arm-left.gltf';
    const armName = `${teamPos.team} Team Arms`;
    
    // Add left arm cosmetic
    try {
      const leftArmEntity = new Entity({
        name: `${armName} (Left)`,
        modelUri: armModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'arm-left-anchor'
      });
      
      leftArmEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added ${teamPos.team} left arm cosmetic to player ${playerEntity.player?.id} using arm-left-anchor`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create left arm cosmetic with arm-left-anchor:`, 'PlayerManager');
    }
    
    // Add right arm cosmetic (using same left arm model as requested)
    try {
      const rightArmEntity = new Entity({
        name: `${armName} (Right)`,
        modelUri: armModelUri,
        modelScale: 1,
        parent: playerEntity,
        parentNodeName: 'arm-right-anchor'
      });
      
      rightArmEntity.spawn(
        this.world,
        { x: 0, y: 0, z: 0 }, // Position relative to parent attachment point
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
              CONSTANTS.debugLog(`Added ${teamPos.team} right arm cosmetic to player ${playerEntity.player?.id} using arm-right-anchor`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create right arm cosmetic with arm-right-anchor:`, 'PlayerManager');
    }
  }

  private addHockeyStick(leftGloveEntity: Entity, teamPos: any, playerEntity: HytopiaPlayerEntity): void {
    if (!teamPos || !this.world || !leftGloveEntity.isSpawned) return;
    
    // Find the right glove entity to attach the controlled stick to
    const rightGloveEntity = this.findRightGloveEntity(playerEntity);
    if (!rightGloveEntity) {
      CONSTANTS.debugWarn(`Could not find right glove entity for player ${playerEntity.player?.id}`, 'PlayerManager');
      return;
    }
    
    const idleStickName = `${teamPos.team} Team Hockey Stick Idle`;
    const controlledLeftStickName = `${teamPos.team} Team Hockey Stick Controlled Left`;
    const controlledRightStickName = `${teamPos.team} Team Hockey Stick Controlled Right`;
    
    try {
      // Create IDLE hockey stick (attached to left hand, visible when not controlling puck)
      const hockeyStickIdleEntity = new Entity({
        name: idleStickName,
        modelUri: 'models/cosmetics/hockey-stick-idle.gltf',
        modelScale: 1,
        parent: leftGloveEntity, // Attached to left hand
      });
      
      // Create CONTROLLED LEFT hockey stick (attached to left hand, visible when controlling puck and moving left)
      const hockeyStickControlledLeftEntity = new Entity({
        name: controlledLeftStickName,
        modelUri: 'models/cosmetics/hockey-stick-controlled-left.gltf',
        modelScale: 1,
        parent: leftGloveEntity, // Attached to left hand
      });
      
      // Create CONTROLLED RIGHT hockey stick (attached to right hand, visible when controlling puck and moving right)
      const hockeyStickControlledRightEntity = new Entity({
        name: controlledRightStickName,
        modelUri: 'models/cosmetics/hockey-stick-controlled-right.gltf',
        modelScale: 1,
        parent: rightGloveEntity, // Attached to right hand
      });
      
      // Spawn the IDLE hockey stick (visible by default)
      hockeyStickIdleEntity.spawn(
        this.world,
        { x: 0, y: -0.2, z: 0.8 }, // Position relative to left glove
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
      // Spawn the CONTROLLED LEFT hockey stick (hidden by default)
      hockeyStickControlledLeftEntity.spawn(
        this.world,
        { x: 0, y: -100, z: 0.8 }, // Hidden position
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
      // Spawn the CONTROLLED RIGHT hockey stick (hidden by default)
      hockeyStickControlledRightEntity.spawn(
        this.world,
        { x: 0, y: -100, z: 0.8 }, // Hidden position
        { x: 0, y: 0, z: 0, w: 1 } // Default rotation relative to parent
      );
      
      // Store references to all hockey stick entities for later access
      (playerEntity as any)._hockeyStickIdleEntity = hockeyStickIdleEntity;
      (playerEntity as any)._hockeyStickControlledLeftEntity = hockeyStickControlledLeftEntity;
      (playerEntity as any)._hockeyStickControlledRightEntity = hockeyStickControlledRightEntity;
      (playerEntity as any)._currentStickState = 'idle'; // Track current stick state: 'idle', 'controlled-left', 'controlled-right'
      
              CONSTANTS.debugLog(`Added idle and controlled hockey sticks to player ${playerEntity.player?.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugWarn(`Failed to create hockey stick entities:`, 'PlayerManager');
    }
  }
  
  private findRightGloveEntity(playerEntity: HytopiaPlayerEntity): Entity | null {
    // Get the stored reference to the right glove entity
    const rightGloveEntity = (playerEntity as any)._rightGloveEntity;
    if (rightGloveEntity && rightGloveEntity.isSpawned) {
      return rightGloveEntity;
    }
    
    return null;
  }

  // NEW: Handle position switch requests
  private handlePositionSwitchRequest(player: any, data: any): void {
    if (!this.world) return;
    
    const { newTeam, newPosition } = data;
    CONSTANTS.debugLog(`Position switch request: ${player.id} wants to switch to ${newTeam}-${newPosition}`, 'PlayerManager');
    
    const switchSuccessful = HockeyGameManager.instance.switchPlayerPosition(player, newTeam, newPosition);
    
    if (switchSuccessful) {
      player.ui.sendData({
        type: 'position-switch-success',
        newTeam: newTeam,
        newPosition: newPosition
      });
      
      this.world.chatManager.sendPlayerMessage(
        player,
        `Position switched to ${newTeam} ${newPosition}!`,
        '00FF00'
      );
      
      // Update all players with new team positions
      for (const p of this.connectedPlayers) {
        p.ui.sendData({
          type: 'team-positions-update',
          teams: HockeyGameManager.instance.getTeamsWithNamesForUI()
        });
      }
      
      // Recreate player entity with new team/position
      this.createPlayerEntity(player);
      
      // Check if this affects the minimum threshold countdown
      this.updateGameState();
      
      CONSTANTS.debugLog(`Player ${player.id} successfully switched position`, 'PlayerManager');
    } else {
      player.ui.sendData({
        type: 'position-switch-error',
        message: 'Unable to switch to that position. It may be taken or switching is not allowed at this time.'
      });
      
      this.world.chatManager.sendPlayerMessage(
        player,
        'Unable to switch to that position. Please try another position.',
        'FF4444'
      );
    }
  }
  
  // NEW: Handle requests to reopen team selection
  private handleGameModeSelect(player: any, data: any): void {
    if (!this.world) return;
    
    const { gameMode } = data;
    CONSTANTS.debugLog(`game-mode-select received: gameMode=${gameMode}, player.id=${player.id}`, 'PlayerManager');

    // Enforce game mode lock
    const currentLock = HockeyGameManager.instance.gameModeLock;
    if (currentLock && currentLock !== gameMode) {
      // Mode is locked to the other mode, reject
      player.ui.sendData({
        type: 'game-mode-locked',
        locked: currentLock,
        message: `This mode is unavailable while ${currentLock} is in progress.`
      });
      this.world.chatManager.sendPlayerMessage(
        player,
        `This mode is unavailable while ${currentLock} is in progress.`,
        'FF4444'
      );
      return;
    }

    // If the game is already in a Regulation lobby phase, just show team selection
    const state = HockeyGameManager.instance.state;
    const activeMode = HockeyGameManager.instance.gameMode;
    if (
      (state === 'WAITING_FOR_PLAYERS' || state === 'TEAM_SELECTION' || state === 'COUNTDOWN_TO_START') &&
      gameMode === activeMode
    ) {
      this.showTeamSelectionToPlayer(player);
      this.world.chatManager.sendPlayerMessage(
        player,
        `Selected ${gameMode} mode!`,
        '00FF00'
      );
      return;
    }

    // Only allow selecting a new mode if in GAME_MODE_SELECTION
    // EXCEPTION: Allow joining shootout as spectator even when shootout is in progress
    if (
      state !== 'GAME_MODE_SELECTION' &&
      !(gameMode === GameMode.SHOOTOUT && state === 'SHOOTOUT_READY' && currentLock === GameMode.SHOOTOUT) &&
      !(gameMode === GameMode.SHOOTOUT && state === 'SHOOTOUT_IN_PROGRESS' && currentLock === GameMode.SHOOTOUT)
    ) {
      CONSTANTS.debugWarn(`Game mode selection attempted but not in correct state: ${state}`, 'PlayerManager');
      return;
    }

    HockeyGameManager.instance.selectGameMode(gameMode);
    if (gameMode === GameMode.REGULATION) {
      this.showTeamSelectionToPlayer(player);
    }
    // --- FIX: Register player for shootout mode immediately or if already in SHOOTOUT_READY ---
    if (gameMode === GameMode.SHOOTOUT) {
      HockeyGameManager.instance.registerPlayerForShootout(player);
    }

    // Send appropriate message based on game state
    let message = `Selected ${gameMode} mode!`;
    if (gameMode === GameMode.SHOOTOUT && state === 'SHOOTOUT_IN_PROGRESS') {
      message = `Joined as spectator for active shootout!`;
    }

    this.world.chatManager.sendPlayerMessage(
      player,
      message,
      '00FF00'
    );
  }

  private showTeamSelectionToPlayer(player: any): void {
    try {
      CONSTANTS.debugLog(`🏒 Showing team selection to player ${player.id}`, 'PlayerManager');
      player.ui.sendData({
        type: 'show-team-selection'
      });
      setTimeout(() => {
        player.ui.sendData({
          type: 'team-positions-update',
          teams: HockeyGameManager.instance.getTeamsWithNamesForUI()
        });
      }, 100);
      CONSTANTS.debugLog(`Sent team selection UI to player ${player.id}`, 'PlayerManager');
    } catch (error) {
      CONSTANTS.debugError(`Failed to show team selection to player ${player.id}`, error, 'PlayerManager');
    }
  }

  private handleReopenTeamSelection(player: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`Team selection reopen request from player: ${player.id}`, 'PlayerManager');
    
    // Only allow during lobby/waiting states (not during active game)
    const gameState = HockeyGameManager.instance.state;
    if (gameState !== HockeyGameState.LOBBY && 
        gameState !== HockeyGameState.WAITING_FOR_PLAYERS && 
        gameState !== HockeyGameState.COUNTDOWN_TO_START) {
      this.world.chatManager.sendPlayerMessage(
        player, 
        'Cannot change position during active game.', 
        'FF4444'
      );
      return;
    }
    
    // Check if player is currently locked in
    const isLockedIn = HockeyGameManager.instance.lockedIn.has(player.id);
    
    if (isLockedIn) {
      // Show team selection overlay WITHOUT despawning player
      // Player keeps their current position until they actually change and lock in
      player.ui.sendData({
        type: 'show-team-selection'
      });
      
      // Send current team positions to help them see available options
      const teamsWithNames = HockeyGameManager.instance.getTeamsWithNamesForUI();
      player.ui.sendData({
        type: 'team-positions-update',
        teams: teamsWithNames
      });
      
      // Mark player as "browsing" so we know they're in selection mode
      (player as any)._browsingTeamSelection = true;
      
      this.world.chatManager.sendPlayerMessage(
        player, 
        'Browse positions and lock in to confirm a change. Press ESC to close without changing.', 
        '00FFFF'
      );
      
      CONSTANTS.debugLog(`Player ${player.id} is browsing team selection (not despawned)`, 'PlayerManager');
    } else {
      this.world.chatManager.sendPlayerMessage(
        player, 
        'You must be locked into a position first.', 
        'FF4444'
      );
    }
  }

  private handleShootoutShotTimeout(player: any): void {
    if (!this.world) return;
    
    CONSTANTS.debugLog(`Shootout shot timeout for player: ${player.id}`, 'PlayerManager');
    
    // Only process timeout from the current shooter to prevent duplicates
    const shootoutGameState = ShootoutManager.instance.getGameState();
    if (shootoutGameState && shootoutGameState.currentShooter === player.id) {
      CONSTANTS.debugLog(`Valid timeout from current shooter: ${player.id}`, 'PlayerManager');
      
      // Play referee whistle sound for timeout
      AudioManager.instance.playRefereeWhistle();
      
      // Notify HockeyGameManager that the shot timed out (missed)
      HockeyGameManager.instance.shootoutGoalScored(false); // false = missed shot
    } else {
      CONSTANTS.debugLog(`Ignoring timeout from non-shooter: ${player.id}`, 'PlayerManager');
    }
  }

  private handleShootoutReturnToGameModeSelection(player: any): void {
    CONSTANTS.debugLog(`Processing return to game mode selection from player: ${player.id}`, 'PlayerManager');
    
    // Call the ShootoutManager to handle the return - this will show game mode selection
    // to all players before despawning them
    ShootoutManager.instance.returnToGameModeSelection();
  }

  // NEW: Public method to update game state during countdown
  public updateGameStateForCountdown(): void {
    CONSTANTS.debugLog('updateGameStateForCountdown called from HockeyGameManager countdown timer', 'PlayerManager');
    this.updateGameState();
  }

  /**
   * Handle actions requested by HockeyGameManager (like entity movement)
   */
  private handlePlayerManagerAction(action: string, data: any): void {
    try {
      if (action === 'movePlayerToNewPosition') {
        this.movePlayerEntityToNewPosition(data.player, data.newTeam, data.newPosition);
      } else if (action === 'spawnPlayerForShootout') {
        this.spawnPlayerForShootout(data.player, data.team, data.position);
      } else if (action === 'registerExistingPlayersForShootout') {
        this.registerExistingPlayersForShootout();
      } else if (action === 'showTeamSelectionToAll') {
        this.showTeamSelectionToAllPlayers();
      } else {
        CONSTANTS.debugLog(`Unknown PlayerManager action: ${action}`, 'PlayerManager');
      }
    } catch (error) {
      CONSTANTS.debugError(`Failed to handle PlayerManager action ${action}`, error, 'PlayerManager');
    }
  }

     /**
    * Spawn player entity for shootout mode
    */
   private spawnPlayerForShootout(player: any, team: HockeyTeam, position: HockeyPosition): void {
     if (!this.world) return;

     try {
       CONSTANTS.debugLog(`🥅 Spawning player ${player.id} for shootout as ${team} ${position}`, 'PlayerManager');

       // Use the existing createPlayerEntity method which handles all the entity creation
       this.createPlayerEntity(player);

       // Ensure pointer is locked during shootout transition periods (prevents movement during delays)
       setTimeout(() => {
         try {
           player.ui.lockPointer(true);
           CONSTANTS.debugLog(`🔒 Locked pointer for player ${player.id} during shootout transition`, 'PlayerManager');
         } catch (error) {
           CONSTANTS.debugError(`Error locking pointer for shootout player ${player.id}:`, error, 'PlayerManager');
         }
       }, 150); // Slight delay to ensure entity is fully spawned

       // Send team-position-confirmed event after a short delay to ensure entity is fully spawned
       setTimeout(() => {
         player.ui.sendData({ 
           type: 'team-position-confirmed', 
           team: team, 
           position: position 
         });
         CONSTANTS.debugLog(`Sent team-position-confirmed for ${team} ${position} to player ${player.id}`, 'PlayerManager');
       }, 100);

       // Send chat message to notify player
       this.world.chatManager.sendPlayerMessage(
         player, 
         `🥅 You've joined the shootout! Waiting for more players...`, 
         '00FFFF'
       );

       CONSTANTS.debugLog(`Successfully spawned player ${player.id} for shootout mode`, 'PlayerManager');

     } catch (error) {
       CONSTANTS.debugError(`Failed to spawn player entity for shootout ${player.id}`, error, 'PlayerManager');
     }
   }

   /**
    * Register all existing connected players for shootout mode
    * NOTE: This method is no longer used - players must individually select shootout mode
    */
   private registerExistingPlayersForShootout(): void {
     // This method is deprecated - players now individually select shootout mode
     CONSTANTS.debugLog(`⚠️ registerExistingPlayersForShootout called but no longer used`, 'PlayerManager');
   }

   /**
    * Show team selection UI to all connected players (for Regulation mode)
    */
   private showTeamSelectionToAllPlayers(): void {
     try {
       CONSTANTS.debugLog(`🏒 Showing team selection to all ${this.connectedPlayers.length} connected players`, 'PlayerManager');

       for (const player of this.connectedPlayers) {
         // Send team selection UI event
         player.ui.sendData({
           type: 'show-team-selection'
         });

         // Also send current team positions so they see locked-in positions immediately
         setTimeout(() => {
           player.ui.sendData({
             type: 'team-positions-update',
             teams: HockeyGameManager.instance.getTeamsWithNamesForUI()
           });
         }, 100);

         CONSTANTS.debugLog(`Sent team selection UI to player ${player.id}`, 'PlayerManager');
       }

       CONSTANTS.debugLog(`✅ Team selection UI sent to all connected players`, 'PlayerManager');

     } catch (error) {
       CONSTANTS.debugError(`Failed to show team selection to all players`, error, 'PlayerManager');
     }
   }

  /**
   * Move player entity to new team position by recreating the entity (same as manual position switching)
   */
  private movePlayerEntityToNewPosition(player: any, newTeam: HockeyTeam, newPosition: HockeyPosition): void {
    if (!this.world) return;

    try {
      CONSTANTS.debugLog(`Auto-balancing: Recreating entity for player ${player.id} to ${newTeam} ${newPosition}`, 'PlayerManager');

      // Use the same entity recreation logic that works for manual position switching
      // This automatically handles:
      // - Despawning old entity
      // - Spawning at correct position with correct rotation  
      // - Adding correct team cosmetics
      // - Setting up proper camera and controls
      this.createPlayerEntity(player);

      // Send chat message to notify player
      this.world.chatManager.sendPlayerMessage(
        player, 
        `Auto-balanced to ${newTeam} ${newPosition} for fair teams!`, 
        '00FFFF'
      );

      CONSTANTS.debugLog(`Successfully auto-balanced player ${player.id} entity to ${newTeam} ${newPosition}`, 'PlayerManager');

    } catch (error) {
      CONSTANTS.debugError(`Failed to auto-balance player entity for ${player.id}`, error, 'PlayerManager');
    }
  }

  public showGameModeSelectionToAllPlayers(): void {
    this.connectedPlayers.forEach(player => {
      player.ui.sendData({ type: 'game-mode-selection-start' });
      CONSTANTS.debugLog(`Sent game-mode-selection-start to player ${player.id} (showGameModeSelectionToAllPlayers)`, 'PlayerManager');
    });
  }

  // --- Add method to update overlay UIs in real time ---
  public updateGameModeOverlayAvailability(available: any, locked: any) {
    this.getConnectedPlayers().forEach(p => {
      p.ui.sendData({ type: 'game-mode-availability', available, locked });
    });
  }
}
