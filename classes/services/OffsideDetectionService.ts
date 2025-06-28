import { Entity, Player, type Vector3Like } from 'hytopia';
import { 
  HockeyTeam, 
  HockeyGameState, 
  HockeyZone, 
  FaceoffLocation,
  BlueLLineCrossing,
  PlayerPositionHistory,
  OffsideViolation,
  ZoneBoundary
} from '../utils/types';
import { HockeyGameManager } from '../managers/HockeyGameManager';
import { PlayerManager } from '../managers/PlayerManager';
import * as CONSTANTS from '../utils/constants';

/**
 * Service for detecting offside violations in hockey gameplay
 * Monitors puck and player positions relative to blue lines
 * Detects when players enter offensive zones before the puck
 * 
 * Phase 3: Connected to real game systems for actual violation detection
 */
export class OffsideDetectionService {
  private static _instance: OffsideDetectionService;
  private _isActive: boolean = false;
  private _previousPuckPosition: Vector3Like | null = null;
  private _lastOffsideTime: number = 0;
  private _offsideCooldownMs: number = 3000; // 3 seconds between offside calls
  
  // Zone boundaries based on blue line coordinates from map analysis
  private readonly ZONE_BOUNDARIES: ZoneBoundary = {
    redDefensiveMax: -6.5,  // Z < -6.5 is Red defensive zone
    blueDefensiveMin: 7.5   // Z > 7.5 is Blue defensive zone
  };
  
  // Faceoff locations based on red dot coordinates (ID 103) from map
  // Fine-tuned coordinates for optimal faceoff positioning
  private readonly FACEOFF_POSITIONS: Record<FaceoffLocation, Vector3Like> = {
    [FaceoffLocation.RED_DEFENSIVE_LEFT]: { x: -13.36, y: 1.75, z: -22.75 },
    [FaceoffLocation.RED_DEFENSIVE_RIGHT]: { x: 14.36, y: 1.75, z: -22.75 },
    [FaceoffLocation.RED_NEUTRAL_LEFT]: { x: -13.36, y: 1.75, z: -3.75 },
    [FaceoffLocation.RED_NEUTRAL_RIGHT]: { x: 14.36, y: 1.75, z: -3.75 },
    [FaceoffLocation.BLUE_NEUTRAL_LEFT]: { x: -13.36, y: 1.75, z: 5.4 },
    [FaceoffLocation.BLUE_NEUTRAL_RIGHT]: { x: 14.36, y: 1.75, z: 5.25 },
    [FaceoffLocation.BLUE_DEFENSIVE_LEFT]: { x: -13.36, y: 1.75, z: 21.25 },
    [FaceoffLocation.BLUE_DEFENSIVE_RIGHT]: { x: 14.36, y: 1.75, z: 21.25 }
  };
  
  // Player position history for offside tracking
  private _playerPositionHistory: Map<string, PlayerPositionHistory[]> = new Map();
  private readonly MAX_POSITION_HISTORY = 10; // Keep last 10 positions per player
  private readonly POSITION_HISTORY_DURATION = 5000; // 5 seconds of position history
  
  private constructor() {}

  public static get instance(): OffsideDetectionService {
    if (!OffsideDetectionService._instance) {
      OffsideDetectionService._instance = new OffsideDetectionService();
    }
    return OffsideDetectionService._instance;
  }

  /**
   * Start monitoring for offside violations
   */
  public startMonitoring(): void {
    this._isActive = true;
    this._previousPuckPosition = null;
    this._lastOffsideTime = 0;
    this._playerPositionHistory.clear();
    CONSTANTS.debugLog('Started monitoring for offside violations', 'OffsideDetectionService');
  }

  /**
   * Stop monitoring for offside violations
   */
  public stopMonitoring(): void {
    this._isActive = false;
    this._previousPuckPosition = null;
    this._playerPositionHistory.clear();
    CONSTANTS.debugLog('Stopped monitoring for offside violations', 'OffsideDetectionService');
  }

  /**
   * Main offside detection method - call this regularly from game loop
   * @param puckEntity - The puck entity to check
   * @param world - The world to get player entities from
   * @returns OffsideViolation if detected, null otherwise
   */
  public checkForOffside(puckEntity: Entity | null, world: any): OffsideViolation | null {
    // Early exit conditions
    if (!this._isActive || !puckEntity || !puckEntity.isSpawned) {
      return null;
    }

    // Only detect offside during active gameplay
    const gameManager = HockeyGameManager.instance;
    if (gameManager.state !== HockeyGameState.IN_PERIOD) {
      return null;
    }

    // Cooldown check to prevent spam
    const currentTime = Date.now();
    if (currentTime - this._lastOffsideTime < this._offsideCooldownMs) {
      return null;
    }

    const currentPuckPosition = puckEntity.position;
    
    // Get all connected players
    const connectedPlayers = PlayerManager.instance.getConnectedPlayers();
    const allPlayers = new Map<string, Player>();
    connectedPlayers.forEach(player => {
      allPlayers.set(player.id, player);
    });
    
    // Update player position history
    this.updatePlayerPositions(allPlayers, currentTime, world);
    
    // Check for puck blue line crossing
    const blueLLineCrossing = this.detectPuckBlueLLineCrossing(currentPuckPosition);
    
    if (blueLLineCrossing) {
      CONSTANTS.debugLog(`🔵 Puck crossed blue line into ${blueLLineCrossing.zone} (${blueLLineCrossing.direction}) by ${blueLLineCrossing.crossingTeam} team`, 'OffsideDetectionService');
      
      // Check for offside violation
      const violation = this.checkOffsideViolation(blueLLineCrossing, allPlayers, currentTime);
      
      if (violation) {
        this._lastOffsideTime = currentTime;
        CONSTANTS.debugLog(`🚨 OFFSIDE DETECTED! ${violation.violatingTeam} team, ${violation.violatingPlayerIds.length} players: ${violation.violatingPlayerIds.join(', ')}`, 'OffsideDetectionService');
        return violation;
      } else {
        CONSTANTS.debugLog(`✅ No offside violation - all ${blueLLineCrossing.crossingTeam} players entered legally`, 'OffsideDetectionService');
      }
    }
    
    // Store position for next frame comparison
    this._previousPuckPosition = { ...currentPuckPosition };
    
    return null;
  }

  /**
   * Detect if puck crossed a blue line
   */
  private detectPuckBlueLLineCrossing(currentPosition: Vector3Like): BlueLLineCrossing | null {
    if (!this._previousPuckPosition) {
      return null;
    }

    const prevZ = this._previousPuckPosition.z;
    const currZ = currentPosition.z;
    
    // Detect if this is a teleportation (large distance change) and ignore it
    const distance = Math.sqrt(
      Math.pow(currentPosition.x - this._previousPuckPosition.x, 2) + 
      Math.pow(currentPosition.z - this._previousPuckPosition.z, 2)
    );
    
    if (distance > 10) {
      CONSTANTS.debugLog(`Ignoring large puck movement (${distance.toFixed(2)} blocks) - likely teleport/reset`, 'OffsideDetectionService');
      return null;
    }

    const currentTime = Date.now();

    // Check Red defensive blue line crossing (Z = -6.5)
    if (this.didCrossLine(prevZ, currZ, this.ZONE_BOUNDARIES.redDefensiveMax)) {
      if (currZ > this.ZONE_BOUNDARIES.redDefensiveMax) {
        // Entering neutral zone from Red defensive zone
        return {
          zone: HockeyZone.NEUTRAL,
          direction: 'entering',
          crossingTeam: HockeyTeam.BLUE, // Blue team entering neutral zone
          puckPosition: currentPosition,
          timestamp: currentTime
        };
      } else {
        // Entering Red defensive zone (Blue team's offensive zone)
        return {
          zone: HockeyZone.RED_DEFENSIVE,
          direction: 'entering',
          crossingTeam: HockeyTeam.BLUE, // Blue team entering offensive zone
          puckPosition: currentPosition,
          timestamp: currentTime
        };
      }
    }

    // Check Blue defensive blue line crossing (Z = 7.5)
    if (this.didCrossLine(prevZ, currZ, this.ZONE_BOUNDARIES.blueDefensiveMin)) {
      if (currZ < this.ZONE_BOUNDARIES.blueDefensiveMin) {
        // Entering neutral zone from Blue defensive zone
        return {
          zone: HockeyZone.NEUTRAL,
          direction: 'entering',
          crossingTeam: HockeyTeam.RED, // Red team entering neutral zone
          puckPosition: currentPosition,
          timestamp: currentTime
        };
      } else {
        // Entering Blue defensive zone (Red team's offensive zone)
        return {
          zone: HockeyZone.BLUE_DEFENSIVE,
          direction: 'entering',
          crossingTeam: HockeyTeam.RED, // Red team entering offensive zone
          puckPosition: currentPosition,
          timestamp: currentTime
        };
      }
    }

    return null;
  }

  /**
   * Check if puck crossed a line (borrowed from GoalDetectionService)
   */
  private didCrossLine(prevZ: number, currZ: number, lineZ: number): boolean {
    return (prevZ <= lineZ && currZ > lineZ) || (prevZ >= lineZ && currZ < lineZ);
  }

  /**
   * Update position history for all players
   */
  private updatePlayerPositions(allPlayers: Map<string, Player>, currentTime: number, world: any): void {
    const gameManager = HockeyGameManager.instance;

    allPlayers.forEach((player, playerId) => {
      const teamInfo = gameManager.getTeamAndPosition(playerId);
      if (!teamInfo) return;

      // Get player's current position from their entity
      const playerEntities = world.entityManager.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) return;

      const playerPosition = playerEntities[0].position;
      const playerZone = this.getZoneFromPosition(playerPosition);

      const positionRecord: PlayerPositionHistory = {
        playerId,
        team: teamInfo.team,
        position: { ...playerPosition },
        zone: playerZone,
        timestamp: currentTime
      };

      // Initialize history array if needed
      if (!this._playerPositionHistory.has(playerId)) {
        this._playerPositionHistory.set(playerId, []);
      }

      const history = this._playerPositionHistory.get(playerId)!;
      history.push(positionRecord);

      // Clean up old history entries
      const cutoffTime = currentTime - this.POSITION_HISTORY_DURATION;
      const filteredHistory = history.filter(record => record.timestamp > cutoffTime);
      
      // Limit to max entries
      if (filteredHistory.length > this.MAX_POSITION_HISTORY) {
        filteredHistory.splice(0, filteredHistory.length - this.MAX_POSITION_HISTORY);
      }

      this._playerPositionHistory.set(playerId, filteredHistory);
    });
  }

  /**
   * Check for offside violation when puck crosses blue line
   */
  private checkOffsideViolation(
    crossing: BlueLLineCrossing, 
    allPlayers: Map<string, Player>,
    currentTime: number
  ): OffsideViolation | null {
    // Only check when team enters offensive zone
    if (crossing.direction !== 'entering') return null;
    
    // Only check for defensive zone entries (offensive for the attacking team)
    if (crossing.zone === HockeyZone.NEUTRAL) {
      CONSTANTS.debugLog(`⚪ Puck entered neutral zone - no offside check needed`, 'OffsideDetectionService');
      return null;
    }

    const attackingTeam = crossing.crossingTeam;
    const offensiveZone = crossing.zone;
    
    CONSTANTS.debugLog(`🔍 Checking for offside: ${attackingTeam} team entering ${offensiveZone}`, 'OffsideDetectionService');
    
    const violatingPlayerIds: string[] = [];
    let playersChecked = 0;
    
    // Check each player on the attacking team
    allPlayers.forEach((player, playerId) => {
      const gameManager = HockeyGameManager.instance;
      const teamInfo = gameManager.getTeamAndPosition(playerId);
      
      if (!teamInfo || teamInfo.team !== attackingTeam) return;
      
      playersChecked++;
      
      // Check if this player was in the offensive zone before the puck crossed
      if (this.wasPlayerInZoneBeforePuckCrossing(playerId, offensiveZone, crossing.timestamp)) {
        violatingPlayerIds.push(playerId);
        CONSTANTS.debugLog(`⚠️ Player ${playerId} was offside in ${offensiveZone}`, 'OffsideDetectionService');
      } else {
        CONSTANTS.debugLog(`✅ Player ${playerId} was onside`, 'OffsideDetectionService');
      }
    });
    
    CONSTANTS.debugLog(`📊 Checked ${playersChecked} ${attackingTeam} players, ${violatingPlayerIds.length} violations found`, 'OffsideDetectionService');

    if (violatingPlayerIds.length > 0) {
      return {
        violatingPlayerIds,
        violatingTeam: attackingTeam,
        faceoffLocation: this.determineFaceoffLocation(crossing),
        timestamp: currentTime,
        puckPosition: crossing.puckPosition,
        blueLlineCrossedZone: crossing.zone
      };
    }

    return null;
  }

  /**
   * Check if a player was in the offensive zone before the puck crossed
   */
  private wasPlayerInZoneBeforePuckCrossing(
    playerId: string, 
    offensiveZone: HockeyZone, 
    crossingTime: number
  ): boolean {
    const history = this._playerPositionHistory.get(playerId);
    if (!history || history.length === 0) return false;

    // Look for recent position records before the crossing
    const recentRecords = history.filter(record => 
      record.timestamp < crossingTime && 
      record.timestamp > (crossingTime - 2000) // Check 2 seconds before crossing
    );

    // If player was in the offensive zone before puck crossed, it's offside
    return recentRecords.some(record => record.zone === offensiveZone);
  }

  /**
   * Determine which faceoff location to use based on where violation occurred
   * Chooses the closest faceoff dot to where the offside occurred
   */
  private determineFaceoffLocation(crossing: BlueLLineCrossing): FaceoffLocation {
    const puckPosition = crossing.puckPosition;
    
    // Determine which neutral zone faceoff spots to consider based on the violation zone
    let candidateLocations: FaceoffLocation[] = [];
    
    if (crossing.zone === HockeyZone.RED_DEFENSIVE) {
      // Blue team was offside in Red's zone, faceoff in Red's neutral zone
      candidateLocations = [FaceoffLocation.RED_NEUTRAL_LEFT, FaceoffLocation.RED_NEUTRAL_RIGHT];
    } else {
      // Red team was offside in Blue's zone, faceoff in Blue's neutral zone  
      candidateLocations = [FaceoffLocation.BLUE_NEUTRAL_LEFT, FaceoffLocation.BLUE_NEUTRAL_RIGHT];
    }
    
    // Find the closest faceoff location to where the puck was when offside occurred
    let closestLocation = candidateLocations[0];
    let shortestDistance = Number.MAX_VALUE;
    
    for (const location of candidateLocations) {
      const faceoffPos = this.FACEOFF_POSITIONS[location];
      const distance = Math.sqrt(
        Math.pow(puckPosition.x - faceoffPos.x, 2) + 
        Math.pow(puckPosition.z - faceoffPos.z, 2)
      );
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestLocation = location;
      }
    }
    
    CONSTANTS.debugLog(`🎯 Offside faceoff location determined: ${closestLocation} (closest to puck at X=${puckPosition.x.toFixed(1)}, Z=${puckPosition.z.toFixed(1)})`, 'OffsideDetectionService');
    
    return closestLocation;
  }

  /**
   * Get zone from position
   */
  public getZoneFromPosition(position: Vector3Like): HockeyZone {
    if (position.z < this.ZONE_BOUNDARIES.redDefensiveMax) {
      return HockeyZone.RED_DEFENSIVE;
    } else if (position.z > this.ZONE_BOUNDARIES.blueDefensiveMin) {
      return HockeyZone.BLUE_DEFENSIVE;
    } else {
      return HockeyZone.NEUTRAL;
    }
  }

  /**
   * Get faceoff position for a given location
   */
  public getFaceoffPosition(location: FaceoffLocation): Vector3Like {
    return { ...this.FACEOFF_POSITIONS[location] };
  }

  /**
   * Reset service state (useful for game resets)
   */
  public reset(): void {
    this._previousPuckPosition = null;
    this._lastOffsideTime = 0;
    this._playerPositionHistory.clear();
    CONSTANTS.debugLog('Offside detection service reset', 'OffsideDetectionService');
  }

  /**
   * Get debug information about current state
   */
  public getDebugInfo(): any {
    return {
      isActive: this._isActive,
      zoneBoundaries: this.ZONE_BOUNDARIES,
      faceoffLocations: Object.keys(this.FACEOFF_POSITIONS),
      playerHistoryCount: this._playerPositionHistory.size,
      lastOffsideTime: this._lastOffsideTime,
      currentPlayerZones: this.getCurrentPlayerZones()
    };
  }

  /**
   * Get current zone of all tracked players (for debugging)
   */
  private getCurrentPlayerZones(): Record<string, HockeyZone> {
    const zones: Record<string, HockeyZone> = {};
    this._playerPositionHistory.forEach((history, playerId) => {
      if (history.length > 0) {
        const latest = history[history.length - 1];
        zones[playerId] = latest.zone;
      }
    });
    return zones;
  }

  /**
   * Get all faceoff positions for debugging
   */
  public getAllFaceoffPositions(): Record<FaceoffLocation, Vector3Like> {
    return { ...this.FACEOFF_POSITIONS };
  }
} 