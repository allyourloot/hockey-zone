/**
 * ChatCommandManager handles all chat command registrations and handlers
 * Extracted from index.ts section 4. CHAT COMMANDS
 */

import { Entity, ChatManager } from 'hytopia';
import type { World, PlayerEntity } from 'hytopia';
import * as CONSTANTS from '../utils/constants';
import { PuckTrailManager } from './PuckTrailManager';
import { GoalDetectionService } from '../services/GoalDetectionService';
import { OffsideDetectionService } from '../services/OffsideDetectionService';
import { PuckBoundaryService } from '../services/PuckBoundaryService';
import { HockeyGameManager } from './HockeyGameManager';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { WorldInitializer } from '../systems/WorldInitializer';
import { HockeyTeam, HockeyPosition, HockeyZone, FaceoffLocation, OffsideViolation } from '../utils/types';
import { AudioManager } from './AudioManager';
import { PlayerStatsManager } from './PlayerStatsManager';

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
    if (!this.world) return;
    
    this.registerRocketCommand();
    this.registerPuckCommand();
    this.registerSpawnPuckCommand();
    this.registerRemoveTrailCommand();
    this.registerTrailColorCommand();
    this.registerTestSleepCommand();
    this.registerGoalDetectionCommands();
    this.registerOffsideCommands();
    this.registerBodyCheckDebugCommand();
    this.registerStickCheckDebugCommand();
    this.registerStatsTestCommands();
    this.registerPlayerBarrierCommands();
    this.registerIceFloorCommands();
    this.registerTestCommands();
    this.registerGameplayMessageCommands();
    this.registerAudioDebugCommands();
    this.registerPuckIndicatorTestCommand();
    this.registerSpawnInfoCommand();
    this.registerDebugStatsCommand();
    this.registerTestPersistCommand();
    this.registerAssignTeamCommand();
    this.registerTestHitCommand();
    this.registerTestShotCommand();
    this.registerTestLeaderboardCommand();
    this.registerPassDebugCommand();
    this.registerClearHistoryCommand();
    this.registerPuckBoundaryCommands();
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
        // Stop boundary monitoring for old puck
        PuckBoundaryService.instance.stopMonitoring();
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
          
          // Start boundary monitoring for automatic respawn
          PuckBoundaryService.instance.startMonitoring(this.puck);
          
          this.world!.chatManager.sendPlayerMessage(
            player, 
            `Puck spawned at Y=${spawnPos.y} with trail and boundary monitoring!`, 
            '00FF00'
          );
          console.log('[SpawnPuck] Success - puck spawned with trail and boundary monitoring at Y:', spawnPos.y);
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

    // /puckhistory - Show current puck touch history for debugging
    this.world.chatManager.registerCommand('/puckhistory', (player) => {
      if (!this.puck) {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck found!', 'FF0000');
        return;
      }

      try {
        const customProps = (this.puck as any).customProperties;
        if (!customProps) {
          this.world!.chatManager.sendPlayerMessage(player, 'Puck has no custom properties!', 'FF0000');
          return;
        }

        const touchHistory = customProps.get('touchHistory') || [];
        const lastTouchedBy = customProps.get('lastTouchedBy') || 'Unknown';
        const currentTime = Date.now();

        this.world!.chatManager.sendPlayerMessage(player, `=== PUCK TOUCH HISTORY DEBUG ===`, 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, `Last touched by: ${lastTouchedBy}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Touch history length: ${touchHistory.length}`, 'FFFFFF');
        
        // Show RAW touch history data
        this.world!.chatManager.sendPlayerMessage(player, `RAW history: ${JSON.stringify(touchHistory)}`, 'CCCCCC');

        if (touchHistory.length === 0) {
          this.world!.chatManager.sendPlayerMessage(player, 'No touch history found!', 'FF8888');
        } else {
          this.world!.chatManager.sendPlayerMessage(player, `Touch history (${touchHistory.length} touches):`, 'FFFFFF');
          
          touchHistory.forEach((touch: any, index: number) => {
            const age = currentTime - touch.timestamp;
            const ageText = `${(age / 1000).toFixed(1)}s ago`;
            const timeText = new Date(touch.timestamp).toLocaleTimeString();
            
            // Get team info for the player
            const teamInfo = HockeyGameManager.instance.getTeamAndPosition(touch.playerId);
            const teamText = teamInfo ? `${teamInfo.team} ${teamInfo.position}` : 'Unknown team';
            const teamColor = teamInfo?.team === 'RED' ? 'FF4444' : teamInfo?.team === 'BLUE' ? '4444FF' : 'FFFFFF';
            
            this.world!.chatManager.sendPlayerMessage(
              player, 
              `${index + 1}. ${touch.playerId} (${teamText}) - ${timeText} (${ageText})`, 
              teamColor
            );
          });
        }

        // Show recent touches (within 45 seconds)
        const recentTouches = touchHistory.filter((touch: any) => {
          return (currentTime - touch.timestamp) < 45000;
        });
        this.world!.chatManager.sendPlayerMessage(player, `Recent touches (last 45s): ${recentTouches.length}`, 'FFFF00');

        // Show what would happen if we did an assist check now
        if (recentTouches.length > 0) {
          const lastTouch = recentTouches[0];
          const scorer = lastTouch.playerId;
          const scorerTeam = HockeyGameManager.instance.getTeamAndPosition(scorer)?.team;
          
          if (scorerTeam) {
            this.world!.chatManager.sendPlayerMessage(player, `If ${scorer} scored for ${scorerTeam}:`, '88FF88');
            
            const assists: string[] = [];
            for (let i = 0; i < recentTouches.length && assists.length < 2; i++) {
              const touch = recentTouches[i];
              if (touch.playerId === scorer) continue; // Skip scorer
              
              const touchPlayerTeam = HockeyGameManager.instance.getTeamAndPosition(touch.playerId)?.team;
              if (touchPlayerTeam !== scorerTeam) continue; // Skip wrong team
              if (assists.includes(touch.playerId)) continue; // Skip duplicates
              
              const age = currentTime - touch.timestamp;
              const maxTime = assists.length === 0 ? 30000 : 45000;
              if (age > maxTime) continue; // Skip too old
              
              assists.push(touch.playerId);
            }
            
            this.world!.chatManager.sendPlayerMessage(
              player, 
              `- Primary assist: ${assists[0] || 'None'}`, 
              assists[0] ? '88FF88' : 'FF8888'
            );
            this.world!.chatManager.sendPlayerMessage(
              player, 
              `- Secondary assist: ${assists[1] || 'None'}`, 
              assists[1] ? '88FF88' : 'FF8888'
            );
          }
        }

      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, `Error reading touch history: ${error}`, 'FF0000');
        console.error('Error reading puck touch history:', error);
      }
    });

    // /assisttest - Test assist detection logic manually
    this.world.chatManager.registerCommand('/assisttest', (player, args) => {
      if (!this.puck) {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck found!', 'FF0000');
        return;
      }

      const scorerId = player.id;
      const team = args[0]?.toUpperCase();
      
      if (team !== 'RED' && team !== 'BLUE') {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /assisttest <RED|BLUE>', 'FFFF00');
        return;
      }

      try {
        this.world!.chatManager.sendPlayerMessage(player, `=== ASSIST TEST RESULTS ===`, 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, `Scorer: ${scorerId} (${team} team)`, 'FFFFFF');

        // First, check the current puck touch history 
        const customProps = (this.puck as any).customProperties;
        if (!customProps) {
          this.world!.chatManager.sendPlayerMessage(player, 'ERROR: Puck has no custom properties!', 'FF0000');
          return;
        }

        const touchHistory = customProps.get('touchHistory') || [];
        const lastTouchedBy = customProps.get('lastTouchedBy');
        const currentTime = Date.now();

        this.world!.chatManager.sendPlayerMessage(player, `Touch history: ${touchHistory.length} entries`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Last touched by: ${lastTouchedBy || 'Nobody'}`, 'FFFFFF');

        if (touchHistory.length === 0) {
          this.world!.chatManager.sendPlayerMessage(player, 'ERROR: No touch history found!', 'FF0000');
          return;
        }

        // Show current touch history in detail
        this.world!.chatManager.sendPlayerMessage(player, `Current touch history:`, 'CCCCCC');
        touchHistory.forEach((touch: any, index: number) => {
          const age = (currentTime - touch.timestamp) / 1000;
          const teamInfo = HockeyGameManager.instance.getTeamAndPosition(touch.playerId);
          const teamText = teamInfo ? `${teamInfo.team} ${teamInfo.position}` : 'Unknown';
          this.world!.chatManager.sendPlayerMessage(player, `  ${index + 1}. ${touch.playerId} (${teamText}) - ${age.toFixed(1)}s ago`, 'CCCCCC');
        });

        // Filter for recent touches
        const recentTouches = touchHistory.filter((touch: any) => {
          const age = currentTime - touch.timestamp;
          return age < 45000; // 45 seconds
        });

        this.world!.chatManager.sendPlayerMessage(player, `Recent touches (within 45s): ${recentTouches.length}`, 'FFFFFF');

        if (recentTouches.length === 0) {
          this.world!.chatManager.sendPlayerMessage(player, 'ERROR: No recent touches within 45 seconds!', 'FF0000');
          return;
        }

        // Simulate assist detection logic step by step
        const assists: string[] = [];
        const gameManager = HockeyGameManager.instance;
        const scorerTeamInfo = gameManager.getTeamAndPosition(scorerId);

        if (!scorerTeamInfo) {
          this.world!.chatManager.sendPlayerMessage(player, `ERROR: Scorer ${scorerId} not found in teams!`, 'FF0000');
          return;
        }

        this.world!.chatManager.sendPlayerMessage(player, `Scorer info: ${scorerTeamInfo.team} ${scorerTeamInfo.position}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Checking touches for potential assists...`, 'FFFFFF');

        for (let i = 0; i < recentTouches.length && assists.length < 2; i++) {
          const touch = recentTouches[i];
          const touchPlayerId = touch.playerId;
          const touchPlayerTeamInfo = gameManager.getTeamAndPosition(touchPlayerId);
          const timeSinceTouch = currentTime - touch.timestamp;

          this.world!.chatManager.sendPlayerMessage(player, `Touch ${i + 1}: ${touchPlayerId}`, 'CCCCCC');

          // Check if this is the scorer themselves
          if (touchPlayerId === scorerId) {
            this.world!.chatManager.sendPlayerMessage(player, `  ❌ Skipped: is the scorer`, 'FF8888');
            continue;
          }

          // Check team
          if (!touchPlayerTeamInfo) {
            this.world!.chatManager.sendPlayerMessage(player, `  ❌ Skipped: player not found in teams`, 'FF8888');
            continue;
          }

          if (touchPlayerTeamInfo.team !== scorerTeamInfo.team) {
            this.world!.chatManager.sendPlayerMessage(player, `  ❌ Skipped: wrong team (${touchPlayerTeamInfo.team} vs ${scorerTeamInfo.team})`, 'FF8888');
            continue;
          }

          // Check if already in assists
          if (assists.includes(touchPlayerId)) {
            this.world!.chatManager.sendPlayerMessage(player, `  ❌ Skipped: already awarded assist`, 'FF8888');
            continue;
          }

          // Check timing
          const maxTime = assists.length === 0 ? 30000 : 45000;
          if (timeSinceTouch > maxTime) {
            this.world!.chatManager.sendPlayerMessage(player, `  ❌ Skipped: too old (${(timeSinceTouch/1000).toFixed(1)}s > ${maxTime/1000}s)`, 'FF8888');
            continue;
          }

          // Award assist
          assists.push(touchPlayerId);
          const assistType = assists.length === 1 ? 'Primary' : 'Secondary';
          this.world!.chatManager.sendPlayerMessage(player, `  ✅ ${assistType} assist awarded! (${(timeSinceTouch/1000).toFixed(1)}s ago)`, '00FF00');
        }

        // Final results
        this.world!.chatManager.sendPlayerMessage(player, `=== FINAL RESULTS ===`, 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, `Primary assist: ${assists[0] || 'None'}`, assists[0] ? '00FF00' : 'FF8888');
        this.world!.chatManager.sendPlayerMessage(player, `Secondary assist: ${assists[1] || 'None'}`, assists[1] ? '00FF00' : 'FF8888');

        if (assists.length === 0) {
          this.world!.chatManager.sendPlayerMessage(player, `❌ No assists detected! Check logs above for reasons.`, 'FF8888');
        } else {
          this.world!.chatManager.sendPlayerMessage(player, `✅ ${assists.length} assist(s) would be awarded!`, '00FF00');
        }

        // Now also call the actual method for comparison
        const goalDetectionService = GoalDetectionService.instance;
        const actualAssistInfo = (goalDetectionService as any).getAssistInfo(this.puck, scorerId, team, false);
        
        this.world!.chatManager.sendPlayerMessage(player, `=== ACTUAL SYSTEM RESULTS ===`, 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, `Actual primary: ${actualAssistInfo.primaryAssist || 'None'}`, 'FFFFFF');
        this.world!.chatManager.sendPlayerMessage(player, `Actual secondary: ${actualAssistInfo.secondaryAssist || 'None'}`, 'FFFFFF');

      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, `Error testing assists: ${error}`, 'FF0000');
        console.error('Error testing assist detection:', error);
      }
    });

    // /testsave - Simulate a save for testing stats
    this.world.chatManager.registerCommand('/testsave', (player, args) => {
      // Player who runs the command is the goalie making the save
      const goalieId = player.id;
      const shooterId = args[0]; // Required shooter ID
      
      if (!shooterId) {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testsave <shooter_player_id>', 'FFFF00');
        return;
      }

      // Check if the current player is actually a goalie
      const goalieInfo = HockeyGameManager.instance.getTeamAndPosition(goalieId);
      if (!goalieInfo || goalieInfo.position !== HockeyPosition.GOALIE) {
        this.world!.chatManager.sendPlayerMessage(player, 'Error: You must be assigned as a goalie to test saves!', 'FF0000');
        return;
      }

      // Check if shooter exists
      const shooterInfo = HockeyGameManager.instance.getTeamAndPosition(shooterId);
      if (!shooterInfo) {
        this.world!.chatManager.sendPlayerMessage(player, `Error: Shooter player ${shooterId} not found!`, 'FF0000');
        return;
      }

      // Check if shooter is on opposing team
      if (shooterInfo.team === goalieInfo.team) {
        this.world!.chatManager.sendPlayerMessage(player, `Error: Shooter must be on opposing team!`, 'FF0000');
        return;
      }

      this.world!.chatManager.sendPlayerMessage(player, `Simulating save by ${player.username} (${goalieInfo.team}) against shooter ${shooterId} (${shooterInfo.team})...`, '00FF00');
      console.log(`[ChatCommand] Test save simulated: ${player.username} (${goalieId}) saved shot from ${shooterId}`);
      
      // Record the save directly
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      PlayerStatsManager.instance.recordSave(goalieId, shooterId, shooterInfo.team);
      
      // Broadcast the save notification
      HockeyGameManager.instance.saveRecorded(goalieId, shooterId);
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
        gameManager.teams as any, // Type assertion to handle Teams vs Record type mismatch
        gameManager['_playerIdToPlayer'], // Access private property for testing
        this.puck
      );
      this.world!.chatManager.sendPlayerMessage(player, 'All players reset to spawn positions!', '00FF00');
      console.log('[ChatCommand] Players reset to spawn positions');
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
      if (!this.world) return;
      
      this.world!.chatManager.sendPlayerMessage(player, 'Background music is now handled globally with simple Hytopia approach', '00FF00');
      console.log('[ChatCommand] Background music handled globally');
    });

    // /stopmusic - Stop background music (no longer available)
    this.world.chatManager.registerCommand('/stopmusic', (player) => {
      if (!this.world) return;
      
      this.world!.chatManager.sendPlayerMessage(player, 'Background music cannot be stopped individually - handled globally', 'FFAA00');
      console.log('[ChatCommand] Background music stop not available with global approach');
    });

    // /restartmusic - Background music info (no longer restartable)
    this.world.chatManager.registerCommand('/restartmusic', (player) => {
      if (!this.world) return;
      
      this.world!.chatManager.sendPlayerMessage(player, 'Background music is handled globally and cannot be restarted individually', 'FFAA00');
      console.log('[ChatCommand] Background music restart not available with global approach');
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
      
              gameManager.endGame().catch(error => {
          console.error('Error ending game via command:', error);
        });
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
   * Register offside detection debug commands
   */
  private registerOffsideCommands(): void {
    if (!this.world) return;

    // /startoffside - Start offside monitoring
    this.world.chatManager.registerCommand('/startoffside', (player) => {
      const offsideService = OffsideDetectionService.instance;
      offsideService.startMonitoring();
      this.world!.chatManager.sendPlayerMessage(player, 'Offside monitoring started!', '00FF00');
      console.log('[ChatCommand] Offside monitoring started by', player.id);
    });

    // /stopoffside - Stop offside monitoring
    this.world.chatManager.registerCommand('/stopoffside', (player) => {
      const offsideService = OffsideDetectionService.instance;
      offsideService.stopMonitoring();
      this.world!.chatManager.sendPlayerMessage(player, 'Offside monitoring stopped!', 'FF0000');
      console.log('[ChatCommand] Offside monitoring stopped by', player.id);
    });

    // /offsideinfo - Show offside detection debug information
    this.world.chatManager.registerCommand('/offsideinfo', (player) => {
      const offsideService = OffsideDetectionService.instance;
      const debugInfo = offsideService.getDebugInfo();
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Offside Detection Status: ${debugInfo.isActive ? 'ACTIVE' : 'INACTIVE'}`, 
        debugInfo.isActive ? '00FF00' : 'FF0000'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Zone Boundaries: Red Defensive < ${debugInfo.zoneBoundaries.redDefensiveMax}, Blue Defensive > ${debugInfo.zoneBoundaries.blueDefensiveMin}`, 
        'FFFF00'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Player History Count: ${debugInfo.playerHistoryCount}`, 
        'FFFF00'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Faceoff Locations: ${debugInfo.faceoffLocations.length} available`, 
        'FFFF00'
      );

      if (this.puck && this.puck.isSpawned) {
        const pos = this.puck.position;
        const zone = offsideService.getZoneFromPosition(pos);
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Puck Position: X=${pos.x.toFixed(2)}, Y=${pos.y.toFixed(2)}, Z=${pos.z.toFixed(2)} (Zone: ${zone})`, 
          'FFFF00'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Puck not found or not spawned!', 'FF0000');
      }

      console.log('[ChatCommand] Offside detection debug info:', debugInfo);
    });

    // /myzone - Show what zone the player is currently in
    this.world.chatManager.registerCommand('/myzone', (player) => {
      const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length === 0) {
        this.world!.chatManager.sendPlayerMessage(player, 'No player entity found!', 'FF0000');
        return;
      }

      const playerPosition = playerEntities[0].position;
      const offsideService = OffsideDetectionService.instance;
      const zone = offsideService.getZoneFromPosition(playerPosition);
      
      const teamInfo = HockeyGameManager.instance.getTeamAndPosition(player.id);
      const teamText = teamInfo ? `${teamInfo.team} ${teamInfo.position}` : 'Unassigned';
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Your Position: X=${playerPosition.x.toFixed(2)}, Z=${playerPosition.z.toFixed(2)}`, 
        '00FF00'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Current Zone: ${zone} (Team: ${teamText})`, 
        zone === HockeyZone.NEUTRAL ? 'FFFF00' : 
        zone === HockeyZone.RED_DEFENSIVE ? 'FF4444' : '44AAFF'
      );

      console.log(`[ChatCommand] Player ${player.id} zone check: ${zone} at ${JSON.stringify(playerPosition)}`);
    });

    // /faceoffspots - Show all faceoff locations
    this.world.chatManager.registerCommand('/faceoffspots', (player) => {
      const offsideService = OffsideDetectionService.instance;
      const faceoffPositions = offsideService.getAllFaceoffPositions();
      
      this.world!.chatManager.sendPlayerMessage(player, '=== FACEOFF LOCATIONS ===', 'FFFF00');
      
      Object.entries(faceoffPositions).forEach(([location, position]) => {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `${location}: X=${position.x}, Z=${position.z}`, 
          location.includes('RED') ? 'FF4444' : '44AAFF'
        );
      });

      console.log('[ChatCommand] Faceoff spots displayed for', player.id);
    });

    // /testoffside - Simulate an offside violation for testing
    this.world.chatManager.registerCommand('/testoffside', (player, args) => {
      const team = args[0]?.toUpperCase();
      const location = args[1]?.toUpperCase();
      
      if (team !== 'RED' && team !== 'BLUE') {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /testoffside <RED|BLUE> <location>', 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, 'Locations: RED_DEFENSIVE_LEFT, RED_DEFENSIVE_RIGHT, RED_NEUTRAL_LEFT, RED_NEUTRAL_RIGHT, BLUE_NEUTRAL_LEFT, BLUE_NEUTRAL_RIGHT, BLUE_DEFENSIVE_LEFT, BLUE_DEFENSIVE_RIGHT', 'FFFF00');
        return;
      }
      
      // Default to neutral zone if no location specified
      let faceoffLocation: FaceoffLocation;
      if (location && Object.values(FaceoffLocation).includes(location as FaceoffLocation)) {
        faceoffLocation = location as FaceoffLocation;
      } else {
        // Default based on team
        faceoffLocation = team === 'RED' ? FaceoffLocation.RED_NEUTRAL_LEFT : FaceoffLocation.BLUE_NEUTRAL_LEFT;
        this.world!.chatManager.sendPlayerMessage(player, `No valid location specified, using default: ${faceoffLocation}`, 'FFFF00');
      }

      // Create a mock offside violation
      const violation: OffsideViolation = {
        violatingTeam: team as HockeyTeam,
        faceoffLocation: faceoffLocation,
        timestamp: Date.now(),
        violatingPlayerIds: [player.id],
        puckPosition: { x: 0, y: 1, z: 0 },
        blueLlineCrossedZone: HockeyZone.NEUTRAL
      };

      // Actually trigger the offside call through HockeyGameManager
      HockeyGameManager.instance.offsideCalled(violation);

      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Test offside triggered: ${team} violation, faceoff at ${faceoffLocation}`, 
        '00FF00'
      );

      console.log(`[ChatCommand] Test offside triggered: ${team} at ${faceoffLocation} by ${player.id}`);
    });

    // /resetoffside - Reset offside detection service
    this.world.chatManager.registerCommand('/resetoffside', (player) => {
      OffsideDetectionService.instance.reset();
      this.world!.chatManager.sendPlayerMessage(player, 'Offside detection service reset!', '00FF00');
      console.log('[ChatCommand] Offside detection service reset by', player.id);
    });

    // /testfaceoff - Test faceoff formation at closest neutral zone dot
    this.world.chatManager.registerCommand('/testfaceoff', (player) => {
      const { OffsideDetectionService } = require('../services/OffsideDetectionService');
      const { PlayerSpawnManager } = require('./PlayerSpawnManager');
      const gameManager = HockeyGameManager.instance;
      
      // Get player's current position to find closest faceoff dot
      const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length === 0) {
        this.world!.chatManager.sendPlayerMessage(player, 'No player entity found!', 'FF0000');
        return;
      }
      
      const playerPos = playerEntities[0].position;
      
      // Find closest neutral zone faceoff position
      const neutralPositions = {
        RED_NEUTRAL_LEFT: { x: -13.36, y: 1.75, z: -3.75 },
        RED_NEUTRAL_RIGHT: { x: 14.36, y: 1.75, z: -3.75 },
        BLUE_NEUTRAL_LEFT: { x: -13.36, y: 1.75, z: 5.4 },
        BLUE_NEUTRAL_RIGHT: { x: 14.36, y: 1.75, z: 5.25 }
      };
      
      let closestLocation = 'RED_NEUTRAL_LEFT';
      let shortestDistance = Number.MAX_VALUE;
      
      for (const [location, pos] of Object.entries(neutralPositions)) {
        const distance = Math.sqrt(
          Math.pow(playerPos.x - pos.x, 2) + Math.pow(playerPos.z - pos.z, 2)
        );
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestLocation = location;
        }
      }
      
      const faceoffPos = neutralPositions[closestLocation as keyof typeof neutralPositions];
      const validTeams = gameManager.getValidTeamsForReset();
      
      // Test the faceoff formation
      PlayerSpawnManager.instance.teleportPlayersToFaceoffFormation(
        validTeams, 
        gameManager['_playerIdToPlayer'], 
        faceoffPos
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player, 
        `Testing faceoff formation at ${closestLocation}: X=${faceoffPos.x}, Z=${faceoffPos.z}`, 
        '00FF00'
      );
      console.log(`[ChatCommand] Testing faceoff formation at ${closestLocation} by player:`, player.id);
    });

    // /offsideon - Show only offside detection logs
    this.world.chatManager.registerCommand('/offsideon', (player) => {
      // Set up offside-only log filter
      (console as any).originalLog = console.log;
      console.log = (...args: any[]) => {
        const message = args.join(' ');
        if (message.includes('OffsideDetectionService') || 
            message.includes('🔵') || 
            message.includes('🚨') || 
            message.includes('✅') || 
            message.includes('⚠️') || 
            message.includes('🔍') || 
            message.includes('📊') || 
            message.includes('⚪')) {
          (console as any).originalLog(...args);
        }
      };
      this.world!.chatManager.sendPlayerMessage(player, '🏒 Showing ONLY offside detection logs', '00FF00');
      console.log('[ChatCommand] Offside-only logging enabled by', player.id);
    });

    // /offsideoff - Show all logs again
    this.world.chatManager.registerCommand('/offsideoff', (player) => {
      // Restore original console.log
      if ((console as any).originalLog) {
        console.log = (console as any).originalLog;
        delete (console as any).originalLog;
      }
      this.world!.chatManager.sendPlayerMessage(player, '📝 Showing ALL logs again', '00FF00');
      console.log('[ChatCommand] Full logging restored by', player.id);
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
      const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
      if (playerEntities.length === 0) {
        this.world!.chatManager.sendPlayerMessage(player, 'No player entity found!', 'FF0000');
        return;
      }
      
      const controller = playerEntities[0].controller;
      if (!controller) {
        this.world!.chatManager.sendPlayerMessage(player, 'No controller found!', 'FF0000');
        return;
      }
      
      const isControllingPuck = (controller as any)._isControllingPuck || false;
      const isCollidingWithPuck = (controller as any)._isCollidingWithPuck || false;
      const stickCheckCooldown = (controller as any)._stickCheckCooldown || 0;
      
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
      allStats.forEach((stats: any) => {
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
          `Error getting node names: ${error instanceof Error ? error.message : String(error)}`, 
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

    // /audioon - Enable audio-only debug filter (shows only AudioManager logs)
    this.world.chatManager.registerCommand('/audioon', (player) => {
      const { setAudioDebugFilter } = require('../utils/constants');
      setAudioDebugFilter(true);
      this.world!.chatManager.sendPlayerMessage(player, '🎵 AUDIO DEBUG FILTER ENABLED', '00FF00');
      this.world!.chatManager.sendPlayerMessage(player, 'Only AudioManager logs will show in terminal', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, 'Use /audiooff to disable', 'CCCCCC');
    });

    // /audiooff - Disable audio-only debug filter (shows all logs)
    this.world.chatManager.registerCommand('/audiooff', (player) => {
      const { setAudioDebugFilter } = require('../utils/constants');
      setAudioDebugFilter(false);
      this.world!.chatManager.sendPlayerMessage(player, '🎵 AUDIO DEBUG FILTER DISABLED', 'FFFF00');
      this.world!.chatManager.sendPlayerMessage(player, 'All debug logs will show in terminal', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, 'Use /audioon to enable audio-only mode', 'CCCCCC');
    });

    // /offsideon - Enable offside-only debug filter (shows only OffsideDetectionService logs)
    this.world.chatManager.registerCommand('/offsideon', (player) => {
      const { setOffsideDebugFilter } = require('../utils/constants');
      setOffsideDebugFilter(true);
      this.world!.chatManager.sendPlayerMessage(player, '⚪ OFFSIDE DEBUG FILTER ENABLED', '00FF00');
      this.world!.chatManager.sendPlayerMessage(player, 'Only OffsideDetectionService logs will show in terminal', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, 'Use /offsideoff to disable', 'CCCCCC');
    });

    // /offsideoff - Disable offside-only debug filter (shows all logs)
    this.world.chatManager.registerCommand('/offsideoff', (player) => {
      const { setOffsideDebugFilter } = require('../utils/constants');
      setOffsideDebugFilter(false);
      this.world!.chatManager.sendPlayerMessage(player, '⚪ OFFSIDE DEBUG FILTER DISABLED', 'FFFF00');
      this.world!.chatManager.sendPlayerMessage(player, 'All debug logs will show in terminal', 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, 'Use /offsideon to enable offside-only mode', 'CCCCCC');
    });

    // /audioplayercount <number> - Manually set player count for scaling testing
    this.world.chatManager.registerCommand('/audioplayercount', (player, args) => {
      const count = parseInt(args[0]);
      if (isNaN(count) || count < 1 || count > 12) {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /audioplayercount <1-12>', 'FF0000');
        return;
      }
      
      const oldCount = AudioManager.instance.getPlayerCount();
      AudioManager.instance.updatePlayerCount(count);
      
      this.world!.chatManager.sendPlayerMessage(player, `Player count updated: ${oldCount} → ${count}`, '00FF00');
      this.world!.chatManager.sendPlayerMessage(player, `Max instances: ${(AudioManager.instance as any).getScaledMaxInstances()}`, 'FFFFFF');
      this.world!.chatManager.sendPlayerMessage(player, `Cleanup threshold: ${(AudioManager.instance as any).getScaledCleanupThreshold()}`, 'FFFFFF');
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
      this.world!.chatManager.sendPlayerMessage(player, '/audioon - Show ONLY AudioManager logs', '00FF00');
      this.world!.chatManager.sendPlayerMessage(player, '/audiooff - Show all debug logs', 'FFFF00');
      this.world!.chatManager.sendPlayerMessage(player, '/audioplayercount <1-12> - Set player count for testing', 'CCCCCC');
    });
    
    console.log('Audio debugging commands registered');
  }

  /**
   * Register puck control indicator test command
   */
  private registerPuckIndicatorTestCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/pucktest', (player) => {
      try {
        const playerEntities = this.world!.entityManager.getPlayerEntitiesByPlayer(player);
        if (playerEntities.length > 0) {
          const playerEntity = playerEntities[0];
          
          // Test if the SceneUI works by manually creating and loading it
          const { SceneUI } = require('hytopia');
          const testSceneUI = new SceneUI({
            templateId: 'puck-control-indicator',
            attachedToEntity: playerEntity,
            state: {
              visible: true,
              playerName: player.username
            },
            offset: { x: 0, y: 1.8, z: 0 },
          });
          testSceneUI.load(this.world!);
          
          this.world!.chatManager.sendPlayerMessage(
            player, 
            'Puck control indicator test applied to you!', 
            '00FF00'
          );
          
          // Clear it after 5 seconds
          setTimeout(() => {
            try {
              testSceneUI.unload();
              this.world!.chatManager.sendPlayerMessage(
                player, 
                'Puck control indicator test cleared!', 
                'FFFF00'
              );
            } catch (error) {
              console.error('[PuckTest] Error clearing test indicator:', error);
            }
          }, 5000);
          
        } else {
          this.world!.chatManager.sendPlayerMessage(
            player, 
            'No player entity found for testing!', 
            'FF0000'
          );
        }
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `Error testing puck indicator: ${error}`, 
          'FF0000'
        );
        console.error('[PuckTest] Error:', error);
      }
    });
  }

  /**
   * Register spawn position information command
   */
  private registerSpawnInfoCommand(): void {
    if (!this.world) return;
    
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
  }

  /**
   * Register debug stats command
   */
  private registerDebugStatsCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/debugstats', (player) => {
      const gameManager = HockeyGameManager.instance;
      const teamAndPos = gameManager.getTeamAndPosition(player);
      const { PlayerStatsManager } = require('./PlayerStatsManager');
      const { PersistentPlayerStatsManager } = require('./PersistentPlayerStatsManager');
      
      // Check team assignment
      if (teamAndPos) {
        this.world!.chatManager.sendPlayerMessage(
          player,
          `✅ Team: ${teamAndPos.team} ${teamAndPos.position}`,
          '00FF00'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, '❌ NOT assigned to team/position!', 'FF0000');
        this.world!.chatManager.sendPlayerMessage(player, 'Use team selection UI or /assignteam command first', 'FFAA00');
        return;
      }
      
      // Check if player is locked in
      const isLockedIn = gameManager.lockedIn.has(player.id);
      this.world!.chatManager.sendPlayerMessage(
        player,
        `${isLockedIn ? '✅' : '❌'} Locked in: ${isLockedIn}`,
        isLockedIn ? '00FF00' : 'FF0000'
      );
      
      // Check current game stats
      const currentStats = PlayerStatsManager.instance.getPlayerStats(player.id);
      if (currentStats) {
        this.world!.chatManager.sendPlayerMessage(
          player,
          `✅ Current stats: ${currentStats.goals}G ${currentStats.assists}A ${currentStats.saves}S`,
          '00FF00'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, '❌ No current game stats found!', 'FF0000');
      }
      
      // Check if player object is tracked for persistence
      const playerObj = PlayerStatsManager.instance.getPlayerObjectById(player.id);
      this.world!.chatManager.sendPlayerMessage(
        player,
        `${playerObj ? '✅' : '❌'} Player object tracked: ${!!playerObj}`,
        playerObj ? '00FF00' : 'FF0000'
      );
      
      console.log('[ChatCommand] Debug stats for player:', {
        id: player.id,
        username: player.username,
        teamAndPos,
        isLockedIn,
        hasCurrentStats: !!currentStats,
        hasPlayerObject: !!playerObj
      });
    });
  }

  /**
   * Register test persistence command
   */
  private registerTestPersistCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/testpersist', async (player) => {
      try {
        const { PersistentPlayerStatsManager } = require('./PersistentPlayerStatsManager');
        
        this.world!.chatManager.sendPlayerMessage(player, 'Testing persistence...', 'FFFF00');
        
        // Try to load persistent stats
        const stats = await PersistentPlayerStatsManager.instance.loadPlayerStats(player);
        
        this.world!.chatManager.sendPlayerMessage(
          player,
          `✅ Persistence working! Career: ${stats.goals}G ${stats.assists}A ${stats.saves}S ${stats.wins}W-${stats.losses}L`,
          '00FF00'
        );
        
        // Test saving
        await PersistentPlayerStatsManager.instance.updatePlayerStats(player, {
          goals: stats.goals + 1
        });
        
        const saved = await PersistentPlayerStatsManager.instance.savePlayerStats(player);
        this.world!.chatManager.sendPlayerMessage(
          player,
          `${saved ? '✅' : '❌'} Test save: ${saved ? 'SUCCESS' : 'FAILED'}`,
          saved ? '00FF00' : 'FF0000'
        );
        
        console.log('[ChatCommand] Persistence test completed for:', player.username, { stats, saved });
        
             } catch (error) {
         console.error('[ChatCommand] Persistence test error:', error);
         this.world!.chatManager.sendPlayerMessage(player, `❌ Persistence error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'FF0000');
       }
    });
  }

  /**
   * Register assign team command
   */
  private registerAssignTeamCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/assignteam', (player, args) => {
      const team = args[0]?.toUpperCase();
      const position = args[1]?.toUpperCase();
      
      if (!team || !position) {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /assignteam <RED|BLUE> <GOALIE|DEFENDER1|DEFENDER2|WINGER1|WINGER2|CENTER>', 'FFFF00');
        return;
      }
      
      if (team !== 'RED' && team !== 'BLUE') {
        this.world!.chatManager.sendPlayerMessage(player, 'Team must be RED or BLUE', 'FF0000');
        return;
      }
      
      const validPositions = ['GOALIE', 'DEFENDER1', 'DEFENDER2', 'WINGER1', 'WINGER2', 'CENTER'];
      if (!validPositions.includes(position)) {
        this.world!.chatManager.sendPlayerMessage(player, `Position must be one of: ${validPositions.join(', ')}`, 'FF0000');
        return;
      }
      
      const gameManager = HockeyGameManager.instance;
      const success = gameManager.assignPlayerToTeam(player, team as any, position as any);
      
      if (success) {
        // Lock the player in immediately
        gameManager.lockInPlayer(player);
        
        this.world!.chatManager.sendPlayerMessage(
          player,
          `✅ Assigned and locked in to ${team} ${position}`,
          team === 'RED' ? 'FF4444' : '44AAFF'
        );
      } else {
        this.world!.chatManager.sendPlayerMessage(player, '❌ Assignment failed - position may be taken', 'FF0000');
      }
      
      console.log('[ChatCommand] Team assignment:', { player: player.username, team, position, success });
    });
  }

  /**
   * Register test hit command
   */
  private registerTestHitCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/testhit', async (player) => {
      try {
        // Test hit recording
        await PlayerStatsManager.instance.recordHit(player.id);
        
        // Get current stats
        const stats = PlayerStatsManager.instance.getPlayerStats(player.id);
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `✅ Test hit recorded! You now have ${stats?.hits || 0} hits total. (Note: In-game hits only count when body-checking a puck-controlling player)`,
          '00FF00'
        );
        
        CONSTANTS.debugLog(`Test hit recorded for player ${player.id}`, 'ChatCommandManager');
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `❌ Error recording test hit: ${error}`,
          'FF0000'
        );
        console.error('Error in /testhit command:', error);
      }
    });
  }

  /**
   * Register test shot command
   */
  private registerTestShotCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/testshot', async (player) => {
      try {
        // Get team info
        const teamInfo = HockeyGameManager.instance.getTeamAndPosition(player.id);
        if (!teamInfo) {
          this.world!.chatManager.sendPlayerMessage(
            player, 
            `❌ You must be assigned to a team first! Use /assignteam`,
            'FF0000'
          );
          return;
        }
        
        // Test shot on goal recording
        await PlayerStatsManager.instance.recordShot(player.id, teamInfo.team, true, false);
        
        // Get current stats
        const stats = PlayerStatsManager.instance.getPlayerStats(player.id);
        
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `✅ Test shot recorded! You now have ${stats?.shotsOnGoal || 0} shots on goal total.`,
          '00FF00'
        );
        
        CONSTANTS.debugLog(`Test shot recorded for player ${player.id}`, 'ChatCommandManager');
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `❌ Error recording test shot: ${error}`,
          'FF0000'
        );
        console.error('Error in /testshot command:', error);
      }
    });
  }

  /**
   * Register test leaderboard command
   */
  private registerTestLeaderboardCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/testleaderboard', async (player) => {
      try {
        // Manually trigger a leaderboard request
        const PlayerManager = require('./PlayerManager').PlayerManager;
        if (PlayerManager.instance) {
          // Call the leaderboard handler directly
          const playerManager = PlayerManager.instance as any;
          await playerManager.handleLeaderboardRequest(player);
          
          this.world!.chatManager.sendPlayerMessage(
            player, 
            '✅ Leaderboard data sent! Check your stats overlay (press K, then click Leaderboard tab).',
            '00FF00'
          );
        } else {
          this.world!.chatManager.sendPlayerMessage(
            player, 
            '❌ PlayerManager not available',
            'FF0000'
          );
        }
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(
          player, 
          `❌ Error testing leaderboard: ${error}`,
          'FF0000'
        );
        console.error('Error in test leaderboard command:', error);
      }
    });
  }

  // /passdebug - Enable detailed pass sequence debugging
  private registerPassDebugCommand(): void {
    if (!this.world) return;
    
    this.world.chatManager.registerCommand('/passdebug', (player, args) => {
      const action = args[0]?.toLowerCase();
      
      if (action === 'on') {
        // Enable detailed pass debugging
        (console as any).passDebugEnabled = true;
        this.world!.chatManager.sendPlayerMessage(player, '🐛 Pass debugging enabled - console will show detailed pass logs', '00FF00');
        console.log('[ChatCommand] Pass debugging enabled by', player.id);
      } else if (action === 'off') {
        // Disable detailed pass debugging  
        (console as any).passDebugEnabled = false;
        this.world!.chatManager.sendPlayerMessage(player, '📴 Pass debugging disabled', 'FFAA00');
        console.log('[ChatCommand] Pass debugging disabled by', player.id);
      } else {
        this.world!.chatManager.sendPlayerMessage(player, 'Usage: /passdebug <on|off>', 'FFFF00');
        this.world!.chatManager.sendPlayerMessage(player, 'Current status: ' + ((console as any).passDebugEnabled ? 'ON' : 'OFF'), 'FFFFFF');
      }
    });
  }

  // /clearhistory - Clear puck touch history for testing
  private registerClearHistoryCommand(): void {
    if (!this.world) return;

    this.world.chatManager.registerCommand('/clearhistory', (player) => {
      if (!this.puck) {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck found!', 'FF0000');
        return;
      }

      try {
        const customProps = (this.puck as any).customProperties;
        if (customProps) {
          customProps.set('touchHistory', []);
          customProps.set('lastTouchedBy', '');
          this.world!.chatManager.sendPlayerMessage(player, '✅ Puck touch history cleared!', '00FF00');
          console.log('[ChatCommand] Puck touch history cleared by', player.id);
        } else {
          this.world!.chatManager.sendPlayerMessage(player, 'Puck has no custom properties!', 'FF0000');
        }
      } catch (error) {
        this.world!.chatManager.sendPlayerMessage(player, `Error clearing history: ${error}`, 'FF0000');
        console.error('Error clearing puck touch history:', error);
      }
    });
  }

  /**
   * Register puck boundary debugging commands
   */
  private registerPuckBoundaryCommands(): void {
    if (!this.world) return;
    
    // Command to check boundary service status
    this.world.chatManager.registerCommand('/boundaryinfo', (player) => {
      const service = PuckBoundaryService.instance;
      const limits = service.getBoundaryLimits();
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Boundary monitoring: ${service.isMonitoring ? 'ON' : 'OFF'}`,
        service.isMonitoring ? '00FF00' : 'FF0000'
      );
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Limits: X(${limits.X_MIN} to ${limits.X_MAX}) Z(${limits.Z_MIN} to ${limits.Z_MAX}) Y(${limits.Y_MIN} to ${limits.Y_MAX})`,
        '00FFFF'
      );
      
      if (service.monitoredPuck) {
        const pos = service.monitoredPuck.position;
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Puck position: X=${pos.x.toFixed(2)} Y=${pos.y.toFixed(2)} Z=${pos.z.toFixed(2)}`,
          '00FFFF'
        );
      }
    });
    
    // Command to test boundary violation (teleport puck out of bounds)
    this.world.chatManager.registerCommand('/testboundary', (player) => {
      if (!this.puck || !this.puck.isSpawned) {
        this.world!.chatManager.sendPlayerMessage(player, 'No puck spawned!', 'FF0000');
        return;
      }
      
      // Teleport puck outside boundary
      const testPosition = { x: 50, y: 2, z: 50 }; // Way outside bounds
      this.puck.setPosition(testPosition);
      this.puck.setLinearVelocity({ x: 0, y: 0, z: 0 });
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Puck teleported to out-of-bounds position: ${JSON.stringify(testPosition)}`,
        'FFA500'
      );
    });
    
    // Command to adjust boundary limits for testing
    this.world.chatManager.registerCommand('/setboundary', (player, args) => {
      if (args.length !== 2) {
        this.world!.chatManager.sendPlayerMessage(
          player,
          'Usage: /setboundary <dimension> <value> (e.g., /setboundary X_MAX 30)',
          'FF0000'
        );
        return;
      }
      
      const dimension = args[0].toUpperCase();
      const value = parseFloat(args[1]);
      
      if (isNaN(value)) {
        this.world!.chatManager.sendPlayerMessage(player, 'Invalid value!', 'FF0000');
        return;
      }
      
      const validDimensions = ['X_MIN', 'X_MAX', 'Z_MIN', 'Z_MAX', 'Y_MIN', 'Y_MAX'];
      if (!validDimensions.includes(dimension)) {
        this.world!.chatManager.sendPlayerMessage(
          player,
          `Invalid dimension! Use: ${validDimensions.join(', ')}`,
          'FF0000'
        );
        return;
      }
      
      const service = PuckBoundaryService.instance;
      service.updateBoundaryLimits({ [dimension]: value });
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        `Boundary ${dimension} set to ${value}`,
        '00FF00'
      );
    });
    
    // Command to reset boundary limits to defaults
    this.world.chatManager.registerCommand('/resetboundary', (player) => {
      const service = PuckBoundaryService.instance;
      service.updateBoundaryLimits({
        X_MIN: -26,
        X_MAX: 26,
        Z_MIN: -41,
        Z_MAX: 41,
        Y_MIN: 0.5,
        Y_MAX: 10,
      });
      
      this.world!.chatManager.sendPlayerMessage(
        player,
        'Boundary limits reset to defaults',
        '00FF00'
      );
    });
  }
}