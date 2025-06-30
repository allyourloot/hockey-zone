# Automatic Puck Respawn System

## Overview
The **PuckBoundaryService** automatically monitors the puck position and triggers respawn sequences when the puck tunnels through walls or goes out of bounds. This eliminates the need for manual `/spawnpuck` commands.

## Features
- **Real-time monitoring**: Uses `EntityEvent.TICK` to continuously check puck position
- **Smart respawn logic**: Different behavior during active gameplay vs other game states
- **Existing system integration**: Uses your existing reset functions and countdown systems
- **Audio feedback**: Plays referee whistle and countdown sounds
- **Collision avoidance**: 2-second cooldown prevents rapid respawn triggers

## Boundary Limits
The system monitors these coordinates (adjustable):
- **X axis**: -35 to +35 (wide buffer to prevent false triggers)
- **Z axis**: -50 to +50 (wide buffer to prevent false triggers) 
- **Y axis**: 0.5 to 10 (below floor to reasonable height)

**Note**: Boundaries were widened significantly to prevent false triggers when players skate into walls while controlling the puck.

## Automatic Behavior

### During Active Gameplay (`IN_PERIOD` state)
1. Detects puck out of bounds
2. **Pauses game timer** (both backend and UI scoreboard)
3. Broadcasts "Puck out of bounds - Resuming play..." message
4. Plays referee whistle
5. Resets all players to spawn positions
6. Resets puck to center ice (spawns new puck)
7. Starts 3-second countdown ("Resuming play")
8. **Resumes game timer** with proper time adjustment
9. Resumes play with "GO!" message

### During Other Game States
1. Detects puck out of bounds
2. Simply resets puck to center ice
3. Continues monitoring after 1-second delay

## Testing Commands

### Basic Testing
- `/boundaryinfo` - Check monitoring status and current puck position
- `/testboundary` - Teleport puck outside bounds to test automatic respawn
- `/spawnpuck` - Create new puck with boundary monitoring enabled

### Advanced Configuration
- `/setboundary X_MAX 30` - Adjust boundary limits (X_MIN, X_MAX, Z_MIN, Z_MAX, Y_MIN, Y_MAX)
- `/resetboundary` - Reset all boundaries to default values

### Debug Filtering
Enable boundary-only logging in console:
```javascript
boundaryon    // Show only boundary service logs
boundaryoff   // Show all logs again
```

## Integration Points

### Automatic Initialization
- Service initializes when server starts
- Automatically monitors pucks created via `/spawnpuck`
- Automatically monitors pucks created during normal gameplay
- Stops monitoring when pucks are despawned

### Existing System Compatibility
- Uses `PlayerSpawnManager.performCompleteReset()` for full resets
- Uses `PlayerSpawnManager.resetPuckToCenterIce()` for simple resets
- Uses `HockeyGameManager` countdown system
- Uses `AudioManager` for whistle and countdown sounds
- Respects game state from `HockeyGameManager.instance.state`

## Performance
- Boundary checks run on puck tick events (optimized)
- 2-second cooldown prevents rapid triggers
- Monitoring automatically starts/stops with puck lifecycle
- Debug logging can be filtered to reduce console noise

## File Structure
```
classes/services/PuckBoundaryService.ts    # Main boundary service
index.ts                                   # Service initialization  
classes/managers/PlayerManager.ts          # Auto-start monitoring on puck spawn
classes/managers/ChatCommandManager.ts     # Debug commands and manual spawn integration
classes/utils/constants.ts                 # Debug filtering support
```

## Example Usage Scenarios

1. **Puck tunnels through wall during high-speed play**
   - System detects position outside boundaries
   - Automatically triggers full reset with countdown
   - Play resumes seamlessly

2. **Puck gets stuck in geometry**
   - Use `/testboundary` to manually trigger respawn
   - Or adjust boundaries temporarily with `/setboundary`

3. **Debugging boundary issues**
   - Enable `boundaryon` for detailed logs
   - Use `/boundaryinfo` to check current status
   - Adjust limits with `/setboundary` as needed

The system is designed to be completely transparent during normal gameplay while providing powerful debugging tools when needed.

## Recent Fixes (Latest Update)

✅ **Fixed puck not respawning**: Now properly resets puck to center ice after boundary violation  
✅ **Fixed players not resetting**: Now properly teleports all players to spawn positions  
✅ **Fixed countdown UI**: Now shows proper "Resuming Play" countdown overlay with "GO!" message  
✅ **Fixed repeated whistle**: Now plays whistle only once per boundary violation  
✅ **Fixed false triggers**: Widened boundaries to prevent detection when skating into walls  
✅ **Fixed puck reference**: Now gets fresh puck reference after reset to resume monitoring  
✅ **Fixed scoreboard timer**: Now properly pauses UI timer during boundary reset (no more countdown during overlay)  

The system now works exactly like the goal reset system with proper UI, audio, player/puck positioning, and synchronized timer management. 