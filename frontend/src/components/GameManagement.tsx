import React, { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { GamepadIcon, Trash2, AlertCircle } from 'lucide-react';
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
  const { refreshGames } = useGame();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New state for modal confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<GameInfo | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  // Open modal instead of using window.prompt
  const openDeleteModal = (game: GameInfo) => {
    setGameToDelete(game);
    setConfirmText('');
    setError('');
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setGameToDelete(null);
    setConfirmText('');
  };

  const confirmDelete = async () => {
    if (!isAdmin) return setError('Insufficient permissions');
    if (!gameToDelete) return;

    if (confirmText.trim().toLowerCase() !== 'delete') {
      setError('You must type "delete" to confirm deletion.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setDeleting(true);
    try {
      await apiClient.delete(`/games/${gameToDelete.id}`);
      setSuccess('Game deleted successfully');
      await refreshGames();
      await fetchGames();
      closeDeleteModal();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('[GameManagement] Error deleting game:', err);
      setError(err.response?.data?.error || 'Failed to delete game');
    } finally {
      setDeleting(false);
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
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(g); }}
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

      {/* In-app delete confirmation modal */}
      {deleteModalOpen && gameToDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="delete-modal">
            <h3>Confirm deletion</h3>
            <p>
              To permanently delete <strong>{gameToDelete.name}</strong>, type <code>delete</code> below and
              press Delete. This action cannot be undone.
            </p>

            <input
              type="text"
              className="confirm-input"
              placeholder="Type delete to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleting || confirmText.trim().toLowerCase() !== 'delete'}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameManagement;
