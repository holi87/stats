import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { GlobalStatus } from './components/GlobalStatus';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { TicketToRideMatchNewPage } from './pages/TicketToRideMatchNewPage';
import { TicketToRideMatchEditPage } from './pages/TicketToRideMatchEditPage';
import { TicketToRideMatchesPage } from './pages/TicketToRideMatchesPage';
import { TicketToRideStatsPage } from './pages/TicketToRideStatsPage';
import { MultiplayerOverviewPage } from './pages/MultiplayerOverviewPage';
import { MultiplayerGameNewPage } from './pages/MultiplayerGameNewPage';
import { MultiplayerGamesAdminPage } from './pages/MultiplayerGamesAdminPage';
import { MultiplayerMatchesPage } from './pages/MultiplayerMatchesPage';
import { MultiplayerMatchNewPage } from './pages/MultiplayerMatchNewPage';
import { MultiplayerMatchEditPage } from './pages/MultiplayerMatchEditPage';
import { MultiplayerStatsPage } from './pages/MultiplayerStatsPage';
import { PlayersPage } from './pages/PlayersPage';

export function App() {
  return (
    <>
      <GlobalStatus />
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/games/overview" replace />} />
          <Route path="one-vs-one/*" element={<Navigate to="/games/overview" replace />} />
          <Route path="admin" element={<AdminPanelPage />} />
          <Route path="admin/games" element={<MultiplayerGamesAdminPage />} />
          <Route path="admin/players" element={<PlayersPage />} />
          <Route
            path="admin/multiplayer-games"
            element={<Navigate to="/admin/games" replace />}
          />
          <Route
            path="admin/multiplayer-games/new"
            element={<MultiplayerGameNewPage />}
          />
          <Route path="games" element={<Navigate to="/games/overview" replace />} />
          <Route path="games/overview" element={<MultiplayerOverviewPage />} />
          <Route path="games/new" element={<Navigate to="/admin/multiplayer-games/new" replace />} />
          <Route path="games/:gameCode" element={<MultiplayerGameRedirect />} />
          <Route path="games/:gameCode/matches" element={<MultiplayerMatchesPage />} />
          <Route path="games/:gameCode/matches/new" element={<MultiplayerMatchNewPage />} />
          <Route
            path="games/:gameCode/matches/:id/edit"
            element={<MultiplayerMatchEditPage />}
          />
          <Route path="games/:gameCode/stats" element={<MultiplayerStatsPage />} />
          <Route path="multiplayer" element={<Navigate to="/games/overview" replace />} />
          <Route path="multiplayer/overview" element={<Navigate to="/games/overview" replace />} />
          <Route
            path="multiplayer/games/new"
            element={<Navigate to="/admin/multiplayer-games/new" replace />}
          />
          <Route path="multiplayer/:gameCode" element={<MultiplayerGameLegacyRedirect />} />
          <Route path="multiplayer/:gameCode/matches" element={<MultiplayerGameLegacyRedirect />} />
          <Route path="multiplayer/:gameCode/matches/new" element={<MultiplayerGameLegacyRedirect />} />
          <Route path="multiplayer/:gameCode/matches/:id/edit" element={<MultiplayerGameLegacyRedirect />} />
          <Route path="multiplayer/:gameCode/stats" element={<MultiplayerGameLegacyRedirect />} />
          <Route path="ticket-to-ride/matches" element={<TicketToRideMatchesPage />} />
          <Route path="ticket-to-ride/matches/new" element={<TicketToRideMatchNewPage />} />
          <Route path="ticket-to-ride/matches/:id/edit" element={<TicketToRideMatchEditPage />} />
          <Route path="ticket-to-ride/stats" element={<TicketToRideStatsPage />} />
          <Route path="matches" element={<Navigate to="/games/overview" replace />} />
          <Route path="matches/new" element={<Navigate to="/games/overview" replace />} />
          <Route path="matches/:id/edit" element={<Navigate to="/games/overview" replace />} />
          <Route path="players" element={<Navigate to="/admin/players" replace />} />
          <Route path="stats" element={<Navigate to="/games/overview" replace />} />
          <Route path="*" element={<Navigate to="/games/overview" replace />} />
        </Route>
      </Routes>
    </>
  );
}

function MultiplayerGameRedirect() {
  const { gameCode } = useParams();
  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }
  return <Navigate to={`/games/${gameCode}/matches`} replace />;
}

function MultiplayerGameLegacyRedirect() {
  const location = useLocation();
  const { gameCode, id } = useParams();
  if (!gameCode) {
    return <Navigate to="/games/overview" replace />;
  }
  if (location.pathname.endsWith('/matches/new')) {
    return <Navigate to={`/games/${gameCode}/matches/new`} replace />;
  }
  if (
    location.pathname.endsWith('/matches') ||
    location.pathname.endsWith(`/${gameCode}`)
  ) {
    return <Navigate to={`/games/${gameCode}/matches`} replace />;
  }
  if (location.pathname.endsWith('/stats')) {
    return <Navigate to={`/games/${gameCode}/stats`} replace />;
  }
  if (id) {
    return <Navigate to={`/games/${gameCode}/matches/${id}/edit`} replace />;
  }
  return <Navigate to={`/games/${gameCode}/matches`} replace />;
}
