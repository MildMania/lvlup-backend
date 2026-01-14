import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface GameInfo {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
}

interface GameContextType {
  currentGame: GameInfo;
  availableGames: GameInfo[];
  setCurrentGame: (game: GameInfo) => void;
  refreshGames: () => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const defaultGame: GameInfo = {
  id: 'default',
  name: 'No Games Yet',
  description: 'Create your first game',
  apiKey: import.meta.env.VITE_API_KEY || 'default_key'
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize from localStorage if available
  const [currentGame, setCurrentGame] = useState<GameInfo>(() => {
    const savedGame = localStorage.getItem('lvlup-current-game');
    if (savedGame) {
      try {
        return JSON.parse(savedGame);
      } catch (e) {
        console.error('Error parsing saved game:', e);
      }
    }
    return defaultGame;
  });
  const [availableGames, setAvailableGames] = useState<GameInfo[]>([]);

  // Save to localStorage whenever currentGame changes
  useEffect(() => {
    if (currentGame.id !== 'default') {
      localStorage.setItem('lvlup-current-game', JSON.stringify(currentGame));
    }
  }, [currentGame]);

  const fetchGames = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      const response = await fetch(`${apiBaseUrl}/games`);
      
      if (response.ok) {
        const responseData = await response.json();
        // Backend returns {success: true, data: [...games]}
        const games = responseData.data || responseData;
        
        if (games && games.length > 0) {
          setAvailableGames(games);
          
          // If current game is default, try to restore from localStorage or use first game
          if (currentGame.id === 'default') {
            const savedGame = localStorage.getItem('lvlup-current-game');
            if (savedGame) {
              try {
                const parsedGame = JSON.parse(savedGame);
                // Check if saved game still exists in available games
                const gameExists = games.find((g: GameInfo) => g.id === parsedGame.id);
                if (gameExists) {
                  setCurrentGame(gameExists);
                } else {
                  // Saved game no longer exists, use first game
                  setCurrentGame(games[0]);
                }
              } catch (e) {
                setCurrentGame(games[0]);
              }
            } else {
              setCurrentGame(games[0]);
            }
          } else {
            // Verify current game still exists in available games
            const gameExists = games.find((g: GameInfo) => g.id === currentGame.id);
            if (!gameExists) {
              // Current game was deleted, switch to first available
              setCurrentGame(games[0]);
            }
          }
        } else {
          // No games yet - show empty state
          setAvailableGames([]);
          setCurrentGame(defaultGame);
        }
      } else {
        console.error('Failed to fetch games:', response.statusText);
        setAvailableGames([]);
        setCurrentGame(defaultGame);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
      setAvailableGames([]);
      setCurrentGame(defaultGame);
    }
  };

  const refreshGames = async () => {
    await fetchGames();
  };

  useEffect(() => {
    fetchGames();
  }, []);

  return (
    <GameContext.Provider value={{ currentGame, availableGames, setCurrentGame, refreshGames }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
