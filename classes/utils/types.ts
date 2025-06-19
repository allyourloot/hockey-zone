/**
 * Type definitions for the Hockey Zone game
 * Re-exports from hytopia and custom game-specific types
 */

// =========================
// RE-EXPORT HYTOPIA TYPES
// =========================
export type {
  PlayerInput,
  PlayerCameraOrientation,
  Vector3Like,
} from 'hytopia';

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
} from 'hytopia';

// =========================
// CUSTOM GAME TYPES
// =========================

// Hockey-specific types
export type HockeyTeam = 'red' | 'blue';
export type HockeyPosition = 'GOALIE' | 'DEFENDER1' | 'DEFENDER2' | 'CENTER' | 'WINGER1' | 'WINGER2';

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

// Collider configuration
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