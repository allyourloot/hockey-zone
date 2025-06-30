# 🏒 FACE-OFF

A fully-featured 3D hockey game built with the [Hytopia SDK](https://hytopia.com), featuring realistic ice skating physics, professional game management, and authentic NHL-style hockey mechanics.

## 🎮 Game Overview

FACE-OFF is a comprehensive multiplayer hockey simulation that brings the excitement of professional ice hockey to a virtual 3D environment. Players can join teams, select positions, and compete in authentic hockey matches with realistic physics, advanced game mechanics, and professional-grade features.

### ✨ Key Features

#### 🏟️ **Complete Professional Hockey Experience**
- **6v6 Team Play**: Full team rosters with Goalies, Defenders, Wingers, and Centers
- **Position-Based Gameplay**: Each position has unique stats and specialized capabilities
- **3-Period Matches**: Authentic hockey game structure with automatic period transitions
- **Professional Game States**: Lobby → Team Selection → Waiting → Match Start → In Period → Game Over
- **Real-time Scoring**: Live score tracking with goal celebrations and announcements

#### 🎯 **Advanced Goal Detection System**
- **Coordinate-Based Detection**: Precise goal line crossing detection with realistic physics
- **Own Goal Recognition**: Automatic detection and announcement of own goals
- **Player Tracking**: Last touched by system for accurate goal attribution
- **Assist System**: Primary and secondary assists tracking and announcements
- **Goal Celebration Sequences**: Professional overlays with team colors and animations
- **Goalie Save Statistics**: Comprehensive save tracking and statistics

#### 🚫 **NHL-Style Offside Detection**
- **Immediate Offside**: Instant violation when puck carrier enters zone with teammates already offside
- **Delayed Offside**: Realistic delayed offside with proximity-based detection
- **Blue Line Monitoring**: Continuous tracking of puck and player positions relative to blue lines
- **Faceoff System**: Automatic faceoff positioning at appropriate neutral zone locations
- **State Management**: Complete game state pausing and resuming during violations

#### 🛡️ **Player Barrier System**
- **Goal Protection**: Prevents players from entering goal areas inappropriately
- **Goalie-Aware Logic**: Allows goalies to defend their own net while blocking others
- **Velocity Prediction**: Catches fast-moving players before they enter restricted areas
- **Real-time Monitoring**: Continuous position checking with smart collision detection

#### ⛸️ **Realistic Ice Skating Physics**
- **Advanced Movement System**: Smooth ice skating with momentum and realistic gliding
- **Hockey Stops**: Sharp stops with ice spray effects and authentic audio
- **Spin Moves**: 360-degree spins for advanced maneuvering and evasion
- **Body Checking**: Physical contact system with collision detection and impact sounds
- **Skating Audio**: Dynamic ice skating sounds that respond to movement speed

#### 🏒 **Authentic Puck Mechanics**
- **Puck Control**: Advanced attach/detach system with realistic physics
- **Passing System**: Variable power passing with teammate targeting and trajectory
- **Shooting Mechanics**: Power-based shooting with lift, accuracy, and goal detection
- **Stick Checking**: Defensive puck stealing abilities with audio feedback
- **Puck Physics**: Realistic puck bouncing, sliding, and collision responses

#### 🎵 **Professional Audio System**
- **Dynamic Crowd Sounds**: Reactive crowd cheering, chanting, and goal celebrations
- **Hockey-Specific Audio**: Goal horns, referee whistles, stick sounds, and puck impacts
- **Ambient Arena Atmosphere**: Background music and authentic arena ambience
- **Audio Pooling**: Efficient audio management system for optimal performance
- **Multi-player Scaling**: Dynamic audio optimization based on player count

#### 📊 **Comprehensive Statistics System**
- **Live Player Stats**: Real-time tracking of goals, assists, shots, saves, and time played
- **Period Statistics**: Detailed breakdown by period with comprehensive metrics
- **Team Performance**: Team-wide statistics and performance tracking
- **Goalie Metrics**: Specialized goalie statistics including save percentage
- **Game History**: Persistent statistics tracking across multiple games

#### 🎮 **Advanced Game Management**
- **State Machine**: Professional game state management with proper transitions
- **Timer System**: Accurate period timers with pause/resume functionality
- **Match Sequences**: Automated match start, period transitions, and game over sequences
- **UI Overlays**: Professional overlays for all game states with animations
- **Countdown Systems**: Visual and audio countdowns for all game events

#### 💬 **Comprehensive Chat Commands**
- **Admin Controls**: `/startmatch`, `/resetgame`, `/endgame` for game management
- **Testing Commands**: `/testgamestart`, `/testperiodend`, `/testgameover` for debugging
- **Debug Commands**: `/goalred`, `/goalblue`, `/testoffside` for feature testing
- **Statistics Commands**: `/stats`, `/resetstats` for performance tracking

## 🏗️ Technical Architecture

The project follows a sophisticated, modular architecture with clear separation of concerns:

```
classes/
├── managers/              # Core game management systems
│   ├── HockeyGameManager.ts      # Game state, scoring, periods, timers
│   ├── PlayerManager.ts          # Player lifecycle, spawning, UI management
│   ├── AudioManager.ts           # Advanced audio pooling and management
│   ├── PlayerSpawnManager.ts     # Team/position spawn system
│   ├── PlayerStatsManager.ts     # Comprehensive statistics tracking
│   └── ChatCommandManager.ts     # In-game command system
├── services/              # Specialized game services
│   ├── GoalDetectionService.ts   # Coordinate-based goal detection
│   ├── OffsideDetectionService.ts # NHL-style offside detection
│   ├── PlayerBarrierService.ts   # Goal area protection system
│   └── StatisticsService.ts      # Statistics calculation and tracking
├── controllers/           # Entity behavior controllers
│   └── IceSkatingController.ts   # Ice skating physics and puck control
├── systems/              # World and environment systems
│   └── WorldInitializer.ts      # Map loading, goals, entities
├── entities/             # Custom game entities
│   ├── IceFloorEntity.ts        # Ice surface with physics
│   └── PuckTrailEffect.ts       # Visual puck trail effects
└── utils/                # Shared utilities and types
    ├── constants.ts             # Game configuration constants
    └── types.ts                # TypeScript type definitions
```

### 🎯 **Advanced Design Patterns**
- **Singleton Pattern**: Game managers for centralized state management
- **Observer Pattern**: Event-driven UI and game state interactions
- **Service Layer**: Specialized services for complex game mechanics
- **State Machine**: Professional game state management with transitions
- **Object Pooling**: Efficient audio and entity management for performance

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) runtime (v1.2.1 or higher)
- [Hytopia SDK](https://hytopia.com) account and setup

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/allyourloot/hockey-zone.git
   cd hockey-zone
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Run the game server**
   ```bash
   bun run index.ts
   ```

4. **Connect to your game**
   - Open the Hytopia client
   - Connect to your local server
   - Start playing!

## 🎮 How to Play

### 🏒 **Basic Controls**
- **Movement**: WASD keys for ice skating with realistic momentum
- **Sprint**: Hold Shift while moving for faster skating
- **Puck Control**: Automatically pick up puck on contact
- **Pass**: Use UI controls to pass to teammates with variable power
- **Shoot**: Use UI controls to shoot at goal with power selection
- **Body Check**: Special ability with cooldown and collision detection
- **Hockey Stop**: Quick stop with ice spray effect and audio

### 🏟️ **Game Flow**
1. **Join Server**: Connect to the game lobby
2. **Team Selection**: Choose Red or Blue team from the selection UI
3. **Position Selection**: Select from Goalie, Defenders, Wingers, or Center
4. **Lock In**: Confirm your selection to join the match
5. **Match Start**: Automated match start sequence with countdown
6. **Play Periods**: Compete in 3 periods with automatic transitions
7. **Game Over**: Professional game over sequence with winner announcement

### 🎯 **Position Roles & Specializations**
- **Goalie**: Specialized for goalkeeping with unique stats and goal area access
- **Defenders**: Strong body checking abilities and defensive positioning
- **Wingers**: Fast skating for offensive pressure along the boards
- **Center**: Balanced stats for playmaking and face-offs

### 🚫 **Hockey Rules**
- **Offside**: Players cannot enter the offensive zone before the puck
- **Goal Area**: Only goalies can enter their own goal area
- **Periods**: 3 periods of timed gameplay with automatic transitions
- **Scoring**: Goals and assists are tracked and announced in real-time

## 🎛️ Admin Commands

### **Game Management**
- `/startmatch` - Start a new match with full reset sequence
- `/resetgame` - Reset the entire game to lobby state
- `/endgame` - End the current game and show game over screen
- `/endperiod` - Force end the current period

### **Testing & Debug**
- `/testgamestart` - Test the match start sequence
- `/testperiodend` - Test period transition sequence
- `/testgameover` - Test game over sequence
- `/testoffside` - Test offside detection system

### **Scoring & Statistics**
- `/goalred` - Award goal to Red team
- `/goalblue` - Award goal to Blue team
- `/stats` - Display comprehensive game statistics
- `/resetstats` - Reset all player statistics

## 🛠️ Development

### 🏗️ **Project Structure**
The codebase is organized into specialized modules:

- **Managers**: Handle game state, players, audio, statistics, and chat
- **Services**: Specialized systems for goals, offside, barriers, and stats
- **Controllers**: Define entity behaviors and physics
- **Systems**: Manage world initialization and environment
- **Entities**: Custom game entities with specialized behaviors
- **Utils**: Shared constants, types, and utilities

### 🔧 **Key Technologies**
- **Hytopia SDK**: 3D game engine and multiplayer framework
- **TypeScript**: Type-safe development with comprehensive interfaces
- **Bun**: Fast JavaScript runtime and package manager
- **3D Physics**: Realistic collision detection and movement systems
- **State Machines**: Professional game state management

### 🎨 **Assets**
- **3D Models**: Player models, hockey equipment, arena elements, and goals
- **Audio Library**: Comprehensive hockey sound effects and ambient audio
- **Textures**: Ice surfaces, team colors, arena materials, and UI elements
- **UI Components**: Professional overlays, HUD elements, and game interface

### 🏒 **Hockey-Specific Features**
- **Goal Detection**: Precise coordinate-based goal line crossing detection
- **Offside System**: Complete NHL-style offside rules implementation
- **Player Barriers**: Smart goal area protection with goalie awareness
- **Statistics**: Comprehensive player and team performance tracking
- **Audio**: Professional hockey audio with dynamic crowd reactions

## 🎯 Game Features Deep Dive

### **Goal Detection System**
- Coordinate-based detection using precise goal line measurements
- Own goal detection with automatic team credit switching
- Player tracking for accurate goal and assist attribution
- Goal celebration sequences with team-colored overlays
- Movement lock and camera focus during goal resets

### **Offside Detection System**
- **Immediate Offside**: Instant violation when carrying puck with teammates offside
- **Delayed Offside**: Proximity-based detection allowing strategic play
- **Blue Line Crossing**: Continuous monitoring of puck and player positions
- **Faceoff System**: Automatic positioning at correct neutral zone locations

### **Player Statistics**
- **Individual Stats**: Goals, assists, shots, saves, time played
- **Team Stats**: Team totals and performance metrics
- **Live Updates**: Real-time statistics during gameplay
- **Period Breakdown**: Detailed statistics by period

### **Audio Management**
- **Audio Pooling**: Efficient reuse of audio objects for performance
- **Dynamic Scaling**: Automatic optimization based on player count
- **Hockey Sounds**: Goal horns, referee whistles, stick sounds, crowd reactions
- **Ambient Audio**: Arena atmosphere and background music

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### 🐛 **Bug Reports**
Found a bug? Please open an issue with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/videos if applicable

### 💡 **Feature Requests**
Have an idea? We'd love to hear it! Open an issue with:
- Detailed description of the feature
- Use cases and benefits
- Implementation suggestions (optional)

## 📋 Development Status

### ✅ **Completed Features**
- Complete game state system with professional transitions
- Advanced goal detection with coordinate-based precision
- NHL-style offside detection with immediate and delayed violations
- Player barrier system with goalie-aware logic
- Comprehensive statistics tracking and display
- Professional audio management with pooling and scaling
- Automated match sequences and period management
- Chat command system for testing and administration

### 🚧 **In Progress**
- Enhanced UI animations and effects
- Additional player statistics and metrics
- Advanced replay system
- Tournament and league management

### 🗓️ **Planned Features**
- Penalty system implementation
- Power play mechanics
- Enhanced goalie AI behaviors
- Spectator mode and replay system
- Tournament brackets and league play

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Hytopia Team** - For the incredible SDK and platform
- **Hockey Community** - For inspiration, feedback, and testing
- **Contributors** - Everyone who helps make this project better
- **NHL** - For the inspiration and hockey rules implementation

## 🔗 Links

- [Hytopia SDK Documentation](https://github.com/hytopiagg/sdk)
- [Hytopia Discord Community](https://discord.gg/DXCXJbHSJX)
- [Report Issues](https://github.com/allyourloot/hockey-zone/issues)
- [Feature Requests](https://github.com/allyourloot/hockey-zone/discussions)

---

**Built with ❤️ using the Hytopia SDK**

*Experience professional hockey like never before. Clone the repo and hit the ice today!* 🏒⭐

**Game Features**: 🎯 Goal Detection | 🚫 Offside System | 🛡️ Player Barriers | 📊 Live Statistics | 🎵 Professional Audio | ⛸️ Realistic Physics | 🏟️ Complete Game Management
