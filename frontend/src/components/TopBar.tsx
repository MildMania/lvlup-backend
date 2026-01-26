import React, { useState, useEffect } from 'react';
import { GamepadIcon, ChevronDown, Copy } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import AddGameModal from './AddGameModal';
import './TopBar.css';

interface TopBarProps {
  isCollapsed?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ isCollapsed = false }) => {
  const { currentGame, availableGames, setCurrentGame, refreshGames } = useGame();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<{ type: 'id' | 'key' | null }>({ type: null });
  const [isAddOpen, setIsAddOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // if click inside dropdown or on the toggle, do nothing
      if (target.closest('.topbar-dropdown') || target.closest('.game-switch')) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleOpen = () => setOpen(!open);

  const handleSwitch = (gameId: string) => {
    const game = availableGames.find(g => g.id === gameId);
    if (game) {
      setCurrentGame(game);
    }
    setOpen(false);
  };

  const copy = async (text: string, type: 'id' | 'key') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ type });
      setTimeout(() => setCopied({ type: null }), 1600);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <>
      <div className={`topbar ${isCollapsed ? 'collapsed' : ''}`} style={{ left: isCollapsed ? '80px' : '280px' }}>
        <div className="topbar-left">
          <div className="game-switch" onClick={toggleOpen} role="button" tabIndex={0}>
            <GamepadIcon className="topbar-icon" />
            <div className="topbar-game-info">
              <div className="topbar-game-name">{currentGame?.name || 'No Game'}</div>
              <div className="topbar-game-sub">{currentGame?.id ? `${currentGame.id}` : ''}</div>
            </div>
            <ChevronDown className={`chevron ${open ? 'open' : ''}`} />
          </div>

          {open && (
            <div className="topbar-dropdown">
              <div className="dropdown-header">
                <strong>Switch Game</strong>
              </div>
              <div className="dropdown-list">
                {availableGames && availableGames.length > 0 ? (
                  availableGames.map(g => (
                    <button type="button" key={g.id} className={`dropdown-item ${g.id === currentGame.id ? 'active' : ''}`} onClick={() => handleSwitch(g.id)}>
                      <GamepadIcon size={14} />
                      <div className="dropdown-item-info">
                        <div className="name">{g.name}</div>
                        <div className="meta">{g.id}</div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty">No games</div>
                )}
                <div className="dropdown-actions">
                  <button type="button" onClick={() => { setIsAddOpen(true); setOpen(false); }} className="refresh-btn">Add New Game</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {currentGame && (
            <div className="keys-row">
              <div className="key-item">
                <label>Game ID</label>
                <div className="key-value">
                  <code title={currentGame.id}>{currentGame.id}</code>
                  <button className="copy-btn" onClick={() => copy(currentGame.id, 'id')} aria-label="Copy game id"><Copy size={14} /></button>
                  {copied.type === 'id' && <span className="copied">Copied</span>}
                </div>
              </div>

              <div className="key-item">
                <label>API Key</label>
                <div className="key-value">
                  <code title={currentGame.apiKey}>{currentGame.apiKey}</code>
                  <button className="copy-btn" onClick={() => copy(currentGame.apiKey, 'key')} aria-label="Copy api key"><Copy size={14} /></button>
                  {copied.type === 'key' && <span className="copied">Copied</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddGameModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onGameAdded={(game) => {
          // Refresh and switch to the newly created game
          refreshGames();
          setCurrentGame({ id: game.id, name: game.name, apiKey: game.apiKey });
          setIsAddOpen(false);
        }}
      />
    </>
  );
};

export default TopBar;
