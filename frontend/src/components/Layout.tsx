import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import ReleaseManagement from './ReleaseManagement';
import { AIChatWidget } from './AIChatWidget';
import './Layout.css';

interface GameInfo {
  id: string;
  name: string;
  description?: string;
}

const Layout: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedGameId, setSelectedGameId] = useState('cmgnwzyny00001y9kkivzptyx');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Mock games data - in a real app, this would come from an API or context
  const availableGames: GameInfo[] = [
    {
      id: 'cmgnwzyny00001y9kkivzptyx',
      name: 'Puzzle Quest Adventures',
      description: 'A puzzle adventure game with RPG elements'
    },
    {
      id: 'game_2',
      name: 'Space Raiders',
      description: 'An action-packed space shooter game'
    },
    {
      id: 'game_3', 
      name: 'Fantasy Kingdom',
      description: 'A strategic kingdom building game'
    }
  ];

  const currentGame = availableGames.find(game => game.id === selectedGameId) || availableGames[0];

  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard gameInfo={currentGame} isCollapsed={isSidebarCollapsed} />;
      case 'analytics':
        return <div className="page-placeholder">Analytics Page - Coming Soon</div>;
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
      />
      <main className="main-content">
        {renderPage()}
      </main>
      <AIChatWidget />
    </div>
  );
};

export default Layout;