# 🏒 Hockey Zone

A fully-featured 3D hockey game built with the [Hytopia SDK](https://hytopia.com), featuring realistic ice skating physics, team-based gameplay, and immersive hockey mechanics.

## 🎮 Game Overview

Hockey Zone is a multiplayer hockey simulation that brings the excitement of ice hockey to a virtual 3D environment. Players can join teams, select positions, and compete in fast-paced matches with authentic hockey mechanics including ice skating, puck control, passing, shooting, and body checking.

### ✨ Key Features

#### 🏟️ **Complete Hockey Experience**
- **6v6 Team Play**: Full team rosters with Goalies, Defenders, Wingers, and Centers
- **Position-Based Gameplay**: Each position has unique stats and capabilities
- **3-Period Matches**: Authentic hockey game structure with period breaks
- **Real-time Scoring**: Live score tracking and goal celebrations

#### ⛸️ **Realistic Ice Skating Physics**
- **Advanced Movement System**: Smooth ice skating with momentum and gliding
- **Hockey Stops**: Sharp stops with ice spray effects and audio
- **Spin Moves**: 360-degree spins for advanced maneuvering
- **Body Checking**: Physical contact system with collision detection

#### 🏒 **Authentic Puck Mechanics**
- **Puck Control**: Attach/detach puck system with realistic physics
- **Passing System**: Variable power passing with teammate targeting
- **Shooting Mechanics**: Power-based shooting with lift and accuracy
- **Stick Checking**: Defensive puck stealing abilities

#### 🎵 **Immersive Audio System**
- **Dynamic Crowd Sounds**: Reactive crowd cheering and chanting
- **Ice Skating Audio**: Realistic skate sounds on ice
- **Puck Impact Sounds**: Audio feedback for puck interactions
- **Ambient Arena Atmosphere**: Background music and arena ambience

#### 🎯 **Advanced Game Management**
- **Team Selection UI**: Interactive team and position selection
- **Lock-in System**: Players confirm their positions before matches
- **Game State Management**: Lobby → Team Selection → Match → Scoring
- **Chat Commands**: In-game commands for testing and administration

## 🏗️ Technical Architecture

The project follows a clean, modular architecture with separation of concerns:

```
classes/
├── managers/           # Core game management systems
│   ├── HockeyGameManager.ts    # Game state, scoring, periods
│   ├── PlayerManager.ts        # Player lifecycle, spawning, UI
│   ├── AudioManager.ts         # Sound effects and music
│   └── ChatCommandManager.ts   # In-game command system
├── controllers/        # Entity behavior controllers
│   └── IceSkatingController.ts # Ice skating physics and puck control
├── systems/           # World and environment systems
│   └── WorldInitializer.ts    # Map loading, goals, entities
└── utils/             # Shared utilities and types
    ├── constants.ts           # Game configuration constants
    └── types.ts              # TypeScript type definitions
```

### 🎯 **Design Patterns Used**
- **Singleton Pattern**: Game managers for centralized state
- **Observer Pattern**: Event-driven UI and game interactions
- **Component System**: Modular entity controllers
- **Factory Pattern**: Entity creation and spawning

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
- **Movement**: WASD keys for skating
- **Sprint**: Hold Shift while moving
- **Puck Control**: Automatically pick up puck on contact
- **Pass**: Use UI controls to pass to teammates
- **Shoot**: Use UI controls to shoot at goal
- **Body Check**: Special ability with cooldown
- **Hockey Stop**: Quick stop with ice spray effect

### 🏟️ **Game Flow**
1. **Join Server**: Connect to the game lobby
2. **Select Team**: Choose Red or Blue team
3. **Pick Position**: Select from Goalie, Defenders, Wingers, or Center
4. **Lock In**: Confirm your selection to join the match
5. **Play**: Compete in 3-period hockey matches
6. **Score Goals**: Work with your team to outscore opponents

### 🎯 **Position Roles**
- **Goalie**: Defend the net, unique stats for goalkeeping
- **Defenders**: Strong body checking, defensive positioning
- **Wingers**: Fast skating, offensive pressure on sides
- **Center**: Balanced stats, playmaking and face-offs

## 🛠️ Development

### 🏗️ **Project Structure**
The codebase is organized into logical modules:

- **Managers**: Handle game state, players, audio, and chat
- **Controllers**: Define entity behaviors and physics
- **Systems**: Manage world initialization and environment
- **Utils**: Shared constants, types, and utilities

### 🔧 **Key Technologies**
- **Hytopia SDK**: 3D game engine and multiplayer framework
- **TypeScript**: Type-safe development
- **Bun**: Fast JavaScript runtime and package manager
- **3D Physics**: Realistic collision detection and movement

### 🎨 **Assets**
- **3D Models**: Player models, hockey equipment, arena elements
- **Audio**: Comprehensive sound library for hockey atmosphere
- **Textures**: Ice surfaces, team colors, arena materials
- **UI Elements**: Team selection, HUD, and game interface

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

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

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Hytopia Team** - For the amazing SDK and platform
- **Hockey Community** - For inspiration and feedback
- **Contributors** - Everyone who helps make this project better

## 🔗 Links

- [Hytopia SDK Documentation](https://github.com/hytopiagg/sdk)
- [Hytopia Discord Community](https://discord.gg/DXCXJbHSJX)
- [Report Issues](https://github.com/allyourloot/hockey-zone/issues)

---

**Built with ❤️ using the Hytopia SDK**

*Ready to hit the ice? Clone the repo and start your hockey journey today!* 🏒⭐
