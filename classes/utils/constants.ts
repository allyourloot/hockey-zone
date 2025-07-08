/**
 * Constants for the FACE-OFF game
 * Extracted from IceSkatingController and other components
 */

// =========================
// DEVELOPMENT & PERFORMANCE CONSTANTS
// =========================
export const DEBUG_MODE = true; // Set to true during development, false for production

// NEW: Audio-only debug filter for isolating AudioManager logs
export const AUDIO_DEBUG_FILTER = false; // Set to true to show ONLY AudioManager logs

// NEW: Save detection debug filter for isolating SaveDetectionService logs
export const SAVE_DEBUG_FILTER = false; // Set to true to show ONLY SaveDetectionService logs

// NEW: Offside detection debug filter for isolating OffsideDetectionService logs
export const OFFSIDE_DEBUG_FILTER = false; // Set to true to show ONLY OffsideDetectionService logs

// NEW: Boundary detection debug filter for isolating PuckBoundaryService logs
export const BOUNDARY_DEBUG_FILTER = false; // Set to true to show ONLY PuckBoundaryService logs

// NEW: Entity state debugging filter for detailed entity validation debugging
export const ENTITY_DEBUG_FILTER = false; // Set to true to show detailed entity state debugging

// NEW: Cleanup debugging filter for controller cleanup operations  
export const CLEANUP_DEBUG_FILTER = false; // Set to true to show cleanup debugging

// NEW: Audio error filtering - hide/show audio-related errors
export const AUDIO_ERROR_FILTER = false; // Set to false to hide audio errors

// NEW: UI debug filter for isolating UI-related logs and events
export const UI_DEBUG_FILTER = false; // Set to true to show UI debug messages (disabled by default to reduce spam)

// NOTE: Toggle this to false for multiplayer performance.
// Set to true only when debugging specific issues locally.

// =========================
// ICE SKATING PHYSICS CONSTANTS
// =========================
export const ICE_SKATING = {
  // Basic movement
  ICE_ACCELERATION: 0.08,
  ICE_DECELERATION: 0.985,
  ICE_MAX_SPEED_MULTIPLIER: 1.8,
  DIRECTION_CHANGE_PENALTY: 0.5,
  SPRINT_ACCELERATION_RATE: 0.008,
  SPRINT_DECELERATION_RATE: 0.02,
  MIN_SPEED_FACTOR: 0.4,
  ACCELERATION_CURVE_POWER: 1.8,
  BACKWARD_SPEED_PENALTY: 0.8,
  BACKWARD_ACCELERATION_PENALTY: 0.8,
} as const;

// =========================
// HOCKEY STOP CONSTANTS
// =========================
export const HOCKEY_STOP = {
  DURATION: 400, // Shorter duration for less dramatic movement (was 700)
  DECELERATION: 0.85, // Much more deceleration to nearly stop player (was 0.92)
  TURN_SPEED: 15, // Keep current turn speed
  MIN_SPEED: 8, // Keep the same minimum speed requirement
  COOLDOWN: 4000, // Keep current cooldown
  MOMENTUM_PRESERVATION: 0.02, // Minimal momentum preservation - almost complete stop (was 0.1)
  SPEED_BOOST: 0.0, // No speed boost at all to prevent any dramatic movement (was 0.02)
  MAX_ANGLE: 15, // Reduced max angle for subtle movement (was 20)
} as const;

// =========================
// GOALIE SLIDE CONSTANTS
// =========================
export const GOALIE_SLIDE = {
  DURATION: 300, // Quick slide duration (ms)
  DECELERATION: 0.9, // Minimal deceleration to maintain momentum
  TURN_SPEED: 15, // Keep same turn speed as hockey stop
  MIN_SPEED: 1, // Very low minimum speed requirement for goalies
  COOLDOWN: 3000, // 4 seconds cooldown (shorter than hockey stop)
  MOMENTUM_PRESERVATION: 0.8, // Better momentum preservation than hockey stop
  SPEED_BOOST: 0.3, // Small speed boost for goalies
  MAX_ANGLE: 25, // Slightly larger angle for more dramatic movement
  DASH_FORCE: 12, // Moderate dash force for goalies
} as const;

// =========================
// SPIN MOVE CONSTANTS
// =========================
export const SPIN_MOVE = {
  DURATION: 300, // 300ms for one quick spin
  COOLDOWN: 8000, // 7 seconds cooldown
  MIN_SPEED: 8, // Minimum speed required to spin (must be running, not walking)
  MOMENTUM_PRESERVATION: 0.85,
  BOOST_MULTIPLIER: 1.1, // 10% speed boost after spin
  BOOST_DURATION: 700, // 2 seconds boost duration
} as const;

// =========================
// DASH CONSTANTS
// =========================
export const DASH = {
  DURATION: 200, // Quick dash duration in milliseconds
  FORCE: 30, // Reduced from 60 for more natural feel
  COOLDOWN: 2000, // Time before can dash again
  INITIAL_BOOST: 1.0, // Reduced from 1.5 for more natural boost
} as const;

// =========================
// SKATING SOUND CONSTANTS
// =========================
export const SKATING_SOUND = {
  VOLUME: 0.06,
  MIN_SPEED: 4.0,
  WALK_LOOP_DURATION: 1600, // Slow loop for walking (1.2 seconds)
  RUN_LOOP_DURATION: 1000,   // Fast loop for running (0.6 seconds)
} as const;

// =========================
// PUCK CONTROL CONSTANTS
// =========================
export const PUCK_CONTROL = {
  OFFSET: 0.8, // Reduced from 1.2 to bring puck closer to player
  RELEASE_COOLDOWN: 1000, // Cooldown in milliseconds before puck can be re-attached
} as const;

// =========================
// PASS AND SHOT CONSTANTS
// =========================
export const PASS_SHOT = {
  // Default values (can be overridden by position-specific settings)
  MIN_PASS_FORCE: 10, // Reduced from 20
  MAX_PASS_FORCE: 25, // Reduced from 45
  MIN_SHOT_FORCE: 15, // Reduced from 35
  MAX_SHOT_FORCE: 35, // Reduced from 70
  SHOT_LIFT_MULTIPLIER: 0.4, // Slightly reduced from 0.5 for more controlled lift
  SAUCER_PASS_LIFT_MULTIPLIER: 0.1, // Slightly reduced from 0.15 for more controlled saucer passes
} as const;

// =========================
// PUCK MOVEMENT SOUND CONSTANTS
// =========================
export const PUCK_SOUND = {
  COOLDOWN: 200, // 200ms cooldown between puck sounds
  LATERAL_COOLDOWN: 200, // 400ms cooldown between lateral puck movement sounds (A/D dangling)
  VOLUME: 0.3, // Volume for puck movement sounds
  HIT_POST_VOLUME: 0.6, // Volume for post collision sounds
  HIT_POST_COOLDOWN: 500, // 500ms cooldown between post hit sounds
  HIT_POST_REFERENCE_DISTANCE: 45, // Distance for spatial audio (audible across rink with proper falloff)
} as const;

// =========================
// STICK CHECK CONSTANTS
// =========================
export const STICK_CHECK = {
  COOLDOWN: 1000, // ms (increased to prevent spam)
  RANGE: 2.2, // meters
  ANGLE: Math.PI / 3, // 60 degrees cone
  INPUT_DEBOUNCE: 400, // ms (increased to prevent spam)
} as const;

// =========================
// BODY CHECK CONSTANTS
// =========================
export const BODY_CHECK = {
  COOLDOWN: 10000, // 10 seconds
  DASH_FORCE: 60, // Forward impulse
  DURATION: 180, // ms
  UI_RANGE: 3.5, // meters (increased range for UI overlay and magnetization)
  RANGE: 2.5, // meters (actual hitbox/collision range)
  ANGLE: Math.PI / 3, // 60 degrees cone
} as const;

// =========================
// PERSISTENCE CONSTANTS
// =========================
export const PERSISTENCE = {
  // Global leaderboard data (shared across all players)
  GLOBAL_LEADERBOARD_KEY: 'face-off-leaderboard', // Changed from 'hockey-zone-leaderboard' to wipe data
  
  // Individual player data structure key (stored per player automatically by HYTOPIA)
  PLAYER_STATS_KEY: 'playerStatsV2', // Changed from 'playerStats' to wipe data
} as const;

// =========================
// AUDIO MANAGEMENT CONSTANTS
// =========================
export const AUDIO = {
  // Ambient sound scheduling
  MIN_GAP_BETWEEN_SOUNDS: 45000, // 45 seconds
  CROWD_CHANT_MIN: 20000, // 20s
  CROWD_CHANT_MAX: 360000, // 6 minutes
  PERCUSSION_MIN: 45000, // 45s
  PERCUSSION_MAX: 360000, // 6 minutes
  
  // Background music
  BACKGROUND_MUSIC_VOLUME: 0.1,
  
  // Stomp beat timing
  STOMP_BEAT_MIN: 35000, // 35s
  STOMP_BEAT_MAX: 360000, // 6 minutes
  
  // Sound effect volumes
  CROWD_CHANT_VOLUME: 0.3,
  PERCUSSION_VOLUME: 0.2,
  STOMP_BEAT_VOLUME: 0.2,
  GOAL_HORN_VOLUME: 0.6,
  REFEREE_WHISTLE_VOLUME: 0.3, // Reduced from 0.6 to make it less loud
} as const;

// =========================
// AUDIO PERFORMANCE CONSTANTS
// =========================
export const AUDIO_PERFORMANCE = {
  // Audio object cleanup settings
  CLEANUP_DELAY: 15000, // 15 seconds after playback to cleanup audio objects (increased to prevent premature cleanup)
  MAX_CONCURRENT_SOUNDS: 25, // Maximum number of sound effects playing simultaneously (increased to accommodate rapid gameplay)
  SOUND_COOLDOWN_GLOBAL: 25, // Global minimum time between any sound effects (ms) (reduced further with pooled system)
  
  // Emergency cleanup thresholds
  EMERGENCY_CLEANUP_THRESHOLD: 50, // Trigger emergency cleanup at this many sounds (increased to accommodate rapid gameplay)
  MAX_AUDIO_MEMORY_MB: 40, // Maximum estimated audio memory before cleanup (MB)
  OLD_AUDIO_THRESHOLD: 180000, // Consider audio "old" after 3 minutes (ms)
} as const;

// =========================
// PLAYER CONTROLLER DEFAULTS
// =========================
export const PLAYER_DEFAULTS = {
  WALK_VELOCITY: 6,
  RUN_VELOCITY: 12,
  JUMP_VELOCITY: 10,
  
  // Default animations
  IDLE_ANIMATIONS: ['idle-upper', 'idle-lower'],
  WALK_ANIMATIONS: ['walk-upper', 'walk-lower'],
  RUN_ANIMATIONS: ['run-upper', 'run-lower'],
} as const;

// =========================
// GOALIE BALANCE CONSTANTS
// =========================
// Goalies are protected from stick checks and body checks, but to prevent them
// from becoming invincible puck carriers, they must pass within a time limit.
export const GOALIE_BALANCE = {
  PUCK_CONTROL_LIMIT: 5000, // 5 seconds - Goalies must pass within this time or auto-pass triggers
  WARNING_TIME: 2000, // Show warning message when this many milliseconds remain
  COUNTDOWN_THRESHOLD: 3000, // Start UI countdown timer when this many milliseconds remain
} as const;

// =========================
// POSITION-SPECIFIC STATS
// =========================
export const POSITION_STATS = {
  DEFENDER: {
    runVelocity: 9.5,
    walkVelocity: 5,
    minShotForce: 18,
    maxShotForce: 28,
    passingPower: 1.1,
  },
  WINGER: {
    runVelocity: 11.5,
    walkVelocity: 6,
    minShotForce: 20,
    maxShotForce: 32,
    passingPower: 1.0,
  },
  CENTER: {
    runVelocity: 10.5,
    walkVelocity: 6,
    minShotForce: 25,
    maxShotForce: 35,
    passingPower: 1.0,
  },
  GOALIE: {
    runVelocity: 7,
    walkVelocity: 4,
    minShotForce: 10,
    maxShotForce: 20,
    passingPower: 1.1,
  },
} as const;

// =========================
// AUDIO FILE PATHS
// =========================
export const AUDIO_PATHS = {
  // Hockey sounds
  ICE_SKATING: 'audio/sfx/hockey/ice-skating.mp3',
  ICE_STOP: 'audio/sfx/hockey/hockey-stop.mp3',
  GOALIE_SLIDE: 'audio/sfx/hockey/hockey-stop.mp3', // Reuse hockey stop sound for now
  PUCK_ATTACH: 'audio/sfx/hockey/puck-attach.mp3',
  PUCK_CATCH: 'audio/sfx/hockey/puck-catch.mp3',
  PUCK_LEFT: 'audio/sfx/hockey/puck-left.mp3',
  PUCK_RIGHT: 'audio/sfx/hockey/puck-right.mp3',
  PASS_PUCK: 'audio/sfx/hockey/pass-puck.mp3',
  WRIST_SHOT: 'audio/sfx/hockey/wrist-shot.mp3',
  SWING_STICK: 'audio/sfx/hockey/swing-stick.mp3',
  STICK_CHECK: 'audio/sfx/hockey/swing-stick.mp3',
  STICK_CHECK_MISS: 'audio/sfx/hockey/swing-stick.mp3',
  BODY_CHECK: 'audio/sfx/hockey/body-check.mp3',
  WHOOSH: 'audio/sfx/hockey/whoosh.mp3',
  REFEREE_WHISTLE: 'audio/sfx/hockey/referee-whistle.mp3',
  COUNTDOWN_SOUND: 'audio/sfx/hockey/countdown-sound.mp3',
  HIT_POST: 'audio/sfx/hockey/hit-post.wav',
  
  // Ambient sounds
  CROWD_HEY: 'audio/sfx/hockey/crowd-hey.mp3',
  PERCUSSION_BEAT: 'audio/sfx/hockey/percussion-beat.mp3',
  STOMP_BEAT: 'audio/sfx/hockey/stomp-beat.wav',
  
  // Goal effects
  GOAL_HORN: 'audio/sfx/hockey/goal-horn.mp3',
  
  // Background music
  READY_FOR_THIS: 'audio/music/faceoff-theme.mp3',
} as const;

// =========================
// GOAL COLLIDER CONSTANTS
// =========================
export const GOAL_COLLIDERS = {
  // Shared constants for both goals
  POST_HALF_EXTENTS: { x: 0.02, y: 1.15, z: 1 },
  POST_Y_OFFSET: -0.05,
  LEFT_POST_X_OFFSET: -1.98,
  RIGHT_POST_X_OFFSET: 1.98,
  
  CROSSBAR_HALF_EXTENTS: { x: 2.0, y: 0.03, z: 0.09 },
  CROSSBAR_Y_OFFSET: 1.0,
  
  BOTTOM_BAR_HALF_EXTENTS: { x: 2.0, y: 0.03, z: 0.12 },
  BOTTOM_BAR_Y_OFFSET: -0.9, // Position at bottom of goal opening
  
  NETTING_HALF_EXTENTS: { x: 2.0, y: 1.1, z: 0.05 },
  
  // Flat wall behind netting to prevent players from running up the back
  BACK_WALL_HALF_EXTENTS: { x: 2.0, y: 0.5, z: 0.05 },
  
  FRICTION: 0.03,
  BOUNCINESS: 0.15,
} as const;

// Blue goal colliders (current perfect setup)
export const BLUE_GOAL_COLLIDERS = {
  CROSSBAR_Z_OFFSET: -0.9,     // Crossbar position for blue goal
  BOTTOM_BAR_Z_OFFSET: 0.9,   // At front of blue goal
  NETTING_Z_OFFSET: 0.5,      // At back of blue goal
  NETTING_Y_OFFSET: 0.2,    // Vertical position of netting (same as posts by default)
  NETTING_X_ROTATION: -0.4,   // Slant netting backward in RADIANS (negative = slopes back toward goal)
  
  // Flat wall positioned behind the slanted netting
  BACK_WALL_Z_OFFSET: 1.0,    // Further back than netting to catch players going around/behind
  BACK_WALL_Y_OFFSET: 0.2,    // Same height as netting
} as const;

// Red goal colliders (adjusted for 180-degree Y rotation)
// Since red goal is spawned with { x: 0, y: 1, z: 0, w: 0 } (180° rotation), 
// all Z offsets are flipped compared to blue goal
export const RED_GOAL_COLLIDERS = {
  CROSSBAR_Z_OFFSET: 0.9,     // After 180° rotation, this becomes the back crossbar position
  BOTTOM_BAR_Z_OFFSET: -0.9,   // After 180° rotation, this becomes the back bottom bar position
  NETTING_Z_OFFSET: -0.5,     // After 180° rotation, this becomes the back netting position
  NETTING_Y_OFFSET: 0.2,      // Y offset is not affected by Y rotation
  NETTING_X_ROTATION: 0.4,    // Rotation for slanted netting
  
  // Flat wall positioned behind the slanted netting (adjusted for 180° rotation)
  BACK_WALL_Z_OFFSET: -1.0,   // Further back than netting (negative due to 180° rotation)
  BACK_WALL_Y_OFFSET: 0.2,    // Same height as netting
} as const;

// =========================
// PUCK PHYSICS CONSTANTS
// =========================
export const PUCK_PHYSICS = {
  MODEL_SCALE: 0.6,
  LINEAR_DAMPING: 0.02,  // Reduced for smoother movement (was 0.05)
  ANGULAR_DAMPING: 0.6,  // Reduced for more natural spinning (was 0.8)
  GRAVITY_SCALE: 1.0,
  
  // Collider properties - optimized for ice floor interaction WITH CCD
  RADIUS: 0.35,
  HALF_HEIGHT: 0.03, // Very thin to make puck sit directly on ice surface
  BORDER_RADIUS: 0.1,
  FRICTION: 0.08,    // Even lower friction to prevent sticky wall behavior (was 0.05)
  BOUNCINESS: 0.06,   // Increased bounciness for natural wall bounces (was 0.01)
  
  // CCD enabled with ice floor providing smooth collision surface
  CCD_ENABLED: true, // Enable CCD with ice floor handling smooth collisions
} as const;

// =========================
// ICE FLOOR PHYSICS CONSTANTS
// =========================
export const ICE_FLOOR_PHYSICS = {
  // Custom physics properties for the IceFloorEntity
  // These are optimized for smooth puck movement WITH CCD enabled
  FRICTION: 0.001,     // Ultra-low friction for ice-like behavior
  BOUNCINESS: 0.0,     // Zero bounce to prevent any unwanted bouncing
  
  // Damping values for ice physics
  ICE_DAMPING: 0.01,   // Very low damping for ice-like sliding
  NORMAL_DAMPING: 0.01, // Normal puck damping when off ice
  
  // Floor dimensions (based on map analysis)
  HALF_EXTENTS: {
    x: 31.5,  // Total width: 63 blocks (-31.5 to +31.5)
    y: 0.05,  // Very thin physical surface for minimal collision interference
    z: 45.5   // Total length: 91 blocks (-45.5 to +45.5)
  },
  
  // Position sensor at natural player level to detect when puck is on ice
  Y_OFFSET: 1.0,       // Center sensor at mid-level between floor (Y=0) and player (Y=1.79)
  CENTER_POSITION: { x: 0, y: 1, z: -1 }, // Sensor positioned to detect puck on playing surface
} as const;

// =========================
// PUCK TRAIL CONSTANTS
// =========================
export const PUCK_TRAIL = {
  MAX_LENGTH: 3, // Fewer particles for gradient plane trail
  SPAWN_INTERVAL: 70, // Slightly longer for smooth gradient effect
  PARTICLE_LIFETIME: 600, // Longer lifetime to show gradient fade
  MIN_SPEED_FOR_TRAIL: 3.0, // Speed threshold for trail activation
  PARTICLE_SCALE: 0.8, // Larger scale for gradient plane visibility
  POSITION_RANDOMNESS: 0.05 // Minimal randomness for clean gradient trail
} as const;

// =========================
// COLLISION GROUPS
// =========================
export const COLLISION_GROUPS = {
  // Custom collision group for player barriers (value between 1-127)
  PLAYER_BARRIER: 64,
  
  // Custom collision group for ice floor (value between 1-127)
  ICE_FLOOR: 65,
} as const;

// =========================
// OFFSIDE DETECTION CONSTANTS
// =========================
export const OFFSIDE_DETECTION = {
  // Proximity distance for offside calls - only trigger if offside player is within this distance of puck
  PROXIMITY_DISTANCE: 10.0, // meters - gives players reasonable distance to skate back onside
} as const;

// =========================
// PLAYER BARRIER CONSTANTS
// =========================
export const PLAYER_BARRIERS = {
  // Barrier dimensions
  HALF_EXTENTS: {
    x: 1.5,  // Slightly wider than goal width (goal is -1.17 to 1.16)
    y: 1.0,  // Tall enough to block players (2 meters total height)
    z: 0.1   // Thin barrier
  },
  
  // Barrier positions (same as goal lines)
  RED_GOAL_Z: -31.26,  // Same as red goal line
  BLUE_GOAL_Z: 31.26,   // Same as blue goal line
  
  // Physics properties
  FRICTION: 0.0,
  BOUNCINESS: 0.0,
} as const;

// =========================
// SPAWN POSITIONS
// =========================
export const SPAWN_POSITIONS = {
  PUCK_CENTER_ICE: { x: 0, y: 1.8, z: 1 }, // At natural player level to sit on ice floor properly
  PLAYER_DEFAULT: { x: 0, y: 10, z: 0 },
  RED_GOAL: { x: 0, y: 2, z: -32 },
  BLUE_GOAL: { x: 0, y: 2, z: 32 },
} as const;

// =========================
// LOBBY CONFIGURATION CONSTANTS (NEW)
// =========================
export const LOBBY_CONFIG = {
  MINIMUM_PLAYERS_TOTAL: 4,        // 2v2 minimum
  MINIMUM_PLAYERS_PER_TEAM: 2,     // At least 2 per team
  REQUIRED_GOALIES: 1,             // Each team must have 1 goalie
  COUNTDOWN_DURATION: 60,          // 60 seconds when minimum reached
  FULL_LOBBY_COUNTDOWN: 5,         // 5 seconds when lobby is completely full (12/12)
  MAX_PLAYERS_TOTAL: 12,           // 6v6 maximum
  AUTO_BALANCE_ENABLED: true,      // Enable auto-balancing
  ALLOW_POSITION_SWITCHING: true   // Allow position changes in lobby
} as const;

// =========================
// AFK DETECTION CONSTANTS
// =========================
export const AFK_DETECTION = {
  TIMEOUT_DURATION: 2 * 60 * 1000, // 2 minutes in milliseconds
  WARNING_DURATION: 30 * 1000,     // Show warning 30 seconds before timeout
  CHECK_INTERVAL: 5 * 1000,        // Check for AFK every 5 seconds
  ACTIVITY_THRESHOLD: 0.1,         // Minimum movement/input to be considered active
  COUNTDOWN_DISPLAY_TIME: 10 * 1000, // Show countdown for last 10 seconds
  
  // UI message constants
  WARNING_MESSAGE: 'You seem to be inactive. You will be returned to game mode selection if you don\'t move.',
  TIMEOUT_MESSAGE: 'You have been removed from the game due to inactivity.',
  COUNTDOWN_MESSAGE: 'Returning to game mode selection due to inactivity in:',
} as const;

// =========================
// UTILITY FUNCTIONS
// =========================

/**
 * Debug logging utility - only logs when DEBUG_MODE is enabled
 * @param message - The message to log
 * @param prefix - Optional prefix for categorizing logs
 */
export function debugLog(message: string, prefix?: string): void {
  if (!DEBUG_MODE) return;
  
  // Audio-only debug filter: only show AudioManager logs if filter is enabled
  const audioFilterEnabled = (globalThis as any).AUDIO_DEBUG_FILTER ?? AUDIO_DEBUG_FILTER;
  if (audioFilterEnabled && prefix !== 'AudioManager') {
    return;
  }
  
  // Save detection debug filter: only show SaveDetectionService logs if filter is enabled
  const saveFilterEnabled = (globalThis as any).SAVE_DEBUG_FILTER ?? SAVE_DEBUG_FILTER;
  if (saveFilterEnabled && prefix !== 'SaveDetectionService') {
    return;
  }
  
  // Offside detection debug filter: only show OffsideDetectionService logs if filter is enabled
  const offsideFilterEnabled = (globalThis as any).OFFSIDE_DEBUG_FILTER ?? OFFSIDE_DEBUG_FILTER;
  if (offsideFilterEnabled && prefix !== 'OffsideDetectionService') {
    return;
  }
  
  // Boundary detection debug filter: only show PuckBoundaryService logs if filter is enabled
  const boundaryFilterEnabled = (globalThis as any).BOUNDARY_DEBUG_FILTER ?? BOUNDARY_DEBUG_FILTER;
  if (boundaryFilterEnabled && prefix !== 'PuckBoundaryService') {
    return;
  }
  
  const logMessage = prefix ? `[${prefix}] ${message}` : message;
  console.log(logMessage);
}

/**
 * Debug error logging utility - only logs when DEBUG_MODE is enabled
 * @param message - The error message to log
 * @param error - Optional error object
 * @param prefix - Optional prefix for categorizing logs
 */
export function debugError(message: string, error?: any, prefix?: string): void {
  if (!DEBUG_MODE) return;
  
  // Audio-only debug filter: only show AudioManager logs if filter is enabled
  const audioFilterEnabled = (globalThis as any).AUDIO_DEBUG_FILTER ?? AUDIO_DEBUG_FILTER;
  if (audioFilterEnabled && prefix !== 'AudioManager') {
    return;
  }
  
  // Save detection debug filter: only show SaveDetectionService logs if filter is enabled
  const saveFilterEnabled = (globalThis as any).SAVE_DEBUG_FILTER ?? SAVE_DEBUG_FILTER;
  if (saveFilterEnabled && prefix !== 'SaveDetectionService') {
    return;
  }
  
  // Offside detection debug filter: only show OffsideDetectionService logs if filter is enabled
  const offsideFilterEnabled = (globalThis as any).OFFSIDE_DEBUG_FILTER ?? OFFSIDE_DEBUG_FILTER;
  if (offsideFilterEnabled && prefix !== 'OffsideDetectionService') {
    return;
  }
  
  // Boundary detection debug filter: only show PuckBoundaryService logs if filter is enabled
  const boundaryFilterEnabled = (globalThis as any).BOUNDARY_DEBUG_FILTER ?? BOUNDARY_DEBUG_FILTER;
  if (boundaryFilterEnabled && prefix !== 'PuckBoundaryService') {
    return;
  }
  
  const logMessage = prefix ? `[${prefix}] ${message}` : message;
  if (error) {
    console.error(logMessage, error);
  } else {
    console.error(logMessage);
  }
}

/**
 * Debug warning logging utility - only logs when DEBUG_MODE is enabled
 * @param message - The warning message to log
 * @param prefix - Optional prefix for categorizing logs
 */
export function debugWarn(message: string, prefix?: string): void {
  if (!DEBUG_MODE) return;
  
  // Audio-only debug filter: only show AudioManager logs if filter is enabled
  const audioFilterEnabled = (globalThis as any).AUDIO_DEBUG_FILTER ?? AUDIO_DEBUG_FILTER;
  if (audioFilterEnabled && prefix !== 'AudioManager') {
    return;
  }
  
  // Save detection debug filter: only show SaveDetectionService logs if filter is enabled
  const saveFilterEnabled = (globalThis as any).SAVE_DEBUG_FILTER ?? SAVE_DEBUG_FILTER;
  if (saveFilterEnabled && prefix !== 'SaveDetectionService') {
    return;
  }
  
  // Offside detection debug filter: only show OffsideDetectionService logs if filter is enabled
  const offsideFilterEnabled = (globalThis as any).OFFSIDE_DEBUG_FILTER ?? OFFSIDE_DEBUG_FILTER;
  if (offsideFilterEnabled && prefix !== 'OffsideDetectionService') {
    return;
  }
  
  // Boundary detection debug filter: only show PuckBoundaryService logs if filter is enabled
  const boundaryFilterEnabled = (globalThis as any).BOUNDARY_DEBUG_FILTER ?? BOUNDARY_DEBUG_FILTER;
  if (boundaryFilterEnabled && prefix !== 'PuckBoundaryService') {
    return;
  }
  
  const logMessage = prefix ? `[${prefix}] ${message}` : message;
  console.warn(logMessage);
}

/**
 * Toggle the audio-only debug filter at runtime
 * When enabled, only AudioManager logs will be shown in the console
 * @param enabled - Whether to enable audio-only filtering
 */
export function setAudioDebugFilter(enabled: boolean): void {
  (globalThis as any).AUDIO_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('🎵 AUDIO DEBUG FILTER ENABLED - Only AudioManager logs will be shown');
    console.log('💡 To disable: setAudioDebugFilter(false) or type "audiooff" in console');
  } else {
    console.log('🎵 AUDIO DEBUG FILTER DISABLED - All debug logs will be shown');
    console.log('💡 To enable: setAudioDebugFilter(true) or type "audioon" in console');
  }
}

/**
 * Toggle the save detection debug filter at runtime
 * When enabled, only SaveDetectionService logs will be shown in the console
 * @param enabled - Whether to enable save detection filtering
 */
export function setSaveDebugFilter(enabled: boolean): void {
  (globalThis as any).SAVE_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('🥅 SAVE DEBUG FILTER ENABLED - Only SaveDetectionService logs will be shown');
    console.log('💡 To disable: setSaveDebugFilter(false) or type "saveoff" in console');
  } else {
    console.log('🥅 SAVE DEBUG FILTER DISABLED - All debug logs will be shown');
    console.log('💡 To enable: setSaveDebugFilter(true) or type "saveon" in console');
  }
}

// Make functions globally accessible for easy console usage
(globalThis as any).setAudioDebugFilter = setAudioDebugFilter;
(globalThis as any).audioon = () => setAudioDebugFilter(true);
(globalThis as any).audiooff = () => setAudioDebugFilter(false);

// Save detection debug filter shortcuts
(globalThis as any).setSaveDebugFilter = setSaveDebugFilter;
(globalThis as any).saveon = () => setSaveDebugFilter(true);
(globalThis as any).saveoff = () => setSaveDebugFilter(false);

/**
 * Toggle the offside detection debug filter at runtime
 * When enabled, only OffsideDetectionService logs will be shown in the console
 * @param enabled - Whether to enable offside detection filtering
 */
export function setOffsideDebugFilter(enabled: boolean): void {
  (globalThis as any).OFFSIDE_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('⚪ OFFSIDE DEBUG FILTER ENABLED - Only OffsideDetectionService logs will be shown');
    console.log('💡 To disable: setOffsideDebugFilter(false) or type "offsideoff" in console');
  } else {
    console.log('⚪ OFFSIDE DEBUG FILTER DISABLED - All debug logs will be shown');
    console.log('💡 To enable: setOffsideDebugFilter(true) or type "offsideon" in console');
  }
}

/**
 * Toggle the boundary detection debug filter at runtime
 * When enabled, only PuckBoundaryService logs will be shown in the console
 * @param enabled - Whether to enable boundary detection filtering
 */
export function setBoundaryDebugFilter(enabled: boolean): void {
  (globalThis as any).BOUNDARY_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('🚧 BOUNDARY DEBUG FILTER ENABLED - Only PuckBoundaryService logs will be shown');
    console.log('💡 To disable: setBoundaryDebugFilter(false) or type "boundaryoff" in console');
  } else {
    console.log('🚧 BOUNDARY DEBUG FILTER DISABLED - All debug logs will be shown');
    console.log('💡 To enable: setBoundaryDebugFilter(true) or type "boundaryon" in console');
  }
}

// Offside detection debug filter shortcuts
(globalThis as any).setOffsideDebugFilter = setOffsideDebugFilter;
(globalThis as any).offsideon = () => setOffsideDebugFilter(true);
(globalThis as any).offsideoff = () => setOffsideDebugFilter(false);

// Boundary detection debug filter shortcuts
(globalThis as any).setBoundaryDebugFilter = setBoundaryDebugFilter;
(globalThis as any).boundaryon = () => setBoundaryDebugFilter(true);
(globalThis as any).boundaryoff = () => setBoundaryDebugFilter(false);

/**
 * Enhanced debugging functions with filtering for entity states and cleanup
 */

// Entity state debugging function - works independently of DEBUG_MODE
export function debugEntityState(message: string, source?: string): void {
  const entityFilterEnabled = (globalThis as any).ENTITY_DEBUG_FILTER ?? ENTITY_DEBUG_FILTER;
  if (entityFilterEnabled) {
    const logMessage = source ? `[ENTITY][${source}] ${message}` : `[ENTITY] ${message}`;
    console.log(logMessage);
  }
}

// Cleanup debugging function - works independently of DEBUG_MODE
export function debugCleanup(message: string, source?: string): void {
  const cleanupFilterEnabled = (globalThis as any).CLEANUP_DEBUG_FILTER ?? CLEANUP_DEBUG_FILTER;
  if (cleanupFilterEnabled) {
    const logMessage = source ? `[CLEANUP][${source}] ${message}` : `[CLEANUP] ${message}`;
    console.log(logMessage);
  }
}

// Audio error function with filtering - works independently of DEBUG_MODE
export function debugAudioError(message: string, error?: any, source?: string): void {
  const audioErrorFilterEnabled = (globalThis as any).AUDIO_ERROR_FILTER ?? AUDIO_ERROR_FILTER;
  if (audioErrorFilterEnabled) {
    const logMessage = source ? `[AUDIO ERROR][${source}] ${message}` : `[AUDIO ERROR] ${message}`;
    if (error) {
      console.error(logMessage, error);
    } else {
      console.error(logMessage);
    }
  }
}

/**
 * Toggle the entity debugging filter at runtime
 * When enabled, detailed entity state debugging will be shown
 * @param enabled - Whether to enable entity debugging
 */
export function setEntityDebugFilter(enabled: boolean): void {
  (globalThis as any).ENTITY_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('🔍 ENTITY DEBUG FILTER ENABLED - Entity state debugging will be shown');
    console.log('💡 To disable: setEntityDebugFilter(false) or type "entitydebugoff" in console');
  } else {
    console.log('🔍 ENTITY DEBUG FILTER DISABLED - Entity debugging will be hidden');
    console.log('💡 To enable: setEntityDebugFilter(true) or type "entitydebugon" in console');
  }
}

/**
 * Toggle the cleanup debugging filter at runtime
 * When enabled, cleanup operations debugging will be shown
 * @param enabled - Whether to enable cleanup debugging
 */
export function setCleanupDebugFilter(enabled: boolean): void {
  (globalThis as any).CLEANUP_DEBUG_FILTER = enabled;
  
  if (enabled) {
    console.log('🧹 CLEANUP DEBUG FILTER ENABLED - Cleanup debugging will be shown');
    console.log('💡 To disable: setCleanupDebugFilter(false) or type "cleanupdebugoff" in console');
  } else {
    console.log('🧹 CLEANUP DEBUG FILTER DISABLED - Cleanup debugging will be hidden');
    console.log('💡 To enable: setCleanupDebugFilter(true) or type "cleanupdebugon" in console');
  }
}

/**
 * Toggle the audio error filter at runtime
 * When disabled, audio errors will be hidden from console
 * @param enabled - Whether to show audio errors
 */
export function setAudioErrorFilter(enabled: boolean): void {
  (globalThis as any).AUDIO_ERROR_FILTER = enabled;
  
  if (enabled) {
    console.log('🔊 AUDIO ERROR FILTER ENABLED - Audio errors will be shown');
    console.log('💡 To hide: setAudioErrorFilter(false) or type "audioerrorsoff" in console');
  } else {
    console.log('🔊 AUDIO ERROR FILTER DISABLED - Audio errors will be hidden');
    console.log('💡 To show: setAudioErrorFilter(true) or type "audioerrorson" in console');
  }
}

// Entity debugging shortcuts
(globalThis as any).setEntityDebugFilter = setEntityDebugFilter;
(globalThis as any).entitydebugon = () => setEntityDebugFilter(true);
(globalThis as any).entitydebugoff = () => setEntityDebugFilter(false);

// Cleanup debugging shortcuts
(globalThis as any).setCleanupDebugFilter = setCleanupDebugFilter;
(globalThis as any).cleanupdebugon = () => setCleanupDebugFilter(true);
(globalThis as any).cleanupdebugoff = () => setCleanupDebugFilter(false);

// Audio error filtering shortcuts
(globalThis as any).setAudioErrorFilter = setAudioErrorFilter;
(globalThis as any).audioerrorson = () => setAudioErrorFilter(true);
(globalThis as any).audioerrorsoff = () => setAudioErrorFilter(false);

/**
 * UI debug logging function - for UI-related debug messages
 * @param message - The message to log
 * @param type - Optional type of UI log (e.g., 'countdown', 'pointer', 'overlay')
 */
export function debugUI(message: string, type?: string): void {
  const uiFilterEnabled = (globalThis as any).UI_DEBUG_FILTER ?? UI_DEBUG_FILTER;
  if (uiFilterEnabled) {
    const logMessage = type ? `🎯 UI[${type}]: ${message}` : `🎯 UI: ${message}`;
    console.log(logMessage);
  }
}

/**
 * Toggle the UI debug filter at runtime
 * When enabled, UI debug messages will be shown
 * @param enabled - Whether to enable UI debugging
 */

export function setUIDebugFilter(enabled: boolean): void {
  (globalThis as any).UI_DEBUG_FILTER = enabled;
  
  // Always show debug toggle messages since they're used for control/feedback
  if (enabled) {
    console.log('🎯 UI DEBUG FILTER ENABLED - UI debug messages will be shown');
    console.log('💡 To disable: setUIDebugFilter(false) or type "uidebugoff" in console');
  } else {
    console.log('🎯 UI DEBUG FILTER DISABLED - UI debug messages will be hidden');
    console.log('💡 To enable: setUIDebugFilter(true) or type "uidebugon" in console');
  }
}

// UI debugging shortcuts
(globalThis as any).setUIDebugFilter = setUIDebugFilter;
(globalThis as any).uidebugon = () => setUIDebugFilter(true);
(globalThis as any).uidebugoff = () => setUIDebugFilter(false);

/**
 * Global console helper - shows all available debug shortcuts
 */
(globalThis as any).debughelp = () => {
  console.log('\n🐛 CONSOLE DEBUG SHORTCUTS:');
  console.log('🎯 UI debugging: uidebugon / uidebugoff');
  console.log('🎵 Audio only: audioon / audiooff');  
  console.log('🥅 Save detection: saveon / saveoff');
  console.log('⚪ Offside detection: offsideon / offsideoff');
  console.log('🚧 Boundary detection: boundaryon / boundaryoff');
  console.log('🔍 Entity states: entitydebugon / entitydebugoff');
  console.log('🧹 Cleanup operations: cleanupdebugon / cleanupdebugoff');
  console.log('🔊 Audio errors: audioerrorson / audioerrorsoff');
  console.log('\n💡 Type "debughelp" to see this list again\n');
}; 