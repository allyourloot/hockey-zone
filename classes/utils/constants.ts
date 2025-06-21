/**
 * Constants for the Hockey Zone game
 * Extracted from IceSkatingController and other components
 */

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
  DURATION: 400, // Increased duration for smoother transition
  DECELERATION: 0.95, // Less aggressive deceleration
  TURN_SPEED: 15, // Reduced turn speed for smoother rotation
  MIN_SPEED: 4, // Keep the same minimum speed requirement
  COOLDOWN: 2000, // Reduced cooldown for better responsiveness
  MOMENTUM_PRESERVATION: 0.9, // Increased momentum preservation
  SPEED_BOOST: 1.10, // Speed boost during direction change
  MAX_ANGLE: 45, // Reduced max angle for more natural feel
} as const;

// =========================
// SPIN MOVE CONSTANTS
// =========================
export const SPIN_MOVE = {
  DURATION: 300, // 300ms for one quick spin
  COOLDOWN: 7000, // 7 seconds cooldown
  MIN_SPEED: 4, // Minimum speed required to spin
  MOMENTUM_PRESERVATION: 0.85,
  BOOST_MULTIPLIER: 1.2, // 20% speed boost after spin
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
  VOLUME: 0.2,
  MIN_SPEED: 0.5,
  DURATION: 800,
  MIN_PLAYBACK_RATE: 0.7,
  MAX_PLAYBACK_RATE: 1.3,
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
  VOLUME: 0.4, // Volume for puck movement sounds
} as const;

// =========================
// STICK CHECK CONSTANTS
// =========================
export const STICK_CHECK = {
  COOLDOWN: 500, // ms (reduced for more responsive checks)
  RANGE: 2.2, // meters
  ANGLE: Math.PI / 3, // 60 degrees cone
  INPUT_DEBOUNCE: 250, // ms
} as const;

// =========================
// BODY CHECK CONSTANTS
// =========================
export const BODY_CHECK = {
  COOLDOWN: 5000, // 5 seconds
  DASH_FORCE: 18, // Forward impulse
  DURATION: 180, // ms
  UI_RANGE: 3.5, // meters (increased range for UI overlay and magnetization)
  RANGE: 2.5, // meters (actual hitbox/collision range)
  ANGLE: Math.PI / 3, // 60 degrees cone
} as const;

// =========================
// AUDIO MANAGEMENT CONSTANTS
// =========================
export const AUDIO = {
  // Ambient sound scheduling
  MIN_GAP_BETWEEN_SOUNDS: 10000, // 10 seconds
  CROWD_CHANT_MIN: 40000, // 40s
  CROWD_CHANT_MAX: 80000, // 80s
  PERCUSSION_MIN: 30000, // 30s
  PERCUSSION_MAX: 60000, // 60s
  
  // Background music
  BACKGROUND_MUSIC_VOLUME: 0.05,
  
  // Stomp beat timing
  STOMP_BEAT_MIN: 25000, // 25s
  STOMP_BEAT_MAX: 50000, // 50s
  
  // Sound effect volumes
  CROWD_CHANT_VOLUME: 0.3,
  PERCUSSION_VOLUME: 0.4,
  STOMP_BEAT_VOLUME: 0.4,
  GOAL_HORN_VOLUME: 0.6,
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
// POSITION-SPECIFIC STATS
// =========================
export const POSITION_STATS = {
  DEFENDER: {
    runVelocity: 10,
    walkVelocity: 6,
    minShotForce: 15,
    maxShotForce: 30,
    passingPower: 1.3,
  },
  WINGER: {
    runVelocity: 14,
    walkVelocity: 8,
    minShotForce: 20,
    maxShotForce: 35,
    passingPower: 1.6,
  },
  CENTER: {
    runVelocity: 12,
    walkVelocity: 7,
    minShotForce: 25,
    maxShotForce: 40,
    passingPower: 1.1,
  },
  // GOALIE uses base stats
} as const;

// =========================
// AUDIO FILE PATHS
// =========================
export const AUDIO_PATHS = {
  // Hockey sounds
  ICE_SKATING: 'audio/sfx/hockey/ice-skating.mp3',
  ICE_STOP: 'audio/sfx/hockey/ice-stop.mp3',
  PUCK_ATTACH: 'audio/sfx/hockey/puck-attach.mp3',
  PUCK_CATCH: 'audio/sfx/hockey/puck-catch.mp3',
  PUCK_LEFT: 'audio/sfx/hockey/puck-left.mp3',
  PUCK_RIGHT: 'audio/sfx/hockey/puck-right.mp3',
  PASS_PUCK: 'audio/sfx/hockey/pass-puck.mp3',
  WRIST_SHOT: 'audio/sfx/hockey/wrist-shot.mp3',
  SWING_STICK: 'audio/sfx/hockey/swing-stick.mp3',
  STICK_CHECK: 'audio/sfx/hockey/stick-check.mp3',
  STICK_CHECK_MISS: 'audio/sfx/hockey/stick-check-miss.mp3',
  BODY_CHECK: 'audio/sfx/hockey/body-check.mp3',
  WHOOSH: 'audio/sfx/hockey/whoosh.mp3',
  REFEREE_WHISTLE: 'audio/sfx/hockey/referee-whistle.mp3',
  
  // Ambient sounds
  CROWD_HEY: 'audio/sfx/hockey/crowd-hey.mp3',
  PERCUSSION_BEAT: 'audio/sfx/hockey/percussion-beat.mp3',
  STOMP_BEAT: 'audio/sfx/hockey/stomp-beat.wav',
  
  // Goal effects
  GOAL_HORN: 'audio/sfx/hockey/goal-horn.mp3',
  
  // Background music
  READY_FOR_THIS: 'audio/music/ready-for-this.mp3',
} as const;

// =========================
// GOAL COLLIDER CONSTANTS
// =========================
export const GOAL_COLLIDERS = {
  POST_HALF_EXTENTS: { x: 0.02, y: 1.15, z: 1 },
  POST_Y_OFFSET: -0.05,
  LEFT_POST_X_OFFSET: -1.55,
  RIGHT_POST_X_OFFSET: 1.55,
  
  CROSSBAR_HALF_EXTENTS: { x: 0.8, y: 0.02, z: 0.09 },
  CROSSBAR_Y_OFFSET: 2.2,
  
  BOTTOM_BAR_HALF_EXTENTS: { x: 1.5, y: 0.15, z: -0.09 },
  BOTTOM_BAR_Z_OFFSET: 1.0,
  
  NETTING_HALF_EXTENTS: { x: 1.50, y: 1.15, z: 0.05 },
  NETTING_Z_OFFSET: 0.9,
  
  FRICTION: 0.03,
  BOUNCINESS: 0.3,
} as const;

// =========================
// PUCK PHYSICS CONSTANTS
// =========================
export const PUCK_PHYSICS = {
  MODEL_SCALE: 0.6,
  LINEAR_DAMPING: 0.05,
  ANGULAR_DAMPING: 0.8,
  GRAVITY_SCALE: 1.0,
  
  // Collider properties
  RADIUS: 0.4,
  HALF_HEIGHT: 0.02, // Very thin to make puck sit directly on ice surface
  BORDER_RADIUS: 0.1,
  FRICTION: 0.2,
  BOUNCINESS: 0.05,
} as const;

// =========================
// PUCK TRAIL CONSTANTS
// =========================
export const PUCK_TRAIL = {
  MAX_LENGTH: 4, // Fewer particles for gradient plane trail
  SPAWN_INTERVAL: 70, // Slightly longer for smooth gradient effect
  PARTICLE_LIFETIME: 600, // Longer lifetime to show gradient fade
  MIN_SPEED_FOR_TRAIL: 2.5, // Speed threshold for trail activation
  PARTICLE_SCALE: 0.8, // Larger scale for gradient plane visibility
  POSITION_RANDOMNESS: 0.05 // Minimal randomness for clean gradient trail
} as const;

// =========================
// SPAWN POSITIONS
// =========================
export const SPAWN_POSITIONS = {
  PUCK_CENTER_ICE: { x: 0, y: 1.1, z: 1 }, // Lowered from 1.8 to 0.2 to sit on ice surface
  PLAYER_DEFAULT: { x: 0, y: 10, z: 0 },
  RED_GOAL: { x: 0, y: 2, z: -32 },
  BLUE_GOAL: { x: 0, y: 2, z: 32 },
} as const; 