import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import Analytics from './Analytics';
import Events from './Events';
import ReleaseManagement from './ReleaseManagement';
import LevelFunnel from './LevelFunnel';
import TeamManagement from './TeamManagement';
import UserManagement from './UserManagement';
import { AIChatWidget } from './AIChatWidget';
import { useGame } from '../contexts/GameContext';
import { setApiKey } from '../lib/apiClient';
import './Layout.css';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { currentGame, availableGames, setCurrentGame, refreshGames } = useGame();

  // Determine current page from URL path
  const currentPage = location.pathname.substring(1) || 'dashboard';

  // Update API key when game changes
  useEffect(() => {
    setApiKey(currentGame.apiKey);
  }, [currentGame]);

  const handlePageChange = (page: string) => {
    navigate(`/${page}`);
  };

  const handleGameChange = (gameId: string) => {
    const game = availableGames.find(g => g.id === gameId);
    if (game) {
      setCurrentGame(game);
    }
  };

  const handleGameAdded = async (game: { id: string; name: string; apiKey: string }) => {
    // Refresh the games list
    await refreshGames();
    // Switch to the newly created game
    setCurrentGame({
      id: game.id,
      name: game.name,
      apiKey: game.apiKey
    });
  };

  const handleGameDelete = async (gameId: string) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      const response = await fetch(`${apiBaseUrl}/games/${gameId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh games list
        await refreshGames();
        
        // If deleted game was current, switch to first available or default
        if (currentGame.id === gameId) {
          const remainingGames = availableGames.filter(g => g.id !== gameId);
          if (remainingGames.length > 0) {
            setCurrentGame(remainingGames[0]);
          } else {
            // Reset to default if no games left
            setCurrentGame({
              id: 'default',
              name: 'No Games Yet',
              description: 'Create your first game',
              apiKey: 'default_key'
            });
          }
        }
      } else {
        const errorData = await response.json();
        alert(`Failed to delete game: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting game:', error);
      alert('Failed to delete game. Please try again.');
    }
  };

  return (
    <div className="layout">
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={handlePageChange}
        gameInfo={currentGame}
        availableGames={availableGames}
        onGameChange={handleGameChange}
        onCollapseChange={setIsSidebarCollapsed}
        onGameAdded={handleGameAdded}
        onGameDelete={handleGameDelete}
      />
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/analytics" element={<Analytics gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/teams" element={<TeamManagement />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/events" element={<Events gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/funnels" element={<LevelFunnel isCollapsed={isSidebarCollapsed} />} />
          <Route path="/releases" element={<ReleaseManagement isCollapsed={isSidebarCollapsed} />} />
          <Route path="/settings" element={<div className="page-placeholder">Settings Page - Coming Soon</div>} />
          <Route path="/" element={<Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
        </Routes>
      </main>
      <AIChatWidget />
    </div>
  );
};

export default Layout;