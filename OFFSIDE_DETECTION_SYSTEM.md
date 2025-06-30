# FACE-OFF - Offside Detection System

## Overview

The FACE-OFF game implements a sophisticated offside detection system that mimics real NHL hockey rules. The system handles both immediate and delayed offside scenarios with proximity-based detection to ensure realistic gameplay while maintaining good flow.

**Latest Version**: Includes critical fixes for scenario 3 (puck carrier immediate offside), puck zone validation, and complete state reset after faceoffs.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [System Architecture](#system-architecture)
3. [Offside Scenarios](#offside-scenarios)
4. [Technical Implementation](#technical-implementation)
5. [Critical Bug Fixes](#critical-bug-fixes)
6. [Configuration](#configuration)
7. [Testing Scenarios](#testing-scenarios)
8. [Integration Points](#integration-points)
9. [Future Enhancements](#future-enhancements)

## Core Concepts

### Real Hockey Offside Rules

In hockey, a player is offside if they enter the attacking zone before the puck crosses the blue line. However, there are two types of offside:

1. **Immediate Offside**: When a player carries the puck into the zone while teammates are already offside
2. **Delayed Offside**: When the puck is passed into the zone while players are offside, but play continues until an offside player touches the puck or gets too close to it

### FACE-OFF Implementation

Our system implements both types with these key features:

- **Proximity Detection**: Delayed offside only triggers when an offside player gets within 10 meters of the puck **AND** the puck is in the offensive zone
- **Comprehensive Tracking**: Monitors ALL players in the offensive zone, not just originally offside players
- **Proactive Zone Entry Tracking**: Tracks players who enter offensive zones without the puck (critical for scenario 3)
- **Realistic Faceoff Positioning**: Places faceoffs at appropriate neutral zone locations
- **Complete State Reset**: Clears all tracking data after offside violations to prevent false positives
- **Player Barrier Integration**: Works with goal barriers to prevent exploitation

## System Architecture

### Core Components

```
┌─────────────────────────────────────────────┐
│           OffsideDetectionService           │
├─────────────────────────────────────────────┤
│ • Blue line crossing detection              │
│ • Player position tracking                  │
│ • Proactive zone entry tracking            │
│ • Delayed offside management                │
│ • Proximity violation checking              │
│ • Puck zone validation                      │
│ • Complete state reset management           │
│ • Faceoff location determination            │
└─────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────┐
│          HockeyGameManager                  │
├─────────────────────────────────────────────┤
│ • Faceoff execution                         │
│ • Player positioning                        │
│ • Camera management                         │
│ • Timer pause/resume                        │
│ • State reset coordination                  │
└─────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────┐
│        PlayerSpawnManager                   │
├─────────────────────────────────────────────┤
│ • Faceoff formation setup                   │
│ • Player rotation preservation              │
│ • Team-based positioning                    │
│ • Post-faceoff state cleanup                │
└─────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────┐
│       IceSkatingController                  │
├─────────────────────────────────────────────┤
│ • Rotation preservation during faceoffs     │
│ • Movement restriction integration          │
└─────────────────────────────────────────────┘
```

### Data Structures

```typescript
// Player position tracking
interface PlayerPositionHistory {
  playerId: string;
  team: HockeyTeam;
  position: Vector3Like;
  zone: HockeyZone;
  timestamp: number;
}

// Delayed offside tracking
Map<string, {
  team: HockeyTeam;
  zone: HockeyZone;
  detectedTime: number;
}>

// Blue line crossing detection
interface BlueLLineCrossing {
  zone: HockeyZone;
  direction: 'entering' | 'exiting';
  crossingTeam: HockeyTeam;
  puckPosition: Vector3Like;
  timestamp: number;
}

// State management flags
private _offsideJustCalled: boolean = false;
private _lastFaceoffResetTime: number = 0;
private readonly FACEOFF_GRACE_PERIOD_MS: number = 3000;
```

## Offside Scenarios

### Scenario 1: Immediate Offside (Pass to Offside Player)

**Trigger**: Player passes to teammate who is already offside

**Flow**:
1. Player A enters offensive zone before puck → tracked for delayed offside
2. Player B passes puck to Player A → system detects proximity < 10m
3. **Immediate offside called** → faceoff in neutral zone

**Status**: ✅ Working correctly

### Scenario 2: Delayed Offside (Pass Far from Offside Player)

**Trigger**: Player passes into zone far from offside player, then offside player approaches

**Flow**:
1. Player A enters offensive zone before puck → tracked for delayed offside
2. Player B passes puck into zone (far from Player A) → delayed tracking continues
3. Player A approaches within 10m of puck → **delayed offside triggered**
4. Player can also skate back to neutral zone to clear tracking

**Status**: ✅ Working correctly

### Scenario 3: Immediate Offside (Puck Carrying) - **CRITICAL FIX**

**Trigger**: Player carries puck across blue line while teammates are already offside

**Flow**:
1. Player A enters offensive zone before puck → tracked for delayed offside
2. Player B carries puck across blue line → system detects puck control
3. **Immediate offside called on Player A** (not Player B who has the puck)
4. Faceoff in neutral zone

**Previous Issue**: This scenario wasn't working because proactive tracking was disabled

**Fix**: Re-implemented `trackPlayersEnteringOffensiveZones()` with proper zone transition detection

```typescript
// Key fix: Detect when players ENTER zones (not just when they're IN zones)
if (teamInfo.team === HockeyTeam.RED && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.BLUE_DEFENSIVE) {
  enteredOffensiveZone = HockeyZone.BLUE_DEFENSIVE;
} else if (teamInfo.team === HockeyTeam.BLUE && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.RED_DEFENSIVE) {
  enteredOffensiveZone = HockeyZone.RED_DEFENSIVE;
}

if (enteredOffensiveZone) {
  // Add to delayed tracking for scenario 3
  this._delayedOffsidePlayers.set(playerId, {
    team: teamInfo.team,
    zone: enteredOffensiveZone,
    detectedTime: currentTime
  });
}
```

**Status**: ✅ Fixed and working correctly

## Technical Implementation

### Key Methods

#### `checkForOffside(puckEntity, world)` - Main Orchestrator

```typescript
public checkForOffside(puckEntity: Entity | null, world: any): OffsideViolation | null {
  // Early exit conditions
  if (!this._isActive || !puckEntity || !puckEntity.isSpawned) return null;
  if (gameManager.state !== HockeyGameState.IN_PERIOD) return null;
  if (currentTime - this._lastOffsideTime < this._offsideCooldownMs) return null;

  // 1. Update player position history
  this.updatePlayerPositions(allPlayers, currentTime, world);
  
  // 2. Track players proactively entering offensive zones (CRITICAL for scenario 3)
  this.trackPlayersEnteringOffensiveZones(allPlayers, currentTime, world, currentPuckPosition);
  
  // 3. Detect blue line crossings
  const blueLLineCrossing = this.detectPuckBlueLLineCrossing(currentPuckPosition);
  
  // 4. Check for immediate violations on blue line crossing
  if (blueLLineCrossing) {
    const violation = this.checkOffsideViolation(blueLLineCrossing, allPlayers, currentTime, world);
    if (violation) {
      this._lastOffsideTime = currentTime;
      this._offsideJustCalled = true; // Disable new tracking until faceoff reset
      return violation;
    }
  }
  
  // 5. Clean up players who skated back onside
  this.cleanupDelayedOffsideTracking(allPlayers, world);
  
  // 6. Check delayed violations (proximity-based)
  const delayedViolation = this.checkDelayedOffsideViolations(currentPuckPosition, allPlayers, currentTime, world);
  if (delayedViolation) {
    this._lastOffsideTime = currentTime;
    return delayedViolation;
  }
  
  // Store position for next frame comparison
  this._previousPuckPosition = { ...currentPuckPosition };
  return null;
}
```

#### `trackPlayersEnteringOffensiveZones()` - Proactive Tracking (FIXED)

**Critical for Scenario 3**: This method tracks players who enter offensive zones without the puck

```typescript
private trackPlayersEnteringOffensiveZones(
  allPlayers: Map<string, Player>,
  currentTime: number,
  world: any,
  puckPosition: Vector3Like
): void {
  // Skip during disabled periods
  if (this._offsideJustCalled) return;
  if (currentTime - this._lastFaceoffResetTime < this.FACEOFF_GRACE_PERIOD_MS) return;

  allPlayers.forEach((player, playerId) => {
    if (this._delayedOffsidePlayers.has(playerId)) return; // Already tracking

    const teamInfo = gameManager.getTeamAndPosition(playerId);
    if (!teamInfo) return;

    // Get position history to detect zone transitions
    const history = this._playerPositionHistory.get(playerId);
    if (!history || history.length < 2) return;

    const previousRecord = history[history.length - 2];
    const currentZone = this.getZoneFromPosition(currentPlayerPosition);
    const previousZone = previousRecord.zone;

    // Detect zone entry transitions (neutral → offensive)
    let enteredOffensiveZone: HockeyZone | null = null;
    if (teamInfo.team === HockeyTeam.RED && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.BLUE_DEFENSIVE) {
      enteredOffensiveZone = HockeyZone.BLUE_DEFENSIVE;
    } else if (teamInfo.team === HockeyTeam.BLUE && previousZone === HockeyZone.NEUTRAL && currentZone === HockeyZone.RED_DEFENSIVE) {
      enteredOffensiveZone = HockeyZone.RED_DEFENSIVE;
    }

    if (enteredOffensiveZone) {
      // Check if entry is legal (puck already there or teammate has puck there)
      const puckZone = this.getZoneFromPosition(puckPosition);
      if (puckZone === enteredOffensiveZone) return; // Legal entry

      const puckController = this.getPuckController(allPlayers, world);
      if (puckController) {
        const controllerTeamInfo = gameManager.getTeamAndPosition(puckController);
        if (controllerTeamInfo && controllerTeamInfo.team === teamInfo.team && puckZone === enteredOffensiveZone) {
          return; // Legal entry - teammate has puck
        }
      }

      // Add to delayed tracking
      this._delayedOffsidePlayers.set(playerId, {
        team: teamInfo.team,
        zone: enteredOffensiveZone,
        detectedTime: currentTime
      });
    }
  });
}
```

#### `checkOffsideViolation()` - Immediate Offside Detection

Handles blue line crossings and existing delayed players:

```typescript
private checkOffsideViolation(
  crossing: BlueLLineCrossing, 
  allPlayers: Map<string, Player>,
  currentTime: number,
  world?: any
): OffsideViolation | null {
  // Only check when entering offensive zone
  if (crossing.direction !== 'entering' || crossing.zone === HockeyZone.NEUTRAL) return null;

  const attackingTeam = crossing.crossingTeam;
  const offensiveZone = crossing.zone;
  
  // Check for existing delayed players
  const existingDelayedPlayers = Array.from(this._delayedOffsidePlayers.entries())
    .filter(([_, info]) => info.team === attackingTeam && info.zone === offensiveZone)
    .map(([playerId, _]) => playerId);
  
  if (existingDelayedPlayers.length > 0) {
    const puckController = this.getPuckController(allPlayers, world);
    
    if (puckController) {
      // Someone is carrying the puck - check for immediate offside
      const otherDelayedPlayers = existingDelayedPlayers.filter(playerId => playerId !== puckController);
      
      if (otherDelayedPlayers.length > 0) {
        // IMMEDIATE OFFSIDE: Puck carrier entered while other players already offside
        
        // COMPLETE RESET: Clear ALL tracking data
        const totalClearedPlayers = this._delayedOffsidePlayers.size;
        this._delayedOffsidePlayers.clear();
        this._playerPositionHistory.clear();
        this._offsideJustCalled = true;
        
        return {
          violatingPlayerIds: otherDelayedPlayers,
          violatingTeam: attackingTeam,
          faceoffLocation: this.determineFaceoffLocation(crossing),
          timestamp: currentTime,
          puckPosition: crossing.puckPosition,
          blueLlineCrossedZone: crossing.zone
        };
      } else {
        // Legal entry - only puck carrier was tracked
        this._delayedOffsidePlayers.delete(puckController);
      }
    }
    // If puck was passed (not carried), continue with delayed system
  }

  // Check individual players for historical offside
  const immediateViolatingPlayerIds: string[] = [];
  const puckController = this.getPuckController(allPlayers, world);
  
  allPlayers.forEach((player, playerId) => {
    const teamInfo = gameManager.getTeamAndPosition(playerId);
    if (!teamInfo || teamInfo.team !== attackingTeam) return;
    
    // Skip puck controller - they can't be offside against themselves
    if (puckController === playerId) {
      if (this._delayedOffsidePlayers.has(playerId)) {
        this._delayedOffsidePlayers.delete(playerId);
      }
      return;
    }
    
    // Check if player was in zone before puck
    if (this.wasPlayerInZoneBeforePuckCrossing(playerId, offensiveZone, crossing.timestamp)) {
      // Use proximity system for delayed vs immediate offside
      const playerEntities = world?.entityManager?.getPlayerEntitiesByPlayer(player);
      if (playerEntities && playerEntities.length > 0) {
        const distance = calculateDistance(playerEntities[0].position, crossing.puckPosition);
        
        if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
          immediateViolatingPlayerIds.push(playerId);
        } else {
          // Add to delayed tracking
          this._delayedOffsidePlayers.set(playerId, {
            team: attackingTeam,
            zone: offensiveZone,
            detectedTime: currentTime
          });
        }
      }
    }
  });

  // Return immediate violation if any
  if (immediateViolatingPlayerIds.length > 0) {
    // COMPLETE RESET for immediate violations too
    this._delayedOffsidePlayers.clear();
    this._playerPositionHistory.clear();
    this._offsideJustCalled = true;
    
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
```

#### `checkDelayedOffsideViolations()` - Proximity-Based Detection (FIXED)

**Critical Fix**: Only triggers when puck is in the same zone as tracked players

```typescript
private checkDelayedOffsideViolations(
  puckPosition: Vector3Like,
  allPlayers: Map<string, Player>,
  currentTime: number,
  world?: any
): OffsideViolation | null {
  if (this._delayedOffsidePlayers.size === 0) return null;

  const violatingPlayerIds: string[] = [];
  let violatingTeam: HockeyTeam | null = null;
  let faceoffLocation: FaceoffLocation | null = null;

  // Get tracked teams and zones
  const trackedTeams = new Set<HockeyTeam>();
  const trackedZones = new Set<HockeyZone>();
  this._delayedOffsidePlayers.forEach((info) => {
    trackedTeams.add(info.team);
    trackedZones.add(info.zone);
  });

  const puckController = this.getPuckController(allPlayers, world);

  allPlayers.forEach((player, playerId) => {
    const teamInfo = gameManager.getTeamAndPosition(playerId);
    if (!teamInfo || !trackedTeams.has(teamInfo.team)) return;
    
    // Skip puck controller
    if (puckController === playerId) {
      if (this._delayedOffsidePlayers.has(playerId)) {
        this._delayedOffsidePlayers.delete(playerId);
      }
      return;
    }

    const currentPlayerZone = this.getZoneFromPosition(playerPosition);
    
    // Check if player is in tracked offensive zone
    let offensiveZone: HockeyZone | null = null;
    if (teamInfo.team === HockeyTeam.RED && currentPlayerZone === HockeyZone.BLUE_DEFENSIVE && trackedZones.has(HockeyZone.BLUE_DEFENSIVE)) {
      offensiveZone = HockeyZone.BLUE_DEFENSIVE;
    } else if (teamInfo.team === HockeyTeam.BLUE && currentPlayerZone === HockeyZone.RED_DEFENSIVE && trackedZones.has(HockeyZone.RED_DEFENSIVE)) {
      offensiveZone = HockeyZone.RED_DEFENSIVE;
    }

    if (!offensiveZone) return;

    // CRITICAL FIX: Only check proximity when puck is also in the same offensive zone
    const puckZone = this.getZoneFromPosition(puckPosition);
    if (puckZone !== offensiveZone) {
      CONSTANTS.debugLog(`🔍 Player ${playerId} in ${offensiveZone} but puck in ${puckZone} - no delayed violation (puck must be in same zone)`, 'OffsideDetectionService');
      return;
    }

    // Check proximity
    const distance = calculateDistance(playerPosition, puckPosition);
    if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
      violatingPlayerIds.push(playerId);
      violatingTeam = teamInfo.team;
      // Set faceoff location...
    }
  });

  if (violatingPlayerIds.length > 0 && violatingTeam && faceoffLocation) {
    // COMPLETE RESET for delayed violations
    this._delayedOffsidePlayers.clear();
    this._playerPositionHistory.clear();
    this._offsideJustCalled = true;

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
```

#### `resetAfterFaceoff()` - Complete State Reset

**Critical Fix**: Ensures clean slate after every faceoff

```typescript
public resetAfterFaceoff(currentPuckPosition?: Vector3Like): void {
  // Set previous puck position to prevent false zone entry detection
  this._previousPuckPosition = currentPuckPosition ? { ...currentPuckPosition } : null;
  
  // COMPLETE RESET: Clear all tracking data
  this._playerPositionHistory.clear();
  this._delayedOffsidePlayers.clear();
  
  // Re-enable tracking after faceoff positioning is complete
  this._offsideJustCalled = false;
  
  // Set grace period to prevent immediate false positives
  this._lastFaceoffResetTime = Date.now();
  
  CONSTANTS.debugLog(`🔄 Offside detection state reset after faceoff completion - tracking re-enabled with ${this.FACEOFF_GRACE_PERIOD_MS}ms grace period`, 'OffsideDetectionService');
}
```

### Zone Detection

Precise coordinate-based zone detection:

```typescript
private readonly ZONE_BOUNDARIES: ZoneBoundary = {
  redDefensiveMax: -6.5,  // Z < -6.5 is Red defensive zone
  blueDefensiveMin: 7.5   // Z > 7.5 is Blue defensive zone
};

public getZoneFromPosition(position: Vector3Like): HockeyZone {
  if (position.z < this.ZONE_BOUNDARIES.redDefensiveMax) {
    return HockeyZone.RED_DEFENSIVE;
  } else if (position.z > this.ZONE_BOUNDARIES.blueDefensiveMin) {
    return HockeyZone.BLUE_DEFENSIVE;
  } else {
    return HockeyZone.NEUTRAL;
  }
}
```

### Faceoff Positioning

Strategic faceoff locations based on puck position and crossing point:

```typescript
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

private determineFaceoffLocation(crossing: BlueLLineCrossing): FaceoffLocation {
  const puckPosition = crossing.puckPosition;
  
  // Determine candidate locations based on violation zone
  let candidateLocations: FaceoffLocation[] = [];
  if (crossing.zone === HockeyZone.RED_DEFENSIVE) {
    candidateLocations = [FaceoffLocation.RED_NEUTRAL_LEFT, FaceoffLocation.RED_NEUTRAL_RIGHT];
  } else {
    candidateLocations = [FaceoffLocation.BLUE_NEUTRAL_LEFT, FaceoffLocation.BLUE_NEUTRAL_RIGHT];
  }
  
  // Find closest faceoff location to puck position
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
  
  return closestLocation;
}
```

## Critical Bug Fixes

### 1. Scenario 3 Fix: Proactive Zone Entry Tracking

**Issue**: Players could carry the puck into offensive zones while teammates were offside without triggering offside.

**Root Cause**: The `trackPlayersEnteringOffensiveZones()` method was disabled due to previous false positive issues.

**Solution**: Re-implemented with proper zone transition detection instead of static zone checking.

**Before (Broken)**:
```typescript
// This was checking if players were currently IN zones (every frame)
if (currentPlayerZone === HockeyZone.BLUE_DEFENSIVE) {
  // Add to tracking - this fired constantly!
}
```

**After (Fixed)**:
```typescript
// Now checks for zone TRANSITIONS (neutral → offensive)
const history = this._playerPositionHistory.get(playerId);
const previousRecord = history[history.length - 2];
const previousZone = previousRecord.zone;

if (teamInfo.team === HockeyTeam.RED && 
    previousZone === HockeyZone.NEUTRAL && 
    currentZone === HockeyZone.BLUE_DEFENSIVE) {
  // Only fires ONCE when player enters zone
  enteredOffensiveZone = HockeyZone.BLUE_DEFENSIVE;
}
```

**Impact**: Scenario 3 now works perfectly - when Player A skates into offensive zone, then Player B carries puck in, offside is immediately called on Player A.

### 2. Puck Zone Validation Fix

**Issue**: Delayed offside was triggering when players were in offensive zones but puck was in neutral zone (e.g., at faceoff dots).

**Root Cause**: Proximity checking didn't validate that the puck was actually in the same zone as the tracked players.

**Solution**: Added puck zone validation before proximity checking.

**Before (Broken)**:
```typescript
// This would trigger offside if player in blue zone was near puck in neutral zone
if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
  // VIOLATION - incorrect!
}
```

**After (Fixed)**:
```typescript
// CRITICAL FIX: Only check proximity when puck is also in the same offensive zone
const puckZone = this.getZoneFromPosition(puckPosition);
if (puckZone !== offensiveZone) {
  return; // No violation - puck not in same zone
}

if (distance <= CONSTANTS.OFFSIDE_DETECTION.PROXIMITY_DISTANCE) {
  // VIOLATION - correct!
}
```

**Impact**: Players can now move freely in offensive zones when puck is in neutral zone without triggering false offsides.

### 3. Complete State Reset Fix

**Issue**: After faceoffs, stale tracking data caused false offside calls when players would cross blue lines.

**Root Cause**: Tracking data (position history, delayed players) wasn't being cleared after offside violations.

**Solution**: Complete state reset after every offside call and faceoff.

**Implementation**:
```typescript
// Set flag when any offside is detected
this._offsideJustCalled = true;

// Complete reset in all violation returns
this._delayedOffsidePlayers.clear();
this._playerPositionHistory.clear();
this._offsideJustCalled = true;

// Reset after faceoff completion
public resetAfterFaceoff(currentPuckPosition?: Vector3Like): void {
  this._previousPuckPosition = currentPuckPosition ? { ...currentPuckPosition } : null;
  this._playerPositionHistory.clear();
  this._delayedOffsidePlayers.clear();
  this._offsideJustCalled = false;
  this._lastFaceoffResetTime = Date.now();
}
```

**Grace Period**: 3-second grace period after faceoffs prevents immediate false positives during player positioning.

**Impact**: Clean slate after every offside ensures no false positives from stale data.

### 4. Puck Controller Exclusion Fix

**Issue**: Players could be called offside against themselves when carrying the puck.

**Root Cause**: System didn't properly identify and exclude the puck carrier from offside violations.

**Solution**: Comprehensive puck controller detection and exclusion across all violation types.

**Implementation**:
```typescript
private getPuckController(allPlayers: Map<string, Player>, world?: any): string | null {
  for (const [playerId, player] of allPlayers) {
    const playerEntity = playerEntities[0];
    const controller = playerEntity.controller;
    
    if (controller && controller.isControllingPuck) {
      return playerId;
    }
  }
  return null;
}

// In violation checking:
if (puckController === playerId) {
  // Clear from tracking and skip all offside checks
  if (this._delayedOffsidePlayers.has(playerId)) {
    this._delayedOffsidePlayers.delete(playerId);
  }
  return; // Skip all offside checks for puck controller
}
```

**Impact**: Puck carriers can never be called offside against themselves, following proper hockey rules.

## Configuration

### Constants

```typescript
// Proximity distance for delayed offside detection
export const OFFSIDE_DETECTION = {
  PROXIMITY_DISTANCE: 10.0, // meters
};

// Position tracking settings
private readonly MAX_POSITION_HISTORY = 10;
private readonly POSITION_HISTORY_DURATION = 5000; // 5 seconds

// Cooldown between offside calls
private _offsideCooldownMs: number = 3000; // 3 seconds

// Grace period after faceoff
private readonly FACEOFF_GRACE_PERIOD_MS: number = 3000; // 3 seconds
```

### Debug Controls

Comprehensive debugging tools for development:

```typescript
// Toggle offside-only debug output
export const OFFSIDE_DEBUG_FILTER = false;

// Console commands for testing
offsideon()  // Enable offside debug filter
offsideoff() // Disable offside debug filter

// Debug logging provides detailed flow information
CONSTANTS.debugLog(`🟡 DELAYED TRACKING ADDED: Player ${playerId} (${teamInfo.team}) entered ${enteredOffensiveZone} without puck`, 'OffsideDetectionService');
CONSTANTS.debugLog(`🔍 Player ${playerId} in ${offensiveZone} but puck in ${puckZone} - no delayed violation`, 'OffsideDetectionService');
CONSTANTS.debugLog(`🚨 IMMEDIATE OFFSIDE (CARRIED): Player ${puckController} carried puck into ${offensiveZone} while ${otherDelayedPlayers.length} OTHER players already offside`, 'OffsideDetectionService');
```

## Testing Scenarios

### Test Case 1: Basic Immediate Offside (Pass)
1. Player A skates into offensive zone
2. Player B passes puck to Player A (within 10m)
3. **Expected**: Immediate offside violation
4. **Status**: ✅ Working

### Test Case 2: Delayed Offside - Original Player
1. Player A skates into offensive zone
2. Player B passes puck into zone (far from Player A)
3. Player A skates toward puck and gets within 10m
4. **Expected**: Delayed offside violation
5. **Status**: ✅ Working

### Test Case 3: Immediate Offside (Puck Carrying) - **CRITICAL**
1. Player A skates into offensive zone
2. Player B carries puck across blue line
3. **Expected**: Immediate offside violation on Player A
4. **Previous Status**: ❌ Broken (scenario 3 issue)
5. **Current Status**: ✅ Fixed with proactive tracking

### Test Case 4: Player Skating Back Onside
1. Player A skates into offensive zone
2. Player B passes puck into zone
3. Player A skates back to neutral zone
4. Player C enters zone and retrieves puck
5. **Expected**: No violation (Player A cleared from tracking)
6. **Status**: ✅ Working

### Test Case 5: False Positive Prevention (Puck in Neutral Zone)
1. Player A skates into offensive zone → tracked
2. Puck remains in neutral zone (e.g., at faceoff dot)
3. Player A moves around in offensive zone near blue line
4. **Expected**: No violation (puck not in same zone)
5. **Previous Status**: ❌ Broken (false offside calls)
6. **Current Status**: ✅ Fixed with puck zone validation

### Test Case 6: Post-Faceoff Clean Slate
1. Trigger any offside violation
2. Complete faceoff sequence
3. Immediately have any player cross blue line
4. **Expected**: No false offside (clean state)
5. **Previous Status**: ❌ Broken (stale data causing false positives)
6. **Current Status**: ✅ Fixed with complete state reset

### Test Case 7: Puck Controller Re-Entry
1. Player A controls puck, enters zone legally
2. Player A exits zone while controlling puck
3. Player A re-enters zone while still controlling puck
4. **Expected**: No violation (can't be offside against yourself)
5. **Status**: ✅ Working

### Test Case 8: Cross-Team Independence
1. Red Player A goes offside in blue zone
2. Blue Player B carries puck into red zone  
3. **Expected**: No violation (different teams/zones)
4. **Status**: ✅ Working

## Integration Points

### HockeyGameManager Integration

```typescript
// In HockeyGameManager.update()
const offsideViolation = this._offsideDetectionService.checkForOffside(puckEntity, world);

if (offsideViolation) {
  this.handleOffsideViolation(offsideViolation, world);
}

private async handleOffsideViolation(violation: OffsideViolation, world: any): Promise<void> {
  // Pause game timer
  this._periodManager.pauseTimer();
  
  // Execute faceoff
  await this._playerSpawnManager.performOffsideFaceoff(violation, world);
  
  // CRITICAL: Reset offside detection state after faceoff
  this._offsideDetectionService.resetAfterFaceoff(puckEntity?.position);
  
  // Resume game timer
  this._periodManager.resumeTimer();
}
```

### PlayerSpawnManager Integration

```typescript
// After faceoff completion
public async performOffsideFaceoff(violation: OffsideViolation, world: any): Promise<void> {
  // ... faceoff logic ...
  
  // Ensure state is reset after faceoff completes
  const puckEntity = world.entityManager.getEntityByType('puck')[0];
  this._offsideDetectionService.resetAfterFaceoff(puckEntity?.position);
}
```

### IceSkatingController Integration

```typescript
// Preserve player rotations during faceoffs
public preserveFaceoffRotation(duration: number, rotation: number): void {
  this._preserveFaceoffRotationUntil = Date.now() + duration;
  this._faceoffRotation = rotation;
}
```

## Performance Considerations

### Optimization Strategies

1. **Efficient Zone Checks**: Simple coordinate comparisons
2. **Lazy Evaluation**: Distance calculations only when needed
3. **History Cleanup**: Automatic pruning of old data
4. **Conditional Processing**: Skip expensive checks when possible
5. **State Flags**: Use `_offsideJustCalled` to disable processing during faceoffs

### Memory Management

```typescript
// Automatic cleanup of old position history
const cutoffTime = currentTime - this.POSITION_HISTORY_DURATION;
const filteredHistory = history.filter(record => record.timestamp > cutoffTime);

// Limit maximum entries per player
if (filteredHistory.length > this.MAX_POSITION_HISTORY) {
  filteredHistory.splice(0, filteredHistory.length - this.MAX_POSITION_HISTORY);
}
```

## Future Enhancements

### Potential Improvements

1. **Video Replay System**: Integration with replay functionality for offside reviews
2. **AI Referee**: Machine learning for edge case decisions
3. **Advanced Analytics**: Heat maps showing offside frequency
4. **Custom Rule Sets**: Support for different league rules (NHL, IIHF, etc.)
5. **Predictive Tracking**: Anticipate potential offside situations
6. **Network Optimization**: Reduce bandwidth for multiplayer synchronization

### Implementation Considerations

1. **Multi-Game Support**: Extend to handle multiple simultaneous games
2. **Real-time Spectator Features**: Live offside tracking for viewers
3. **Tournament Integration**: Advanced statistics for competitive play
4. **Accessibility Features**: Visual indicators for offside situations

## Conclusion

The FACE-OFF offside detection system provides a robust, realistic implementation of hockey's most complex rule. The system has been thoroughly tested and debugged to handle all major offside scenarios:

✅ **Scenario 1**: Pass to offside player (immediate)
✅ **Scenario 2**: Pass far from offside player (delayed)  
✅ **Scenario 3**: Carry puck while teammates offside (immediate)
✅ **False Positive Prevention**: Puck zone validation
✅ **State Management**: Complete reset after violations
✅ **Puck Carrier Protection**: No self-offside violations

The modular architecture, comprehensive testing, and detailed debugging make this a solid foundation for any hockey simulation game. The fixes implemented ensure realistic gameplay while preventing exploitation and false positives.

## Code References

- **Main Service**: `classes/services/OffsideDetectionService.ts`
- **Game Integration**: `classes/managers/HockeyGameManager.ts`  
- **Faceoff Management**: `classes/managers/PlayerSpawnManager.ts`
- **Player Control**: `classes/controllers/IceSkatingController.ts`
- **Configuration**: `classes/utils/constants.ts`
- **Type Definitions**: `classes/utils/types.ts` 