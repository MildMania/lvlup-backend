#!/bin/bash

# Quick Outlier Analysis Script
# Runs the outlier detection for your game

echo "🔍 Level Completion Outlier Analysis"
echo "====================================="
echo ""

# Default values
GAME_ID="cmk1phl2o0001pb1k2ubtq0fo"
LEVEL_ID="1"

# Check if arguments provided
if [ $# -eq 1 ]; then
    LEVEL_ID="$1"
elif [ $# -eq 2 ]; then
    GAME_ID="$1"
    LEVEL_ID="$2"
fi

echo "📊 Analyzing:"
echo "   Game ID: $GAME_ID"
echo "   Level: $LEVEL_ID"
echo ""
echo "💡 Tip: You can specify different values:"
echo "   ./analyze-outliers.sh [levelId]"
echo "   ./analyze-outliers.sh [gameId] [levelId]"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run the analysis
node find-level-outliers-railway.js "$GAME_ID" "$LEVEL_ID"

