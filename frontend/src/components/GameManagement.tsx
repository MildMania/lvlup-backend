import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { GamepadIcon, Trash2, Plus, AlertCircle, X, ChevronLeft } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import './GameManagement.css';

interface GameInfo {
  id: string;
  name: string;
  description?: string;
  apiKey?: string;
}

interface GameManagementProps {
  isCollapsed?: boolean;
}

const GameManagement: React.FC<GameManagementProps> = ({ isCollapsed = false }) => {
  const { user } = useAuth();
  const { availableGames, refreshGames, setCurrentGame } = useGame();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isAdmin = user?.teamMemberships?.some(
    membership => ['ADMIN', 'SUPER_ADMIN'].includes(membership.role)
  ) || false;

  useEffect(() => {
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/games');
      const data = response.data.data || response.data;
      setGames(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[GameManagement] Error fetching games:', err);
      setError(err.response?.data?.error || 'Failed to fetch games');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (game: GameInfo) => {
    if (!isAdmin) return setError('Insufficient permissions');

    // Ask user to type 'delete' to validate deletion
    const userInput = window.prompt(
      `Type 'delete' to confirm deletion of "${game.name}". This action cannot be undone.`
    );

    if (userInput === null) {
      // user cancelled prompt
      return;
    }

    if (userInput.trim().toLowerCase() !== 'delete') {
      // Invalid confirmation
      setError('Deletion cancelled — you must type "delete" to confirm.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    try {
      await apiClient.delete(`/games/${game.id}`);
      setSuccess('Game deleted successfully');
      // Refresh local and global game lists
      await refreshGames();
      await fetchGames();

      // Clear success message after a short delay
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('[GameManagement] Error deleting game:', err);
      setError(err.response?.data?.error || 'Failed to delete game');
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className={`game-management ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="game-header">
        <h1>Game Management</h1>
        <p>Admin-only page to manage games (create, edit, delete)</p>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="success-banner">
          <span>{success}</span>
        </div>
      )}

      <div className="games-grid">
        {games.length === 0 ? (
          <div className="empty-state">
            <GamepadIcon className="empty-state-icon" />
            <h3>No games yet</h3>
            <p>Create your first game from the Add Game flow</p>
          </div>
        ) : (
          games.map((g) => (
            <div key={g.id} className="game-card">
              <div className="game-card-header">
                <div className="game-icon"><GamepadIcon size={20} /></div>
                {isAdmin && (
                  <div className="game-actions-buttons">
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={(e) => { e.stopPropagation(); handleDelete(g); }}
                      title="Delete game"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              <h3>{g.name}</h3>
              {g.description && <p className="game-description">{g.description}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GameManagement;
