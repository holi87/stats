import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function OneVsOneOverviewPage() {
  return (
    <section>
      <div className="page-header-row">
        <PageHeader
          title="1v1"
          description="Szybki dostęp do meczów i statystyk 1v1."
        />
      </div>

      <div className="overview-hero card">
        <div>
          <h2>Tryb 1v1</h2>
          <p>
            Na telefonie najczęściej dodawaj mecze, na desktopie analizuj statystyki i pojedynki.
          </p>
        </div>
        <div className="overview-hero-actions">
          <Link className="button primary" to="/one-vs-one/matches/new">
            Dodaj mecz
          </Link>
          <Link className="button secondary" to="/one-vs-one/matches">
            Mecze
          </Link>
          <Link className="button ghost" to="/one-vs-one/stats">
            Statystyki
          </Link>
        </div>
      </div>

      <div className="multiplayer-game-grid">
        <div className="card multiplayer-game-card">
          <div>
            <h3>Mecze 1v1</h3>
            <p className="multiplayer-game-meta">
              Lista spotkań, filtrowanie i eksport CSV.
            </p>
          </div>
          <div className="multiplayer-game-actions">
            <Link className="button secondary" to="/one-vs-one/matches">
              Otwórz mecze
            </Link>
            <Link className="button primary" to="/one-vs-one/matches/new">
              Dodaj mecz
            </Link>
          </div>
        </div>

        <div className="card multiplayer-game-card">
          <div>
            <h3>Statystyki 1v1</h3>
            <p className="multiplayer-game-meta">
              Ranking graczy i porównanie head-to-head.
            </p>
          </div>
          <div className="multiplayer-game-actions">
            <Link className="button secondary" to="/one-vs-one/stats">
              Otwórz statystyki
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
