import { Entity, type Vector3Like } from 'hytopia';
import { HockeyTeam, HockeyPosition } from '../utils/types';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { PlayerStatsManager } from '../managers/PlayerStatsManager';
import * as CONSTANTS from '../utils/constants';
import { debugLog, debugError, debugWarn } from '../utils/constants';

/**
 * Service for detecting saves made by goalies using trajectory prediction
 * A save is counted when:
 * 1. A goalie (position) picks up/touches the puck
 * 2. The puck was last touched by an opponent
 * 3. The puck was on a trajectory that would have crossed the goal line
 */
export class SaveDetectionService {
  private static _instance: SaveDetectionService;

  // Goal zones for trajectory prediction (reusing from GoalDetectionService)
  private readonly GOAL_ZONES = {
    BLUE: {
      minX: -1.60,
      maxX: 1.60,
      goalLineZ: 31.26,
      team: HockeyTeam.BLUE,
      name: 'Blue Goal'
    },
    RED: {
      minX: -1.60,
      maxX: 1.60,
      goalLineZ: -31.285,
      team: HockeyTeam.RED,
      name: 'Red Goal'
    }
  };

  private constructor() {}

  public static get instance(): SaveDetectionService {
    if (!SaveDetectionService._instance) {
      SaveDetectionService._instance = new SaveDetectionService();
    }
    return SaveDetectionService._instance;
  }

  /**
   * Check if a goalie picking up the puck should count as a save
   * @param goalieId - The player ID of the goalie
   * @param puckEntity - The puck entity being picked up
   * @returns true if this should count as a save
   */
  public checkForSave(goalieId: string, puckEntity: Entity): boolean {
    try {
      debugLog(`🧪 SAVE CHECK STARTED for goalie ${goalieId}`, 'SaveDetectionService');
      
      const gameManager = HockeyGameManager.instance;
      
      // 0. Check if game is in active period (only track saves during live gameplay)
      if (gameManager.state !== 'IN_PERIOD') {
        debugLog(`❌ Save check failed: Game not in active period (current state: ${gameManager.state})`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 0 passed: Game is in active period (${gameManager.state})`, 'SaveDetectionService');
      
      // 1. Verify the player is actually a goalie
      const goalieInfo = gameManager.getTeamAndPosition(goalieId);
      if (!goalieInfo || goalieInfo.position !== HockeyPosition.GOALIE) {
        debugLog(`❌ Save check failed: ${goalieId} is not a goalie (position: ${goalieInfo?.position})`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 1 passed: ${goalieId} is a ${goalieInfo.team} goalie`, 'SaveDetectionService');

      // 2. Check if puck was last touched by an opponent
      const lastTouchedBy = this.getLastPlayerToTouchPuck(puckEntity);
      if (!lastTouchedBy) {
        debugLog(`❌ Save check failed: No last touched player found`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 2 passed: Last touched by player ${lastTouchedBy}`, 'SaveDetectionService');

      const shooterInfo = gameManager.getTeamAndPosition(lastTouchedBy);
      if (!shooterInfo) {
        debugLog(`❌ Save check failed: Shooter ${lastTouchedBy} not found in teams`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 3 passed: Shooter ${lastTouchedBy} is on ${shooterInfo.team} team`, 'SaveDetectionService');

      // Check if last touched player is on opposing team
      if (shooterInfo.team === goalieInfo.team) {
        debugLog(`❌ Save check failed: Last touched by teammate ${lastTouchedBy} (${shooterInfo.team}), not opponent`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 4 passed: ${lastTouchedBy} (${shooterInfo.team}) is opponent of goalie (${goalieInfo.team})`, 'SaveDetectionService');

      // 3. Check if puck was on trajectory to score (trajectory prediction)
      const wouldHaveScored = this.predictTrajectoryGoal(puckEntity, goalieInfo.team);
      if (!wouldHaveScored) {
        debugLog(`❌ Save check failed: Puck was not on trajectory to score`, 'SaveDetectionService');
        return false;
      }

      debugLog(`✅ Step 5 passed: Puck was on trajectory to score`, 'SaveDetectionService');

      // 4. Check if the touch was recent enough (within 10 seconds to catch slow passes)
      const touchHistory = this.getTouchHistory(puckEntity);
      debugLog(`📋 Touch history length: ${touchHistory.length}`, 'SaveDetectionService');
      
      if (touchHistory.length > 0) {
        const lastTouch = touchHistory[0];
        const timeSinceTouch = Date.now() - lastTouch.timestamp;
        debugLog(`⏰ Time since last touch: ${(timeSinceTouch/1000).toFixed(1)}s`, 'SaveDetectionService');
        
        if (timeSinceTouch > 10000) { // Increased from 5 to 10 seconds for slow passes
          debugLog(`❌ Save check failed: Last opponent touch was too long ago (${(timeSinceTouch/1000).toFixed(1)}s > 10s)`, 'SaveDetectionService');
          return false;
        }
      }

      debugLog(`✅ Step 6 passed: Touch timing is acceptable`, 'SaveDetectionService');

      // All conditions met - this is a save!
      debugLog(`🎉 SAVE DETECTED! Goalie ${goalieId} (${goalieInfo.team}) saved shot from ${lastTouchedBy} (${shooterInfo.team})`, 'SaveDetectionService');
      
      // Record the save
      PlayerStatsManager.instance.recordSave(goalieId, lastTouchedBy, shooterInfo.team);
      
      // TRACK SHOT ON GOAL: Record that this was a shot on goal (saved)
      // Note: In SaveDetectionService context, this is never an own goal since the save
      // only occurs when an opponent shoots at the goalie's goal
      PlayerStatsManager.instance.recordShot(lastTouchedBy, shooterInfo.team, true, true, goalieId, false).catch(error => {
        debugError('Error recording shot stat:', error, 'SaveDetectionService');
      });
      debugLog(`📊 Recorded shot on goal for ${lastTouchedBy} (saved by ${goalieId})`, 'SaveDetectionService');
      
      // Notify the game manager to broadcast the save
      gameManager.saveRecorded(goalieId, lastTouchedBy);
      
      return true;

    } catch (error) {
      CONSTANTS.debugError('Error in save detection', error, 'SaveDetectionService');
      return false;
    }
  }

  /**
   * Predict if the puck would have scored based on its current trajectory
   * @param puckEntity - The puck entity
   * @param goalieTeam - The team of the goalie making the save
   * @returns true if puck was heading toward the goal
   */
  private predictTrajectoryGoal(puckEntity: Entity, goalieTeam: HockeyTeam): boolean {
    const position = puckEntity.position;
    const velocity = puckEntity.linearVelocity;

    // Determine which goal the goalie is defending
    const defendingGoal = goalieTeam === HockeyTeam.RED ? this.GOAL_ZONES.RED : this.GOAL_ZONES.BLUE;
    
    debugLog(`🎯 Checking trajectory for ${goalieTeam} goalie defending ${defendingGoal.name}`, 'SaveDetectionService');
    debugLog(`📍 Puck position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`, 'SaveDetectionService');
    debugLog(`🏃 Puck velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`, 'SaveDetectionService');

    // Check if puck has meaningful velocity (moving toward goal)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    debugLog(`⚡ Puck speed: ${speed.toFixed(2)}`, 'SaveDetectionService');
    
    // More lenient speed check - passes can be slower than shots
    if (speed < 0.8) { // Reduced from 1.5 to 0.8 to catch slow passes
      debugLog(`❌ Puck speed too low for save: ${speed.toFixed(2)} < 0.8`, 'SaveDetectionService');
      return false; 
    }

    // Calculate time to reach goal line
    const distanceToGoalLine = Math.abs(position.z - defendingGoal.goalLineZ);
    const velocityTowardGoal = goalieTeam === HockeyTeam.RED ? -velocity.z : velocity.z;
    
    debugLog(`📏 Distance to goal line: ${distanceToGoalLine.toFixed(2)}`, 'SaveDetectionService');
    debugLog(`➡️ Velocity toward goal: ${velocityTowardGoal.toFixed(2)}`, 'SaveDetectionService');
    
    // Very lenient check for puck moving toward goal (to catch slow passes)
    if (velocityTowardGoal <= 0.05) { // Even more lenient than before
      debugLog(`❌ Puck not moving toward goal: velocityTowardGoal=${velocityTowardGoal.toFixed(2)} <= 0.05`, 'SaveDetectionService');
      return false;
    }

    const timeToGoalLine = distanceToGoalLine / velocityTowardGoal;
    
    // Predict where puck will be when it reaches goal line
    const predictedX = position.x + (velocity.x * timeToGoalLine);
    const predictedY = position.y + (velocity.y * timeToGoalLine) + (0.5 * -9.81 * timeToGoalLine * timeToGoalLine); // Account for gravity

    debugLog(`⏱️ Time to goal line: ${timeToGoalLine.toFixed(2)}s`, 'SaveDetectionService');
    debugLog(`🎯 Predicted impact: X=${predictedX.toFixed(2)}, Y=${predictedY.toFixed(2)}`, 'SaveDetectionService');
    debugLog(`🥅 Goal boundaries: X(${defendingGoal.minX} to ${defendingGoal.maxX}), Y(0.3 to 3.2)`, 'SaveDetectionService');

    // Very generous goal dimensions to catch passes that might drift into goal
    const withinGoalWidth = predictedX >= (defendingGoal.minX - 0.5) && predictedX <= (defendingGoal.maxX + 0.5); // Increased buffer to 0.5m
    const withinGoalHeight = predictedY >= 0.1 && predictedY <= 3.5; // Expanded height range
    const reasonableTime = timeToGoalLine > 0 && timeToGoalLine < 15.0; // Increased from 8 to 15 seconds for slow passes

    debugLog(`✅ Width check: ${withinGoalWidth} (predicted: ${predictedX.toFixed(2)})`, 'SaveDetectionService');
    debugLog(`✅ Height check: ${withinGoalHeight} (predicted: ${predictedY.toFixed(2)})`, 'SaveDetectionService');
    debugLog(`✅ Time check: ${reasonableTime} (time: ${timeToGoalLine.toFixed(2)}s)`, 'SaveDetectionService');

    const wouldScore = withinGoalWidth && withinGoalHeight && reasonableTime;
    
    debugLog(`🏁 Trajectory result: withinWidth=${withinGoalWidth}, withinHeight=${withinGoalHeight}, reasonableTime=${reasonableTime} -> wouldScore=${wouldScore}`, 'SaveDetectionService');

    return wouldScore;
  }

  /**
   * Get the last player to touch the puck
   */
  private getLastPlayerToTouchPuck(puckEntity: Entity): string | undefined {
    try {
      const lastTouched = (puckEntity as any).customProperties?.get('lastTouchedBy') as string | undefined;
      return lastTouched;
    } catch (error) {
      CONSTANTS.debugWarn('Could not get puck lastTouchedBy property', 'SaveDetectionService');
      return undefined;
    }
  }

  /**
   * Get the touch history of the puck
   */
  private getTouchHistory(puckEntity: Entity): Array<{playerId: string, timestamp: number}> {
    try {
      const touchHistory = (puckEntity as any).customProperties?.get('touchHistory') || [];
      return touchHistory;
    } catch (error) {
      CONSTANTS.debugWarn('Could not get puck touch history', 'SaveDetectionService');
      return [];
    }
  }
}