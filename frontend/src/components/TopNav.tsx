import { NavLink } from 'react-router-dom';
import { useMultiplayerGames } from '../api/hooks';
import { isQuickMenuGameVisible } from '../utils/multiplayerVisibility';

const primaryLinks = [
  { to: '/games/overview', label: 'Gry' },
  { to: '/admin', label: 'Administracja' },
];

export function TopNav() {
  const { data: multiplayerGames = [], isLoading, isError } = useMultiplayerGames();
  const quickMenuGames = multiplayerGames.filter((game) => isQuickMenuGameVisible(game));

  return (
    <header className="top-nav">
      <div className="top-nav-main">
        <NavLink to="/games/overview" className="brand-link">
          <img className="brand-logo" src="/logo2.png" alt="Logo" />
          <span className="brand-copy">
            <strong>Game Stats</strong>
            <small>Tracking i analityka gier</small>
          </span>
        </NavLink>

        <nav className="top-nav-primary" aria-label="Główna nawigacja">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `pill-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="top-nav-secondary" aria-label="Skróty gier">
        {isLoading ? <span className="nav-meta">Ładowanie gier...</span> : null}
        {!isLoading && isError ? <span className="nav-meta">Brak gier</span> : null}
        {!isLoading && !isError
          ? quickMenuGames.map((game) => (
              <div key={game.id} className="top-nav-game">
                <span className="top-nav-game-name">{game.displayName}</span>
                <div className="top-nav-game-links">
                  <NavLink
                    to={`/games/${game.code}/matches`}
                    className={({ isActive }) => `mini-link${isActive ? ' active' : ''}`}
                  >
                    Mecze
                  </NavLink>
                  <NavLink
                    to={`/games/${game.code}/stats`}
                    className={({ isActive }) => `mini-link${isActive ? ' active' : ''}`}
                  >
                    Statystyki
                  </NavLink>
                </div>
              </div>
            ))
          : null}
      </div>
    </header>
  );
}
