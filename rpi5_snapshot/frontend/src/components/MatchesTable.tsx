import { Link } from 'react-router-dom';
import { MatchSummary } from '../api/hooks';
import { MatchNoteHint } from './MatchNoteHint';

function getWinnerLabel(match: MatchSummary) {
  if (match.winner === 'DRAW') {
    return 'Remis';
  }
  const name = match.winner === 'A' ? match.playerA.name : match.playerB.name;
  return `Zwycięża: ${name}`;
}

type MatchesTableProps = {
  items: MatchSummary[];
  onDelete: (id: string) => void;
  search?: string;
};

export function MatchesTable({ items, onDelete, search }: MatchesTableProps) {
  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Gra</th>
            <th>Gracz A</th>
            <th>Wynik</th>
            <th>Gracz B</th>
            <th className="note-col">Notatka</th>
            <th className="actions-col">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {items.map((match) => (
            <tr key={match.id}>
              <td>{match.playedOn}</td>
              <td>{match.game.name}</td>
              <td>{match.playerA.name}</td>
              <td>
                <div className="score">
                  {match.scoreA}:{match.scoreB}
                  <span className="badge">{getWinnerLabel(match)}</span>
                </div>
              </td>
              <td>{match.playerB.name}</td>
              <td className="note-col">
                <MatchNoteHint note={match.notes} />
              </td>
              <td className="actions-col">
                <div className="table-actions">
                  <Link
                    className="button link"
                    to={`/one-vs-one/matches/${match.id}/edit${search ? `?${search}` : ''}`}
                  >
                    Edytuj
                  </Link>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => onDelete(match.id)}
                  >
                    Usuń
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
