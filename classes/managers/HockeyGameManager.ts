import { DefaultPlayerEntity, Entity, Player, World, } from 'hytopia';
import { 
  HockeyGameState, 
  HockeyTeam, 
  HockeyPosition 
} from '../utils/types';
import type { 
  TeamAssignment, 
  Teams 
} from '../utils/types';
import { PlayerSpawnManager } from './PlayerSpawnManager';

export class HockeyGameManager {
  private static _instance: HockeyGameManager;
  private _world: World | undefined;
  private _state: HockeyGameState = HockeyGameState.LOBBY;
  private _teams: Teams = {
    [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
    [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
  };
  private _scores: Record<HockeyTeam, number> = {
    [HockeyTeam.RED]: 0,
    [HockeyTeam.BLUE]: 0,
  };
  private _period: number = 1;
  private _periodTimeMs: number = 3 * 60 * 1000; // 3 minutes
  private _periodTimer: NodeJS.Timeout | undefined;
  private _lockedInPlayers: Set<string> = new Set();
  private _playerIdToPlayer: Map<string, Player> = new Map();
  
  // Removed movement lock system - was interfering with puck controls

  private constructor() {}

  public static get instance(): HockeyGameManager {
    if (!HockeyGameManager._instance) {
      HockeyGameManager._instance = new HockeyGameManager();
    }
    return HockeyGameManager._instance;
  }

  public setupGame(world: World) {
    this._world = world;
    this._state = HockeyGameState.LOBBY;
    this._teams = {
      [HockeyTeam.RED]: {} as Record<HockeyPosition, string>,
      [HockeyTeam.BLUE]: {} as Record<HockeyPosition, string>,
    };
    this._scores = {
      [HockeyTeam.RED]: 0,
      [HockeyTeam.BLUE]: 0,
    };
    this._period = 1;
    this._lockedInPlayers.clear();
    this._playerIdToPlayer.clear();
    // TODO: Announce lobby open, show team selection UI
  }

  public startTeamSelection() {
    if (this._state === HockeyGameState.TEAM_SELECTION) return;
    this._state = HockeyGameState.TEAM_SELECTION;
    // TODO: Show team/position selection UI
  }

  public startWaitingForPlayers() {
    if (this._state === HockeyGameState.WAITING_FOR_PLAYERS) return;
    this._state = HockeyGameState.WAITING_FOR_PLAYERS;
    // TODO: Wait for both teams to fill
  }

  public startMatch() {
    if (this._state === HockeyGameState.MATCH_START) return;
    this._state = HockeyGameState.MATCH_START;
    this._period = 1;
    this._scores = {
      RED: 0,
      BLUE: 0,
    };
    // TODO: Announce match start, countdown, then call startPeriod()
  }

  public startPeriod() {
    if (this._state === HockeyGameState.IN_PERIOD) return;
    this._state = HockeyGameState.IN_PERIOD;
    
    // Movement lock system removed - no longer needed
    
    // Update period and notify all players
    if (this._world) {
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'game-start'
          });
          player.ui.sendData({
            type: 'period-update',
            period: this._period
          });
        } catch (error) {
          console.error('Error sending period start to player:', error);
        }
      });
    }
    
    // Start period timer, reset puck/players
    this._periodTimer = setTimeout(() => this.endPeriod(), this._periodTimeMs);
  }

  public goalScored(team: HockeyTeam, puckEntity?: any, isOwnGoal: boolean = false) {
    if (this._state === HockeyGameState.GOAL_SCORED) return;
    this._scores[team]++;
    // DON'T lock movement yet - allow celebration time
    // this._state = HockeyGameState.GOAL_SCORED;
    
    // Notify all players of the score update
    if (this._world) {
      // Get all player IDs from teams and convert to Player objects
      const allPlayerIds = [
        ...Object.values(this._teams[HockeyTeam.RED]), 
        ...Object.values(this._teams[HockeyTeam.BLUE])
      ].filter(Boolean) as string[];
      
      const allPlayers = allPlayerIds
        .map(playerId => this._playerIdToPlayer.get(playerId))
        .filter(Boolean) as Player[];
      
      allPlayers.forEach((player) => {
        try {
          player.ui.sendData({
            type: 'score-update',
            redScore: this._scores[HockeyTeam.RED],
            blueScore: this._scores[HockeyTeam.BLUE]
          });
        } catch (error) {
          console.error('Error sending score update to player:', error);
        }
      });
      
      // Announce the goal
      const goalMessage = isOwnGoal 
        ? `OWN GOAL! ${team} team scores! Score is now RED ${this._scores[HockeyTeam.RED]} - BLUE ${this._scores[HockeyTeam.BLUE]}`
        : `GOAL! ${team} team scores! Score is now RED ${this._scores[HockeyTeam.RED]} - BLUE ${this._scores[HockeyTeam.BLUE]}`;
      
      this._world.chatManager.sendBroadcastMessage(
        goalMessage,
        team === HockeyTeam.RED ? 'FF4444' : '44AAFF'
      );
    }
    
    // Reset players and puck after goal celebration (no immediate movement lock)
    setTimeout(() => {
      console.log('[HockeyGameManager] Starting goal reset sequence...');
      
      // Lock movement IMMEDIATELY when reset starts
      this._state = HockeyGameState.GOAL_SCORED;
      console.log('[HockeyGameManager] Entered GOAL_SCORED state - players locked during reset and countdown');
      
      // Perform complete reset using PlayerSpawnManager
      PlayerSpawnManager.instance.performCompleteReset(
        this._teams,
        this._playerIdToPlayer,
        puckEntity
      );
      
      // Start countdown immediately after reset
      this.startResumeCountdown();
      
    }, 3000); // 3s celebration before reset
  }

  /**
   * Start countdown before resuming play after a goal
   */
  private startResumeCountdown(): void {
    if (!this._world) return;
    
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        this._world!.chatManager.sendBroadcastMessage(
          `Resuming play in ${countdown}...`,
          'FFFF00'
        );
        countdown--;
      } else {
        clearInterval(countdownInterval);
        
        this._state = HockeyGameState.IN_PERIOD;
        this._world!.chatManager.sendBroadcastMessage(
          'Play resumed!',
          '00FF00'
        );
        console.log('[HockeyGameManager] Play resumed after goal reset');
      }
    }, 1000);
  }

  public endPeriod() {
    if (this._period < 3) {
      if (this._state === HockeyGameState.PERIOD_END) return;
      this._state = HockeyGameState.PERIOD_END;
      this._period++;
      
      // Notify all players of the period change
      if (this._world) {
        // Get all player IDs from teams and convert to Player objects
        const allPlayerIds = [
          ...Object.values(this._teams[HockeyTeam.RED]), 
          ...Object.values(this._teams[HockeyTeam.BLUE])
        ].filter(Boolean) as string[];
        
        const allPlayers = allPlayerIds
          .map(playerId => this._playerIdToPlayer.get(playerId))
          .filter(Boolean) as Player[];
        
        allPlayers.forEach((player) => {
          try {
            player.ui.sendData({
              type: 'period-update',
              period: this._period
            });
          } catch (error) {
            console.error('Error sending period update to player:', error);
          }
        });
        
        // Announce period end
        this._world.chatManager.sendBroadcastMessage(
          `End of period ${this._period - 1}! Score: RED ${this._scores[HockeyTeam.RED]} - BLUE ${this._scores[HockeyTeam.BLUE]}`
        );
      }
      
      setTimeout(() => this.startPeriod(), 10000); // 10s break
    } else {
      this.endGame();
    }
  }

  public endGame() {
    if (this._state === HockeyGameState.GAME_OVER) return;
    this._state = HockeyGameState.GAME_OVER;
    
    // Announce winner
    if (this._world) {
      const redScore = this._scores[HockeyTeam.RED];
      const blueScore = this._scores[HockeyTeam.BLUE];
      const winner = redScore > blueScore ? 'RED' : blueScore > redScore ? 'BLUE' : 'TIED';
      const color = winner === 'RED' ? 'FF4444' : winner === 'BLUE' ? '44AAFF' : 'FFFFFF';
      
      this._world.chatManager.sendBroadcastMessage(
        `Game Over! ${winner === 'TIED' ? "It's a tie!" : `${winner} team wins!`} Final score: RED ${redScore} - BLUE ${blueScore}`,
        color
      );
    }
    
    setTimeout(() => this.setupGame(this._world!), 15000); // 15s to lobby
  }

  // --- Player/Team Management ---
  public assignPlayerToTeam(player: Player, team: HockeyTeam, position: HockeyPosition): boolean {
    // Prevent duplicate positions
    if (this._teams[team][position]) return false;
    this._teams[team][position] = player.id;
    this._playerIdToPlayer.set(player.id, player);
    console.log(`[HGM] assignPlayerToTeam: player.id=${player.id}, team=${team}, position=${position}`);
    console.log('[HGM] Teams after assignment:', JSON.stringify(this._teams));
    return true;
  }

  public removePlayer(player: Player) {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === player.id) {
          delete this._teams[team][pos];
        }
      }
    }
    this._lockedInPlayers.delete(player.id);
    this._playerIdToPlayer.delete(player.id);
  }

  public getTeamAndPosition(player: Player | string): { team: HockeyTeam, position: HockeyPosition } | undefined {
    const playerId = typeof player === 'string' ? player : player.id;
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        if (this._teams[team][pos] === playerId) {
          return { team, position: pos };
        }
      }
    }
    return undefined;
  }

  public getPlayerById(id: string): Player | undefined {
    return this._playerIdToPlayer.get(id);
  }

  // --- Utility ---
  public isAnyTeamHasPlayers(): boolean {
    return (
      Object.values(this._teams[HockeyTeam.RED]).some(Boolean) ||
      Object.values(this._teams[HockeyTeam.BLUE]).some(Boolean)
    );
  }

  public isTeamsFull(): boolean {
    // For solo/offline testing, allow if at least one player is present
    const redCount = Object.keys(this._teams[HockeyTeam.RED]).length;
    const blueCount = Object.keys(this._teams[HockeyTeam.BLUE]).length;
    const total = redCount + blueCount;
    if (total === 1) return true;
    return (redCount === 6 && blueCount === 6);
  }

  // Get starting positions for each team and position
  public getStartingPosition(team: HockeyTeam, position: HockeyPosition): { x: number, y: number, z: number } {
    // Example layout: customize as needed for your map
    const baseY = 5;
    const redBaseX = -20;
    const blueBaseX = 20;
    const centerZ = 0;
    const offsets: Record<HockeyPosition, { x: number, z: number }> = {
      [HockeyPosition.GOALIE]:    { x: 0, z: 0 },
      [HockeyPosition.DEFENDER1]: { x: 3, z: -5 },
      [HockeyPosition.DEFENDER2]: { x: 3, z: 5 },
      [HockeyPosition.WINGER1]:   { x: 10, z: -7 },
      [HockeyPosition.WINGER2]:   { x: 10, z: 7 },
      [HockeyPosition.CENTER]:    { x: 15, z: 0 },
    };
    const baseX = team === HockeyTeam.RED ? redBaseX : blueBaseX;
    const sign = team === HockeyTeam.RED ? 1 : -1;
    const offset = offsets[position];
    return {
      x: baseX + sign * offset.x,
      y: baseY,
      z: centerZ + offset.z,
    };
  }

  // Start match countdown, then move all players to starting positions and start period
  public async startMatchCountdown(world: World) {
    if (this._state === HockeyGameState.MATCH_START) return;
    this._state = HockeyGameState.MATCH_START;
    for (let i = 5; i > 0; i--) {
      world.chatManager.sendBroadcastMessage(`Match starting in ${i}...`);
      await new Promise(res => setTimeout(res, 1000));
    }
    world.chatManager.sendBroadcastMessage('Go!');
    // Move all players to their starting positions
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        const playerId = this._teams[team][pos];
        if (playerId) {
          const player = this._playerIdToPlayer.get(playerId);
          if (player) {
            // Move their entity if it exists
            const entities = world.entityManager.getPlayerEntitiesByPlayer(player);
            for (const entity of entities) {
              entity.setPosition(this.getStartingPosition(team, pos));
              entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
            }
          }
        }
      }
    }
    this.startPeriod();
  }

  // Mark a player as locked in
  public lockInPlayer(player: Player) {
    this._lockedInPlayers.add(player.id);
    this._playerIdToPlayer.set(player.id, player);
  }

  // Check if all positions are filled and all players are locked in
  public areAllPositionsLockedIn(): boolean {
    for (const team of [HockeyTeam.RED, HockeyTeam.BLUE]) {
      for (const pos of Object.values(HockeyPosition)) {
        const playerId = this._teams[team][pos];
        if (!playerId || !this._lockedInPlayers.has(playerId)) {
          return false;
        }
      }
    }
    return true;
  }

  // Add getters for teams and lockedIn
  public get teams(): Teams {
    return this._teams;
  }

  public get lockedIn(): Set<string> {
    return this._lockedInPlayers;
  }

  public get state(): HockeyGameState {
    return this._state;
  }

  // --- Movement Lock System Removed ---
  // The movement lock system was interfering with puck controls
  // Players will be able to move during goal reset countdowns
  // This is acceptable for Phase 1 implementation
} 