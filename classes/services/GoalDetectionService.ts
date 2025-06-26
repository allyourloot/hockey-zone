import { Entity, type Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyGameState } from '../utils/types';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { IceSkatingController } from '../controllers/IceSkatingController';
import * as CONSTANTS from '../utils/constants';

/**
 * Goal zone configuration for coordinate-based detection
 */
interface GoalZone {
  minX: number;
  maxX: number;
  goalLineZ: number;
  team: HockeyTeam;
  name: string;
}

/**
 * Service for detecting goals using coordinate-based position checking
 * This approach monitors puck position and detects when it crosses goal lines
 */
export class GoalDetectionService {
  private static _instance: GoalDetectionService;
  private _isActive: boolean = false;
  private _previousPuckPosition: Vector3Like | null = null;
  private _lastGoalTime: number = 0;
  private _goalCooldownMs: number = 2000; // 2 seconds between goals
  
  // Goal zones based on your measured coordinates
  private readonly GOAL_ZONES: Record<string, GoalZone> = {
    BLUE: {
      minX: -1.60,
      maxX: 1.60,
      goalLineZ: 31.26, // Average of front posts: (31.21 + 31.31) / 2
      team: HockeyTeam.BLUE,
      name: 'Blue Goal'
    },
    RED: {
      minX: -1.60,
      maxX: 1.60,
      goalLineZ: -31.285, // Average of front posts: (-31.29 + -31.28) / 2
      team: HockeyTeam.RED,
      name: 'Red Goal'
    }
  };

  private constructor() {}

  public static get instance(): GoalDetectionService {
    if (!GoalDetectionService._instance) {
      GoalDetectionService._instance = new GoalDetectionService();
    }
    return GoalDetectionService._instance;
  }

  /**
   * Start monitoring puck position for goal detection
   */
  public startMonitoring(): void {
    this._isActive = true;
    this._previousPuckPosition = null;
    this._lastGoalTime = 0;
    console.log('[GoalDetectionService] Started monitoring for goals');
  }

  /**
   * Stop monitoring puck position
   */
  public stopMonitoring(): void {
    this._isActive = false;
    this._previousPuckPosition = null;
    console.log('[GoalDetectionService] Stopped monitoring for goals');
  }

  /**
   * Check if the puck has scored a goal based on its current position
   * @param puckEntity - The puck entity to check
   * @returns Object with scoring team and own goal info, or null if no goal
   */
  public checkForGoal(puckEntity: Entity | null): { scoringTeam: HockeyTeam, isOwnGoal: boolean, lastTouchedBy?: string, primaryAssist?: string, secondaryAssist?: string } | null {
    // Early exit conditions
    if (!this._isActive || !puckEntity || !puckEntity.isSpawned) {
      return null;
    }

    // Only detect goals during active gameplay
    const gameManager = HockeyGameManager.instance;
    if (gameManager.state !== HockeyGameState.IN_PERIOD) {
      return null;
    }

    // Cooldown check to prevent spam
    const currentTime = Date.now();
    if (currentTime - this._lastGoalTime < this._goalCooldownMs) {
      return null;
    }

    const currentPosition = puckEntity.position;
    
    // Store position for next frame comparison
    const previousPosition = this._previousPuckPosition;
    this._previousPuckPosition = { ...currentPosition };

    // Need previous position to detect crossing
    if (!previousPosition) {
      return null;
    }

    // Detect if this is a teleportation (large distance change) and ignore it
    const distance = Math.sqrt(
      Math.pow(currentPosition.x - previousPosition.x, 2) + 
      Math.pow(currentPosition.z - previousPosition.z, 2)
    );
    
    // If puck moved more than 10 blocks in one frame, it's likely a teleport/reset
    if (distance > 10) {
      console.log(`[GoalDetectionService] Ignoring large movement (${distance.toFixed(2)} blocks) - likely teleport/reset`);
      return null;
    }

    // Check each goal zone for line crossing
    for (const zone of Object.values(this.GOAL_ZONES)) {
      const goalResult = this.checkGoalLineCrossing(previousPosition, currentPosition, zone, puckEntity);
      if (goalResult) {
        this._lastGoalTime = currentTime;
        console.log(`[GoalDetectionService] GOAL DETECTED! ${goalResult.scoringTeam} team scored in ${zone.name}${goalResult.isOwnGoal ? ' (OWN GOAL)' : ''}`);
        console.log(`[GoalDetectionService] Puck crossed from Z=${previousPosition.z.toFixed(2)} to Z=${currentPosition.z.toFixed(2)}`);
        console.log(`[GoalDetectionService] Puck X position: ${currentPosition.x.toFixed(2)} (goal width: ${zone.minX} to ${zone.maxX})`);
        return goalResult;
      }
    }

    return null;
  }

  /**
   * Check if the puck crossed a specific goal line
   * @param prevPos - Previous puck position
   * @param currPos - Current puck position
   * @param zone - Goal zone to check
   * @param puckEntity - The puck entity for checking last touched by
   * @returns Goal result with scoring team and own goal info, or null
   */
  private checkGoalLineCrossing(
    prevPos: Vector3Like, 
    currPos: Vector3Like, 
    zone: GoalZone,
    puckEntity: Entity
  ): { scoringTeam: HockeyTeam, isOwnGoal: boolean, lastTouchedBy?: string, primaryAssist?: string, secondaryAssist?: string } | null {
    
    // Check if puck is within goal width (X coordinate)
    if (currPos.x < zone.minX || currPos.x > zone.maxX) {
      return null;
    }

    // Check if puck is at reasonable height (ice level)
    if (currPos.y < 0.5 || currPos.y > 3.0) {
      return null;
    }

    // Check if puck crossed the goal line
    const crossedGoalLine = this.didCrossLine(prevPos.z, currPos.z, zone.goalLineZ);
    
    if (crossedGoalLine) {
      // Check if puck is currently being controlled by a player (carried into goal)
      const isControlledByPlayer = this.isPuckControlledByPlayer(puckEntity);
      if (isControlledByPlayer) {
        console.log(`[GoalDetectionService] Goal DENIED - puck is being carried by player (not a valid shot)`);
        return null; // Don't allow goals when puck is being carried into the goal
      }
      
      // Determine which team scored based on which goal was crossed
      let scoringTeam: HockeyTeam;
      if (zone.team === HockeyTeam.BLUE) {
        // Puck entered blue goal, red team scores
        scoringTeam = HockeyTeam.RED;
      } else {
        // Puck entered red goal, blue team scores
        scoringTeam = HockeyTeam.BLUE;
      }
      
      // Check if this was an own goal by examining last touched player
      const lastTouchedBy = this.getLastPlayerToTouchPuck(puckEntity);
      const isOwnGoal = this.isOwnGoal(lastTouchedBy, scoringTeam);
      
      // Get assist information from touch history
      const assistInfo = this.getAssistInfo(puckEntity, lastTouchedBy, scoringTeam, isOwnGoal);
      
      return {
        scoringTeam,
        isOwnGoal,
        lastTouchedBy,
        primaryAssist: assistInfo.primaryAssist,
        secondaryAssist: assistInfo.secondaryAssist
      };
    }

    return null;
  }

  /**
   * Check if a line was crossed between two Z positions
   * @param prevZ - Previous Z position
   * @param currZ - Current Z position  
   * @param lineZ - The line Z coordinate to check
   * @returns True if the line was crossed
   */
  private didCrossLine(prevZ: number, currZ: number, lineZ: number): boolean {
    // Check if we crossed the line in either direction
    return (prevZ <= lineZ && currZ >= lineZ) || (prevZ >= lineZ && currZ <= lineZ);
  }

  /**
   * Get debug information about current goal zones
   */
  public getDebugInfo(): any {
    return {
      isActive: this._isActive,
      goalZones: this.GOAL_ZONES,
      lastGoalTime: this._lastGoalTime,
      cooldownMs: this._goalCooldownMs
    };
  }

  /**
   * Force reset the service state (useful for testing)
   */
  public reset(): void {
    this._previousPuckPosition = null;
    this._lastGoalTime = 0;
    console.log('[GoalDetectionService] Service state reset');
  }

  /**
   * Check if the puck is currently being controlled/carried by a player
   */
  private isPuckControlledByPlayer(puckEntity: Entity): boolean {
    try {
      // Check if there's a global puck controller
      const globalController = IceSkatingController._globalPuckController;
      const isControlled = globalController !== null && globalController !== undefined;
      
      console.log(`[GoalDetectionService] isPuckControlledByPlayer: ${isControlled} (global controller: ${globalController ? 'exists' : 'none'})`);
      return isControlled;
    } catch (error) {
      console.warn('[GoalDetectionService] Could not check puck controller:', error);
      return false; // If we can't check, assume it's not controlled
    }
  }

  /**
   * Get the last player to touch the puck (from custom properties)
   */
  private getLastPlayerToTouchPuck(puckEntity: Entity): string | undefined {
    try {
      // Check if puck has custom property for last touched player
      const lastTouched = (puckEntity as any).customProperties?.get('lastTouchedBy') as string | undefined;
      console.log(`[GoalDetectionService] getLastPlayerToTouchPuck: ${lastTouched}`);
      return lastTouched;
    } catch (error) {
      console.warn('[GoalDetectionService] Could not get puck custom property:', error);
      return undefined;
    }
  }

  /**
   * Determine if this is an own goal based on last touched player and scoring team
   */
  private isOwnGoal(lastTouchedPlayerId: string | undefined, scoringTeam: HockeyTeam): boolean {
    if (!lastTouchedPlayerId) {
      console.log(`[GoalDetectionService] No last touched player - not an own goal`);
      return false; // Can't determine own goal without knowing who touched it
    }

    // Get player's team from HockeyGameManager
    const gameManager = HockeyGameManager.instance;
    const playerTeamInfo = gameManager.getTeamAndPosition(lastTouchedPlayerId);
    
    if (!playerTeamInfo) {
      console.log(`[GoalDetectionService] Player ${lastTouchedPlayerId} not found in teams - not an own goal`);
      return false; // Player not found in teams
    }

    // It's an own goal if the player who last touched the puck is on the OPPOSITE team from the one scoring
    // (i.e., they scored against their own team)
    const isOwnGoal = playerTeamInfo.team !== scoringTeam;
    console.log(`[GoalDetectionService] Own goal check: player ${lastTouchedPlayerId} (${playerTeamInfo.team}) vs scoring team (${scoringTeam}) = ${isOwnGoal ? 'OWN GOAL' : 'NORMAL GOAL'}`);
    return isOwnGoal;
  }

  /**
   * Get assist information from puck touch history
   */
  private getAssistInfo(puckEntity: Entity, scorerId: string | undefined, scoringTeam: HockeyTeam, isOwnGoal: boolean): { primaryAssist?: string, secondaryAssist?: string } {
    try {
      const customProps = (puckEntity as any).customProperties;
      if (!customProps || !scorerId) {
        return {};
      }

      const touchHistory = customProps.get('touchHistory') || [];
      console.log(`[GoalDetectionService] Touch history for assists: ${JSON.stringify(touchHistory)}`);

      if (touchHistory.length < 2) {
        console.log(`[GoalDetectionService] Not enough touch history for assists`);
        return {}; // Need at least 2 players (scorer + 1 assist)
      }

      const gameManager = HockeyGameManager.instance;
      const scorerTeamInfo = gameManager.getTeamAndPosition(scorerId);
      
      if (!scorerTeamInfo) {
        return {};
      }

      // For own goals, no assists are awarded
      if (isOwnGoal) {
        console.log(`[GoalDetectionService] Own goal - no assists awarded`);
        return {};
      }

      const assists: string[] = [];
      
      // Check each player in touch history (excluding the scorer who is at index 0)
      for (let i = 1; i < Math.min(touchHistory.length, 3); i++) {
        const playerId = touchHistory[i];
        const playerTeamInfo = gameManager.getTeamAndPosition(playerId);
        
        // Only award assists to players on the same team as the scorer
        if (playerTeamInfo && playerTeamInfo.team === scorerTeamInfo.team) {
          assists.push(playerId);
          console.log(`[GoalDetectionService] Assist awarded to ${playerId} (${playerTeamInfo.team} team)`);
        } else {
          console.log(`[GoalDetectionService] No assist for ${playerId} - different team or not found`);
        }
      }

      return {
        primaryAssist: assists[0],
        secondaryAssist: assists[1]
      };
    } catch (error) {
      console.warn('[GoalDetectionService] Could not get assist info:', error);
      return {};
    }
  }
} 