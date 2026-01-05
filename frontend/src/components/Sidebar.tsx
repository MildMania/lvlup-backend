import React, { useState } from 'react';
import { 
  BarChart3, 
  Users, 
  Activity, 
  Settings, 
  GamepadIcon,
  TrendingUp,
  Target,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
  GitBranch,
  Trash2
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import AddGameModal from './AddGameModal';
import './Sidebar.css';

interface GameInfo {
  id: string;
  name: string;
  description?: string;
}

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  gameInfo?: GameInfo;
  availableGames?: GameInfo[];
  onGameChange?: (gameId: string) => void;
  onCollapseChange?: (collapsed: boolean) => void;
  onGameAdded?: (game: { id: string; name: string; apiKey: string }) => void;
  onGameDelete?: (gameId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentPage, 
  onPageChange, 
  gameInfo, 
  availableGames = [], 
  onGameChange,
  onCollapseChange,
  onGameAdded,
  onGameDelete
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isGamesExpanded, setIsGamesExpanded] = useState(true);
  const [isAddGameModalOpen, setIsAddGameModalOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'funnels', label: 'Funnels', icon: Target },
    { id: 'releases', label: 'Releases', icon: GitBranch },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const toggleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    onCollapseChange?.(newCollapsedState);
  };

  const toggleMobile = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button 
        className="mobile-menu-btn" 
        onClick={toggleMobile}
        aria-label="Toggle menu"
      >
        <Menu size={24} />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && <div className="mobile-overlay" onClick={toggleMobile} />}

      {/* Sidebar */}
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-section">
            <GamepadIcon className="logo-icon" size={32} />
            {!isCollapsed && (
              <div className="logo-text">
                <h1>LvlUp</h1>
                <span>Analytics</span>
              </div>
            )}
          </div>
          
          {/* Desktop Collapse Button */}
          <button 
            className="collapse-btn desktop-only" 
            onClick={toggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>

          {/* Mobile Close Button */}
          <button 
            className="close-btn mobile-only" 
            onClick={toggleMobile}
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        {/* Game Info Section */}
        {gameInfo && (
          <div className="game-info">
            <div className="game-header">
              <div className="game-icon">
                <GamepadIcon size={16} />
              </div>
              {!isCollapsed && (
                <div className="game-details">
                  <h3 className="game-name">{gameInfo.name}</h3>
                  {gameInfo.description && (
                    <p className="game-description">{gameInfo.description}</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Games List - Always show so Add Game button is accessible */}
            {!isCollapsed && (
              <div className="games-section">
                <div 
                  className="games-toggle"
                  onClick={() => setIsGamesExpanded(!isGamesExpanded)}
                >
                  <span>Games</span>
                  {isGamesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                
                {isGamesExpanded && (
                  <div className="games-list">
                    {availableGames.filter(game => game.id !== 'default').map((game) => (
                      <div key={game.id} className="game-item-wrapper">
                        <button
                          className={`game-item ${game.id === gameInfo.id ? 'active' : ''}`}
                          onClick={() => onGameChange && onGameChange(game.id)}
                        >
                          <GamepadIcon size={14} />
                          <span className="game-item-name">{game.name}</span>
                        </button>
                        {onGameDelete && (
                          <button
                            className="game-item-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Are you sure you want to delete "${game.name}"? This action cannot be undone.`)) {
                                onGameDelete(game.id);
                              }
                            }}
                            title="Delete game"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    {availableGames.filter(game => game.id !== 'default').length === 0 && (
                      <div className="no-games-message">
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px', textAlign: 'center' }}>
                          No games yet. Create your first one!
                        </p>
                      </div>
                    )}
                    <button 
                      className="game-item add-game"
                      onClick={() => setIsAddGameModalOpen(true)}
                    >
                      <Plus size={14} />
                      <span className="game-item-name">Add Game</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.id} className="nav-item">
                  <button
                    className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                    onClick={() => {
                      onPageChange(item.id);
                      if (window.innerWidth <= 768) {
                        setIsMobileOpen(false);
                      }
                    }}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <IconComponent className="nav-icon" size={20} />
                    {!isCollapsed && <span className="nav-label">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {!isCollapsed && (
            <div className="footer-content">
              <button 
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <p className="version">v1.0.0</p>
            </div>
          )}
          {isCollapsed && (
            <button 
              className="theme-toggle-collapsed"
              onClick={toggleTheme}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          )}
        </div>
      </div>

      {/* Add Game Modal */}
      <AddGameModal
        isOpen={isAddGameModalOpen}
        onClose={() => setIsAddGameModalOpen(false)}
        onGameAdded={(game) => {
          if (onGameAdded) {
            onGameAdded(game);
          }
          setIsAddGameModalOpen(false);
        }}
      />
    </>
  );
};

export default Sidebar;
