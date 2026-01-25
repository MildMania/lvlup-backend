import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  Trash2,
  UsersRound,
  User,
  LogOut
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import AddGameModal from './AddGameModal';
import './Sidebar.css';

interface GameInfo {
  id: string;
  name: string;
  description?: string;
}

interface SidebarProps {
  currentPage: string;
  onPageChange?: (page: string) => void;  // Optional since not currently used
  gameInfo?: GameInfo;
  availableGames?: GameInfo[];
  onGameChange?: (gameId: string) => void;
  onCollapseChange?: (collapsed: boolean) => void;
  onGameAdded?: (game: { id: string; name: string; apiKey: string }) => void;
  onGameDelete?: (gameId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentPage, 
  // onPageChange,  // TODO: Remove if not needed, or implement usage
  gameInfo, 
  availableGames = [], 
  onGameChange,
  onCollapseChange,
  onGameAdded,
  onGameDelete
}) => {
  // Initialize collapsed state from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('lvlup-sidebar-collapsed');
    return saved === 'true';
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Initialize games expanded state from localStorage
  const [isGamesExpanded, setIsGamesExpanded] = useState(() => {
    const saved = localStorage.getItem('lvlup-games-expanded');
    return saved !== 'false'; // Default to true if not set
  });
  // Initialize settings expanded state from localStorage
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(() => {
    const saved = localStorage.getItem('lvlup-settings-expanded');
    return saved !== 'false'; // Default to true if not set
  });
  const [isAddGameModalOpen, setIsAddGameModalOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout, user } = useAuth();

  // Check if user has admin privileges
  const isAdmin = user?.teamMemberships?.some(
    membership => ['ADMIN', 'SUPER_ADMIN'].includes(membership.role)
  ) || false;

  // Notify parent of initial collapsed state
  useEffect(() => {
    if (onCollapseChange) {
      onCollapseChange(isCollapsed);
    }
  }, []); // Run only once on mount

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      try {
        await logout();
        window.location.href = '/login';
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'events', label: 'Events', icon: Activity },
    { id: 'funnels', label: 'Funnels', icon: Target },
    { id: 'releases', label: 'Releases', icon: GitBranch },
  ];

  const settingsItems = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'teams', label: 'Teams', icon: UsersRound, adminOnly: true },
    { id: 'users', label: 'Users', icon: Users, adminOnly: true },
    { id: 'settings', label: 'General', icon: Settings, adminOnly: true },
    // Add Games management as an admin-only settings page
    { id: 'games', label: 'Games', icon: GamepadIcon, adminOnly: true },
  ];

  // Filter settings items based on user role
  const visibleSettingsItems = settingsItems.filter(item => {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    return true;
  });

  const toggleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    localStorage.setItem('lvlup-sidebar-collapsed', String(newCollapsedState));
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
                  <p className="game-id">{gameInfo.id}</p>
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
                  onClick={() => {
                    const newState = !isGamesExpanded;
                    setIsGamesExpanded(newState);
                    localStorage.setItem('lvlup-games-expanded', String(newState));
                  }}
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
                        {/* Removed inline delete button from sidebar to centralize deletion in admin Games page */}
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
                  <Link
                    to={`/${item.id}`}
                    className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                    onClick={() => {
                      if (window.innerWidth <= 768) {
                        setIsMobileOpen(false);
                      }
                    }}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <IconComponent className="nav-icon" size={20} />
                    {!isCollapsed && <span className="nav-label">{item.label}</span>}
                  </Link>
                </li>
              );
            })}

            {/* Settings Section with Submenu */}
            {!isCollapsed ? (
              <li className="nav-item settings-section">
                <div 
                  className="settings-toggle"
                  onClick={() => {
                    const newState = !isSettingsExpanded;
                    setIsSettingsExpanded(newState);
                    localStorage.setItem('lvlup-settings-expanded', String(newState));
                  }}
                >
                  <div className="settings-toggle-content">
                    <Settings className="nav-icon" size={20} />
                    <span className="nav-label">Settings</span>
                  </div>
                  {isSettingsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                
                {isSettingsExpanded && (
                  <ul className="settings-submenu">
                    {visibleSettingsItems.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <li key={item.id} className="submenu-item">
                          <Link
                            to={`/${item.id}`}
                            className={`nav-link submenu-link ${currentPage === item.id ? 'active' : ''}`}
                            onClick={() => {
                              if (window.innerWidth <= 768) {
                                setIsMobileOpen(false);
                              }
                            }}
                          >
                            <IconComponent className="nav-icon" size={18} />
                            <span className="nav-label">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ) : (
              // Collapsed sidebar - show Settings items as regular menu items
              visibleSettingsItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <li key={item.id} className="nav-item">
                    <Link
                      to={`/${item.id}`}
                      className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
                      onClick={() => {
                        if (window.innerWidth <= 768) {
                          setIsMobileOpen(false);
                        }
                      }}
                      title={item.label}
                    >
                      <IconComponent className="nav-icon" size={20} />
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {!isCollapsed && (
            <div className="footer-content">
              {user && (
                <div className="user-info">
                  <div className="user-name">{user.firstName} {user.lastName}</div>
                  <div className="user-email">{user.email}</div>
                </div>
              )}
              <button 
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <button 
                className="logout-btn"
                onClick={handleLogout}
                aria-label="Log out"
              >
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
              <p className="version">v1.0.0</p>
            </div>
          )}
          {isCollapsed && (
            <>
              <button 
                className="theme-toggle-collapsed"
                onClick={toggleTheme}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button 
                className="logout-btn-collapsed"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={20} />
              </button>
            </>
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
