/**
 * Type definitions for the FACE-OFF game
 * Re-exports from hytopia and custom game-specific types
 */

// Import types for use in interfaces
import type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
} from 'hytopia';

import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  PlayerEvent,
  PlayerUIEvent,
  PlayerCameraMode,
  PlayerEntity,
  Entity,
  ChatManager,
  Collider,
  ColliderShape,
  RigidBodyType,
  BaseEntityController,
  CollisionGroup,
  CoefficientCombineRule,
  DefaultPlayerEntityController,
  EntityEvent,
  BlockType,
  BaseEntityControllerEvent,
  SceneUI,
  ModelRegistry,
} from 'hytopia';

// =========================
// RE-EXPORT HYTOPIA TYPES
// =========================
export type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
};

export {
  startServer,
  Audio,
  DefaultPlayerEntity,
  PlayerEvent,
  PlayerUIEvent,
  PlayerCameraMode,
  PlayerEntity,
  Entity,
  ChatManager,
  Collider,
  ColliderShape,
  RigidBodyType,
  BaseEntityController,
  CollisionGroup,
  CoefficientCombineRule,
  DefaultPlayerEntityController,
  EntityEvent,
  BlockType,
  BaseEntityControllerEvent,
  SceneUI,
  ModelRegistry,
};

// =========================
// CUSTOM GAME TYPES
// =========================

// Hockey-specific enums and types
export enum HockeyTeam {
  RED = 'RED',
  BLUE = 'BLUE',
}

export enum HockeyPosition {
  GOALIE = 'GOALIE',
  DEFENDER1 = 'DEFENDER1',
  DEFENDER2 = 'DEFENDER2',
  WINGER1 = 'WINGER1',
  WINGER2 = 'WINGER2',
  CENTER = 'CENTER',
}

export enum HockeyGameState {
  LOBBY = 'LOBBY',
  TEAM_SELECTION = 'TEAM_SELECTION',
  WAITING_FOR_PLAYERS = 'WAITING_FOR_PLAYERS',
  MATCH_START = 'MATCH_START',
  IN_PERIOD = 'IN_PERIOD',
  GOAL_SCORED = 'GOAL_SCORED',
  PERIOD_END = 'PERIOD_END',
  GAME_OVER = 'GAME_OVER',
}

export interface TeamAssignment {
  [HockeyPosition.GOALIE]?: string;
  [HockeyPosition.DEFENDER1]?: string;
  [HockeyPosition.DEFENDER2]?: string;
  [HockeyPosition.WINGER1]?: string;
  [HockeyPosition.WINGER2]?: string;
  [HockeyPosition.CENTER]?: string;
}

export interface Teams {
  [HockeyTeam.RED]: TeamAssignment;
  [HockeyTeam.BLUE]: TeamAssignment;
}

// Controller options interface
export interface IceSkatingControllerOptions {
  walkVelocity?: number;
  runVelocity?: number;
  minShotForce?: number;
  maxShotForce?: number;
  passingPower?: number;
}

// Puck control states
export type PuckMovementDirection = 
  | 'forward' 
  | 'lateral-left' 
  | 'lateral-right' 
  | 'lateral-left-forward' 
  | 'lateral-right-forward'
  | '';

// Audio configuration types
export interface AudioConfig {
  uri: string;
  volume?: number;
  loop?: boolean;
  attachedToEntity?: Entity;
  playbackRate?: number;
}

// Team position assignment interface
export interface TeamPositionAssignment {
  team: HockeyTeam;
  position: HockeyPosition;
}

// Goal entity configuration
export interface GoalConfig {
  team: HockeyTeam;
  modelUri: string;
  modelScale: number;
  position: Vector3Like;
  rotation: { x: number; y: number; z: number; w: number };
}

// Puck entity configuration
export interface PuckConfig {
  modelUri: string;
  modelScale: number;
  position: Vector3Like;
}

// UI event data types
export interface UIEventData {
  type: string;
  [key: string]: any;
}

export interface TeamPositionSelectData extends UIEventData {
  type: 'team-position-select';
  team: HockeyTeam;
  position: HockeyPosition;
}

export interface PuckPassData extends UIEventData {
  type: 'puck-pass';
  power: number;
}

export interface PuckShootData extends UIEventData {
  type: 'puck-shoot';
  power: number;
}

export interface LockInData extends UIEventData {
  type: 'lock-in';
}

// Audio management types
export interface AmbientSoundScheduler {
  nextChantTime: number;
  nextPercussionTime: number;
  scheduleCrowdChant: () => void;
  schedulePercussionBeat: () => void;
  startAmbientSounds: () => void;
}

// Position statistics interface
export interface PositionStats {
  runVelocity: number;
  walkVelocity: number;
  minShotForce: number;
  maxShotForce: number;
  passingPower: number;
}

// Collider configuration (using imported types)
export interface ColliderConfig {
  shape: ColliderShape;
  halfExtents?: Vector3Like;
  radius?: number;
  halfHeight?: number;
  borderRadius?: number;
  relativePosition?: Vector3Like;
  friction?: number;
  bounciness?: number;
  frictionCombineRule?: CoefficientCombineRule;
  bouncinessCombineRule?: CoefficientCombineRule;
  collisionGroups?: {
    belongsTo: CollisionGroup[];
    collidesWith: CollisionGroup[];
  };
  isSensor?: boolean;
  tag?: string;
  onCollision?: (other: Entity | BlockType, started: boolean) => void;
}

// World initialization configuration
export interface WorldConfig {
  map: any;
  optimizeModels?: boolean;
}

// Chat command handler type
export type ChatCommandHandler = (player: any) => void;

// Animation sets
export interface AnimationSet {
  idle: string[];
  walk: string[];
  run: string[];
  walkBackwards?: string[];
  runBackwards?: string[];
  walkStrafeLeft?: string[];
  walkStrafeRight?: string[];
  runStrafeLeft?: string[];
  runStrafeRight?: string[];
}

// Constants object types for better type checking
export type IceSkatingConstants = typeof import('./constants').ICE_SKATING;
export type HockeyStopConstants = typeof import('./constants').HOCKEY_STOP;
export type SpinMoveConstants = typeof import('./constants').SPIN_MOVE;
export type DashConstants = typeof import('./constants').DASH;
export type SkatingSound = typeof import('./constants').SKATING_SOUND;
export type PuckControlConstants = typeof import('./constants').PUCK_CONTROL;
export type PassShotConstants = typeof import('./constants').PASS_SHOT;
export type AudioConstants = typeof import('./constants').AUDIO;

// =========================
// OFFSIDE DETECTION TYPES
// =========================

// FACE-OFF definitions based on blue lines
export enum HockeyZone {
  RED_DEFENSIVE = 'RED_DEFENSIVE',    // Z < -6.5 (Red's defensive zone)
  NEUTRAL = 'NEUTRAL',                // -6.5 <= Z <= 7.5 (Neutral zone)
  BLUE_DEFENSIVE = 'BLUE_DEFENSIVE'   // Z > 7.5 (Blue's defensive zone)
}

// Faceoff locations based on red dot positions (ID 103)
export enum FaceoffLocation {
  RED_DEFENSIVE_LEFT = 'RED_DEFENSIVE_LEFT',     // (-14,0,-23)
  RED_DEFENSIVE_RIGHT = 'RED_DEFENSIVE_RIGHT',   // (15,0,-23)
  RED_NEUTRAL_LEFT = 'RED_NEUTRAL_LEFT',         // (-14,0,-4)
  RED_NEUTRAL_RIGHT = 'RED_NEUTRAL_RIGHT',       // (15,0,-4)
  BLUE_NEUTRAL_LEFT = 'BLUE_NEUTRAL_LEFT',       // (-14,0,21)
  BLUE_NEUTRAL_RIGHT = 'BLUE_NEUTRAL_RIGHT',     // (15,0,21)
  BLUE_DEFENSIVE_LEFT = 'BLUE_DEFENSIVE_LEFT',   // (-14,0,5)
  BLUE_DEFENSIVE_RIGHT = 'BLUE_DEFENSIVE_RIGHT'  // (15,0,5)
}

// Blue line crossing detection
export interface BlueLLineCrossing {
  zone: HockeyZone;
  direction: 'entering' | 'exiting';
  crossingTeam: HockeyTeam; // Which team's offensive zone was entered
  puckPosition: Vector3Like;
  timestamp: number;
}

// Player position tracking for offsides
export interface PlayerPositionHistory {
  playerId: string;
  team: HockeyTeam;
  position: Vector3Like;
  zone: HockeyZone;
  timestamp: number;
}

// Offsides violation details
export interface OffsideViolation {
  violatingPlayerIds: string[]; // Player IDs who were offside
  violatingTeam: HockeyTeam;
  faceoffLocation: FaceoffLocation;
  puckPosition: Vector3Like;
  blueLlineCrossedZone: HockeyZone; // Which zone the violation occurred in
  timestamp: number;
}

// Zone boundary configuration
export interface ZoneBoundary {
  redDefensiveMax: number;  // Z coordinate (anything less is Red defensive)
  blueDefensiveMin: number; // Z coordinate (anything greater is Blue defensive)
} 