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
import { HockeyTeam } from '../utils/types';

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
        this.puck = this.createPuckEntity();
        
        // Spawn at center ice using constants
        this.puck.spawn(this.world!, CONSTANTS.SPAWN_POSITIONS.PUCK_CENTER_ICE);
        
        // Attach trail effect to the new puck
        PuckTrailManager.instance.attachTrailToPuck(this.puck);
        
        this.world!.chatManager.sendPlayerMessage(player, 'New puck spawned with custom gradient trail!', '00FF00');
        console.log('New puck spawned with custom gradient trail');
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Error: Cannot create puck entity!', 'FF0000');
        console.error('ChatCommandManager: createPuckEntity function not available');
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
        const spawnPos = PlayerSpawnManager.instance.getSpawnPosition(teamAndPos.team, teamAndPos.position);
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Your spawn: ${teamAndPos.team} ${teamAndPos.position} at X=${spawnPos.x}, Y=${spawnPos.y}, Z=${spawnPos.z}`,
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
      try {
        // Stop existing music
        AudioManager.instance.stop();
        // Reinitialize
        AudioManager.instance.initialize(this.world!);
        this.world!.chatManager.sendPlayerMessage(player, 'Background music restarted cleanly', '00FF00');
        console.log('[ChatCommand] Background music restarted cleanly');
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
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testgoal <RED|BLUE>', 'FFFF00');
        return;
      }

      // Get player's ID for goal attribution
      const scorerId = player.id;
      
      this.world!.chatManager.sendPlayerMessage(player, `Simulating ${team} goal by ${player.username}...`, '00FF00');
      console.log(`[ChatCommand] Test goal simulated: ${team} by ${player.username} (${player.id})`);
      
      // Trigger goal with proper attribution
      HockeyGameManager.instance.goalScored(team as any, this.puck, false, scorerId);
    });

    // /teststats - Add fake stats for testing
    this.world.chatManager.registerCommand('/teststats', (player, args) => {
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      const action = args[0]?.toLowerCase();
      
      if (action === 'shot') {
        // Record a shot on goal
        PlayerStatsManager.instance.recordShot(player.id, 'RED', true, false);
        this.world!.chatManager.sendPlayerMessage(player, 'Recorded shot on goal for you!', '00FF00');
      } else if (action === 'save') {
        // Record a save (if player is goalie)
        PlayerStatsManager.instance.recordShot('opponent', 'BLUE', true, true, player.id);
        this.world!.chatManager.sendPlayerMessage(player, 'Recorded save for you!', '00FF00');
      } else if (action === 'hit') {
        // Record a hit
        PlayerStatsManager.instance.recordHit(player.id);
        this.world!.chatManager.sendPlayerMessage(player, 'Recorded hit for you!', '00FF00');
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /teststats <shot|save|hit>', 'FFFF00');
        return;
      }
      
      // Broadcast updated stats
      HockeyGameManager.instance.broadcastStatsUpdate();
      console.log(`[ChatCommand] Test stat recorded: ${action} for ${player.username}`);
    });

    // /resetstats - Reset all player statistics
    this.world.chatManager.registerCommand('/resetstats', (player) => {
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      PlayerStatsManager.instance.resetStats();
      
      this.world!.chatManager.sendPlayerMessage(player, 'All player statistics have been reset!', '00FF00');
      this.world!.chatManager.sendBroadcastMessage('Player statistics have been reset by admin.', 'FFFF00');
      
      // Broadcast empty stats
      HockeyGameManager.instance.broadcastStatsUpdate();
      console.log(`[ChatCommand] All stats reset by ${player.username}`);
    });

    // /topstats - Show top performers in chat
    this.world.chatManager.registerCommand('/topstats', (player) => {
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      const topScorers = PlayerStatsManager.instance.getTopScorers(3);
      const summary = PlayerStatsManager.instance.getStatsSummary();
      
      this.world!.chatManager.sendPlayerMessage(player, '=== TOP PERFORMERS ===', 'FFFF00');
      
      if (summary.topScorer) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Top Scorer: ${summary.topScorer.name} (${summary.topScorer.points} pts)`, 
          '00FF00'
        );
      }
      
      if (summary.mostGoals) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Most Goals: ${summary.mostGoals.name} (${summary.mostGoals.goals} goals)`, 
          '00FF00'
        );
      }
      
      if (summary.mostSaves) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Most Saves: ${summary.mostSaves.name} (${summary.mostSaves.saves} saves)`, 
          '00FF00'
        );
      }
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Team Goals: RED ${summary.teamStats.red.goals} - BLUE ${summary.teamStats.blue.goals}`, 
        '00FFFF'
      );
      
      console.log(`[ChatCommand] Top stats displayed to ${player.username}`);
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

    // /testgameover - Test game over with sample data
    this.world.chatManager.registerCommand('/testgameover', (player) => {
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      const boxScore = PlayerStatsManager.instance.generateBoxScore();
      
      // Get actual current scores from HockeyGameManager
      const gameManager = HockeyGameManager.instance;
      const redScore = boxScore.totalScore.red;
      const blueScore = boxScore.totalScore.blue;
      const winner = redScore > blueScore ? 'RED' : blueScore > redScore ? 'BLUE' : 'TIED';
      
      this.world!.chatManager.sendPlayerMessage(player, 'Triggering test game over with current stats...', '00FF00');
      
      // Broadcast game over with current box score
      const allPlayerIds = [
        ...Object.values(HockeyGameManager.instance.teams[HockeyTeam.RED]), 
        ...Object.values(HockeyGameManager.instance.teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => HockeyGameManager.instance.getPlayerById(playerId))
        .filter(Boolean) as Player[];
      
      allPlayers.forEach((p) => {
        try {
          p.ui.sendData({
            type: 'game-over',
            winner: winner,
            redScore: redScore,
            blueScore: blueScore,
            finalMessage: winner === 'TIED' ? "It's a tie!" : `${winner} team wins!`,
            boxScore: boxScore
          });
        } catch (error) {
          console.error('Error sending test game over to player:', error);
        }
      });
      
      // Simulate the automatic return to lobby after 10 seconds (like in real endGame)
      setTimeout(() => {
        console.log('[ChatCommand] Test game over - returning to lobby after countdown');
        
        // Hide game over overlay
        allPlayers.forEach((p) => {
          try {
            p.ui.sendData({ type: 'game-over-hide' });
            p.ui.sendData({ type: 'timer-stop' });
          } catch (error) {
            console.error('Error hiding game over for player:', error);
          }
        });
        
        // Reset to lobby with team selection
        HockeyGameManager.instance.resetToLobby();
      }, 10000);
      
      console.log(`[ChatCommand] Test game over sent with actual scores: RED ${redScore} - BLUE ${blueScore}, box score:`, boxScore);
    });
  }
} 