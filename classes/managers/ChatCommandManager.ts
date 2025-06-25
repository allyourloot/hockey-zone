/**
 * ChatCommandManager handles all chat command registrations and handlers
 * Extracted from index.ts section 4. CHAT COMMANDS
 */

import { Entity, ChatManager } from 'hytopia';
import type { World, PlayerEntity } from 'hytopia';
import * as CONSTANTS from '../utils/constants';
import { PuckTrailManager } from './PuckTrailManager';
import { GoalDetectionService } from '../services/GoalDetectionService';
import { HockeyGameManager } from './HockeyGameManager';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { WorldInitializer } from '../systems/WorldInitializer';
import { HockeyTeam } from '../utils/types';
import { AudioManager } from './AudioManager';

// Import the IceSkatingController type - we'll need to reference it
// Note: This creates a circular dependency that we'll resolve in later phases
type IceSkatingController = any; // Temporary type until we extract the controller

export class ChatCommandManager {
  private static _instance: ChatCommandManager | null = null;
  
  private world: World | null = null;
  private puck: Entity | null = null;
  private createPuckEntity: (() => Entity) | null = null;
  
  // Private constructor for singleton pattern
  private constructor() {}
  
  public static get instance(): ChatCommandManager {
    if (!ChatCommandManager._instance) {
      ChatCommandManager._instance = new ChatCommandManager();
    }
    return ChatCommandManager._instance;
  }
  
  /**
   * Initialize the chat command manager
   * @param world - The game world instance
   * @param puckRef - Reference to the puck entity (will be updated by reference)
   * @param puckFactory - Function to create new puck entities
   */
  public initialize(
    world: World, 
    puckRef: { current: Entity | null }, 
    puckFactory: () => Entity
  ): void {
    this.world = world;
    this.createPuckEntity = puckFactory;
    
    // Set up a getter/setter for puck reference
    Object.defineProperty(this, 'puck', {
      get: () => puckRef.current,
      set: (value: Entity | null) => { puckRef.current = value; }
    });
    
    this.registerAllCommands();
    console.log('ChatCommandManager: All commands registered');
  }
  
  /**
   * Register all chat commands
   */
  private registerAllCommands(): void {
    if (!this.world) {
      console.warn('ChatCommandManager: Cannot register commands - world not initialized');
      return;
    }
    
    this.registerRocketCommand();
    this.registerPuckCommand();
    this.registerSpawnPuckCommand();
    this.registerRemoveTrailCommand();
    this.registerTrailColorCommand();
    this.registerTestSleepCommand();
    this.registerGoalDetectionCommands();
    this.registerBodyCheckDebugCommand();
    this.registerStickCheckDebugCommand();
    this.registerStatsTestCommands();
    this.registerPlayerBarrierCommands();
    this.registerIceFloorCommands();
    this.registerTestCommands();
    this.registerGameplayMessageCommands();
    this.registerAudioDebugCommands();
  }
  
  /**
   * Register the /rocket command - applies upward impulse to player
   */
  private registerRocketCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/rocket', (player) => {
      this.world!.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
        entity.applyImpulse({ x: 0, y: 20, z: 0 });
      });
    });
  }
  
  /**
   * Register the /puck command - shows puck debug information
   */
  private registerPuckCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/puck', (player) => {
      if (this.puck) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Puck status: spawned=${this.puck.isSpawned}, position=${JSON.stringify(this.puck.position)}`, 
          '00FF00'
        );
        console.log('Puck debug - spawned:', this.puck.isSpawned, 'position:', this.puck.position);
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Puck not found!', 'FF0000');
        console.log('Puck debug - puck is null');
      }
      
      const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
      playerEntities.forEach((entity, i) => {
        // Note: This references IceSkatingController which we haven't extracted yet
        // We'll need to update this when we extract the controller in a later phase
        if (entity.controller && (entity.controller as any).isControllingPuck !== undefined) {
          const controlling = (entity.controller as any).isControllingPuck;
          this.world!.chatManager.sendPlayerMessage(
            player, 
            `Player entity ${i}: controlling puck = ${controlling}`, 
            '00FF00'
          );
          console.log(`Player entity ${i}: controlling puck =`, controlling);
        }
      });
    });
  }
  
  /**
   * Register the /spawnpuck command - creates a new puck at center ice
   */
  private registerSpawnPuckCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/spawnpuck', (player) => {
      // First despawn existing puck if any
      if (this.puck && this.puck.isSpawned) {
        this.puck.despawn();
        // Remove trail effect when despawning
        PuckTrailManager.instance.removeTrail();
      }

      // Create new puck entity
      if (this.createPuckEntity) {
        try {
          this.puck = this.createPuckEntity();
          console.log('[SpawnPuck] Puck entity created successfully');
          
          // Spawn at center ice using constants
          const spawnPos = CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE;
          console.log('[SpawnPuck] Attempting to spawn puck at:', spawnPos);
          
          this.puck.spawn(this.world!, spawnPos);
          console.log('[SpawnPuck] Puck spawned, isSpawned:', this.puck.isSpawned);
          
          // Attach trail effect to the new puck
          PuckTrailManager.instance.attachTrailToPuck(this.puck);
          
          this.world!.chatManager.sendPlayerMessage(
            player, 
            `Puck spawned at Y=${spawnPos.y} with trail!`, 
            '00FF00'
          );
          console.log('[SpawnPuck] Success - puck spawned with trail at Y:', spawnPos.y);
        } catch (error) {
          this.world!.chatManager.sendPlayerMessage(player, `Error spawning puck: ${error}`, 'FF0000');
          console.error('[SpawnPuck] Error creating/spawning puck:', error);
        }
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Error: Cannot create puck entity!', 'FF0000');
        console.error('[SpawnPuck] createPuckEntity function not available');
      }
    });
  }
  
  /**
   * Register the /removetrail command - removes the puck trail effect
   */
  private registerRemoveTrailCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/removetrail', (player) => {
      PuckTrailManager.instance.removeTrail();
      this.world!.chatManager.sendPlayerMessage(player, 'Puck trail effect removed!', '00FF00');
      console.log('Puck trail effect removed');
    });
  }

  /**
   * Register the /trailcolor command - switches between different trail particle colors
   */
  private registerTrailColorCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/trailcolor', (player, args) => {
      const color = args[0]?.toLowerCase();
      if (color === 'gray' || color === 'grey' || color === 'red' || color === 'gold') {
        // This will require updating the PuckTrailEffect to support color changes
        // For now, we'll just send a message
        const displayColor = color === 'grey' ? 'gray' : color;
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Trail color would be changed to ${displayColor}! (Feature coming soon)`, 
          color === 'red' ? 'FF4444' : color === 'gold' ? 'FFD700' : 'AAAAAA'
        );
        console.log(`Trail color change requested: ${displayColor}`);
      } else {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          'Usage: /trailcolor <gray|red|gold>', 
          'FFFF00'
        );
      }
    });
  }

  /**
   * Register the /testsleep command - triggers sleep animation for all players
   */
  private registerTestSleepCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/testsleep', (player) => {
      this.world!.entityManager.getAllPlayerEntities().forEach(entity => {
        // Note: This references IceSkatingController which we haven't extracted yet
        // We'll need to update this when we extract the controller in a later phase
        if (entity.controller && (entity.controller as any)._stunnedUntil !== undefined) {
          const controller = entity.controller as any;
          controller._stunnedUntil = Date.now() + 2000;
          controller._isPlayingSleep = false;
          
          if (typeof entity.stopAllModelAnimations === 'function') {
            entity.stopAllModelAnimations();
            console.log('[TESTSLEEP] Stopped all animations for', entity.player?.id);
          }
          if (typeof entity.startModelLoopedAnimations === 'function') {
            entity.startModelLoopedAnimations(['sleep']);
            console.log('[TESTSLEEP] Started looped animation [sleep] for', entity.player?.id);
          }
        }
      });
      this.world!.chatManager.sendBroadcastMessage('Triggered sleep animation for all players!', 'FFFF00');
    });
  }
  
  /**
   * Get the current puck instance (for debugging)
   */
  public getPuck(): Entity | null {
    return this.puck;
  }
  
  /**
   * Update the puck reference (called externally when puck changes)
   */
  public updatePuckReference(newPuck: Entity | null): void {
    this.puck = newPuck;
  }

  /**
   * Register goal detection debug commands
   */
  private registerGoalDetectionCommands(): void {
    if (!this.world) return;

    // /startmatch - Force start a match for testing with proper game start sequence
    this.world.chatManager.registerCommand('/startmatch', (player) => {
      const gameManager = HockeyGameManager.instance;
      gameManager.startMatchSequence();
      this.world!.chatManager.sendPlayerMessage(player, 'Starting match sequence!', '00FF00');
      console.log('[ChatCommand] Match sequence started with proper countdown and reset');
    });

    // /goalinfo - Show goal detection debug information
    this.world.chatManager.registerCommand('/goalinfo', (player) => {
      const goalService = GoalDetectionService.instance;
      const debugInfo = goalService.getDebugInfo();
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Goal Detection Status: ${debugInfo.isActive ? 'ACTIVE' : 'INACTIVE'}`, 
        debugInfo.isActive ? '00FF00' : 'FF0000'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Red Goal Line: Z=${debugInfo.goalZones.RED.goalLineZ}, Width: X=${debugInfo.goalZones.RED.minX} to ${debugInfo.goalZones.RED.maxX}`, 
        'FF4444'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Blue Goal Line: Z=${debugInfo.goalZones.BLUE.goalLineZ}, Width: X=${debugInfo.goalZones.BLUE.minX} to ${debugInfo.goalZones.BLUE.maxX}`, 
        '44AAFF'
      );

      if (this.puck && this.puck.isSpawned) {
        const pos = this.puck.position;
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Puck Position: X=${pos.x.toFixed(2)}, Y=${pos.y.toFixed(2)}, Z=${pos.z.toFixed(2)}`, 
          'FFFF00'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Puck not found or not spawned!', 'FF0000');
      }

      console.log('[ChatCommand] Goal detection debug info:', debugInfo);
    });

    // /testgoal <team> - Manually trigger a goal for testing
    this.world.chatManager.registerCommand('/testgoal', (player, args) => {
      const team = args[0]?.toUpperCase();
      if (team === 'RED' || team === 'BLUE') {
        HockeyGameManager.instance.goalScored(team as any);
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Test goal triggered for ${team} team!`, 
          team === 'RED' ? 'FF4444' : '44AAFF'
        );
        console.log(`[ChatCommand] Test goal triggered for ${team} team`);
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testgoal <red|blue>', 'FFFF00');
      }
    });

    // /resetgoals - Reset goal detection service
    this.world.chatManager.registerCommand('/resetgoals', (player) => {
      GoalDetectionService.instance.reset();
      this.world!.chatManager.sendPlayerMessage(player, 'Goal detection service reset!', '00FF00');
      console.log('[ChatCommand] Goal detection service reset');
    });

    // /resetplayers - Reset all players to spawn positions
    this.world.chatManager.registerCommand('/resetplayers', (player) => {
      const gameManager = HockeyGameManager.instance;
      PlayerSpawnManager.instance.performCompleteReset(
        gameManager.teams,
        gameManager['_playerIdToPlayer'], // Access private property for testing
        this.puck
      );
      this.world!.chatManager.sendPlayerMessage(player, 'All players reset to spawn positions!', '00FF00');
      console.log('[ChatCommand] Players reset to spawn positions');
    });

    // /spawninfo - Show spawn position information
    this.world.chatManager.registerCommand('/spawninfo', (player) => {
      const gameManager = HockeyGameManager.instance;
      const teamAndPos = gameManager.getTeamAndPosition(player);
      
      if (teamAndPos) {
        const spawnData = PlayerSpawnManager.instance.getSpawnData(teamAndPos.team, teamAndPos.position);
        const rotationDegrees = Math.round((spawnData.yaw * 180) / Math.PI);
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Your spawn: ${teamAndPos.team} ${teamAndPos.position} at X=${spawnData.position.x}, Y=${spawnData.position.y}, Z=${spawnData.position.z}, Rotation=${rotationDegrees}°`,
          teamAndPos.team === 'RED' ? 'FF4444' : '44AAFF'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'You are not assigned to a team/position!', 'FF0000');
      }
      
      console.log('[ChatCommand] Spawn info requested for player:', player.id);
    });

    // /gamestate - Check current game state  
    this.world.chatManager.registerCommand('/gamestate', (player) => {
      const gameManager = HockeyGameManager.instance;
      const gameState = gameManager.state;
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Game state: ${gameState}`, 
        '00FF00'
      );
      console.log(`[ChatCommand] Player ${player.id} requested game state: ${gameState}`);
    });

    // /testmusic - Test background music
    this.world.chatManager.registerCommand('/testmusic', (player) => {
      const { AudioManager } = require('./AudioManager');
      const music = AudioManager.instance.getBackgroundMusic();
      if (music) {
        this.world!.chatManager.sendPlayerMessage(player, 'Background music exists - trying to restart...', '00FF00');
        try {
          music.play(this.world!);
          console.log('[ChatCommand] Attempted to restart background music');
        } catch (error) {
          console.error('[ChatCommand] Error restarting music:', error);
        }
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'No background music found!', 'FF0000');
        console.log('[ChatCommand] No background music instance found');
      }
    });

    // /stopmusic - Stop background music
    this.world.chatManager.registerCommand('/stopmusic', (player) => {
      const { AudioManager } = require('./AudioManager');
      try {
        AudioManager.instance.stop();
        this.world!.chatManager.sendPlayerMessage(player, 'Background music stopped', '00FF00');
        console.log('[ChatCommand] Background music stopped');
      } catch (error) {
        console.error('[ChatCommand] Error stopping music:', error);
        this.world!.chatManager.sendPlayerMessage(player, 'Error stopping music', 'FF0000');
      }
    });

    // /restartmusic - Restart background music cleanly
    this.world.chatManager.registerCommand('/restartmusic', (player) => {
      const { AudioManager } = require('./AudioManager');
      const CONSTANTS = require('../utils/constants');
      try {
        // Stop existing music
        AudioManager.instance.stop();
        
        // Create new background music without re-initializing entire AudioManager
        // (this avoids duplicate ambient sound timers)
        const gameMusic = AudioManager.instance.createManagedAudio({
          uri: 'audio/music/ready-for-this.mp3',
          loop: true,
          volume: CONSTANTS.AUDIO.BACKGROUND_MUSIC_VOLUME,
        }, 'music');
        
        if (gameMusic && this.world) {
          gameMusic.play(this.world);
          (this.world as any)._gameMusic = gameMusic; // Store reference
        }
        
        this.world!.chatManager.sendPlayerMessage(player, 'Background music restarted cleanly (no ambient duplication)', '00FF00');
        console.log('[ChatCommand] Background music restarted cleanly without re-initializing ambient sounds');
      } catch (error) {
        console.error('[ChatCommand] Error restarting music:', error);
        this.world!.chatManager.sendPlayerMessage(player, 'Error restarting music', 'FF0000');
      }
    });

    // /testlock - Test movement lock system
    this.world.chatManager.registerCommand('/testlock', (player) => {
      const gameManager = HockeyGameManager.instance;
      const currentState = gameManager.state;
      
      if (currentState === 'GOAL_SCORED') {
        // Resume play
        gameManager.startPeriod();
        this.world!.chatManager.sendPlayerMessage(player, 'Movement unlocked - play resumed', '00FF00');
        console.log('[ChatCommand] Movement unlocked by', player.id);
      } else {
        // Lock movement by setting to GOAL_SCORED state
        (gameManager as any)._state = 'GOAL_SCORED';
        this.world!.chatManager.sendPlayerMessage(player, 'Movement locked for testing', 'FF0000');
        console.log('[ChatCommand] Movement locked by', player.id);
      }
    });

    // /testgamestart - Test the new game start sequence
    this.world.chatManager.registerCommand('/testgamestart', (player) => {
      const gameManager = HockeyGameManager.instance;
      this.world!.chatManager.sendPlayerMessage(player, 'Testing game start sequence...', '00FF00');
      console.log('[ChatCommand] Testing game start sequence triggered by', player.id);
      gameManager.startMatchSequence();
    });

    // /testmatchlock - Test movement lock during match start state
    this.world.chatManager.registerCommand('/testmatchlock', (player) => {
      const gameManager = HockeyGameManager.instance;
      const currentState = gameManager.state;
      
      if (currentState === 'MATCH_START') {
        // Unlock by setting to IN_PERIOD
        (gameManager as any)._state = 'IN_PERIOD';
        this.world!.chatManager.sendPlayerMessage(player, 'Movement unlocked - match start lock removed', '00FF00');
        console.log('[ChatCommand] Match start movement lock removed by', player.id);
      } else {
        // Lock movement by setting to MATCH_START state
        (gameManager as any)._state = 'MATCH_START';
        this.world!.chatManager.sendPlayerMessage(player, 'Movement locked - testing match start lock', 'FF0000');
        console.log('[ChatCommand] Match start movement lock activated by', player.id);
      }
    });

    // /testperiodend - Test period ending transition sequence
    this.world.chatManager.registerCommand('/testperiodend', (player) => {
      const gameManager = HockeyGameManager.instance;
      const currentPeriod = (gameManager as any)._period || 1;
      this.world!.chatManager.sendPlayerMessage(player, `Testing period end transition for period ${currentPeriod}...`, '00FF00');
      console.log(`[ChatCommand] Testing period end transition for period ${currentPeriod} triggered by`, player.id);
      gameManager.endPeriod();
    });

    // /testtimer - Test timer synchronization
    this.world.chatManager.registerCommand('/testtimer', (player) => {
      const gameManager = HockeyGameManager.instance;
      const currentState = gameManager.state;
      const currentPeriod = (gameManager as any)._period || 1;
      
      this.world!.chatManager.sendPlayerMessage(player, `Game State: ${currentState}, Period: ${currentPeriod}`, '00FF00');
      
      if (currentState === 'IN_PERIOD') {
        this.world!.chatManager.sendPlayerMessage(player, 'Server timer is running. UI timer should also be running.', '00FF00');
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Server timer is NOT running.', 'FF0000');
      }
      
      console.log(`[ChatCommand] Timer sync test - State: ${currentState}, Period: ${currentPeriod}`);
    });

    // /testgameover - Test enhanced game over sequence with box score
    this.world.chatManager.registerCommand('/testgameover', (player) => {
      const gameManager = HockeyGameManager.instance;
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      
      // Set some test scores
      (gameManager as any)._scores = { RED: 3, BLUE: 1 };
      
      // Add some test stats for demonstration
      PlayerStatsManager.instance.recordGoal(player.id, 'RED', 1, 120, false);
      PlayerStatsManager.instance.recordGoal(player.id, 'RED', 2, 45, false);
      PlayerStatsManager.instance.recordShot(player.id, 'RED', true, false);
      PlayerStatsManager.instance.recordShot(player.id, 'RED', true, false);
      
      this.world!.chatManager.sendPlayerMessage(player, 'Testing enhanced game over sequence with box score...', '00FF00');
      console.log('[ChatCommand] Testing enhanced game over sequence with box score triggered by', player.id);
      
      gameManager.endGame();
    });

    // /resetgame - Reset game to lobby with team selection
    this.world.chatManager.registerCommand('/resetgame', (player) => {
      const gameManager = HockeyGameManager.instance;
      
      this.world!.chatManager.sendPlayerMessage(player, 'Resetting game to lobby...', '00FF00');
      this.world!.chatManager.sendBroadcastMessage('Game reset to lobby by admin. Please reselect your teams!', 'FFFF00');
      
      console.log('[ChatCommand] Game reset to lobby triggered by', player.id);
      
      gameManager.resetToLobby();
    });
  }

  /**
   * Register the /bodycheck command - debug body check functionality
   */
  private registerBodyCheckDebugCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/bodycheck', (player) => {
      const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
      
      if (!teamPos) {
        this.world!.chatManager.sendPlayerMessage(player, 'You must be assigned to a team and position first!', 'FF0000');
        return;
      }
      
      const isDefender = teamPos.position === 'DEFENDER1' || teamPos.position === 'DEFENDER2';
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Team: ${teamPos.team}, Position: ${teamPos.position}, Can Body Check: ${isDefender}`, 
        isDefender ? '00FF00' : 'FF0000'
      );
      
      if (isDefender) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          'Body check should be available! Look for opponents in range and use Left Click.', 
          '00FFFF'
        );
        
        // Test UI visibility
        player.ui.sendData({ type: 'set-body-check-visibility', visible: true });
        player.ui.sendData({ type: 'body-check-available', available: true });
        this.world!.chatManager.sendPlayerMessage(
          player, 
          'Body check UI should now be visible and enabled for testing!', 
          '00FF00'
        );
      }
    });
  }

  /**
   * Register the /stickcheck command - debug stick check functionality
   */
  private registerStickCheckDebugCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/stickcheck', (player) => {
      const teamPos = HockeyGameManager.instance.getTeamAndPosition(player.id);
      
      if (!teamPos) {
        this.world!.chatManager.sendPlayerMessage(player, 'You must be assigned to a team and position first!', 'FF0000');
        return;
      }
      
      // Get player's controller
      const controller = player.entity?.controller;
      if (!controller) {
        this.world!.chatManager.sendPlayerMessage(player, 'No controller found!', 'FF0000');
        return;
      }
      
      const isControllingPuck = controller._isControllingPuck || false;
      const isCollidingWithPuck = controller._isCollidingWithPuck || false;
      const stickCheckCooldown = controller._stickCheckCooldown || 0;
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Stick Check Debug:`, 
        'FFFF00'
      );
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `- Controlling Puck: ${isControllingPuck}`, 
        isControllingPuck ? 'FF0000' : '00FF00'
      );
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `- Colliding with Puck: ${isCollidingWithPuck}`, 
        isCollidingWithPuck ? '00FF00' : 'FF0000'
      );
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `- Cooldown: ${stickCheckCooldown}ms`, 
        stickCheckCooldown > 0 ? 'FF0000' : '00FF00'
      );
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Stick check available when: NOT controlling puck AND colliding with puck AND cooldown = 0`, 
        '00FFFF'
      );
    });
  }

  /**
   * Register stats testing and management commands
   */
  private registerStatsTestCommands(): void {
    if (!this.world) return;

    // /stats - Show current statistics scoreboard
    this.world.chatManager.registerCommand('/stats', (player) => {
      this.world!.chatManager.sendPlayerMessage(player, 'Broadcasting current stats to all players...', '00FF00');
      HockeyGameManager.instance.broadcastStatsUpdate();
      console.log('[ChatCommand] Stats broadcast triggered by', player.id);
    });

    // /testgoal - Simulate a goal for testing stats
    this.world.chatManager.registerCommand('/testgoal', (player, args) => {
      const team = args[0]?.toUpperCase();
      
      if (team !== 'RED' && team !== 'BLUE') {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testgoal <RED|BLUE> [assist_player_id]', 'FFFF00');
        return;
      }

      // Get player's ID for goal attribution
      const scorerId = player.id;
      const assistId = args[1]; // Optional assist player ID
      
      this.world!.chatManager.sendPlayerMessage(player, `Simulating ${team} goal by ${player.username}${assistId ? ` (assist: ${assistId})` : ''}...`, '00FF00');
      console.log(`[ChatCommand] Test goal simulated: ${team} by ${player.username} (${player.id})${assistId ? ` with assist from ${assistId}` : ''}`);
      
      // Trigger goal with proper attribution
      HockeyGameManager.instance.goalScored(team as any, this.puck, false, scorerId, assistId);
    });

    // /debugstats - Show detailed stats debugging info
    this.world.chatManager.registerCommand('/debugstats', (player) => {
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      const allStats = PlayerStatsManager.instance.getAllStats();
      const goals = PlayerStatsManager.instance.getGoals();
      const boxScore = PlayerStatsManager.instance.generateBoxScore();
      
      this.world!.chatManager.sendPlayerMessage(player, '=== STATS DEBUG ===', 'FFFF00');
      this.world!.chatManager.sendPlayerMessage(player, `Total Players: ${allStats.length}`, '00FFFF');
      this.world!.chatManager.sendPlayerMessage(player, `Total Goals: ${goals.length}`, '00FFFF');
      
      // Show each player's stats
      allStats.forEach(stats => {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `${stats.playerName}: ${stats.goals}G ${stats.assists}A ${stats.saves}S`, 
          '00FF00'
        );
      });
      
      // Show box score totals
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Box Score: RED ${boxScore.totalScore.red} - BLUE ${boxScore.totalScore.blue}`, 
        'FFFF00'
      );
      
      console.log(`[ChatCommand] Debug stats:`, {
        playersCount: allStats.length,
        goalsCount: goals.length,
        boxScore: boxScore.totalScore
      });
    });
  }

  /**
   * Register player barrier debug commands
   */
  private registerPlayerBarrierCommands(): void {
    if (!this.world) return;

    // /barrierinfo - Show barrier status and debug information
    this.world.chatManager.registerCommand('/barrierinfo', (player) => {
      const { PlayerBarrierService } = require('../services/PlayerBarrierService');
      const debugInfo = PlayerBarrierService.instance.getDebugInfo();
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Barriers Active: ${debugInfo.isActive ? 'YES' : 'NO'}`, 
        debugInfo.isActive ? '00FF00' : 'FF0000'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Red Barrier: ${debugInfo.redBarrierSpawned ? 'SPAWNED' : 'NOT SPAWNED'}`, 
        debugInfo.redBarrierSpawned ? '00FF00' : 'FF0000'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Blue Barrier: ${debugInfo.blueBarrierSpawned ? 'SPAWNED' : 'NOT SPAWNED'}`, 
        debugInfo.blueBarrierSpawned ? '00FF00' : 'FF0000'
      );

      if (debugInfo.redBarrierPosition) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Red Barrier Position: X=${debugInfo.redBarrierPosition.x.toFixed(2)}, Y=${debugInfo.redBarrierPosition.y.toFixed(2)}, Z=${debugInfo.redBarrierPosition.z.toFixed(2)}`, 
          'FF4444'
        );
      }

      if (debugInfo.blueBarrierPosition) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Blue Barrier Position: X=${debugInfo.blueBarrierPosition.x.toFixed(2)}, Y=${debugInfo.blueBarrierPosition.y.toFixed(2)}, Z=${debugInfo.blueBarrierPosition.z.toFixed(2)}`, 
          '44AAFF'
        );
      }

      console.log('[ChatCommand] Barrier debug info:', debugInfo);
    });

    // /removebarriers - Remove all goal barriers (for testing)
    this.world.chatManager.registerCommand('/removebarriers', (player) => {
      const { PlayerBarrierService } = require('../services/PlayerBarrierService');
      PlayerBarrierService.instance.removeBarriers();
      this.world!.chatManager.sendPlayerMessage(player, 'All goal barriers removed!', 'FF0000');
      console.log('[ChatCommand] Goal barriers removed by', player.id);
    });

    // /createbarriers - Recreate goal barriers (for testing)
    this.world.chatManager.registerCommand('/createbarriers', (player) => {
      const { PlayerBarrierService } = require('../services/PlayerBarrierService');
      try {
        PlayerBarrierService.instance.createBarriers(this.world!);
        this.world!.chatManager.sendPlayerMessage(player, 'Goal barriers recreated!', '00FF00');
        console.log('[ChatCommand] Goal barriers recreated by', player.id);
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, 'Error creating barriers!', 'FF0000');
        console.error('[ChatCommand] Error creating barriers:', error);
      }
    });

    // /testbarrier - Test barrier collision by trying to teleport player into goal
    this.world.chatManager.registerCommand('/testbarrier', (player, args) => {
      const goal = args[0]?.toLowerCase();
      if (goal !== 'red' && goal !== 'blue') {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testbarrier <red|blue>', 'FFFF00');
        return;
      }

      const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length === 0) {
        this.world!.chatManager.sendPlayerMessage(player, 'No player entity found!', 'FF0000');
        return;
      }

      // Try to teleport player to goal line to test barrier
      const testPosition = goal === 'red' 
        ? { x: 0, y: 1.75, z: -31.5 }  // Just behind red goal line
        : { x: 0, y: 1.75, z: 31.5 };   // Just behind blue goal line

      try {
        playerEntities[0].setPosition(testPosition);
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Teleported to ${goal} goal line to test barrier!`, 
          goal === 'red' ? 'FF4444' : '44AAFF'
        );
        console.log(`[ChatCommand] Player ${player.id} teleported to ${goal} goal for barrier test`);
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, 'Error teleporting player!', 'FF0000');
        console.error('[ChatCommand] Error teleporting player for barrier test:', error);
      }
    });
  }

  /**
   * Register ice floor debug commands
   */
  private registerIceFloorCommands(): void {
    if (!this.world) return;

    // /icefloor - Show ice floor entity status
    this.world.chatManager.registerCommand('/icefloor', (player) => {
      const iceFloor = WorldInitializer.instance.getIceFloor();
      if (iceFloor) {
        const position = iceFloor.position;
        const isSpawned = iceFloor.isSpawned;
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Ice Floor: spawned=${isSpawned}, pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`,
          '00FFFF'
        );
        console.log('[IceFloor] Status:', { spawned: isSpawned, position });
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Ice floor entity not found!', 'FF0000');
        console.log('[IceFloor] Entity not found');
      }
    });

    // /testpuckphysics - Test puck physics with detailed reporting
    this.world.chatManager.registerCommand('/testpuckphysics', (player) => {
      if (this.puck && this.puck.isSpawned) {
        // Use the correct property names from Hytopia SDK
        const velocity = this.puck.linearVelocity;
        const position = this.puck.position;
        const angularVel = this.puck.angularVelocity;
        
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Puck Physics: pos=(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
          '00FFFF'
        );
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Linear Vel: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`,
          '00FFFF'
        );
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Angular Vel: (${angularVel.x.toFixed(2)}, ${angularVel.y.toFixed(2)}, ${angularVel.z.toFixed(2)})`,
          '00FFFF'
        );
        
        console.log('[PuckPhysics] Position:', position);
        console.log('[PuckPhysics] Linear Velocity:', velocity);
        console.log('[PuckPhysics] Angular Velocity:', angularVel);
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck found or puck not spawned!', 'FF0000');
      }
    });

    // /testcollisions - Check if puck is colliding with ice floor vs map blocks
    this.world.chatManager.registerCommand('/testcollisions', (player) => {
      const iceFloor = WorldInitializer.instance.getIceFloor();
      if (!iceFloor) {
        this.world!.chatManager.sendPlayerMessage(player, 'Ice floor not found!', 'FF0000');
        return;
      }

      if (!this.puck || !this.puck.isSpawned) {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck found!', 'FF0000');
        return;
      }

      // Display collision info
      const iceFloorPos = iceFloor.position;
      const puckPos = this.puck.position;
      const verticalDiff = puckPos.y - iceFloorPos.y;

      this.world!.chatManager.sendPlayerMessage(
        player,
        `Ice Floor Y: ${iceFloorPos.y.toFixed(3)}, Puck Y: ${puckPos.y.toFixed(3)}`,
        '00FFFF'
      );
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Vertical diff: ${verticalDiff.toFixed(3)} (should be ~0.05-0.1)`,
        verticalDiff > 0.05 && verticalDiff < 0.15 ? '00FF00' : 'FF0000'
      );

      console.log('[CollisionTest] Ice floor position:', iceFloorPos);
      console.log('[CollisionTest] Puck position:', puckPos);
      console.log('[CollisionTest] Vertical difference:', verticalDiff);
    });
  }

  private registerTestCommands(): void {
    if (!this.world) return;
    
    // Test command to list available node names and verify all anchor points
    this.world.chatManager.registerCommand('/test-nodes', (player) => {
      try {
        const { ModelRegistry } = require('hytopia');
        const nodeNames = ModelRegistry.instance.getNodeNames('models/players/player.gltf');
        
        // Check if required anchor nodes exist
        const hasHeadAnchor = nodeNames.includes('head-anchor');
        const hasHeadAnchorUnderscore = nodeNames.includes('head_anchor');
        const hasEyesAnchor = nodeNames.includes('eyes-anchor');
        const hasEyesAnchorUnderscore = nodeNames.includes('eyes_anchor');
        const hasFootRightAnchor = nodeNames.includes('foot-right-anchor');
        const hasFootLeftAnchor = nodeNames.includes('foot-left-anchor');
        const hasFootRightAnchorUnderscore = nodeNames.includes('foot_right_anchor');
        const hasFootLeftAnchorUnderscore = nodeNames.includes('foot_left_anchor');
        const hasTorsoAnchor = nodeNames.includes('torso-anchor');
        const hasTorsoAnchorUnderscore = nodeNames.includes('torso_anchor');
        const hasHandRightAnchor = nodeNames.includes('hand-right-anchor');
        const hasHandLeftAnchor = nodeNames.includes('hand-left-anchor');
        const hasHandRightAnchorUnderscore = nodeNames.includes('hand_right_anchor');
        const hasHandLeftAnchorUnderscore = nodeNames.includes('hand_left_anchor');
        const hasLegRightAnchor = nodeNames.includes('leg-right-anchor');
        const hasLegLeftAnchor = nodeNames.includes('leg-left-anchor');
        const hasLegRightAnchorUnderscore = nodeNames.includes('leg_right_anchor');
        const hasLegLeftAnchorUnderscore = nodeNames.includes('leg_left_anchor');
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Player model nodes: ${nodeNames.join(', ')}`, 
          '00FF00'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Head anchor: ${hasHeadAnchor ? '✓ head-anchor' : hasHeadAnchorUnderscore ? '✓ head_anchor' : '✗ not found'}`, 
          hasHeadAnchor || hasHeadAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Eyes anchor: ${hasEyesAnchor ? '✓ eyes-anchor' : hasEyesAnchorUnderscore ? '✓ eyes_anchor' : '✗ not found'}`, 
          hasEyesAnchor || hasEyesAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Right foot: ${hasFootRightAnchor ? '✓ foot-right-anchor' : hasFootRightAnchorUnderscore ? '✓ foot_right_anchor' : '✗ not found'}`, 
          hasFootRightAnchor || hasFootRightAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Left foot: ${hasFootLeftAnchor ? '✓ foot-left-anchor' : hasFootLeftAnchorUnderscore ? '✓ foot_left_anchor' : '✗ not found'}`, 
          hasFootLeftAnchor || hasFootLeftAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Torso: ${hasTorsoAnchor ? '✓ torso-anchor' : hasTorsoAnchorUnderscore ? '✓ torso_anchor' : '✗ not found'}`, 
          hasTorsoAnchor || hasTorsoAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Right hand: ${hasHandRightAnchor ? '✓ hand-right-anchor' : hasHandRightAnchorUnderscore ? '✓ hand_right_anchor' : '✗ not found'}`, 
          hasHandRightAnchor || hasHandRightAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Left hand: ${hasHandLeftAnchor ? '✓ hand-left-anchor' : hasHandLeftAnchorUnderscore ? '✓ hand_left_anchor' : '✗ not found'}`, 
          hasHandLeftAnchor || hasHandLeftAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Right leg: ${hasLegRightAnchor ? '✓ leg-right-anchor' : hasLegRightAnchorUnderscore ? '✓ leg_right_anchor' : '✗ not found'}`, 
          hasLegRightAnchor || hasLegRightAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Left leg: ${hasLegLeftAnchor ? '✓ leg-left-anchor' : hasLegLeftAnchorUnderscore ? '✓ leg_left_anchor' : '✗ not found'}`, 
          hasLegLeftAnchor || hasLegLeftAnchorUnderscore ? '00FF00' : 'FF0000'
        );
        
        console.log('Available node names for player.gltf:', nodeNames);
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Error getting node names: ${error.message}`, 
          'FF0000'
        );
        console.error('Error getting node names:', error);
      }
    });
  }

  /**
   * Register commands for toggling gameplay messages
   */
  private registerGameplayMessageCommands(): void {
    if (!this.world) return;

    this.world.chatManager.registerCommand('/togglemessages', (player) => {
      const { IceSkatingController } = require('../controllers/IceSkatingController');
      IceSkatingController._showGameplayMessages = !IceSkatingController._showGameplayMessages;
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Gameplay messages ${IceSkatingController._showGameplayMessages ? 'enabled' : 'disabled'}!`,
        IceSkatingController._showGameplayMessages ? '00FF00' : 'FF0000'
      );
      
      console.log(`[ChatCommand] Gameplay messages ${IceSkatingController._showGameplayMessages ? 'enabled' : 'disabled'} by`, player.id);
    });
  }
  
  /**
   * Register audio debugging commands for diagnosing audio degradation issues
   */
  private registerAudioDebugCommands(): void {
    if (!this.world) return;
    
    // /audioinfo - Shows comprehensive audio status
    this.world.chatManager.registerCommand('/audioinfo', (player) => {
      const debugInfo = AudioManager.instance.getAudioDebugInfo();
      const stats = AudioManager.instance.getAudioStats();
      
      if (debugInfo) {
        this.world!.chatManager.sendPlayerMessage(player, '🎵 AUDIO SYSTEM STATUS:', '00FFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Total: ${debugInfo.totalAudiosInWorld} | Managed: ${debugInfo.managedAudios} | Unmanaged: ${debugInfo.unmanagedAudios}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Looped: ${debugInfo.loopedAudios} | One-shot: ${debugInfo.oneshotAudios}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Entity Attached: ${debugInfo.entityAttachedAudios}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Memory Est: ${debugInfo.memoryEstimate}MB`, 'FFFFFF');
        
        if (debugInfo.oldestAudio) {
          const ageSeconds = Math.round(debugInfo.oldestAudio.age / 1000);
          this.world!.chatManager.sendPlayerMessage(player, `Oldest: ${ageSeconds}s (${debugInfo.oldestAudio.uri})`, 'FFFFFF');
        }
        
        if (Object.keys(debugInfo.typeBreakdown).length > 0) {
          this.world!.chatManager.sendPlayerMessage(player, `Types: ${JSON.stringify(debugInfo.typeBreakdown)}`, 'FFFFFF');
        }
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'No audio debug info available yet', 'FFFF00');
      }
    });
    
    // /audioworld - Shows all audio instances in world using Hytopia API
    this.world.chatManager.registerCommand('/audioworld', (player) => {
      const allAudios = AudioManager.instance.getAllWorldAudios();
      const loopedAudios = AudioManager.instance.getAllLoopedAudios();
      const oneshotAudios = AudioManager.instance.getAllOneshotAudios();
      
      this.world!.chatManager.sendPlayerMessage(player, '🌍 WORLD AUDIO INSTANCES:', '00FFFF');
      this.world!.chatManager.sendPlayerMessage(player, `Total: ${allAudios.length}`, 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, `Looped: ${loopedAudios.length}`, 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, `One-shot: ${oneshotAudios.length}`, 'FFFFFF');
      
      // Show details of first few audios
      const firstFew = allAudios.slice(0, 5);
      firstFew.forEach((audio, index) => {
        const uri = audio.uri || 'unknown';
        const attached = audio.attachedToEntity ? 'entity-attached' : 'global';
        const looped = audio.loop ? 'looped' : 'one-shot';
        this.world!.chatManager.sendPlayerMessage(player, `${index + 1}. ${uri} (${attached}, ${looped})`, 'CCCCCC');
      });
      
      if (allAudios.length > 5) {
        this.world!.chatManager.sendPlayerMessage(player, `... and ${allAudios.length - 5} more`, 'CCCCCC');
      }
    });
    
    // /audiocleanup - Forces manual cleanup
    this.world.chatManager.registerCommand('/audiocleanup', (player) => {
      AudioManager.instance.forceCleanup();
      this.world!.chatManager.sendPlayerMessage(player, 'Manual audio cleanup performed!', '00FF00');
    });
    
    // /audiocleanupenhanced - Forces enhanced cleanup using official AudioManager methods
    this.world.chatManager.registerCommand('/audiocleanupenhanced', (player) => {
      const allAudiosBefore = AudioManager.instance.getAllWorldAudios().length;
      
      // Try the enhanced cleanup methods
      try {
        // First cleanup old pooled audios
        (AudioManager.instance as any).cleanupOldPooledAudios();
        
        // Then try enhanced emergency cleanup
        (AudioManager.instance as any).enhancedEmergencyCleanup();
        
        const allAudiosAfter = AudioManager.instance.getAllWorldAudios().length;
        const cleaned = allAudiosBefore - allAudiosAfter;
        
        this.world!.chatManager.sendPlayerMessage(player, `Enhanced audio cleanup completed!`, '00FF00');
        this.world!.chatManager.sendPlayerMessage(player, `Cleaned up ${cleaned} audio instances (${allAudiosBefore} → ${allAudiosAfter})`, 'FFFFFF');
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, `Enhanced cleanup error: ${error}`, 'FF0000');
      }
    });
    
    // /audioanalyze - Forces manual analysis
    this.world.chatManager.registerCommand('/audioanalyze', (player) => {
      const debugInfo = AudioManager.instance.performManualAudioAnalysis();
      if (debugInfo) {
        this.world!.chatManager.sendPlayerMessage(player, 'Audio analysis completed:', '00FF00');
        this.world!.chatManager.sendPlayerMessage(player, `${debugInfo.totalAudiosInWorld} total audios detected`, 'FFFFFF');
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Audio analysis failed', 'FF0000');
      }
    });
    
    // /audioreset - Resets degradation detection
    this.world.chatManager.registerCommand('/audioreset', (player) => {
      AudioManager.instance.resetDegradationFlag();
      this.world!.chatManager.sendPlayerMessage(player, 'Audio degradation flag reset', '00FF00');
    });
    
    // /audiotest - Creates test audio to verify system
    this.world.chatManager.registerCommand('/audiotest', (player) => {
      const success = AudioManager.instance.playGlobalSoundEffect(
        CONSTANTS.AUDIO_PATHS.REFEREE_WHISTLE,
        0.5
      );
      
      if (success) {
        this.world!.chatManager.sendPlayerMessage(player, 'Test audio played successfully', '00FF00');
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Test audio failed to play', 'FF0000');
      }
    });
    
    // /audiostopambient - Stop ambient sound timers to prevent duplication
    this.world.chatManager.registerCommand('/audiostopambient', (player) => {
      AudioManager.instance.stopAmbientSounds();
      this.world!.chatManager.sendPlayerMessage(player, 'Ambient sound timers stopped to prevent duplication', '00FF00');
    });

    // /audiohelp - Shows available audio debug commands
    this.world.chatManager.registerCommand('/audiohelp', (player) => {
      this.world!.chatManager.sendPlayerMessage(player, '🎵 AUDIO DEBUG COMMANDS:', '00FFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audioinfo - Show audio system status', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audioworld - Show all world audio instances', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audiocleanup - Force manual cleanup', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audiocleanupenhanced - Enhanced cleanup with official AudioManager', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audioanalyze - Force manual analysis', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audioreset - Reset degradation flag', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audiotest - Play test sound', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, '/audiostopambient - Stop ambient sound timers', 'FFFFFF');
    });
    
    console.log('Audio debugging commands registered');
  }
}