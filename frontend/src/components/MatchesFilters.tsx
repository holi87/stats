import { Game, Player } from '../api/hooks';
import { Button } from './ui/Button';
import { FormField } from './ui/FormField';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

type Filters = {
  gameId?: string;
  playerId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type MatchesFiltersProps = {
  games: Game[];
  players: Player[];
  values: Filters;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
};

export function MatchesFilters({ games, players, values, onChange, onClear }: MatchesFiltersProps) {
  return (
    <div className="filters">
      <div className="filters-row">
        <FormField label="Gra">
          <Select
            value={values.gameId ?? ''}
            onChange={(event) => onChange({ gameId: event.target.value || undefined })}
          >
            <option value="">Wszystkie</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Gracz">
          <Select
            value={values.playerId ?? ''}
            onChange={(event) => onChange({ playerId: event.target.value || undefined })}
          >
            <option value="">Wszyscy</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Data od">
          <Input
            type="date"
            value={values.dateFrom ?? ''}
            onChange={(event) => onChange({ dateFrom: event.target.value || undefined })}
          />
        </FormField>
        <FormField label="Data do">
          <Input
            type="date"
            value={values.dateTo ?? ''}
            onChange={(event) => onChange({ dateTo: event.target.value || undefined })}
          />
        </FormField>
        <Button type="button" variant="secondary" onClick={onClear}>
          Wyczyść filtry
        </Button>
      </div>
    </div>
  );
}

export type { Filters as MatchesFiltersState };
