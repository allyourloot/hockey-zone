# Hockey Zone Audio Debugging Guide

## 🚨 Audio Degradation Issue

You've reported that audio deteriorates after about a minute and progressively gets worse until it goes silent. This document outlines the comprehensive debugging system we've implemented to diagnose and fix this issue.

## 🔧 What We've Implemented

### 1. Enhanced AudioManager with Debugging

The `AudioManager` has been upgraded with comprehensive monitoring and debugging capabilities:

- **Real-time monitoring**: Analyzes audio health every 5 seconds
- **Memory tracking**: Estimates audio memory usage
- **Degradation detection**: Automatically identifies problematic patterns
- **Emergency cleanup**: Triggers automatic cleanup when issues are detected
- **Comprehensive logging**: Detailed audio lifecycle tracking

### 2. Audio Debug Commands

We've added several chat commands to help diagnose issues in real-time:

| Command | Description |
|---------|-------------|
| `/audiohelp` | Shows all available audio debug commands |
| `/audioinfo` | Shows comprehensive audio system status |
| `/audioworld` | Lists all audio instances using Hytopia's API |
| `/audiocleanup` | Forces manual cleanup of audio instances |
| `/audioanalyze` | Forces manual analysis and reports results |
| `/audioreset` | Resets degradation detection flag |
| `/audiotest` | Plays test sound to verify system works |

### 3. Improved Performance Settings

We've adjusted the audio performance constants to be more conservative:

```typescript
CLEANUP_DELAY: 3000,              // Reduced from 5s to 3s
MAX_CONCURRENT_SOUNDS: 15,        // Reduced from 20 to 15
SOUND_COOLDOWN_GLOBAL: 100,       // Increased from 50ms to 100ms
EMERGENCY_CLEANUP_THRESHOLD: 25,  // New emergency threshold
MAX_AUDIO_MEMORY_MB: 40,          // New memory limit
OLD_AUDIO_THRESHOLD: 180000,      // 3 minutes for "old" audio
```

## 🔍 How to Debug the Issue

### Step 1: Start Your Game
Run your game normally and play for a few minutes to reproduce the issue.

### Step 2: Monitor Audio Health
Use these commands to monitor what's happening:

```
/audioinfo    # Get overall status
/audioworld   # See all world audio instances
```

### Step 3: Look for Warning Signs
Watch for these indicators in console or chat:

- **🚨 AUDIO DEGRADATION DETECTED:** messages
- High number of "unmanaged" audios vs "managed" audios
- Memory estimates above 40MB
- Very old audio instances (5+ minutes)
- Many looped audios (5+)

### Step 4: Identify the Source
The debug system will help identify:

- Whether the issue is with **managed** or **unmanaged** audio instances
- Which specific audio files are accumulating
- Entity-attached vs global audio problems
- Memory leak patterns

## 🎯 Likely Causes & Solutions

### Cause 1: Unmanaged Audio Instances
**Problem**: Many audio effects are created with `new Audio()` instead of the managed system.

**Detection**: `/audioinfo` shows many more "unmanaged" than "managed" audios.

**Solution**: Migrate audio creation to use `AudioManager.instance.createAndPlayManagedAudio()`.

### Cause 2: Entity-Attached Audio Not Cleaned Up
**Problem**: Audio attached to entities isn't cleaned up when entities are removed.

**Detection**: `/audioworld` shows many entity-attached audios.

**Solution**: Ensure proper cleanup when entities despawn.

### Cause 3: Looped Audio Accumulation
**Problem**: Background music or ambient sounds are being created multiple times.

**Detection**: High number of looped audios in `/audioinfo`.

**Solution**: Proper management of background music lifecycle.

### Cause 4: Ice Skating Sound Issues
**Problem**: The continuous ice skating sound might be creating audio instances repeatedly.

**Detection**: Look for ice-skating.mp3 files in `/audioworld`.

**Solution**: Use a single looped audio instance instead of creating new ones.

## 🛠️ Immediate Migration Example

Here's how to migrate problematic audio code. Instead of:

```typescript
// OLD - Creates unmanaged audio
new Audio({ 
  uri: 'audio/sfx/hockey/swing-stick.mp3', 
  volume: 0.6, 
  attachedToEntity: entity 
}).play(entity.world, true);
```

Use:

```typescript
// NEW - Creates managed audio
AudioManager.instance.createAndPlayManagedAudio({
  uri: CONSTANTS.AUDIO_PATHS.SWING_STICK,
  volume: 0.6,
  attachedToEntity: entity
}, entity.world, true, 'effect');
```

## 🔄 Testing Process

1. **Reproduce the issue** - Play for 1-2 minutes until audio starts degrading
2. **Run diagnostics** - Use `/audioinfo` and `/audioworld` to see the state
3. **Capture baseline** - Note the numbers when audio is working fine
4. **Monitor changes** - Watch how numbers change as degradation occurs
5. **Identify patterns** - Look for which audio types are accumulating

## 📊 What to Look For

### Healthy Audio System:
- Total audios: 5-15
- Managed > Unmanaged
- Memory: < 20MB
- No very old audios
- Looped audios: 1-3

### Problematic Audio System:
- Total audios: 25+
- Unmanaged >> Managed
- Memory: > 40MB
- Old audios: 300+ seconds
- Looped audios: 5+

## 🚀 Next Steps

1. **Start with diagnostics**: Use the debug commands to understand current state
2. **Identify the culprit**: Find which audio files/types are accumulating
3. **Migrate critical paths**: Start with the most frequently played sounds
4. **Monitor improvements**: Use the debug system to verify fixes

The system will automatically detect degradation and attempt emergency cleanup, but the real solution is migrating to the managed audio system for all audio creation.

## 🏒 Hockey-Specific Considerations

Pay special attention to:
- **Ice skating sounds** (played continuously)
- **Stick collision sounds** (played frequently)
- **Puck collision sounds** (played rapidly)
- **Body check sounds** (might accumulate during gameplay)

These are likely the main sources of audio accumulation in your hockey game. 