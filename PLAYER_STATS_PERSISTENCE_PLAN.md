# Player Stats Persistence Implementation Plan

## 🎉 MAJOR PROGRESS UPDATE - Phases 1 & 2 COMPLETED! 

### ✅ What's Been Accomplished
- **✅ Persistent Stats Infrastructure**: Complete `PersistentPlayerStatsManager` class with async load/save operations
- **✅ Win/Loss Tracking**: Fully implemented individual player win/loss recording on game end
- **✅ Real-time Stats Persistence**: Goals, assists, and saves are now saved immediately to persistent storage
- **✅ Player Lifecycle Integration**: Stats are loaded on player join and saved on player leave
- **✅ Game End Integration**: All stats are saved and wins/losses recorded when games conclude

### 🔧 Technical Implementation Details
- Uses Hytopia's player-specific persistence with `player.getPersistedData()` and `player.setPersistedData()`
- Implements caching layer to avoid repeated database hits
- Handles async operations with proper error handling and fallbacks
- Tracks 11 different stat categories including new wins/losses

### 🎯 Ready for Testing
The core persistence system is now functional and ready for testing. Players should see their career stats persist across game sessions!

## Overview
Implement persistent player statistics across game sessions using Hytopia's PersistenceManager to save Goals, Assists, Saves, Wins, and Losses for each player.

## Current State Analysis

### ✅ Already Implemented
- **Goals**: Tracked in `PlayerStatsManager.recordGoal()`
- **Assists**: Tracked in `PlayerStatsManager.recordGoal()` (assistId parameter)
- **Saves**: Tracked in `PlayerStatsManager.recordShot()` and `saveRecorded()`

### ❌ Missing Implementation
- **Wins/Losses**: Not currently tracked for individual players
- **Data Persistence**: No use of Hytopia's PersistenceManager
- **Cross-session Stats**: Stats reset each game/server restart

## Implementation Phases

### Phase 1: Setup Persistence Infrastructure ✅ COMPLETED
**Goal**: Integrate Hytopia's PersistenceManager and create persistent stats interface

**Tasks**:
- [x] Create `PersistentPlayerStatsManager` class
- [x] Define `PersistentPlayerStats` interface 
- [x] Implement `loadPlayerStats()` and `savePlayerStats()` methods
- [x] Add persistence layer to existing `PlayerStatsManager`

**Files to Modify**:
- Create: `classes/managers/PersistentPlayerStatsManager.ts` ✅
- Modify: `classes/managers/PlayerStatsManager.ts` ✅

### Phase 2: Implement Win/Loss Tracking ✅ COMPLETED
**Goal**: Add win/loss tracking to individual players

**Tasks**:
- [x] Modify `HockeyGameManager.endGame()` to determine winners/losers
- [x] Add `recordWin()` and `recordLoss()` methods to `PlayerStatsManager`
- [x] Update persistent stats interface to include wins/losses
- [x] Test win/loss assignment logic

**Files to Modify**:
- `classes/managers/HockeyGameManager.ts` ✅
- `classes/managers/PlayerStatsManager.ts` ✅
- `classes/utils/types.ts` ✅ (via PersistentPlayerStats interface)

### Phase 3: Integrate Persistence with Game Flow ⭐ NEXT
**Goal**: Ensure stats are loaded/saved at appropriate times

**Tasks**:
- [x] Load player stats when player joins world (via `initializePlayer`)
- [x] Save stats when player leaves world (via `removePlayer`)
- [x] Save stats when game ends (via `endGame`)
- [x] Save stats on goal/assist/save events (real-time updates)
- [ ] Add periodic saving during gameplay (safety net)
- [ ] Handle edge cases (server crashes, disconnections)
- [ ] Test full integration in game environment

**Files to Modify**:
- `classes/managers/HockeyGameManager.ts` ✅ (partially)
- Main game initialization files (pending)

### Phase 4: Enhanced Stats UI & Display
**Goal**: Show persistent stats to players

**Tasks**:
- [ ] Update UI to display persistent career stats
- [ ] Add "All-Time Stats" vs "Current Game Stats" views
- [ ] Show top players leaderboard
- [ ] Add stat comparison features

**Files to Modify**:
- UI files in `assets/ui/`
- Frontend communication code

### Phase 5: Advanced Features & Polish
**Goal**: Add advanced persistence features

**Tasks**:
- [ ] Implement stat history/trends
- [ ] Add achievement/milestone tracking
- [ ] Implement stat reset functionality
- [ ] Add backup/restore capabilities
- [ ] Performance optimization for large datasets

## Technical Specifications

### Persistent Data Structure
```typescript
interface PersistentPlayerStats {
  playerId: string;
  playerName: string;
  totalGames: number;
  
  // Core Stats
  goals: number;
  assists: number;
  saves: number;
  wins: number;
  losses: number;
  
  // Additional Career Stats
  gamesPlayed: number;
  shotsOnGoal: number;
  shotsBlocked: number;
  hits: number;
  penaltyMinutes: number;
  
  // Performance Metrics
  winRate: number; // calculated field
  pointsPerGame: number; // calculated field
  savesPerGame: number; // calculated field
  
  // Timestamps
  firstGameDate: number; // Unix timestamp
  lastGameDate: number; // Unix timestamp
  lastUpdated: number; // Unix timestamp
}
```

### Data Storage Strategy
- **Key Pattern**: `player-stats-{playerId}`
- **Storage Type**: Per-player persistence using Hytopia's player-specific data
- **Backup Pattern**: `player-stats-backup-{playerId}` for redundancy
- **Update Frequency**: 
  - Save on goal/assist/save events (immediate)
  - Save on game end (comprehensive)
  - Save on player disconnect (safety)

### Error Handling
- Graceful degradation if persistence fails
- Retry logic for failed saves
- Local fallback storage during network issues
- Data validation before persistence

## Implementation Progress Tracking

### Phase 1: Infrastructure ✅ COMPLETED
- [x] Create PersistentPlayerStatsManager class
- [x] Implement basic load/save methods
- [x] Add persistence to PlayerStatsManager
- [x] Test basic persistence functionality

### Phase 2: Win/Loss Tracking ✅ COMPLETED
- [x] Add win/loss logic to HockeyGameManager
- [x] Implement recordWin/recordLoss methods
- [x] Test game outcome assignment
- [x] Verify stats accuracy

### Phase 3: Game Integration ⭐ MOSTLY COMPLETE
- [x] Player join/leave persistence
- [x] Game end stat finalization
- [x] Error handling and edge cases
- [ ] Periodic saves during gameplay (optional enhancement)

### Phase 4: UI Enhancement ⏳
- [ ] Career stats display
- [ ] Leaderboard implementation
- [ ] Stat comparison features
- [ ] UI/UX improvements

### Phase 5: Advanced Features ⏳
- [ ] Achievement system
- [ ] Stat analytics
- [ ] Performance optimization
- [ ] Final testing and polish

## Testing Strategy
1. **Unit Tests**: Test individual persistence methods
2. **Integration Tests**: Test with real game scenarios
3. **Edge Case Tests**: Handle disconnections, errors, etc.
4. **Performance Tests**: Verify scalability with many players
5. **Data Integrity Tests**: Ensure stats remain accurate across sessions

## Rollout Plan
1. **Development Testing**: Local testing with bun server
2. **Alpha Testing**: Small group testing
3. **Beta Testing**: Broader community testing
4. **Production Release**: Full feature release

---

## Notes
- Hytopia's persistence system uses JSON-formatted data
- Local development stores data in `dev/` directory
- Production will use Hytopia's cloud persistence services
- Consider implementing data migration if schema changes are needed

## Dependencies
- Hytopia SDK PersistenceManager
- Existing PlayerStatsManager
- Existing HockeyGameManager
- UI components for displaying persistent stats 