# Test Dataset Documentation

This directory contains comprehensive test data for the LvlUp Analytics platform. The seed script generates realistic gaming analytics data across multiple games and user scenarios.

## What's Generated

### 🎮 Games (3 different games)

- **Puzzle Quest Adventures**: Match-3 puzzle game with RPG elements
- **Space Runner 3D**: Endless runner game set in space
- **City Builder Pro**: City building and management game

### 👥 Users (225 total users)

- 50 users for Puzzle Quest Adventures
- 75 users for Space Runner 3D
- 100 users for City Builder Pro
- Distributed across different platforms (iOS, Android, WebGL)
- Various countries and languages
- Users created over the last 90 days

### 📊 Analytics Data

- **Sessions**: 5-25 sessions per user with realistic durations (5 minutes to 1 hour)
- **Events**: 5-20 events per session with game-specific event types
- **Properties**: Contextual event properties (levels, scores, purchases, etc.)

### 🎯 Player Journey

- **Checkpoints**: Tutorial completion, level progression, achievements
- **Player Progress**: Realistic funnel progression with dropoff rates
- **Metadata**: Completion times, attempts, contextual data

### ⚙️ Configuration & Testing

- **Remote Configs**: Game settings, difficulty, shop items
- **A/B Tests**: New player onboarding experiments
- **Test Assignments**: 60% of users assigned to test variants

## Event Types by Game

### Puzzle Quest Adventures

- `level_start`, `level_complete`, `level_fail`
- `power_up_used`, `purchase_made`
- `daily_reward_claimed`, `tutorial_step_completed`

### Space Runner 3D

- `game_start`, `game_over`, `power_up_collected`
- `obstacle_hit`, `high_score_achieved`
- `shop_visited`, `achievement_unlocked`

### City Builder Pro

- `building_placed`, `building_upgraded`, `resource_collected`
- `quest_completed`, `city_expanded`
- `population_milestone`, `trade_completed`

## Checkpoints by Game

### Puzzle Quest Adventures

1. `tutorial_complete` - Complete the tutorial
2. `level_10_reached` - Reach level 10
3. `first_power_up` - Use first power-up
4. `level_25_reached` - Reach level 25
5. `first_purchase` - Make first purchase
6. `level_50_reached` - Reach level 50

### Space Runner 3D

1. `first_run` - Complete first run
2. `score_1000` - Score 1000 points
3. `power_up_master` - Collect 10 power-ups
4. `score_5000` - Score 5000 points
5. `daily_player` - Play for 7 consecutive days

### City Builder Pro

1. `first_building` - Place first building
2. `population_100` - Reach 100 population
3. `first_upgrade` - Upgrade first building
4. `population_500` - Reach 500 population
5. `city_expansion` - Expand city boundaries
6. `population_1000` - Reach 1000 population

## Usage

### First Time Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
npm install

# Generate Prisma client
npm run generate

# Push schema to database and seed data
npm run db:reset
```

### Running Just the Seed

```bash
# If you already have the database schema
npm run db:seed
```

### Resetting Everything

```bash
# This will reset the database and re-seed all data
npm run db:reset
```

## Data Volumes

After seeding, you'll have approximately:

- **225 users** across 3 games
- **2,000+ sessions** with realistic patterns
- **30,000+ events** with contextual properties
- **18 checkpoints** across all games
- **Player progression data** showing realistic funnel behavior
- **Remote configs** for each game
- **A/B test data** with user assignments

## API Keys for Testing

Use these API keys when testing the API endpoints:

- **Puzzle Quest Adventures**: `pqa_api_key_12345`
- **Space Runner 3D**: `sr3d_api_key_67890`
- **City Builder Pro**: `cbp_api_key_11111`

## Example API Calls

```bash
# Get analytics for Puzzle Quest Adventures
curl -H "X-API-Key: pqa_api_key_12345" \
  "http://localhost:3001/api/analytics/users?startDate=2024-07-01&endDate=2024-10-12"

# Get player journey data
curl -H "X-API-Key: pqa_api_key_12345" \
  "http://localhost:3001/api/analytics/player-journey/funnel"

# Get engagement metrics
curl -H "X-API-Key: sr3d_api_key_67890" \
  "http://localhost:3001/api/analytics/engagement/retention"
```

## Realistic Scenarios Covered

### 📈 Analytics Testing

- Daily/weekly/monthly active users
- User retention cohorts
- Session duration patterns
- Event frequency distributions

### 🎮 Gaming Metrics

- Level progression analytics
- In-app purchase behavior
- Player engagement patterns
- Feature adoption rates

### 🧪 A/B Testing

- User assignment distribution
- Control vs variant performance
- Feature flag configurations

### 📊 Business Intelligence

- Revenue tracking (purchase events)
- User acquisition patterns
- Churn prediction data
- Engagement segmentation

This dataset provides a solid foundation for testing all analytics features, developing dashboards, and validating business metrics calculations.
