export type Uuid = string;
export type DateString = string;
export type DateTimeString = string;

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export type ErrorDetailsItem = {
  field: string;
  message: string;
};

export type ErrorPayload = {
  code: ErrorCode;
  message: string;
  details: ErrorDetailsItem[];
};

export type ErrorResponse = {
  error: ErrorPayload;
};

export type ScoringType =
  | 'MANUAL_POINTS'
  | 'TTR_CALCULATOR'
  | 'TM_CALCULATOR'
  | 'CUSTOM_CALCULATOR';

export type MultiplayerGame = {
  id: Uuid;
  code: string;
  displayName: string;
  calculatorButtonLabel?: string | null;
  calculatorUrl?: string | null;
  scoringType: ScoringType;
  minPlayers: number;
  maxPlayers: number;
  isActive: boolean;
  showInQuickMenu: boolean;
  optionsCount: number;
  requiresOption: boolean;
  optionsExclusive: boolean;
  customFieldsCount: number;
};

export type MultiplayerGameListItem = MultiplayerGame;
export type MultiplayerGameListResponse = MultiplayerGameListItem[];

export type MultiplayerGameOption = {
  id: Uuid;
  gameId: Uuid;
  code: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
};

export type MultiplayerGameOptionListResponse = MultiplayerGameOption[];

export type MultiplayerCustomCalculatorField = {
  id: Uuid;
  gameId: Uuid;
  code: string;
  label: string;
  description?: string | null;
  pointsPerUnit: number;
  sortOrder: number;
  isActive: boolean;
};

export type MultiplayerCustomCalculatorFieldListResponse = MultiplayerCustomCalculatorField[];

export type MultiplayerMatchOption = {
  id: Uuid;
  code: string;
  displayName: string;
};

export type MultiplayerMatchPlayer = {
  playerId: Uuid;
  name: string;
  totalPoints: number;
  place: number;
};

export type MultiplayerMatchListGame = {
  id: Uuid;
  code: string;
  displayName: string;
};

export type MultiplayerMatchListItem = {
  id: Uuid;
  playedOn: DateString;
  notes?: string | null;
  game: MultiplayerMatchListGame;
  options: MultiplayerMatchOption[];
  option: MultiplayerMatchOption | null;
  players: MultiplayerMatchPlayer[];
};

export type MultiplayerMatchListResponse = {
  items: MultiplayerMatchListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type TrainsCounts = {
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
  '6': number;
  '7': number;
  '8': number;
  '9': number;
};

export type TicketToRideVariant = {
  id: Uuid;
  code: string;
  name: string;
};

export type TicketToRidePlayerDetail = {
  playerId: Uuid;
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: TrainsCounts;
  trainsPoints: number;
  totalPoints: number;
  place: number;
};

export type TicketToRidePlayersDetails = TicketToRidePlayerDetail[];

export type TerraformingMarsPlayerDetail = {
  playerId: Uuid;
  titlesCount: number;
  awardsFirstCount: number;
  awardsSecondCount: number;
  citiesPoints: number;
  forestsPoints: number;
  cardsPoints: number;
  trPoints: number;
  titlesPoints: number;
  awardsFirstPoints: number;
  awardsSecondPoints: number;
  totalPoints: number;
  place: number;
};

export type TerraformingMarsPlayersDetails = TerraformingMarsPlayerDetail[];

export type MultiplayerMatchBase = {
  id: Uuid;
  game: MultiplayerGame;
  playedOn: DateString;
  notes?: string | null;
  createdAt?: DateTimeString | null;
  updatedAt?: DateTimeString | null;
  options: MultiplayerMatchOption[];
  option: MultiplayerMatchOption | null;
  players: MultiplayerMatchPlayer[];
};

export type MultiplayerMatchManualResponse = MultiplayerMatchBase;

export type MultiplayerMatchTtrResponse = MultiplayerMatchBase & {
  ticketToRide: {
    variant: TicketToRideVariant | null;
    playersDetails: TicketToRidePlayersDetails;
  };
};

export type MultiplayerMatchTmResponse = MultiplayerMatchBase & {
  terraformingMars: {
    playersDetails: TerraformingMarsPlayersDetails;
  };
};

export type MultiplayerMatchCustomResponse = MultiplayerMatchBase & {
  customCalculator: {
    fields: MultiplayerCustomCalculatorField[];
    playersDetails: Array<{
      playerId: Uuid;
      values: Array<{
        fieldId: Uuid;
        value: number;
        points: number;
      }>;
      totalPoints: number;
      place: number;
    }>;
  };
};

export type MultiplayerMatchResponse =
  | MultiplayerMatchManualResponse
  | MultiplayerMatchTtrResponse
  | MultiplayerMatchTmResponse
  | MultiplayerMatchCustomResponse;

export type MultiplayerMatchManualCreatePlayer = {
  playerId: Uuid;
  totalPoints: number;
};

export type MultiplayerMatchManualCreate = {
  scoringType?: 'MANUAL_POINTS';
  gameId: Uuid;
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn: DateString;
  notes?: string | null;
  players: MultiplayerMatchManualCreatePlayer[];
};

export type MultiplayerMatchTtrCreatePlayer = {
  playerId: Uuid;
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: TrainsCounts;
};

export type MultiplayerMatchTtrCreate = {
  scoringType?: 'TTR_CALCULATOR';
  gameId: Uuid;
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn: DateString;
  notes?: string | null;
  ticketToRide: {
    variantId: Uuid;
  };
  players: MultiplayerMatchTtrCreatePlayer[];
};

export type MultiplayerMatchTmCreatePlayer = {
  playerId: Uuid;
  titlesCount?: number;
  awardsFirstCount?: number;
  awardsSecondCount?: number;
  citiesPoints?: number;
  forestsPoints?: number;
  cardsPoints?: number;
  trPoints?: number;
};

export type MultiplayerMatchTmCreate = {
  scoringType?: 'TM_CALCULATOR';
  gameId: Uuid;
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn: DateString;
  notes?: string | null;
  terraformingMars?: Record<string, never>;
  players: MultiplayerMatchTmCreatePlayer[];
};

export type MultiplayerMatchCustomCreatePlayer = {
  playerId: Uuid;
  calculatorValues: Record<string, number>;
};

export type MultiplayerMatchCustomCreate = {
  scoringType?: 'CUSTOM_CALCULATOR';
  gameId: Uuid;
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn: DateString;
  notes?: string | null;
  players: MultiplayerMatchCustomCreatePlayer[];
};

export type MultiplayerMatchCreate =
  | MultiplayerMatchManualCreate
  | MultiplayerMatchTtrCreate
  | MultiplayerMatchTmCreate
  | MultiplayerMatchCustomCreate;

export type MultiplayerMatchManualPatchPlayer = {
  playerId: Uuid;
  totalPoints: number;
};

export type MultiplayerMatchManualPatch = {
  scoringType?: 'MANUAL_POINTS';
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn?: DateString;
  notes?: string | null;
  players?: MultiplayerMatchManualPatchPlayer[];
};

export type MultiplayerMatchTtrPatchPlayer = {
  playerId: Uuid;
  ticketsPoints: number;
  bonusPoints: number;
  trainsCounts: TrainsCounts;
};

export type MultiplayerMatchTtrPatch = {
  scoringType?: 'TTR_CALCULATOR';
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn?: DateString;
  notes?: string | null;
  ticketToRide?: {
    variantId: Uuid;
  };
  players?: MultiplayerMatchTtrPatchPlayer[];
};

export type MultiplayerMatchTmPatchPlayer = {
  playerId: Uuid;
  titlesCount?: number;
  awardsFirstCount?: number;
  awardsSecondCount?: number;
  citiesPoints?: number;
  forestsPoints?: number;
  cardsPoints?: number;
  trPoints?: number;
};

export type MultiplayerMatchTmPatch = {
  scoringType?: 'TM_CALCULATOR';
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn?: DateString;
  notes?: string | null;
  terraformingMars?: Record<string, never>;
  players?: MultiplayerMatchTmPatchPlayer[];
};

export type MultiplayerMatchCustomPatchPlayer = {
  playerId: Uuid;
  calculatorValues: Record<string, number>;
};

export type MultiplayerMatchCustomPatch = {
  scoringType?: 'CUSTOM_CALCULATOR';
  optionId?: Uuid;
  optionIds?: Uuid[];
  playedOn?: DateString;
  notes?: string | null;
  players?: MultiplayerMatchCustomPatchPlayer[];
};

export type MultiplayerMatchPatch =
  | MultiplayerMatchManualPatch
  | MultiplayerMatchTtrPatch
  | MultiplayerMatchTmPatch
  | MultiplayerMatchCustomPatch;

export type MultiplayerPlayerStats = {
  playerId: Uuid;
  name: string;
  matches: number;
  wins: number;
  seconds: number;
  thirds: number;
  podiums: number;
  avgPoints: number;
  bestPoints: number;
};

export type MultiplayerPodiumStats = {
  playerId: Uuid;
  name: string;
  wins: number;
  seconds: number;
  thirds: number;
  podiums: number;
};

export type OneVsOnePlayerStats = {
  playerId: Uuid;
  name: string;
  matches: number;
  wins: number;
  draws?: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type MultiplayerMatchesQuery = {
  gameId?: Uuid;
  playerId?: Uuid;
  optionId?: Uuid;
  dateFrom?: DateString;
  dateTo?: DateString;
  limit?: number;
  offset?: number;
};

export type MultiplayerGameCreateInput = {
  code?: string;
  displayName: string;
  calculatorButtonLabel?: string | null;
  calculatorUrl?: string | null;
  scoringType?: 'MANUAL_POINTS' | 'CUSTOM_CALCULATOR';
  minPlayers?: number;
  maxPlayers?: number;
  showInQuickMenu?: boolean;
  isActive?: boolean;
  optionsExclusive?: boolean;
  customCalculator?: {
    fields: Array<{
      code?: string;
      label: string;
      description?: string;
      pointsPerUnit: number;
    }>;
  };
};

export type MultiplayerGameUpdateInput = {
  displayName?: string;
  calculatorButtonLabel?: string | null;
  calculatorUrl?: string | null;
  minPlayers?: number;
  maxPlayers?: number;
  showInQuickMenu?: boolean;
  isActive?: boolean;
  optionsExclusive?: boolean;
};

export type MultiplayerGameOptionUpdateInput = {
  displayName?: string;
};

export type MultiplayerGameOptionCreateInput = {
  displayName: string;
  optionCode?: string;
  sortOrder?: number;
};

export type MultiplayerGameDeleteResponse = {
  code: string;
  deletedMatches: number;
};

export type MultiplayerPlayerStatsByOption = {
  overall: MultiplayerPlayerStats[];
  byOption: Array<{
    option: MultiplayerMatchOption;
    stats: MultiplayerPlayerStats[];
  }>;
};

export type MultiplayerStatsPlayersQuery = {
  gameId: Uuid;
};

export type MultiplayerPodiumsQuery = {
  dateFrom?: DateString;
  dateTo?: DateString;
};

export type OneVsOneStatsPlayersQuery = {
  gameId: Uuid;
  activeOnly?: boolean;
};

export type MultiplayerGameCodeParams = {
  code: string;
};

export type MultiplayerMatchIdParams = {
  id: Uuid;
};

export type AdminDataSnapshot = {
  version: number;
  exportedAt: DateTimeString;
  data: {
    games: Array<{
      id: Uuid;
      code: string;
      name: string;
      isActive: boolean;
      createdAt?: DateTimeString | null;
    }>;
    players: Array<{
      id: Uuid;
      name: string;
      isActive: boolean;
      createdAt?: DateTimeString | null;
    }>;
    matches: Array<{
      id: Uuid;
      gameId: Uuid;
      playedOn: DateString;
      playerAId: Uuid;
      playerBId: Uuid;
      scoreA: number;
      scoreB: number;
      notes?: string | null;
      createdAt?: DateTimeString | null;
      updatedAt?: DateTimeString | null;
    }>;
    ticketToRideVariants: Array<{
      id: Uuid;
      code: string;
      name: string;
      isActive: boolean;
      createdAt?: DateTimeString | null;
    }>;
    multiplayerGames: Array<{
      id: Uuid;
      code: string;
      displayName: string;
      calculatorButtonLabel?: string | null;
      calculatorUrl?: string | null;
      scoringType: ScoringType;
      minPlayers: number;
      maxPlayers: number;
      isActive: boolean;
      showInOneVsOne: boolean;
      showInMultiplayer: boolean;
      optionsExclusive?: boolean | null;
      createdAt?: DateTimeString | null;
    }>;
    multiplayerGameOptions: Array<{
      id: Uuid;
      gameId: Uuid;
      code: string;
      displayName: string;
      sortOrder: number;
      isActive: boolean;
      createdAt?: DateTimeString | null;
    }>;
    multiplayerMatches: Array<{
      id: Uuid;
      gameId: Uuid;
      playedOn: DateString;
      notes?: string | null;
      createdAt?: DateTimeString | null;
      updatedAt?: DateTimeString | null;
    }>;
    multiplayerMatchOptions: Array<{
      matchId: Uuid;
      gameId: Uuid;
      optionId: Uuid;
      createdAt?: DateTimeString | null;
    }>;
    multiplayerMatchPlayers: Array<{
      id: Uuid;
      matchId: Uuid;
      playerId: Uuid;
      totalPoints: number;
      place?: number | null;
      createdAt?: DateTimeString | null;
      updatedAt?: DateTimeString | null;
    }>;
    multiplayerTicketToRideMatches: Array<{
      matchId: Uuid;
      variantId: Uuid;
    }>;
    multiplayerTicketToRidePlayerDetails: Array<{
      id: Uuid;
      matchPlayerId: Uuid;
      ticketsPoints: number;
      bonusPoints: number;
      trainsCounts: TrainsCounts;
      trainsPoints: number;
    }>;
    multiplayerTerraformingMarsPlayerDetails: Array<{
      id: Uuid;
      matchPlayerId: Uuid;
      titlesCount: number;
      awardsFirstCount: number;
      awardsSecondCount: number;
      citiesPoints: number;
      forestsPoints: number;
      cardsPoints: number;
      trPoints: number;
      titlesPoints: number;
      awardsFirstPoints: number;
      awardsSecondPoints: number;
    }>;
    multiplayerCustomScoringFields: Array<{
      id: Uuid;
      gameId: Uuid;
      code: string;
      label: string;
      description?: string | null;
      pointsPerUnit: number;
      sortOrder: number;
      isActive: boolean;
      createdAt?: DateTimeString | null;
    }>;
    multiplayerCustomMatchPlayerValues: Array<{
      id: Uuid;
      matchPlayerId: Uuid;
      fieldId: Uuid;
      value: number;
      points: number;
      createdAt?: DateTimeString | null;
    }>;
  };
};

export type AdminDataImportSummary = {
  received: Record<string, number>;
  toInsert: Record<string, number>;
  toUpdate: Record<string, number>;
};

export type AdminDataImportResponse = {
  dryRun: boolean;
  summary: AdminDataImportSummary;
  warnings: string[];
  appliedAt?: DateTimeString;
  confirmationRequired?: boolean;
  confirmationToken?: string | null;
};
