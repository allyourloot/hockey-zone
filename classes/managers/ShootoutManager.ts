import { Entity, Player, World, Audio } from 'hytopia';
import { 
  HockeyGameState, 
  HockeyTeam, 
  HockeyPosition,
  GameMode
} from '../utils/types';
import type { 
  ShootoutRound,
  ShootoutGameState
} from '../utils/types';
import { PlayerSpawnManager } from './PlayerSpawnManager';
import { AudioManager } from './AudioManager';
import { PlayerStatsManager } from './PlayerStatsManager';
import { HockeyGameManager } from './HockeyGameManager';
import { GoalDetectionService } from '../services/GoalDetectionService';
import * as CONSTANTS from '../utils/constants';

export class ShootoutManager {
  private static _instance: ShootoutManager;
  private _world: World | undefined;
  private _gameState: ShootoutGameState;
  private _playerIdToPlayer: Map<string, Player> = new Map();
  private _countdownTimer: NodeJS.Timeout | undefined;
  private _roundEndTimer: NodeJS.Timeout | undefined;
  private _gameEndTimer: NodeJS.Timeout | undefined;
  
  private constructor() {
    this._gameState = {
      currentRound: 1,
      totalRounds: 5,
      scores: {
        [HockeyTeam.RED]: 0,
        [HockeyTeam.BLUE]: 0,
      },
      rounds: [],
      isCountdownActive: false,
      countdownSeconds: 3,
    };
  }

  public static get instance(): ShootoutManager {
    if (!ShootoutManager._instance) {
      ShootoutManager._instance = new ShootoutManager();
    }
    return ShootoutManager._instance;
  }

  public initialize(world: World) {
    this._world = world;
    this.resetShootoutState();
  }

  public resetShootoutState() {
    this._gameState = {
      currentRound: 1,
      totalRounds: 5,
      scores: {
        [HockeyTeam.RED]: 0,
        [HockeyTeam.BLUE]: 0,
      },
      rounds: [],
      isCountdownActive: false,
      countdownSeconds: 3,
    };
    
    // Clear any existing timers
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = undefined;
    }
    if (this._roundEndTimer) {
      clearTimeout(this._roundEndTimer);
      this._roundEndTimer = undefined;
    }
    if (this._gameEndTimer) {
      clearTimeout(this._gameEndTimer);
      this._gameEndTimer = undefined;
    }
  }

  public startShootout(players: Player[]) {
    if (!this._world || players.length !== 2) {
      CONSTANTS.debugError('Shootout requires exactly 2 players', null, 'ShootoutManager');
      return;
    }

    // Reset state
    this.resetShootoutState();
    
    // Store player references
    this._playerIdToPlayer.clear();
    players.forEach(player => {
      this._playerIdToPlayer.set(player.id, player);
    });

    // Ensure goal detection is active for shootout mode
    GoalDetectionService.instance.startMonitoring();
    CONSTANTS.debugLog('🥅 Goal detection service activated for shootout mode', 'ShootoutManager');

    // Assign players (first player always starts as shooter in round 1)
    const [player1, player2] = players;
    
    // Start with Round 1, Shot 1: Player 1 shoots on Player 2
    this._gameState.currentShooter = player1.id;
    this._gameState.currentGoalie = player2.id;

    // Initialize first shot of first round
    this._gameState.rounds.push({
      roundNumber: 1,
      shotNumber: 1,
      shooterTeam: HockeyTeam.RED, // Player 1 is always RED for shot 1
      shooterPlayerId: player1.id,
      goalieTeam: HockeyTeam.BLUE, // Player 2 is always BLUE for shot 1
      goaliePlayerId: player2.id,
      scored: false,
      completed: false,
    });

    // Spawn players in correct positions
    this.spawnPlayersForRound();

    // Send initial shootout scoreboard to all players
    this.broadcastShootoutScoreboard();

    // Reset puck to center before first shot
    this.spawnPuckAtCenter();

    // Start unified countdown with proper message
    this.startShotCountdown();
  }

  private spawnPlayersForRound() {
    if (!this._world || !this._gameState.currentShooter || !this._gameState.currentGoalie) return;

    const shooterPlayer = this._playerIdToPlayer.get(this._gameState.currentShooter);
    const goaliePlayer = this._playerIdToPlayer.get(this._gameState.currentGoalie);

    if (!shooterPlayer || !goaliePlayer) return;

    // Get current shot info
    const currentShot = this._gameState.rounds[this._gameState.rounds.length - 1] as ShootoutRound;
    if (!currentShot) return;

    CONSTANTS.debugLog(`🔄 Spawning players for Round ${currentShot.roundNumber} Shot ${currentShot.shotNumber}: ${shooterPlayer.id} as ${currentShot.shooterTeam} CENTER, ${goaliePlayer.id} as ${currentShot.goalieTeam} GOALIE`, 'ShootoutManager');

    // Update team assignments in HockeyGameManager
    this.updateTeamAssignments(shooterPlayer, goaliePlayer, currentShot);

    // Use PlayerManager to properly respawn players with new team/position assignments
    this.respawnPlayerWithNewPosition(shooterPlayer, currentShot.shooterTeam, HockeyPosition.CENTER);
    this.respawnPlayerWithNewPosition(goaliePlayer, currentShot.goalieTeam, HockeyPosition.GOALIE);

    // Spawn puck at center ice
    this.spawnPuckAtCenter();
  }

  private updateTeamAssignments(shooterPlayer: Player, goaliePlayer: Player, currentShot: ShootoutRound) {
    // Clear previous team assignments
    const teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
    };

    // Set new team assignments with proper typing
    const shooterTeam = currentShot.shooterTeam as HockeyTeam;
    const goalieTeam = currentShot.goalieTeam as HockeyTeam;
    
    teams[shooterTeam][HockeyPosition.CENTER] = shooterPlayer.id;
    teams[goalieTeam][HockeyPosition.GOALIE] = goaliePlayer.id;

    // Update HockeyGameManager teams - need to access private property
    (HockeyGameManager.instance as any)._teams = teams;

    CONSTANTS.debugLog(`🔄 Updated team assignments: ${shooterPlayer.id} → ${shooterTeam} CENTER, ${goaliePlayer.id} → ${goalieTeam} GOALIE`, 'ShootoutManager');
  }

  private respawnPlayerWithNewPosition(player: Player, team: HockeyTeam, position: HockeyPosition) {
    // Use HockeyGameManager's PlayerManager callback to respawn player with new position
    const hockeyGameManager = HockeyGameManager.instance as any;
    if (hockeyGameManager._playerManagerCallback) {
      hockeyGameManager._playerManagerCallback('spawnPlayerForShootout', {
        player: player,
        team: team,
        position: position
      });
    }
  }

  private spawnPuckAtCenter() {
    if (!this._world) return;

    const puckPosition = { x: 0, y: 1.8, z: 1 };
    
    // Try multiple methods to find the puck
    let puck: any = null;
    
    // Method 1: Search by model URI
    const entitiesWithPuckModel = this._world.entityManager.getAllEntities().filter(e => 
      e.modelUri && e.modelUri.includes('puck')
    );
    
    if (entitiesWithPuckModel.length > 0) {
      puck = entitiesWithPuckModel[0];
      CONSTANTS.debugLog(`Found puck by model URI: ${puck.modelUri}`, 'ShootoutManager');
    } else {
      // Method 2: Search by name (various possible names)
      const possibleNames = ['Puck', 'puck', 'PUCK'];
      for (const name of possibleNames) {
        const foundPucks = this._world.entityManager.getAllEntities().filter(e => e.name === name);
        if (foundPucks.length > 0) {
          puck = foundPucks[0];
          CONSTANTS.debugLog(`Found puck by name: ${name}`, 'ShootoutManager');
          break;
        }
      }
    }
    
    // Method 3: Get all entities and find physics-enabled ones that could be pucks
    if (!puck) {
      const allEntities = this._world.entityManager.getAllEntities();
      for (const entity of allEntities) {
        if (entity.modelUri && (
          entity.modelUri.includes('puck') || 
          entity.modelUri.includes('projectile')
        )) {
          puck = entity;
          CONSTANTS.debugLog(`Found puck by projectile model: ${entity.modelUri}`, 'ShootoutManager');
          break;
        }
      }
    }
    
    if (puck && puck.isSpawned) {
      // Reset puck position and velocity
      puck.setPosition(puckPosition);
      puck.setLinearVelocity({ x: 0, y: 0, z: 0 });
      puck.setAngularVelocity({ x: 0, y: 0, z: 0 });
      
      // Clear any puck control
      if ((puck as any).customProperties) {
        try {
          (puck as any).customProperties.set('lastTouchedBy', null);
          (puck as any).customProperties.set('touchHistory', JSON.stringify([]));
        } catch (error) {
          CONSTANTS.debugLog(`Could not clear puck properties: ${error}`, 'ShootoutManager');
        }
      }
      
      CONSTANTS.debugLog(`✅ Moved puck to center for shootout: ${JSON.stringify(puckPosition)}`, 'ShootoutManager');
    } else {
      CONSTANTS.debugError('❌ No puck found to move to center', null, 'ShootoutManager');
      
      // Debug: List all entities to help troubleshoot
      const allEntities = this._world.entityManager.getAllEntities();
      CONSTANTS.debugLog(`🔍 Debug: Found ${allEntities.length} total entities:`, 'ShootoutManager');
      allEntities.forEach((entity, index) => {
        CONSTANTS.debugLog(`  ${index}: name="${entity.name}", modelUri="${entity.modelUri}", spawned=${entity.isSpawned}`, 'ShootoutManager');
      });
    }
  }

  private startShotCountdown() {
    if (!this._world) return;

    this._gameState.isCountdownActive = true;
    this._gameState.countdownSeconds = 3; // Changed from 5 to 3 seconds to match regulation mode

    const currentShot = this._gameState.rounds[this._gameState.rounds.length - 1];
    const shooterPlayer = this._playerIdToPlayer.get(currentShot.shooterPlayerId);
    const goaliePlayer = this._playerIdToPlayer.get(currentShot.goaliePlayerId);
    
    const shooterName = shooterPlayer?.username || 'Unknown';
    const goalieName = goaliePlayer?.username || 'Unknown';
    
    // Create descriptive countdown message
    const shotDesc = currentShot.shotNumber === 1 ? 'first shot' : 'second shot';
    const subtitle = `Round ${currentShot.roundNumber} ${shotDesc}`;

    // Use shootout-specific countdown events (separate from regulation mode)
    let countdown = this._gameState.countdownSeconds;
    
    // CRITICAL: Send initial shootout countdown event to show overlay with "3"
    this.broadcastToAllPlayers({
      type: 'shootout-countdown-start',
      countdown: countdown,
      subtitle: subtitle
    });
    
    // Play countdown sound immediately for the first number
    AudioManager.instance.playCountdownSound();
    
    CONSTANTS.debugLog(`🎯 Shootout countdown started: ${countdown} - ${subtitle}`, 'ShootoutManager');
    
    const countdownInterval = setInterval(() => {
      countdown--;
      
      if (countdown > 0) {
        // Send shootout countdown update for remaining numbers (2, 1)
        this.broadcastToAllPlayers({
          type: 'shootout-countdown-update',
          countdown: countdown,
          subtitle: subtitle
        });
        
        CONSTANTS.debugLog(`🎯 Shootout countdown: ${countdown}`, 'ShootoutManager');
      } else {
        // Countdown finished - use shootout-specific events
        clearInterval(countdownInterval);
        
        // Clear countdown state
        this._gameState.isCountdownActive = false;
        
        CONSTANTS.debugLog(`🎯 Shootout countdown finished, will show GO! after brief delay`, 'ShootoutManager');
        
        // Small delay to ensure "1" is fully processed before showing "GO!"
        setTimeout(() => {
          CONSTANTS.debugLog(`🎯 Broadcasting shootout-countdown-go event`, 'ShootoutManager');
          
          // Send shootout-specific "GO!" event
          this.broadcastToAllPlayers({
            type: 'shootout-countdown-go'
          });
          
          // Play referee whistle sound effect
          AudioManager.instance.playRefereeWhistle();
          
          // Start shot immediately when GO! appears
          this.startShot();
          
          // Hide GO! overlay after longer display time (2 seconds instead of 1)
          setTimeout(() => {
            CONSTANTS.debugLog(`🎯 Hiding shootout countdown overlay after GO! display`, 'ShootoutManager');
            this.broadcastToAllPlayers({
              type: 'shootout-countdown-end'
            });
          }, 2000); // Increased from 1000ms to 2000ms for better visibility
        }, 200); // Small delay to ensure "1" is processed before "GO!"
      }
    }, 1000); // 1 second intervals, same as regulation mode
  }

  private startShot() {
    if (!this._world) return;

    CONSTANTS.debugLog('🥅 Shot started - players can now move', 'ShootoutManager');

    // Broadcast shot start
    this.broadcastToAllPlayers({
      type: 'shootout-shot-start',
      round: this._gameState.currentRound,
      shooterName: this._playerIdToPlayer.get(this._gameState.currentShooter!)?.username || 'Unknown',
      goalieName: this._playerIdToPlayer.get(this._gameState.currentGoalie!)?.username || 'Unknown',
    });

    // Start shot timer (10 seconds max per shot to match frontend timer)
    this._roundEndTimer = setTimeout(() => {
      // Shot timed out without goal
      CONSTANTS.debugLog('🕐 Backend shot timer expired (10s) - ending shot', 'ShootoutManager');
      this.endCurrentShot(false);
    }, 10000);
  }

  public shotAttempted(scored: boolean, scorerId?: string) {
    if (!this._gameState.isCountdownActive) {
      this.endCurrentShot(scored, scorerId);
    }
  }

  private endCurrentShot(scored: boolean, scorerId?: string) {
    if (!this._world) return;

    // Get current shot and check if already completed (prevent duplicate processing)
    const currentShot = this._gameState.rounds[this._gameState.rounds.length - 1];
    if (!currentShot || currentShot.completed) {
      CONSTANTS.debugLog(`🚫 Shot already completed or no current shot - ignoring duplicate end call`, 'ShootoutManager');
      return;
    }

    CONSTANTS.debugLog(`🎯 Ending shot: Round ${currentShot.roundNumber} Shot ${currentShot.shotNumber} - Scored: ${scored}`, 'ShootoutManager');

    // Clear round timer
    if (this._roundEndTimer) {
      clearTimeout(this._roundEndTimer);
      this._roundEndTimer = undefined;
    }

    // Update current shot
    currentShot.scored = scored;
    currentShot.completed = true;
    
    // Update score
    if (scored) {
      this._gameState.scores[currentShot.shooterTeam]++;
    }

    // Update and broadcast scoreboard with new results
    this.broadcastShootoutScoreboard();

    // Broadcast shot result
    this.broadcastToAllPlayers({
      type: 'shootout-shot-end',
      round: currentShot.roundNumber,
      shotNumber: currentShot.shotNumber,
      scored: scored,
      scorerName: scored ? (this._playerIdToPlayer.get(scorerId || this._gameState.currentShooter!)?.username || 'Unknown') : undefined,
      redScore: this._gameState.scores[HockeyTeam.RED],
      blueScore: this._gameState.scores[HockeyTeam.BLUE],
    });

    // Determine wait time based on whether goal was scored
    const waitTime = scored ? 6000 : 3000; // 6s for goal celebration, 3s for miss
    
    CONSTANTS.debugLog(`Shot completed - waiting ${waitTime}ms before ${scored ? 'goal celebration ends' : 'continuing'}`, 'ShootoutManager');

    // Wait before next shot or round
    this._gameEndTimer = setTimeout(() => {
      this.prepareNextShot(scored);
    }, waitTime);
  }

  private prepareNextShot(wasGoal: boolean = false) {
    if (!this._world) return;

    const currentShot = this._gameState.rounds[this._gameState.rounds.length - 1];
    const currentShotNumber = currentShot.shotNumber;
    const currentRoundNumber = currentShot.roundNumber;
    
    CONSTANTS.debugLog(`📊 SHOT PROGRESSION: Just completed Round ${currentRoundNumber} Shot ${currentShotNumber}`, 'ShootoutManager');
    
    // Determine next shot details
    const [player1, player2] = Array.from(this._playerIdToPlayer.values());
    let nextRoundNumber, nextShotNumber, nextShooter, nextGoalie, nextShooterTeam, nextGoalieTeam;

    if (currentShotNumber === 1) {
      // First shot just completed, now do second shot of same round
      nextRoundNumber = currentRoundNumber;
      nextShotNumber = 2;
      nextShooter = player2.id;
      nextGoalie = player1.id;
      nextShooterTeam = HockeyTeam.BLUE;
      nextGoalieTeam = HockeyTeam.RED;
      
      CONSTANTS.debugLog(`📊 NEXT: Round ${nextRoundNumber} Shot ${nextShotNumber} - Player 2 shoots`, 'ShootoutManager');
    } else {
      // Second shot just completed, move to next round
      nextRoundNumber = currentRoundNumber + 1;
      nextShotNumber = 1;
      nextShooter = player1.id;
      nextGoalie = player2.id;
      nextShooterTeam = HockeyTeam.RED;
      nextGoalieTeam = HockeyTeam.BLUE;
      
      // Check if shootout is done
      if (nextRoundNumber > this._gameState.totalRounds) {
        CONSTANTS.debugLog(`📊 SHOOTOUT COMPLETE: All ${this._gameState.totalRounds} rounds finished`, 'ShootoutManager');
        this.endShootout();
        return;
      }
      
      // Update current round
      this._gameState.currentRound = nextRoundNumber;
      CONSTANTS.debugLog(`📊 NEXT: Round ${nextRoundNumber} Shot ${nextShotNumber} - Player 1 shoots (new round)`, 'ShootoutManager');
    }

    // Update current shooter/goalie
    this._gameState.currentShooter = nextShooter;
    this._gameState.currentGoalie = nextGoalie;

    // Add next shot
    this._gameState.rounds.push({
      roundNumber: nextRoundNumber,
      shotNumber: nextShotNumber,
      shooterTeam: nextShooterTeam,
      shooterPlayerId: nextShooter,
      goalieTeam: nextGoalieTeam,
      goaliePlayerId: nextGoalie,
      scored: false,
      completed: false,
    });

    // Spawn players for next shot
    this.spawnPlayersForRound();

    // CRITICAL: Immediately lock player movement after respawning to prevent movement during transition
    this.broadcastToAllPlayers({
      type: 'shootout-transition-lock',
      message: 'Preparing for next shot...'
    });

    // Update scoreboard
    this.broadcastShootoutScoreboard();

    // Reset puck to center
    this.spawnPuckAtCenter();

    // Start countdown immediately after goal celebration ends or miss timeout
    this.startShotCountdown();
  }

  private endShootout() {
    if (!this._world) return;

    // Get player names and calculate their individual scores
    const players = Array.from(this._playerIdToPlayer.values());
    const player1 = players[0];
    const player2 = players[1];

    if (!player1 || !player2) return;

    // Calculate individual scores by counting goals when each player was the shooter
    let player1Goals = 0;
    let player2Goals = 0;

    for (const shot of this._gameState.rounds) {
      if (shot.completed && shot.scored) {
        if (shot.shooterPlayerId === player1.id) {
          player1Goals++;
        } else if (shot.shooterPlayerId === player2.id) {
          player2Goals++;
        }
      }
    }

    // Determine winner based on individual scores
    let winner: string | null = null;
    let winnerName: string | null = null;
    
    if (player1Goals > player2Goals) {
      winner = player1.id;
      winnerName = player1.username || 'Player 1';
    } else if (player2Goals > player1Goals) {
      winner = player2.id;
      winnerName = player2.username || 'Player 2';
    }

    // Broadcast game end
    this.broadcastToAllPlayers({
      type: 'shootout-game-end',
      winner: winner,
      winnerName: winnerName,
      player1: {
        id: player1.id,
        name: player1.username || 'Player 1',
        goals: player1Goals
      },
      player2: {
        id: player2.id,
        name: player2.username || 'Player 2',
        goals: player2Goals
      },
      finalScore: `${player1Goals}-${player2Goals}`,
      rounds: this._gameState.rounds,
    });

    CONSTANTS.debugLog(`🏆 Shootout ended: ${player1.username || 'Player 1'} ${player1Goals}-${player2Goals} ${player2.username || 'Player 2'}${winner ? ` - Winner: ${winnerName}` : ' - TIE'}`, 'ShootoutManager');

    // Frontend will handle the return to game mode selection after countdown
    // Clear any existing timer to avoid conflicts
    if (this._gameEndTimer) {
      clearTimeout(this._gameEndTimer);
      this._gameEndTimer = undefined;
    }
  }

  public returnToGameModeSelection() {
    if (!this._world) return;

    // Hide shootout scoreboard
    this.broadcastToAllPlayers({
      type: 'hide-shootout-scoreboard',
    });

    // Get all players before clearing
    const playersToReset = Array.from(this._playerIdToPlayer.values());
    
    // Show game mode selection overlay to all players BEFORE despawning them
    this.broadcastToAllPlayers({
      type: 'game-mode-selection-start'
    });

    // Small delay to ensure UI message is received before despawning
    setTimeout(() => {
      // Despawn all player entities
      playersToReset.forEach(player => {
        try {
          if (this._world) {
            this._world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => {
              entity.despawn();
              CONSTANTS.debugLog(`Despawned entity for player ${player.id} from shootout`, 'ShootoutManager');
            });
          }
        } catch (error) {
          CONSTANTS.debugError(`Error despawning player ${player.id}:`, error, 'ShootoutManager');
        }
      });

      // Reset shootout state
      this.resetShootoutState();

      // Import and use HockeyGameManager to return to game mode selection
      const { HockeyGameManager } = require('./HockeyGameManager');
      
      // Clear players from HockeyGameManager shootout registration
      playersToReset.forEach(player => {
        HockeyGameManager.instance.removePlayer(player);
      });
      
      // Start game mode selection
      HockeyGameManager.instance.startGameModeSelection();

      CONSTANTS.debugLog('🎮 Returned to game mode selection from shootout', 'ShootoutManager');
    }, 500); // 500ms delay to ensure UI message is processed
  }

  private broadcastShootoutScoreboard() {
    if (!this._world) return;

    // Get player names
    const players = Array.from(this._playerIdToPlayer.values());
    const player1 = players[0];
    const player2 = players[1];

    if (!player1 || !player2) return;

    // Build score arrays for each player - track their shot attempts
    const player1Attempts: (boolean | null)[] = [];
    const player2Attempts: (boolean | null)[] = [];

    // Process completed shots to build score arrays
    for (const shot of this._gameState.rounds) {
      if (shot.completed) {
        if (shot.shooterPlayerId === player1.id) {
          player1Attempts.push(shot.scored);
        } else if (shot.shooterPlayerId === player2.id) {
          player2Attempts.push(shot.scored);
        }
      }
    }

    // Each player gets exactly 5 attempts total - use null for shots not taken yet
    while (player1Attempts.length < 5) player1Attempts.push(null);
    while (player2Attempts.length < 5) player2Attempts.push(null);

    // Calculate total scores - only count actual goals (true values, not null)
    const player1Goals = player1Attempts.filter(scored => scored === true).length;
    const player2Goals = player2Attempts.filter(scored => scored === true).length;

    const scoreboardData = {
      type: 'shootout-scoreboard',
      player1: {
        name: player1.username || 'Player 1',
        scores: player1Attempts.slice(0, 5), // Exactly 5 attempts
        totalScore: player1Goals
      },
      player2: {
        name: player2.username || 'Player 2', 
        scores: player2Attempts.slice(0, 5), // Exactly 5 attempts
        totalScore: player2Goals
      },
      currentRound: this._gameState.currentRound,
      isActive: true
    };

    this.broadcastToAllPlayers(scoreboardData);
    CONSTANTS.debugLog(`📊 Broadcasted shootout scoreboard: ${scoreboardData.player1.name} ${scoreboardData.player1.totalScore}-${scoreboardData.player2.totalScore} ${scoreboardData.player2.name}`, 'ShootoutManager');
  }

  private broadcastToAllPlayers(data: any) {
    if (!this._world) return;

    this._playerIdToPlayer.forEach((player) => {
      try {
        player.ui.sendData(data);
      } catch (error) {
        CONSTANTS.debugError('Error broadcasting to player in shootout:', error, 'ShootoutManager');
      }
    });
  }

  public getGameState(): ShootoutGameState {
    return { ...this._gameState };
  }

  public isShootoutActive(): boolean {
    return this._gameState.rounds.length > 0;
  }

  public getCurrentRound(): number {
    return this._gameState.currentRound;
  }

  public getScores(): Record<HockeyTeam, number> {
    return { ...this._gameState.scores };
  }

  public isCountdownActive(): boolean {
    return this._gameState.isCountdownActive;
  }
} 