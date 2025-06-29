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
  
  // Delayed offside tracking - players who are offside but outside proximity range
  private _delayedOffsidePlayers: Map<string, {
    team: HockeyTeam;
    zone: HockeyZone;
    detectedTime: number;
  }> = new Map();
  
  // Track when an offside was just called to prevent immediate re-tracking at faceoff positions
  private _offsideJustCalled: boolean = false;
  
  // Track last faceoff reset time for grace period
  private _lastFaceoffResetTime: number = 0;
  private readonly FACEOFF_GRACE_PERIOD_MS: number = 3000; // 3 seconds grace period after faceoff
  
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
    this._delayedOffsidePlayers.clear();
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
    
    // Update player position history for offside detection (needed for checking if players were in zones before puck)
    this.updatePlayerPositions(allPlayers, currentTime, world);
    
    // Track players proactively entering offensive zones (FIXED VERSION - prevents scenario 3 issue)
    this.trackPlayersEnteringOffensiveZones(allPlayers, currentTime, world, currentPuckPosition);
    
    // Check for puck blue line crossing
    const blueLLineCrossing = this.detectPuckBlueLLineCrossing(currentPuckPosition);
    
    if (blueLLineCrossing) {
      CONSTANTS.debugLog(`🔵 Puck crossed blue line into ${blueLLineCrossing.zone} (${blueLLineCrossing.direction}) by ${blueLLineCrossing.crossingTeam} team`, 'OffsideDetectionService');
      
      // Debug: Show delayed tracking before checking violation
      CONSTANTS.debugLog(`🔍 PRE-CHECK: ${this._delayedOffsidePlayers.size} players in delayed tracking before offside check`, 'OffsideDetectionService');
      
      // Check for offside violation
      const violation = this.checkOffsideViolation(blueLLineCrossing, allPlayers, currentTime, world);
      
      if (violation) {
        this._lastOffsideTime = currentTime;
        this._offsideJustCalled = true; // Disable new tracking until faceoff reset
        CONSTANTS.debugLog(`🚨 OFFSIDE DETECTED! ${violation.violatingTeam} team, ${violation.violatingPlayerIds.length} players: ${violation.violatingPlayerIds.join(', ')}`, 'OffsideDetectionService');
        return violation;
      } else {
        CONSTANTS.debugLog(`✅ No offside violation - all ${blueLLineCrossing.crossingTeam} players entered legally`, 'OffsideDetectionService');
      }
    } else {
      // Debug: Show if we're not detecting blue line crossings
      if (this._delayedOffsidePlayers.size > 0) {
        CONSTANTS.debugLog(`⚪ No blue line crossing detected, but ${this._delayedOffsidePlayers.size} players still in delayed tracking`, 'OffsideDetectionService');
      }
    }
    
    // First, clean up delayed tracking for players who are now onside (MUST come before violation check)
    this.cleanupDelayedOffsideTracking(allPlayers, world);
    
    // Check for delayed offside violations (players approaching puck while offside)
    const delayedViolation = this.checkDelayedOffsideViolations(currentPuckPosition, allPlayers, currentTime, world);
    if (delayedViolation) {
      this._lastOffsideTime = currentTime;
      return delayedViolation;
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
    
    // Debug: Show puck movement when we have delayed players
    if (this._delayedOffsidePlayers.size > 0) {
      CONSTANTS.debugLog(`🏒 Puck movement: ${prevZ.toFixed(1)} → ${currZ.toFixed(1)} (Δ${(currZ - prevZ).toFixed(1)})`, 'OffsideDetectionService');
    }
    
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
        if (this._delayedOffsidePlayers.size > 0) {
          CONSTANTS.debugLog(`🔵 DETECTED: Blue line crossing into NEUTRAL zone by RED team (${this._delayedOffsidePlayers.size} delayed players)`, 'OffsideDetectionService');
        }
        return {
          zone: HockeyZone.NEUTRAL,
          direction: 'entering',
          crossingTeam: HockeyTeam.RED, // Red team entering neutral zone
          puckPosition: currentPosition,
          timestamp: currentTime
        };
      } else {
        // Entering Blue defensive zone (Red team's offensive zone)
        if (this._delayedOffsidePlayers.size > 0) {
          CONSTANTS.debugLog(`🔵 DETECTED: Blue line crossing into BLUE_DEFENSIVE zone by RED team (${this._delayedOffsidePlayers.size} delayed players)`, 'OffsideDetectionService');
        }
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
    const crossed = (prevZ <= lineZ && currZ > lineZ) || (prevZ >= lineZ && currZ < lineZ);
    
    // Debug line crossing when we have delayed players
    if (this._delayedOffsidePlayers.size > 0 && crossed) {
      CONSTANTS.debugLog(`🚨 LINE CROSSED: Z=${prevZ.toFixed(1)} → ${currZ.toFixed(1)} crossed line at Z=${lineZ}`, 'OffsideDetectionService');
    }
    
    return crossed;
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
   * This handles immediate offside detection and delayed offside tracking
   */
  private checkOffsideViolation(
    crossing: BlueLLineCrossing, 
    allPlayers: Map<string, Player>,
    currentTime: number,
    world?: any
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
    
    // Debug: Show current delayed tracking state
    CONSTANTS.debugLog(`📋 Current delayed tracking: ${this._delayedOffsidePlayers.size} players total`, 'OffsideDetectionService');
    this._delayedOffsidePlayers.forEach((info, playerId) => {
      CONSTANTS.debugLog(`   - Player ${playerId}: ${info.team} team in ${info.zone}`, 'OffsideDetectionService');
    });
    
    // Check if there are already delayed offside players on this team in this zone
    const existingDelayedPlayers = Array.from(this._delayedOffsidePlayers.entries())
      .filter(([_, info]) => info.team === attackingTeam && info.zone === offensiveZone)
      .map(([playerId, _]) => playerId);
    
    CONSTANTS.debugLog(`🔍 Found ${existingDelayedPlayers.length} existing delayed ${attackingTeam} players in ${offensiveZone}: [${existingDelayedPlayers.join(', ')}]`, 'OffsideDetectionService');
    
    if (existingDelayedPlayers.length > 0) {
      // Check if someone is controlling the puck (carrying it across) vs puck was passed
      const puckController = this.getPuckController(allPlayers, world);
      
      if (puckController) {
        // Someone is carrying the puck across the blue line
        CONSTANTS.debugLog(`🏒 Puck is carried by player ${puckController}`, 'OffsideDetectionService');
        
        // Remove the puck carrier from the list of delayed players - they can't be offside if they have the puck!
        const otherDelayedPlayers = existingDelayedPlayers.filter(playerId => playerId !== puckController);
        
        if (otherDelayedPlayers.length > 0) {
          // There are OTHER players (not the puck carrier) who were already offside - immediate violation!
          CONSTANTS.debugLog(`🚨 IMMEDIATE OFFSIDE (CARRIED): Player ${puckController} carried puck into ${offensiveZone} while ${otherDelayedPlayers.length} OTHER ${attackingTeam} players already offside: [${otherDelayedPlayers.join(', ')}]`, 'OffsideDetectionService');
          
          // COMPLETE RESET: Clear ALL delayed tracking and position history for clean slate after offside
          const totalClearedPlayers = this._delayedOffsidePlayers.size;
          this._delayedOffsidePlayers.clear();
          this._playerPositionHistory.clear();
          
          // Set flag to prevent immediate re-tracking until faceoff positioning is complete
          this._offsideJustCalled = true;
          
          CONSTANTS.debugLog(`🧹 COMPLETE RESET: Cleared ${totalClearedPlayers} delayed tracking entries and all position history for clean slate after immediate offside`, 'OffsideDetectionService');
          
          return {
            violatingPlayerIds: otherDelayedPlayers,
            violatingTeam: attackingTeam,
            faceoffLocation: this.determineFaceoffLocation(crossing),
            timestamp: currentTime,
            puckPosition: crossing.puckPosition,
            blueLlineCrossedZone: crossing.zone
          };
        } else {
          // Only the puck carrier was in delayed tracking - this is LEGAL! Clear them from tracking
          CONSTANTS.debugLog(`✅ LEGAL ZONE ENTRY: Player ${puckController} carried puck into ${offensiveZone} (was only player tracked for delayed offside) - clearing tracking`, 'OffsideDetectionService');
          this._delayedOffsidePlayers.delete(puckController);
          // No offside violation - puck carrier establishes legal zone entry
        }
      } else {
        // Puck was passed (not carried) - continue with delayed offside system
        CONSTANTS.debugLog(`🟡 DELAYED TRACKING: Puck was PASSED into ${offensiveZone} while ${existingDelayedPlayers.length} ${attackingTeam} players already offside - continuing delayed system`, 'OffsideDetectionService');
        // Don't return here - let the delayed system handle it via proximity checks
      }
    }
    
    const immediateViolatingPlayerIds: string[] = [];
    let playersChecked = 0;
    
    // Get the puck controller to exclude them from any offside violations
    const puckController = this.getPuckController(allPlayers, world);
    
    // Check each player on the attacking team
    allPlayers.forEach((player, playerId) => {
      const gameManager = HockeyGameManager.instance;
      const teamInfo = gameManager.getTeamAndPosition(playerId);
      
      if (!teamInfo || teamInfo.team !== attackingTeam) return;
      
      playersChecked++;
      
      // CRITICAL FIX: Skip offside check for puck controller - they can't be offside against themselves!
      if (puckController === playerId) {
        // If the puck controller was being tracked for delayed offside, clear them since they establish legal zone entry
        if (this._delayedOffsidePlayers.has(playerId)) {
          this._delayedOffsidePlayers.delete(playerId);
          CONSTANTS.debugLog(`✅ LEGAL ZONE ENTRY: Player ${playerId} (puck controller) carried puck into ${offensiveZone} - cleared from delayed tracking`, 'OffsideDetectionService');
        } else {
          CONSTANTS.debugLog(`✅ Player ${playerId} (puck controller) legally entered ${offensiveZone} with the puck`, 'OffsideDetectionService');
        }
        return; // Skip all offside checks for puck controller
      }
      
      // Check if this player was in the offensive zone before the puck crossed
      if (this.wasPlayerInZoneBeforePuckCrossing(playerId, offensiveZone, crossing.timestamp)) {
        // Player was offside when puck entered zone
        
        // CRITICAL DISTINCTION: Check if this offside player is the one who brought the puck in
        if (puckController === playerId) {
          // Same player who was offside is now controlling the puck - IMMEDIATE VIOLATION
          immediateViolatingPlayerIds.push(playerId);
          CONSTANTS.debugLog(`⚠️ Player ${playerId} was offside in ${offensiveZone} and then brought puck into zone - IMMEDIATE VIOLATION`, 'OffsideDetectionService');
        } else {
          // Different player brought the puck in - use DELAYED OFFSIDE with proximity check
          const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
          
          if (playerEntities && playerEntities.length > 0) {
            const playerEntity = playerEntities[0];
            const playerPosition = playerEntity.position;
            
            // Calculate distance from offside player to puck
            const distance = Math.sqrt(
              Math.pow(playerPosition.x - crossing.puckPosition.x, 2) + 
              Math.pow(playerPosition.z - crossing.puckPosition.z, 2)
            );
            
            if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
              // Offside player is close to puck when teammate brought it in - immediate violation!
              immediateViolatingPlayerIds.push(playerId);
              CONSTANTS.debugLog(`⚠️ Player ${playerId} was offside in ${offensiveZone} and within proximity (${distance.toFixed(1)}m) when teammate brought puck in - IMMEDIATE VIOLATION`, 'OffsideDetectionService');
            } else {
              // Offside player is far from puck when teammate brought it in - delayed tracking
              this._delayedOffsidePlayers.set(playerId, {
                team: attackingTeam,
                zone: offensiveZone,
                detectedTime: currentTime
              });
              CONSTANTS.debugLog(`🟡 Player ${playerId} was offside in ${offensiveZone} but far from puck (${distance.toFixed(1)}m) when teammate brought it in - DELAYED OFFSIDE TRACKING`, 'OffsideDetectionService');
            }
          } else {
            // Fallback: if we can't get player entity, call immediate offside (safety)
            immediateViolatingPlayerIds.push(playerId);
            CONSTANTS.debugLog(`⚠️ Player ${playerId} was offside in ${offensiveZone} (unable to check proximity) - IMMEDIATE VIOLATION`, 'OffsideDetectionService');
          }
        }
      } else {
        CONSTANTS.debugLog(`✅ Player ${playerId} was onside`, 'OffsideDetectionService');
      }
    });
    
    CONSTANTS.debugLog(`📊 Checked ${playersChecked} ${attackingTeam} players: ${immediateViolatingPlayerIds.length} immediate violations, ${this._delayedOffsidePlayers.size} total delayed tracking`, 'OffsideDetectionService');

    // Return immediate violation if any
    if (immediateViolatingPlayerIds.length > 0) {
      // COMPLETE RESET: Clear ALL delayed tracking and position history for clean slate after offside
      const totalClearedPlayers = this._delayedOffsidePlayers.size;
      this._delayedOffsidePlayers.clear();
      this._playerPositionHistory.clear();
      
      // Set flag to prevent immediate re-tracking until faceoff positioning is complete
      this._offsideJustCalled = true;
      
      CONSTANTS.debugLog(`🧹 COMPLETE RESET: Cleared ${totalClearedPlayers} delayed tracking entries and all position history for clean slate after immediate offside`, 'OffsideDetectionService');
      
      return {
        violatingPlayerIds: immediateViolatingPlayerIds,
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
   * Check for delayed offside violations - players who are being tracked and now within proximity
   */
  private checkDelayedOffsideViolations(
    puckPosition: Vector3Like,
    allPlayers: Map<string, Player>,
    currentTime: number,
    world?: any
  ): OffsideViolation | null {
    if (this._delayedOffsidePlayers.size === 0) {
      return null;
    }

    // Debug: Show which players are currently in delayed tracking
    const trackedPlayersList = Array.from(this._delayedOffsidePlayers.entries()).map(([id, info]) => 
      `${id}(${info.team} in ${info.zone})`
    ).join(', ');
    CONSTANTS.debugLog(`🚨 CHECKING DELAYED VIOLATIONS: ${this._delayedOffsidePlayers.size} players in tracking: ${trackedPlayersList}`, 'OffsideDetectionService');

    const violatingPlayerIds: string[] = [];
    let violatingTeam: HockeyTeam | null = null;
    let faceoffLocation: FaceoffLocation | null = null;

    // Get info about delayed tracking to determine which zones/teams to check
    const trackedTeams = new Set<HockeyTeam>();
    const trackedZones = new Set<HockeyZone>();
    
    this._delayedOffsidePlayers.forEach((trackingInfo) => {
      trackedTeams.add(trackingInfo.team);
      trackedZones.add(trackingInfo.zone);
    });

    const gameManager = HockeyGameManager.instance;
    
    // Get the puck controller to exclude them from delayed offside violations
    const puckController = this.getPuckController(allPlayers, world);

    // Check ALL players on teams that have delayed offside tracking
    // This prevents new players from entering the zone and getting close to puck
    allPlayers.forEach((player, playerId) => {
      const teamInfo = gameManager.getTeamAndPosition(playerId);
      if (!teamInfo || !trackedTeams.has(teamInfo.team)) return;
      
      // CRITICAL FIX: Skip delayed offside check for puck controller - they can't be offside against themselves!
      if (puckController === playerId) {
        // If the puck controller was being tracked for delayed offside, clear them since they establish legal zone entry
        if (this._delayedOffsidePlayers.has(playerId)) {
          this._delayedOffsidePlayers.delete(playerId);
          CONSTANTS.debugLog(`✅ DELAYED TRACKING CLEARED: Player ${playerId} (puck controller) is legally controlling the puck - removed from delayed tracking`, 'OffsideDetectionService');
        }
        return; // Skip all delayed offside checks for puck controller
      }

      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) return;

      const playerEntity = playerEntities[0];
      const playerPosition = playerEntity.position;
      const currentPlayerZone = this.getZoneFromPosition(playerPosition);

      // Check if this player is in an offensive zone where their team has delayed tracking
      let isInTrackedOffensiveZone = false;
      let offensiveZone: HockeyZone | null = null;

      if (teamInfo.team === HockeyTeam.RED && currentPlayerZone === HockeyZone.BLUE_DEFENSIVE && trackedZones.has(HockeyZone.BLUE_DEFENSIVE)) {
        isInTrackedOffensiveZone = true;
        offensiveZone = HockeyZone.BLUE_DEFENSIVE;
      } else if (teamInfo.team === HockeyTeam.BLUE && currentPlayerZone === HockeyZone.RED_DEFENSIVE && trackedZones.has(HockeyZone.RED_DEFENSIVE)) {
        isInTrackedOffensiveZone = true;
        offensiveZone = HockeyZone.RED_DEFENSIVE;
      }

      if (!isInTrackedOffensiveZone) return;

      // CRITICAL FIX: Only check proximity when puck is also in the same offensive zone
      const puckZone = this.getZoneFromPosition(puckPosition);
      if (puckZone !== offensiveZone) {
        CONSTANTS.debugLog(`🔍 Player ${playerId} in ${offensiveZone} but puck in ${puckZone} - no delayed violation (puck must be in same zone)`, 'OffsideDetectionService');
        return;
      }

      // Calculate distance from player to puck
      const distance = Math.sqrt(
        Math.pow(playerPosition.x - puckPosition.x, 2) + 
        Math.pow(playerPosition.z - puckPosition.z, 2)
      );

      // Check if player is within proximity distance
      if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
        // ANY player getting close to puck while their team has delayed offside triggers it!
        violatingPlayerIds.push(playerId);
        violatingTeam = teamInfo.team;
        
        // Determine faceoff location based on the zone
        if (offensiveZone === HockeyZone.RED_DEFENSIVE) {
          faceoffLocation = puckPosition.x < 0 ? FaceoffLocation.RED_NEUTRAL_LEFT : FaceoffLocation.RED_NEUTRAL_RIGHT;
        } else {
          faceoffLocation = puckPosition.x < 0 ? FaceoffLocation.BLUE_NEUTRAL_LEFT : FaceoffLocation.BLUE_NEUTRAL_RIGHT;
        }
        
        // Check if this player was originally tracked or entered zone later
        const wasOriginallyTracked = this._delayedOffsidePlayers.has(playerId);
        if (wasOriginallyTracked) {
          CONSTANTS.debugLog(`⚠️ DELAYED OFFSIDE TRIGGERED: Player ${playerId} (originally offside) approached puck (${distance.toFixed(1)}m) in ${offensiveZone}`, 'OffsideDetectionService');
        } else {
          CONSTANTS.debugLog(`⚠️ DELAYED OFFSIDE TRIGGERED: Player ${playerId} (entered zone later) approached puck (${distance.toFixed(1)}m) while teammates were offside in ${offensiveZone}`, 'OffsideDetectionService');
        }
      }
    });

    // If we have violations, clear ALL tracking completely and return violation
    if (violatingPlayerIds.length > 0 && violatingTeam && faceoffLocation) {
      // COMPLETE RESET: Clear ALL delayed tracking (not just this team) for clean slate
      const totalClearedPlayers = this._delayedOffsidePlayers.size;
      this._delayedOffsidePlayers.clear();
      this._playerPositionHistory.clear();
      
      // Set flag to prevent immediate re-tracking until faceoff positioning is complete
      this._offsideJustCalled = true;

      CONSTANTS.debugLog(`🚨 DELAYED OFFSIDE CALLED: ${violatingPlayerIds.length} violating players`, 'OffsideDetectionService');
      CONSTANTS.debugLog(`🧹 COMPLETE RESET: Cleared ${totalClearedPlayers} delayed tracking entries and all position history for clean slate`, 'OffsideDetectionService');

      return {
        violatingPlayerIds,
        violatingTeam,
        faceoffLocation,
        timestamp: currentTime,
        puckPosition: { ...puckPosition },
        blueLlineCrossedZone: trackedZones.values().next().value || HockeyZone.NEUTRAL
      };
    }

    return null;
  }

  /**
   * Check if the puck is currently being controlled by any player
   */
  private isPuckCurrentlyControlled(allPlayers: Map<string, Player>, world?: any): boolean {
    // Check each player to see if they're controlling the puck
    for (const [playerId, player] of allPlayers) {
      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) continue;

      const playerEntity = playerEntities[0];
      const controller = playerEntity.controller;
      
      // Check if this player's controller indicates they're controlling the puck
      if (controller && typeof controller.isControllingPuck === 'boolean' && controller.isControllingPuck) {
        CONSTANTS.debugLog(`🏒 Puck is controlled by player ${playerId}`, 'OffsideDetectionService');
        return true;
      }
    }
    
    CONSTANTS.debugLog(`🏒 Puck is NOT controlled (was passed/shot)`, 'OffsideDetectionService');
    return false;
  }

  /**
   * Get the player ID who is currently controlling the puck (if any)
   */
  private getPuckController(allPlayers: Map<string, Player>, world?: any): string | null {
    // Check each player to see if they're controlling the puck
    for (const [playerId, player] of allPlayers) {
      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) continue;

      const playerEntity = playerEntities[0];
      const controller = playerEntity.controller;
      
      // Check if this player's controller indicates they're controlling the puck
      if (controller && typeof controller.isControllingPuck === 'boolean' && controller.isControllingPuck) {
        return playerId;
      }
    }
    
    return null;
  }

  /**
   * Track players proactively entering offensive zones (FIXED VERSION - prevents scenario 3 issue)
   */
  /**
   * Track players proactively entering offensive zones (FIXED VERSION - prevents scenario 3 issue)
   * This tracks players who enter offensive zones without the puck, so that if a teammate
   * later carries the puck into the zone, we can immediately call offside (scenario 3)
   */
  private trackPlayersEnteringOffensiveZones(
    allPlayers: Map<string, Player>,
    currentTime: number,
    world: any,
    puckPosition: Vector3Like
  ): void {
    // Skip tracking if an offside was just called - wait for faceoff to complete and players to get positioned
    if (this._offsideJustCalled) {
      return;
    }

    // Grace period after faceoff to prevent false positives during positioning
    if (currentTime - this._lastFaceoffResetTime < this.FACEOFF_GRACE_PERIOD_MS) {
      return;
    }

    const gameManager = HockeyGameManager.instance;

    allPlayers.forEach((player, playerId) => {
      // Skip if already tracking this player
      if (this._delayedOffsidePlayers.has(playerId)) {
        return;
      }

      const teamInfo = gameManager.getTeamAndPosition(playerId);
      if (!teamInfo) return;

      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) return;

      const playerEntity = playerEntities[0];
      const currentPlayerPosition = playerEntity.position;
      const currentZone = this.getZoneFromPosition(currentPlayerPosition);

      // Get player's position history to check if they just entered a zone
      const history = this._playerPositionHistory.get(playerId);
      if (!history || history.length < 2) return;

      // Get the most recent previous position
      const previousRecord = history[history.length - 2];
      const previousZone = previousRecord.zone;

      // Check if player just entered an offensive zone from neutral zone
      let enteredOffensiveZone: HockeyZone | null = null;

      if (teamInfo.team === HockeyTeam.RED && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.BLUE_DEFENSIVE) {
        enteredOffensiveZone = HockeyZone.BLUE_DEFENSIVE;
      } else if (teamInfo.team === HockeyTeam.BLUE && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.RED_DEFENSIVE) {
        enteredOffensiveZone = HockeyZone.RED_DEFENSIVE;
      }

      if (enteredOffensiveZone) {
        // Check if puck is already in this offensive zone - if so, player entry is legal
        const puckZone = this.getZoneFromPosition(puckPosition);
        
        if (puckZone === enteredOffensiveZone) {
          CONSTANTS.debugLog(`✅ Player ${playerId} (${teamInfo.team}) entered ${enteredOffensiveZone} but puck is already there - LEGAL`, 'OffsideDetectionService');
          return;
        }

        // Check if any teammate is controlling the puck in this zone - if so, entry is legal
        const puckController = this.getPuckController(allPlayers, world);
        if (puckController) {
          const controllerTeamInfo = gameManager.getTeamAndPosition(puckController);
          if (controllerTeamInfo && controllerTeamInfo.team === teamInfo.team && puckZone === enteredOffensiveZone) {
            CONSTANTS.debugLog(`✅ Player ${playerId} (${teamInfo.team}) entered ${enteredOffensiveZone} but teammate ${puckController} has puck there - LEGAL`, 'OffsideDetectionService');
            return;
          }
        }

        // Player entered offensive zone without puck - add to delayed tracking for scenario 3
        this._delayedOffsidePlayers.set(playerId, {
          team: teamInfo.team,
          zone: enteredOffensiveZone,
          detectedTime: currentTime
        });
        
        CONSTANTS.debugLog(`🟡 DELAYED TRACKING ADDED: Player ${playerId} (${teamInfo.team}) entered ${enteredOffensiveZone} without puck - tracking for potential offside`, 'OffsideDetectionService');
      }
    });
  }

  /**
   * Clean up delayed offside tracking for players who are now onside
   */
  private cleanupDelayedOffsideTracking(allPlayers: Map<string, Player>, world?: any): void {
    if (this._delayedOffsidePlayers.size === 0) return; // No cleanup needed
    
    const playersToRemove: string[] = [];

    CONSTANTS.debugLog(`🧹 CLEANUP CHECK: Checking ${this._delayedOffsidePlayers.size} players in delayed tracking`, 'OffsideDetectionService');

    this._delayedOffsidePlayers.forEach((trackingInfo, playerId) => {
      const player = allPlayers.get(playerId);
      if (!player) {
        playersToRemove.push(playerId);
        CONSTANTS.debugLog(`❌ Player ${playerId} disconnected - removing from delayed tracking`, 'OffsideDetectionService');
        return;
      }

      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (!playerEntities || playerEntities.length === 0) {
        CONSTANTS.debugLog(`⚠️ Player ${playerId} has no entities - skipping cleanup check`, 'OffsideDetectionService');
        return;
      }

      const playerEntity = playerEntities[0];
      const playerPosition = playerEntity.position;
      const currentPlayerZone = this.getZoneFromPosition(playerPosition);

      CONSTANTS.debugLog(`🔍 Player ${playerId}: tracked in ${trackingInfo.zone}, currently in ${currentPlayerZone}`, 'OffsideDetectionService');

      // If player is no longer in the offensive zone they were offside in, they're back onside
      if (currentPlayerZone !== trackingInfo.zone) {
        playersToRemove.push(playerId);
        CONSTANTS.debugLog(`✅ Player ${playerId} skated back onside - removing from delayed tracking (was in ${trackingInfo.zone}, now in ${currentPlayerZone})`, 'OffsideDetectionService');
      }
    });

    // Remove players who are back onside
    if (playersToRemove.length > 0) {
      CONSTANTS.debugLog(`🧹 CLEANUP RESULT: Removing ${playersToRemove.length} players from delayed tracking: ${playersToRemove.join(', ')}`, 'OffsideDetectionService');
      playersToRemove.forEach(playerId => {
        this._delayedOffsidePlayers.delete(playerId);
      });
    } else {
      CONSTANTS.debugLog(`🧹 CLEANUP RESULT: No players removed from delayed tracking`, 'OffsideDetectionService');
    }
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
    this._offsideJustCalled = false;
    this._lastFaceoffResetTime = 0;
    this._playerPositionHistory.clear();
    this._delayedOffsidePlayers.clear();
    CONSTANTS.debugLog('Offside detection service reset', 'OffsideDetectionService');
  }

  /**
   * Reset service state after a faceoff and re-enable tracking
   * @param currentPuckPosition - Current puck position to prevent false positives on next frame
   */
  public resetAfterFaceoff(currentPuckPosition?: Vector3Like): void {
    // Set previous puck position to current position to prevent false zone entry detection
    // If no position provided, set to null (existing behavior)
    this._previousPuckPosition = currentPuckPosition ? { ...currentPuckPosition } : null;
    
    // Keep _lastOffsideTime to maintain regular offside cooldown
    this._playerPositionHistory.clear();
    this._delayedOffsidePlayers.clear();
    
    // Clear the offside flag to re-enable tracking after faceoff positioning is complete
    this._offsideJustCalled = false;
    
    // Set grace period timestamp to prevent immediate false positives
    this._lastFaceoffResetTime = Date.now();
    
    if (currentPuckPosition) {
      CONSTANTS.debugLog(`🔄 Offside detection state reset after faceoff completion - tracking re-enabled with puck position (${currentPuckPosition.x.toFixed(1)}, ${currentPuckPosition.z.toFixed(1)}) and ${this.FACEOFF_GRACE_PERIOD_MS}ms grace period`, 'OffsideDetectionService');
    } else {
      CONSTANTS.debugLog(`🔄 Offside detection state reset after faceoff completion - tracking re-enabled with ${this.FACEOFF_GRACE_PERIOD_MS}ms grace period`, 'OffsideDetectionService');
    }
  }

  /**
   * Get debug information about current state
   */
  public getDebugInfo(): any {
    const currentTime = Date.now();
    return {
      isActive: this._isActive,
      zoneBoundaries: this.ZONE_BOUNDARIES,
      faceoffLocations: Object.keys(this.FACEOFF_POSITIONS),
      playerHistoryCount: this._playerPositionHistory.size,
      lastOffsideTime: this._lastOffsideTime,
      offsideJustCalled: this._offsideJustCalled,
      lastFaceoffResetTime: this._lastFaceoffResetTime,
      gracePeriodActive: currentTime - this._lastFaceoffResetTime < this.FACEOFF_GRACE_PERIOD_MS,
      gracePeriodRemainingMs: Math.max(0, this.FACEOFF_GRACE_PERIOD_MS - (currentTime - this._lastFaceoffResetTime)),
      currentPlayerZones: this.getCurrentPlayerZones(),
      delayedOffsideTracking: {
        count: this._delayedOffsidePlayers.size,
        players: Array.from(this._delayedOffsidePlayers.entries()).map(([playerId, info]) => ({
          playerId,
          team: info.team,
          zone: info.zone,
          detectedTime: info.detectedTime,
          trackingDuration: Date.now() - info.detectedTime
        }))
      }
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