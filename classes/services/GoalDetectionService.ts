import { Entity, type Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyGameState } from '../utils/types';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { IceSkatingController } from '../controllers/IceSkatingController';
import { OffsideDetectionService } from './OffsideDetectionService';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

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
  private _goalCooldownMs: number = 8000; // 8 seconds between goals to prevent puck bouncing in net from triggering multiple goals
  
  // Prevent goal detection immediately after offside is called
  private _offsideJustCalled: boolean = false;
  private _offsideCallTime: number = 0;
  private _offsideBlockDurationMs: number = 2000; // Block goals for 2 seconds after offside
  
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
    debugLog('Started monitoring for goals', 'GoalDetectionService');
  }

  /**
   * Stop monitoring puck position
   */
  public stopMonitoring(): void {
    this._isActive = false;
    this._previousPuckPosition = null;
    debugLog('Stopped monitoring for goals', 'GoalDetectionService');
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
    if (gameManager.state !== HockeyGameState.IN_PERIOD && gameManager.state !== HockeyGameState.SHOOTOUT_IN_PROGRESS) {
      return null;
    }
    
    // Cooldown check to prevent spam
    const currentTime = Date.now();
    if (currentTime - this._lastGoalTime < this._goalCooldownMs) {
      return null;
    }

    // CRITICAL: Block goal detection if offside was just called (prevents dual overlays)
    if (this._offsideJustCalled) {
      const timeSinceOffside = currentTime - this._offsideCallTime;
      if (timeSinceOffside < this._offsideBlockDurationMs) {
        // Still within block period
        return null;
      } else {
        // Block period expired, clear the flag
        this._offsideJustCalled = false;
        debugLog(`Offside block period expired after ${timeSinceOffside}ms - goal detection re-enabled`, 'GoalDetectionService');
      }
    }

    const puckPosition = puckEntity.position;
    
    // Store position for next frame comparison
    const previousPosition = this._previousPuckPosition;
    this._previousPuckPosition = { ...puckPosition };

    // Need previous position to detect crossing
    if (!previousPosition) {
      return null;
    }

    // Detect if this is a teleportation (large distance change) and ignore it
    const distance = Math.sqrt(
      Math.pow(puckPosition.x - previousPosition.x, 2) + 
      Math.pow(puckPosition.z - previousPosition.z, 2)
    );
    
    // If puck moved more than 10 blocks in one frame, it's likely a teleport/reset
    if (distance > 10) {
      debugLog(`Ignoring large movement (${distance.toFixed(2)} blocks) - likely teleport/reset`, 'GoalDetectionService');
      return null;
    }

    // RECENT OFFSIDE CHECK: Only check if offside was recently called to prevent dual overlays
    // Don't check delayed tracking here - let OffsideDetectionService handle proximity during normal gameplay
    const hasRecentOffside = this.checkForRecentOffsideCall();
    if (hasRecentOffside) {
      debugLog(`GOAL BLOCKED - Recent offside call prevents goal`, 'GoalDetectionService');
      return null; // Block goal detection if offside was recently called
    }

    // Check each goal zone for line crossing
    for (const zone of Object.values(this.GOAL_ZONES)) {
      const goalResult = this.checkGoalLineCrossing(previousPosition, puckPosition, zone, puckEntity);
      if (goalResult) {
        this._lastGoalTime = currentTime;
        debugLog(`GOAL DETECTED! ${goalResult.scoringTeam} team scored in ${zone.name}${goalResult.isOwnGoal ? ' (OWN GOAL)' : ''}`, 'GoalDetectionService');
        debugLog(`Puck crossed from Z=${previousPosition.z.toFixed(2)} to Z=${puckPosition.z.toFixed(2)}`, 'GoalDetectionService');
        debugLog(`Puck X position: ${puckPosition.x.toFixed(2)} (goal width: ${zone.minX} to ${zone.maxX})`, 'GoalDetectionService');
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
      // DELAYED OFFSIDE CHECK: Only check for delayed violations during actual goal attempts
      // This preserves the delayed offside proximity system during normal gameplay
      const hasDelayedOffsideViolation = this.checkForActiveOffsideViolation(puckEntity);
      if (hasDelayedOffsideViolation) {
        debugLog(`GOAL BLOCKED - Delayed offside violation detected during goal attempt`, 'GoalDetectionService');
        return null; // Block goal completely if delayed offside violation exists
      }
      
      // Check if puck is currently being controlled by a player (carried into goal)
      const isControlledByPlayer = this.isPuckControlledByPlayer(puckEntity);
      if (isControlledByPlayer) {
        debugLog(`Goal DENIED - puck is being carried by player (not a valid shot)`, 'GoalDetectionService');
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
    this._offsideJustCalled = false;
    this._offsideCallTime = 0;
    debugLog('Service state reset', 'GoalDetectionService');
  }

  /**
   * Check if the puck is currently being controlled/carried by a player
   */
  private isPuckControlledByPlayer(puckEntity: Entity): boolean {
    try {
      // Check if there's a global puck controller
      const globalController = IceSkatingController._globalPuckController;
      const isControlled = globalController !== null && globalController !== undefined;
      
      debugLog(`isPuckControlledByPlayer: ${isControlled} (global controller: ${globalController ? 'exists' : 'none'})`, 'GoalDetectionService');
      return isControlled;
    } catch (error) {
      debugWarn('Could not check puck controller:', 'GoalDetectionService');
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
      debugLog(`getLastPlayerToTouchPuck: ${lastTouched}`, 'GoalDetectionService');
      return lastTouched;
    } catch (error) {
      debugWarn('Could not get puck custom property:', 'GoalDetectionService');
      return undefined;
    }
  }

  /**
   * Determine if this is an own goal based on last touched player and scoring team
   */
  private isOwnGoal(lastTouchedPlayerId: string | undefined, scoringTeam: HockeyTeam): boolean {
    if (!lastTouchedPlayerId) {
      debugLog(`No last touched player - not an own goal`, 'GoalDetectionService');
      return false; // Can't determine own goal without knowing who touched it
    }

    // Get player's team from HockeyGameManager
    const gameManager = HockeyGameManager.instance;
    const playerTeamInfo = gameManager.getTeamAndPosition(lastTouchedPlayerId);
    
    if (!playerTeamInfo) {
      debugLog(`Player ${lastTouchedPlayerId} not found in teams - not an own goal`, 'GoalDetectionService');
      return false; // Player not found in teams
    }

    // It's an own goal if the player who last touched the puck is on the OPPOSITE team from the one scoring
    // (i.e., they scored against their own team)
    const isOwnGoal = playerTeamInfo.team !== scoringTeam;
    debugLog(`Own goal check: player ${lastTouchedPlayerId} (${playerTeamInfo.team}) vs scoring team (${scoringTeam}) = ${isOwnGoal ? 'OWN GOAL' : 'NORMAL GOAL'}`, 'GoalDetectionService');
    return isOwnGoal;
  }

  /**
   * Check if an offside was recently called (to prevent dual overlays)
   * @returns true if offside was recently called, false otherwise
   */
  private checkForRecentOffsideCall(): boolean {
    // Check if an offside was recently called (within last 3 seconds)
    // This catches cases where offside was called during blue line crossing but goal still attempted
    const gameManager = HockeyGameManager.instance;
    const timeSinceLastOffside = Date.now() - gameManager['_lastOffsideCallTime'];
    if (timeSinceLastOffside < 3000) { // 3 seconds
      debugLog(`🚫 GOAL BLOCKED - Offside was recently called ${timeSinceLastOffside}ms ago`, 'GoalDetectionService');
      
      // Set our own blocking flag to prevent dual overlays
      this._offsideJustCalled = true;
      this._offsideCallTime = Date.now();
      
      return true;
    }
    
    return false;
  }

  /**
   * Check for any delayed offside violations that would invalidate a goal
   * This checks the existing delayed offside tracking state and should ONLY be called
   * during actual goal line crossings to preserve delayed offside proximity gameplay
   * @param puckEntity - The puck entity
   * @returns true if there's a delayed offside violation, false otherwise
   */
  private checkForActiveOffsideViolation(puckEntity: Entity): boolean {
    try {
      const currentPosition = puckEntity.position;
      
      // Use the OffsideDetectionService to check for existing delayed offside violations
      const offsideDetectionService = OffsideDetectionService.instance;
      const delayedViolation = offsideDetectionService.checkForDelayedOffsideViolation(currentPosition);
      
      if (delayedViolation) {
        debugLog(`🚨 DELAYED OFFSIDE VIOLATION: ${delayedViolation.violatingTeam} team, ${delayedViolation.violatingPlayerIds.length} players involved`, 'GoalDetectionService');
        debugLog(`Players: ${delayedViolation.violatingPlayerIds.join(', ')}`, 'GoalDetectionService');
        debugLog(`BLOCKING GOAL and triggering offside immediately`, 'GoalDetectionService');
        
        // CRITICAL: Set flag to prevent goal detection for the next few seconds
        // This prevents dual overlays if goal detection is called again before offside overlay completes
        this._offsideJustCalled = true;
        this._offsideCallTime = Date.now();
        debugLog(`🚫 GOAL DETECTION BLOCKED for ${this._offsideBlockDurationMs}ms to prevent dual overlays`, 'GoalDetectionService');
        
        // CRITICAL: Clear the delayed tracking state AFTER we've used it to prevent repeated calls
        // This must happen before calling offsideCalled to prevent infinite loops
        offsideDetectionService.clearDelayedTrackingState();
        
        // Get the game manager to trigger the offside call
        const gameManager = HockeyGameManager.instance;
        gameManager.offsideCalled(delayedViolation);
        
        return true; // Block goal detection completely
      }
      
      // Only log occasionally to reduce spam
      if (Math.random() < 0.01) { // 1% chance to log
        debugLog(`✅ No delayed offside violations found - goal can proceed`, 'GoalDetectionService');
      }
      return false;
    } catch (error) {
      debugWarn('Error checking for delayed offside violation:', 'GoalDetectionService');
      return false; // If we can't check, don't block the goal
    }
  }

  /**
   * Get assist information from puck touch history
   */
  private getAssistInfo(puckEntity: Entity, scorerId: string | undefined, scoringTeam: HockeyTeam, isOwnGoal: boolean): { primaryAssist?: string, secondaryAssist?: string } {
    try {
      const customProps = (puckEntity as any).customProperties;
      if (!customProps || !scorerId) {
        debugLog(`getAssistInfo early return: customProps=${!!customProps}, scorerId=${scorerId}`, 'GoalDetectionService');
        return {};
      }

      const touchHistory = customProps.get('touchHistory') || [];
      debugLog(`Touch history for assists: ${JSON.stringify(touchHistory)}`, 'GoalDetectionService');
      debugLog(`Scorer: ${scorerId}, Team: ${scoringTeam}, OwnGoal: ${isOwnGoal}`, 'GoalDetectionService');

      // For own goals, no assists are awarded
      if (isOwnGoal) {
        debugLog(`Own goal - no assists awarded`, 'GoalDetectionService');
        return {};
      }

      const gameManager = HockeyGameManager.instance;
      const scorerTeamInfo = gameManager.getTeamAndPosition(scorerId);
      
      if (!scorerTeamInfo) {
        debugLog(`Scorer ${scorerId} not found in teams - no assists`, 'GoalDetectionService');
        return {};
      }

      debugLog(`Scorer team info: ${JSON.stringify(scorerTeamInfo)}`, 'GoalDetectionService');

      const assists: string[] = [];
      const currentTime = Date.now();
      
      // Filter recent touches (within 45 seconds) and check for meaningful assists  
      const recentTouches = touchHistory.filter((touch: any) => {
        const timeDiff = currentTime - touch.timestamp;
        return timeDiff < 45000; // 45 seconds - much more generous window for hockey assists
      });
      
      debugLog(`Recent touches (last 45s): ${JSON.stringify(recentTouches.map((t: any) => `${t.playerId}@${new Date(t.timestamp).toLocaleTimeString()}`))}`, 'GoalDetectionService');
      debugLog(`Processing ${recentTouches.length} recent touches for assists...`, 'GoalDetectionService');
      
      // FIXED: Allow assists even if there's only 1 recent touch (the scorer)
      // Look through all recent touches to find potential assists
      for (let i = 0; i < recentTouches.length && assists.length < 2; i++) {
        const touch = recentTouches[i];
        const touchPlayerId = touch.playerId;
        const touchPlayerTeamInfo = gameManager.getTeamAndPosition(touchPlayerId);
        const timeSinceTouch = currentTime - touch.timestamp;
        
        debugLog(`Touch ${i}: ${touchPlayerId}, ${timeSinceTouch}ms ago`, 'GoalDetectionService');
        
        // Skip if this is the scorer themselves
        if (touchPlayerId === scorerId) {
          debugLog(`Skipping touch ${i}: is scorer`, 'GoalDetectionService');
          continue;
        }
        
        // Skip if player is not on the same team as scorer
        if (!touchPlayerTeamInfo || touchPlayerTeamInfo.team !== scorerTeamInfo.team) {
          debugLog(`Skipping touch ${i}: wrong team (${touchPlayerTeamInfo?.team} vs ${scorerTeamInfo.team})`, 'GoalDetectionService');
          continue;
        }
        
        // Skip if player is already in assists list
        if (assists.includes(touchPlayerId)) {
          debugLog(`Skipping touch ${i}: already in assists list`, 'GoalDetectionService');
          continue;
        }
        
        // Check timing - primary assist gets 30 seconds, secondary gets 45 seconds (very generous timing for hockey)
        const maxTime = assists.length === 0 ? 30000 : 45000;
        if (timeSinceTouch > maxTime) {
          debugLog(`Skipping touch ${i}: too old (${timeSinceTouch}ms > ${maxTime}ms)`, 'GoalDetectionService');
          continue;
        }
        
        // Award the assist
        assists.push(touchPlayerId);
        const assistType = assists.length === 1 ? 'Primary' : 'Secondary';
        debugLog(`✅ ${assistType} assist awarded to ${touchPlayerId} (${touchPlayerTeamInfo.team} team, ${(timeSinceTouch/1000).toFixed(1)}s ago)`, 'GoalDetectionService');
      }
      
      if (assists.length === 0) {
        debugLog(`❌ No assists awarded - no eligible recent touches from teammates`, 'GoalDetectionService');
      } else {
        debugLog(`✅ Total assists awarded: ${assists.length} (Primary: ${assists[0] || 'None'}, Secondary: ${assists[1] || 'None'})`, 'GoalDetectionService');
      }

      return {
        primaryAssist: assists[0],
        secondaryAssist: assists[1]
      };
    } catch (error) {
      debugWarn('Could not get assist info:', 'GoalDetectionService');
      return {};
    }
  }
} 