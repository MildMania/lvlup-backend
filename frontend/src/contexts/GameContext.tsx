import React, { createContext, useContext, useState } from 'react';
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
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const defaultGames: GameInfo[] = [
  {
    id: '1',
    name: 'Puzzle Quest Adventures',
    description: 'A puzzle adventure game with RPG elements',
    apiKey: 'pqa_api_key_12345'
  },
  {
    id: '2',
    name: 'Space Runner 3D',
    description: 'An action-packed endless runner game',
    apiKey: 'sr3d_api_key_67890'
  },
  {
    id: '3',
    name: 'City Builder Pro',
    description: 'A strategic city building game',
    apiKey: 'cbp_api_key_11111'
  }
];

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentGame, setCurrentGame] = useState<GameInfo>(defaultGames[0]);

  return (
    <GameContext.Provider value={{ currentGame, availableGames: defaultGames, setCurrentGame }}>
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
