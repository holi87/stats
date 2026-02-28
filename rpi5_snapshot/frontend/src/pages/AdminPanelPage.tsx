import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

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
];

export function AdminPanelPage() {
  return (
    <section>
      <PageHeader
        title="Administracja"
        description="Miejsce na operacje administracyjne: gracze, konfiguracja gier i inne akcje techniczne."
      />

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
