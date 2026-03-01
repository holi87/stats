import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminDataImportResponse,
  AdminDataSnapshot,
  MultiplayerGame,
  MultiplayerGameCreateInput,
  MultiplayerCustomCalculatorFieldListResponse,
  MultiplayerGameDeleteResponse,
  MultiplayerGameListResponse,
  MultiplayerGameOption,
  MultiplayerGameOptionCreateInput,
  MultiplayerGameOptionListResponse,
  MultiplayerGameOptionUpdateInput,
  MultiplayerGameUpdateInput,
  MultiplayerMatchCreate,
  MultiplayerMatchListResponse,
  MultiplayerMatchPatch,
  MultiplayerMatchResponse,
  MultiplayerPlayerStats,
  MultiplayerPlayerStatsByOption,
  MultiplayerPodiumStats,
  MultiplayerMatchesQuery,
  MultiplayerPodiumsQuery,
  MultiplayerStatsPlayersQuery,
  TicketToRideVariant,
  TrainsCounts,
} from '../contracts/api';
import { useApi } from './ApiProvider';

type Game = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type GameDeleteResponse = {
  id: string;
  code: string;
  name: string;
  deletedMatches: number;
};

type GameUpdateInput = {
  isActive?: boolean;
  name?: string;
};

type Player = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type PlayerDeleteResponse = {
  player: Player;
  deletedOneVsOneMatches: number;
  deletedMultiplayerParticipations: number;
  deletedOrphanMultiplayerMatches: number;
};

type MatchSummary = {
  id: string;
  playedOn: string;
  notes?: string | null;
  game: Game;
  playerA: { id: string; name: string };
  playerB: { id: string; name: string };
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'DRAW';
};

type MatchDetail = MatchSummary & {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type MatchesResponse = {
  items: MatchSummary[];
  total: number;
  limit: number;
  offset: number;
};

type PlayerStats = {
  playerId: string;
  name: string;
  matches: number;
  wins: number;
  draws?: number;
  pointsFor: number;
  pointsAgainst: number;
};

type HeadToHead = {
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  matches: number;
  player1Wins: number;
  player2Wins: number;
  draws: number;
};

type TicketToRideMatchPlayer = {
  id: string;
  player: { id: string; name: string };
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: TrainsCounts;
  trainsPoints: number;
  totalPoints: number;
  place: number | null;
};

type TicketToRideMatch = {
  id: string;
  playedOn: string;
  variant: TicketToRideVariant;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  players: TicketToRideMatchPlayer[];
};

type TicketToRideMatchesResponse = {
  items: TicketToRideMatch[];
  total: number;
  limit: number;
  offset: number;
};

type TicketToRidePlayerStats = {
  playerId: string;
  name: string;
  matches: number;
  wins: number;
  podiums: number;
  avgPoints: number;
  bestPoints: number;
};

type UpdateMultiplayerMatchInput = MultiplayerMatchPatch & { id: string };
type AdminDataExportInput = { adminToken?: string };
type AdminDataImportInput = {
  adminToken?: string;
  dryRun: boolean;
  payload: AdminDataSnapshot;
  confirmation?: string;
};
type MultiplayerGamesQuery = { includeInactive?: boolean };
type GamesQuery = { includeInactive?: boolean };

type PlayersQuery = { active?: boolean; q?: string };

type MatchesQuery = {
  gameId?: string;
  playerId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sort?: 'playedOnDesc';
};

type StatsPlayersQuery = { gameId?: string };

type HeadToHeadQuery = { gameId?: string; player1Id: string; player2Id: string };

type TicketToRideMatchesQuery = {
  dateFrom?: string;
  dateTo?: string;
  variantId?: string;
  playerId?: string;
  limit?: number;
  offset?: number;
};

type TicketToRideStatsPlayersQuery = {
  variantId?: string;
};

type CreateMatchInput = {
  gameId: string;
  playedOn: string;
  playerAId: string;
  playerBId: string;
  scoreA: number;
  scoreB: number;
  notes?: string;
};

type UpdateMatchInput = Partial<CreateMatchInput> & { id: string };

type CreatePlayerInput = { name: string };

type UpdatePlayerInput = { id: string; name?: string; isActive?: boolean };

type CreateTicketToRideMatchInput = {
  playedOn: string;
  variantId: string;
  notes?: string;
  players: Array<{
    playerId: string;
    ticketsPoints: number;
    bonusPoints: number;
    trainsCounts: TrainsCounts;
  }>;
};

type UpdateTicketToRideMatchInput = Partial<CreateTicketToRideMatchInput> & { id: string };

const queryKeys = {
  games: (params: GamesQuery = {}) => ['games', params] as const,
  players: (params: PlayersQuery) => ['players', params] as const,
  matches: (params: MatchesQuery) => ['matches', params] as const,
  match: (id: string) => ['match', id] as const,
  statsPlayers: (params: StatsPlayersQuery) => ['statsPlayers', params] as const,
  headToHead: (params: HeadToHeadQuery) => ['headToHead', params] as const,
  ticketToRideVariants: () => ['ticketToRideVariants'] as const,
  ticketToRideMatches: (params: TicketToRideMatchesQuery) => ['ticketToRideMatches', params] as const,
  ticketToRideMatch: (id: string) => ['ticketToRideMatch', id] as const,
  ticketToRideStatsPlayers: (params: TicketToRideStatsPlayersQuery) =>
    ['ticketToRideStatsPlayers', params] as const,
  multiplayerGames: (params: MultiplayerGamesQuery = {}) =>
    ['multiplayerGames', params] as const,
  multiplayerGame: (code: string) => ['multiplayerGame', code] as const,
  multiplayerGameCustomFields: (code: string, includeInactive: boolean) =>
    ['multiplayerGameCustomFields', code, includeInactive] as const,
  multiplayerGameOptions: (code: string) => ['multiplayerGameOptions', code] as const,
  multiplayerMatches: (params: MultiplayerMatchesQuery) => ['multiplayerMatches', params] as const,
  multiplayerMatch: (id: string) => ['multiplayerMatch', id] as const,
  multiplayerStatsPlayers: (params: MultiplayerStatsPlayersQuery) =>
    ['multiplayerStatsPlayers', params] as const,
  multiplayerStatsPlayersByOption: (gameId: string) =>
    ['multiplayerStatsPlayersByOption', gameId] as const,
  multiplayerStatsPodiums: (params: MultiplayerPodiumsQuery) =>
    ['multiplayerStatsPodiums', params] as const,
};

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useGames(params: GamesQuery = {}) {
  const { request } = useApi();
  const includeInactive = params.includeInactive ?? false;
  const query = buildQuery({ includeInactive: includeInactive ? true : undefined });

  return useQuery({
    queryKey: queryKeys.games({ includeInactive }),
    queryFn: () => request<Game[]>(`/api/v1/games${query}`),
  });
}

export function usePlayers(params: PlayersQuery = {}) {
  const { request } = useApi();
  const active = params.active ?? true;
  const query = buildQuery({ active, q: params.q });

  return useQuery({
    queryKey: queryKeys.players({ active, q: params.q }),
    queryFn: () => request<Player[]>(`/api/v1/players${query}`),
  });
}

export function useMatches(params: MatchesQuery = {}) {
  const { request } = useApi();
  const queryParams = {
    gameId: params.gameId,
    playerId: params.playerId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    sort: params.sort ?? 'playedOnDesc',
  };

  const query = buildQuery(queryParams);

  return useQuery({
    queryKey: queryKeys.matches(queryParams),
    queryFn: () => request<MatchesResponse>(`/api/v1/matches${query}`),
  });
}

export function useMatch(id: string | undefined) {
  const { request } = useApi();

  return useQuery({
    queryKey: id ? queryKeys.match(id) : ['match', 'missing'],
    queryFn: () => request<MatchDetail>(`/api/v1/matches/${id}`),
    enabled: Boolean(id),
  });
}

export function useStatsPlayers(params: StatsPlayersQuery = {}) {
  const { request } = useApi();
  const query = buildQuery({ gameId: params.gameId });

  return useQuery({
    queryKey: queryKeys.statsPlayers({ gameId: params.gameId }),
    queryFn: () => request<PlayerStats[]>(`/api/v1/stats/players${query}`),
    enabled: Boolean(params.gameId),
  });
}

export function useHeadToHead(params: HeadToHeadQuery | null) {
  const { request } = useApi();
  const enabled = Boolean(params?.player1Id && params?.player2Id);
  const query = params
    ? buildQuery({
        player1Id: params.player1Id,
        player2Id: params.player2Id,
        gameId: params.gameId,
      })
    : '';

  return useQuery({
    queryKey: params ? queryKeys.headToHead(params) : ['headToHead', 'missing'],
    queryFn: () => request<HeadToHead>(`/api/v1/stats/head-to-head${query}`),
    enabled,
  });
}

export function useTicketToRideVariants(options?: { enabled?: boolean }) {
  const { request } = useApi();
  return useQuery({
    queryKey: queryKeys.ticketToRideVariants(),
    queryFn: () => request<TicketToRideVariant[]>('/api/v1/multiplayer/ticket-to-ride/variants'),
    enabled: options?.enabled ?? true,
  });
}

export function useMultiplayerGames(params: MultiplayerGamesQuery = {}) {
  const { request } = useApi();
  const includeInactive = params.includeInactive ?? false;
  const query = buildQuery({ includeInactive: includeInactive ? true : undefined });

  return useQuery({
    queryKey: queryKeys.multiplayerGames({ includeInactive }),
    queryFn: () => request<MultiplayerGameListResponse>(`/api/v1/multiplayer/games${query}`),
  });
}

export function useCreateMultiplayerGame() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MultiplayerGameCreateInput) =>
      request<MultiplayerGame>('/api/v1/multiplayer/games', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerGames'] });
    },
  });
}

export function useUpdateMultiplayerGame() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, ...payload }: { code: string } & MultiplayerGameUpdateInput) =>
      request<MultiplayerGame>(`/api/v1/multiplayer/games/${code}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerGames'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerGame'] });
    },
  });
}

export function useUpdateMultiplayerGameStatus() {
  return useUpdateMultiplayerGame();
}

export function useUpdateMultiplayerGameOption() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      code,
      optionId,
      ...payload
    }: { code: string; optionId: string } & MultiplayerGameOptionUpdateInput) =>
      request<MultiplayerGameOption>(
        `/api/v1/multiplayer/games/${code}/options/${optionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.multiplayerGameOptions(variables.code),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.multiplayerGame(variables.code),
      });
    },
  });
}

export function useCreateMultiplayerGameOption() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      code,
      ...payload
    }: { code: string } & MultiplayerGameOptionCreateInput) =>
      request<MultiplayerGameOption>(`/api/v1/multiplayer/games/${code}/options`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.multiplayerGameOptions(variables.code),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.multiplayerGame(variables.code),
      });
    },
  });
}

export function useDeleteMultiplayerGame() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) =>
      request<MultiplayerGameDeleteResponse>(`/api/v1/multiplayer/games/${code}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerGames'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerGame'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatches'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatch'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayersByOption'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPodiums'] });
    },
  });
}

export function useMultiplayerGame(
  code: string | undefined,
  options?: { enabled?: boolean; includeInactive?: boolean }
) {
  const { request } = useApi();
  const includeInactive = options?.includeInactive ?? false;
  const query = buildQuery({ includeInactive: includeInactive ? true : undefined });
  const enabled = Boolean(code) && (options?.enabled ?? true);

  return useQuery({
    queryKey: code ? ['multiplayerGame', code, includeInactive] : ['multiplayerGame', 'missing'],
    queryFn: () => request<MultiplayerGame>(`/api/v1/multiplayer/games/${code}${query}`),
    enabled,
  });
}

export function useMultiplayerGameOptions(
  code: string | undefined,
  options?: { enabled?: boolean; includeInactive?: boolean }
) {
  const { request } = useApi();
  const includeInactive = options?.includeInactive ?? false;
  const query = buildQuery({ includeInactive: includeInactive ? true : undefined });
  const enabled = Boolean(code) && (options?.enabled ?? true);
  return useQuery({
    queryKey: code
      ? ['multiplayerGameOptions', code, includeInactive]
      : ['multiplayerGameOptions', 'missing'],
    queryFn: () =>
      request<MultiplayerGameOptionListResponse>(
        `/api/v1/multiplayer/games/${code}/options${query}`
      ),
    enabled,
  });
}

export function useMultiplayerGameCustomFields(
  code: string | undefined,
  options?: { enabled?: boolean; includeInactive?: boolean }
) {
  const { request } = useApi();
  const includeInactive = options?.includeInactive ?? false;
  const query = buildQuery({ includeInactive: includeInactive ? true : undefined });
  const enabled = Boolean(code) && (options?.enabled ?? true);

  return useQuery({
    queryKey: code
      ? queryKeys.multiplayerGameCustomFields(code, includeInactive)
      : ['multiplayerGameCustomFields', 'missing'],
    queryFn: () =>
      request<MultiplayerCustomCalculatorFieldListResponse>(
        `/api/v1/multiplayer/games/${code}/calculator-fields${query}`
      ),
    enabled,
  });
}

export function useMultiplayerMatches(
  params: MultiplayerMatchesQuery = {},
  options?: { enabled?: boolean }
) {
  const { request } = useApi();
  const queryParams = {
    gameId: params.gameId,
    playerId: params.playerId,
    optionId: params.optionId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };

  const query = buildQuery(queryParams);

  return useQuery({
    queryKey: queryKeys.multiplayerMatches(queryParams),
    queryFn: () =>
      request<MultiplayerMatchListResponse>(`/api/v1/multiplayer/matches${query}`),
    enabled: options?.enabled ?? true,
  });
}

export function useMultiplayerMatch(id: string | undefined) {
  const { request } = useApi();

  return useQuery({
    queryKey: id ? queryKeys.multiplayerMatch(id) : ['multiplayerMatch', 'missing'],
    queryFn: () => request<MultiplayerMatchResponse>(`/api/v1/multiplayer/matches/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMultiplayerMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MultiplayerMatchCreate) =>
      request<MultiplayerMatchResponse>('/api/v1/multiplayer/matches', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatches'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatch'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayersByOption'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPodiums'] });
    },
  });
}

export function useUpdateMultiplayerMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateMultiplayerMatchInput) =>
      request<MultiplayerMatchResponse>(`/api/v1/multiplayer/matches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatches'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatch', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayersByOption'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPodiums'] });
    },
  });
}

export function useDeleteMultiplayerMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/v1/multiplayer/matches/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatches'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatch'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayersByOption'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPodiums'] });
    },
  });
}

export function useMultiplayerStatsPlayers(gameId: string | undefined) {
  const { request } = useApi();
  const query = buildQuery({ gameId });

  return useQuery({
    queryKey: gameId
      ? queryKeys.multiplayerStatsPlayers({ gameId })
      : ['multiplayerStatsPlayers', 'missing'],
    queryFn: () => request<MultiplayerPlayerStats[]>(`/api/v1/multiplayer/stats/players${query}`),
    enabled: Boolean(gameId),
  });
}

export function useMultiplayerStatsPlayersByOption(gameId: string | undefined) {
  const { request } = useApi();
  const query = buildQuery({ gameId });

  return useQuery({
    queryKey: gameId
      ? queryKeys.multiplayerStatsPlayersByOption(gameId)
      : ['multiplayerStatsPlayersByOption', 'missing'],
    queryFn: () =>
      request<MultiplayerPlayerStatsByOption>(`/api/v1/multiplayer/stats/players-by-option${query}`),
    enabled: Boolean(gameId),
  });
}

export function useMultiplayerStatsPodiums(params: MultiplayerPodiumsQuery = {}) {
  const { request } = useApi();
  const query = buildQuery({ dateFrom: params.dateFrom, dateTo: params.dateTo });

  return useQuery({
    queryKey: queryKeys.multiplayerStatsPodiums({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    }),
    queryFn: () =>
      request<MultiplayerPodiumStats[]>(`/api/v1/multiplayer/stats/podiums${query}`),
  });
}

export function useTicketToRideMatches(params: TicketToRideMatchesQuery = {}) {
  const { request } = useApi();
  const queryParams = {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    variantId: params.variantId,
    playerId: params.playerId,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };

  const query = buildQuery(queryParams);

  return useQuery({
    queryKey: queryKeys.ticketToRideMatches(queryParams),
    queryFn: () => request<TicketToRideMatchesResponse>(`/api/v1/ticket-to-ride/matches${query}`),
  });
}

export function useTicketToRideMatch(id: string | undefined) {
  const { request } = useApi();

  return useQuery({
    queryKey: id ? queryKeys.ticketToRideMatch(id) : ['ticketToRideMatch', 'missing'],
    queryFn: () => request<TicketToRideMatch>(`/api/v1/ticket-to-ride/matches/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMatchInput) =>
      request<MatchDetail>('/api/v1/matches', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
    },
  });
}

export function useUpdateMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMatchInput) =>
      request<MatchDetail>(`/api/v1/matches/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
    },
  });
}

export function useDeleteMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/v1/matches/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
    },
  });
}

export function useDeleteGame() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<GameDeleteResponse>(`/api/v1/games/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match'] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
    },
  });
}

export function useUpdateGameStatus() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & GameUpdateInput) =>
      request<Game>(`/api/v1/games/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match'] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
    },
  });
}

export function useTicketToRideStatsPlayers(params: TicketToRideStatsPlayersQuery = {}) {
  const { request } = useApi();
  const query = buildQuery({ variantId: params.variantId });

  return useQuery({
    queryKey: queryKeys.ticketToRideStatsPlayers({ variantId: params.variantId }),
    queryFn: () => request<TicketToRidePlayerStats[]>(`/api/v1/ticket-to-ride/stats/players${query}`),
  });
}

export function useCreateTicketToRideMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTicketToRideMatchInput) =>
      request<TicketToRideMatch>('/api/v1/ticket-to-ride/matches', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketToRideMatches'] });
      queryClient.invalidateQueries({ queryKey: ['ticketToRideStatsPlayers'] });
    },
  });
}

export function useUpdateTicketToRideMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTicketToRideMatchInput) =>
      request<TicketToRideMatch>(`/api/v1/ticket-to-ride/matches/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticketToRideMatches'] });
      queryClient.invalidateQueries({ queryKey: ['ticketToRideMatch', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['ticketToRideStatsPlayers'] });
    },
  });
}

export function useDeleteTicketToRideMatch() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/v1/ticket-to-ride/matches/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketToRideMatches'] });
      queryClient.invalidateQueries({ queryKey: ['ticketToRideStatsPlayers'] });
    },
  });
}

export function useCreatePlayer() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlayerInput) =>
      request<Player>('/api/v1/players', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useUpdatePlayer() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePlayerInput) =>
      request<Player>(`/api/v1/players/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useDeletePlayer() {
  const { request } = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      request<PlayerDeleteResponse>(`/api/v1/players/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatches'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerMatch'] });
      queryClient.invalidateQueries({ queryKey: ['statsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['headToHead'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPlayersByOption'] });
      queryClient.invalidateQueries({ queryKey: ['multiplayerStatsPodiums'] });
    },
  });
}

export function useAdminDataExport() {
  const { request } = useApi();

  return useMutation({
    mutationFn: (input: AdminDataExportInput = {}) =>
      request<AdminDataSnapshot>('/api/v1/admin/data/export', {
        method: 'GET',
        headers: input.adminToken ? { 'X-Admin-Token': input.adminToken } : undefined,
      }),
  });
}

export function useAdminDataImport() {
  const { request } = useApi();

  return useMutation({
    mutationFn: (input: AdminDataImportInput) =>
      request<AdminDataImportResponse>('/api/v1/admin/data/import', {
        method: 'POST',
        headers: input.adminToken ? { 'X-Admin-Token': input.adminToken } : undefined,
        body: JSON.stringify({
          dryRun: input.dryRun,
          payload: input.payload,
          confirmation: input.confirmation,
        }),
      }),
  });
}

export { queryKeys };
export type {
  Game,
  Player,
  MatchSummary,
  MatchDetail,
  MatchesResponse,
  TicketToRideVariant,
  TicketToRideMatch,
  TicketToRideMatchPlayer,
  TicketToRideMatchesResponse,
  TicketToRidePlayerStats,
  PlayerStats,
  HeadToHead,
  PlayersQuery,
  MatchesQuery,
  StatsPlayersQuery,
  HeadToHeadQuery,
  TicketToRideMatchesQuery,
  TicketToRideStatsPlayersQuery,
  CreateMatchInput,
  UpdateMatchInput,
  GamesQuery,
  GameUpdateInput,
  GameDeleteResponse,
  CreatePlayerInput,
  UpdatePlayerInput,
  PlayerDeleteResponse,
  CreateTicketToRideMatchInput,
  UpdateTicketToRideMatchInput,
  MultiplayerGamesQuery,
  MultiplayerGame,
  MultiplayerGameCreateInput,
  MultiplayerGameDeleteResponse,
  MultiplayerGameUpdateInput,
  MultiplayerGameOptionListResponse,
  MultiplayerMatchResponse,
  MultiplayerMatchListResponse,
  MultiplayerMatchCreate,
  MultiplayerMatchPatch,
  MultiplayerPlayerStats,
  MultiplayerPlayerStatsByOption,
  MultiplayerPodiumStats,
  AdminDataSnapshot,
  AdminDataImportResponse,
  AdminDataExportInput,
  AdminDataImportInput,
  MultiplayerMatchesQuery,
  MultiplayerStatsPlayersQuery,
  MultiplayerPodiumsQuery,
};
