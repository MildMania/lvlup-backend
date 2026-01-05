import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import Analytics from './Analytics';
import ReleaseManagement from './ReleaseManagement';
import { AIChatWidget } from './AIChatWidget';
import { useGame } from '../contexts/GameContext';
import { setApiKey } from '../lib/apiClient';
import './Layout.css';

const Layout: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { currentGame, availableGames, setCurrentGame, refreshGames } = useGame();

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

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />;
      case 'analytics':
        return <Analytics gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />;
      case 'users':
        return <div className="page-placeholder">Users Page - Coming Soon</div>;
      case 'events':
        return <div className="page-placeholder">Events Page - Coming Soon</div>;
      case 'funnels':
        return <div className="page-placeholder">Funnels Page - Coming Soon</div>;
      case 'releases':
        return <ReleaseManagement isCollapsed={isSidebarCollapsed} />;
      case 'settings':
        return <div className="page-placeholder">Settings Page - Coming Soon</div>;
      default:
        return <Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />;
    }
  };

  return (
    <div className="layout">
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        gameInfo={currentGame}
        availableGames={availableGames}
        onGameChange={handleGameChange}
        onCollapseChange={setIsSidebarCollapsed}
        onGameAdded={handleGameAdded}
      />
      <main className="main-content">
        {renderPage()}
      </main>
      <AIChatWidget />
    </div>
  );
};

export default Layout;