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
  const [currentGame, setCurrentGame] = useState<GameInfo>(defaultGame);
  const [availableGames, setAvailableGames] = useState<GameInfo[]>([]);

  const fetchGames = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      const response = await fetch(`${apiBaseUrl}/games`);
      
      if (response.ok) {
        const games = await response.json();
        if (games && games.length > 0) {
          setAvailableGames(games);
          // Set first game as current if we don't have a current game set
          if (currentGame.id === 'default') {
            setCurrentGame(games[0]);
          }
        } else {
          // No games yet - show empty state
          setAvailableGames([]);
          setCurrentGame(defaultGame);
        }
      } else {
        console.error('Failed to fetch games:', response.statusText);
        // Set empty state on error too
        setAvailableGames([]);
        setCurrentGame(defaultGame);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
      // Set empty state on error
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
