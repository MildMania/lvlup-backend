import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import Analytics from './Analytics';
import Events from './Events';
import ReleaseManagement from './ReleaseManagement';
import LevelFunnel from './LevelFunnel';
import TeamManagement from './TeamManagement';
import UserManagement from './UserManagement';
import UserProfile from './UserProfile';
import RemoteConfig from './RemoteConfig';
import GameConfigBundles from './GameConfigBundles';
import { AIChatWidget } from './AIChatWidget';
import { useGame } from '../contexts/GameContext';
import { setApiKey } from '../lib/apiClient';
import GameManagement from './GameManagement';
import TopBar from './TopBar';
import './Layout.css';

const Layout: React.FC = () => {
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { currentGame, availableGames, setCurrentGame, refreshGames } = useGame();

  // Determine current page from URL path
  // Keep sidebar selection stable for nested routes like /game-config/structures.
  const currentPage = location.pathname.split('/').filter(Boolean)[0] || 'dashboard';

  // Update API key when game changes
  useEffect(() => {
    setApiKey(currentGame.apiKey);
  }, [currentGame]);


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

  const sidebarWidth = isSidebarCollapsed ? '80px' : '280px';

  return (
    <div className={`layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ ['--sidebar-width' as any]: sidebarWidth } as React.CSSProperties}>
      <Sidebar 
        currentPage={currentPage}
        gameInfo={currentGame}
        availableGames={availableGames}
        onGameChange={handleGameChange}
        onCollapseChange={setIsSidebarCollapsed}
        onGameAdded={handleGameAdded}
      />
      <TopBar isCollapsed={isSidebarCollapsed} />
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/analytics" element={<Analytics gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/teams" element={<TeamManagement isCollapsed={isSidebarCollapsed} />} />
          <Route path="/users" element={<UserManagement isCollapsed={isSidebarCollapsed} />} />
          <Route path="/events" element={<Events gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
          <Route path="/funnels" element={<LevelFunnel isCollapsed={isSidebarCollapsed} />} />
          <Route path="/releases" element={<ReleaseManagement isCollapsed={isSidebarCollapsed} />} />
          <Route path="/remote-config" element={<RemoteConfig isCollapsed={isSidebarCollapsed} />} />
          {/* Keep a single mounted component for /game-config/* so local edits don't reset on navigation */}
          <Route path="/game-config" element={<Navigate to="/game-config/dictionary/structures" replace />} />
          <Route path="/game-config/*" element={<GameConfigBundles isCollapsed={isSidebarCollapsed} />} />
          <Route path="/profile" element={<UserProfile isCollapsed={isSidebarCollapsed} />} />
          <Route path="/games" element={<GameManagement isCollapsed={isSidebarCollapsed} />} />
          <Route path="/settings" element={<div className="page-placeholder">Settings Page - Coming Soon</div>} />
          <Route path="/" element={<Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />} />
        </Routes>
      </main>
      <AIChatWidget />
    </div>
  );
};

export default Layout;
