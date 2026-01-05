import React, { useState } from 'react';
import { X } from 'lucide-react';
import './AddGameModal.css';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded: (game: { id: string; name: string; apiKey: string }) => void;
}

const AddGameModal: React.FC<AddGameModalProps> = ({ isOpen, onClose, onGameAdded }) => {
  const [gameName, setGameName] = useState('');
  const [gameDescription, setGameDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdGame, setCreatedGame] = useState<{ id: string; name: string; apiKey: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
      
      console.log('Creating game with API URL:', apiBaseUrl);
      console.log('Game name:', gameName);
      console.log('Game description:', gameDescription);
      
      const response = await fetch(`${apiBaseUrl}/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: gameName,
          description: gameDescription,
        }),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = `Failed to create game: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
        }
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      console.log('Game created successfully:', responseData);
      
      // Backend returns {success: true, data: {...game}}
      const gameData = responseData.data || responseData;
      
      setCreatedGame(gameData);
      setSuccess(true);
      onGameAdded(gameData);

      // Reset form after a delay
      setTimeout(() => {
        handleClose();
      }, 3000);

    } catch (err) {
      console.error('Error creating game:', err);
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setGameName('');
    setGameDescription('');
    setError('');
    setSuccess(false);
    setCreatedGame(null);
    onClose();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{success ? '🎉 Game Created!' : '🎮 Add New Game'}</h2>
          <button className="modal-close" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label htmlFor="gameName">
                Game Name <span className="required">*</span>
              </label>
              <input
                id="gameName"
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Enter game name"
                required
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="gameDescription">Description</label>
              <textarea
                id="gameDescription"
                value={gameDescription}
                onChange={(e) => setGameDescription(e.target.value)}
                placeholder="Enter game description (optional)"
                rows={3}
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !gameName.trim()}
              >
                {isLoading ? 'Creating...' : 'Create Game'}
              </button>
            </div>
          </form>
        ) : (
          <div className="success-content">
            <div className="success-message">
              <p>✅ Your game has been created successfully!</p>
            </div>

            {createdGame && (
              <div className="game-details">
                <div className="detail-item">
                  <label>Game ID:</label>
                  <div className="detail-value">
                    <code>{createdGame.id}</code>
                    <button
                      className="copy-btn"
                      onClick={() => copyToClipboard(createdGame.id)}
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="detail-item">
                  <label>API Key:</label>
                  <div className="detail-value">
                    <code className="api-key">{createdGame.apiKey}</code>
                    <button
                      className="copy-btn"
                      onClick={() => copyToClipboard(createdGame.apiKey)}
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="detail-item">
                  <label>Game Name:</label>
                  <div className="detail-value">
                    <strong>{createdGame.name}</strong>
                  </div>
                </div>

                <div className="info-box">
                  <p><strong>⚠️ Important:</strong> Save your API key now! You'll need it to integrate with Unity SDK.</p>
                  <p className="unity-example">
                    <strong>Unity SDK Example:</strong>
                    <code className="code-block">
                      LvlUpManager.Initialize(<br />
                      &nbsp;&nbsp;"<span className="highlight">{createdGame.apiKey}</span>",<br />
                      &nbsp;&nbsp;"{import.meta.env.VITE_API_BASE_URL || 'https://your-backend.railway.app/api'}"<br />
                      );
                    </code>
                  </p>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddGameModal;

