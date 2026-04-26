import { Link } from 'react-router-dom';
import { useApi } from '../api/ApiProvider';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const adminActions = [
  {
    title: 'Gry',
    description: 'Zarządzanie grami multiplayer: aktywność, widoczność i konfiguracja punktacji.',
    links: [
      { to: '/admin/games', label: 'Zarządzaj grami', variant: 'primary' as const },
      { to: '/admin/multiplayer-games/new', label: 'Dodaj grę', variant: 'secondary' as const },
    ],
  },
  {
    title: 'Gracze',
    description: 'Dodawanie, edycja i aktywacja/dezaktywacja graczy.',
    links: [{ to: '/admin/players', label: 'Zarządzaj graczami', variant: 'primary' as const }],
  },
  {
    title: 'Dane',
    description: 'Eksport i import danych (JSON) z trybem dry-run oraz walidacją.',
    links: [{ to: '/admin/data', label: 'Eksport / Import', variant: 'primary' as const }],
  },
];

export function AdminPanelPage() {
  const { adminToken, setAdminToken } = useApi();

  return (
    <section>
      <PageHeader
        title="Administracja"
        description="Miejsce na operacje administracyjne: gracze, konfiguracja gier i inne akcje techniczne."
      />

      <div className="card admin-token-card">
        <div>
          <h3>Token administracyjny</h3>
          <p className="multiplayer-game-meta">
            Token jest dolaczany do operacji zapisu jako naglowek X-Admin-Token.
          </p>
        </div>
        <div className="admin-token-controls">
          <Input
            type="password"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="Wklej token, jesli backend go wymaga"
          />
          <Button type="button" variant="secondary" onClick={() => setAdminToken('')}>
            Wyczyść
          </Button>
        </div>
      </div>

      <div className="admin-grid">
        {adminActions.map((action) => (
          <div key={action.title} className="card admin-card">
            <div>
              <h3>{action.title}</h3>
              <p className="multiplayer-game-meta">{action.description}</p>
            </div>
            <div className="multiplayer-game-actions">
              {action.links.map((link) => (
                <Link key={link.to} className={`button ${link.variant}`} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
