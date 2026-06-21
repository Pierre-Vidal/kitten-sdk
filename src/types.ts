export type RoomStatus = 'WAITING' | 'IN_GAME'

export type EventType =
  | 'ROOM_CREATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'HOST_CHANGED'
  | 'STATE_UPDATED'
  | 'STATUS_CHANGED'
  | 'KICKED'
  | 'STATE_RESET'
  | 'ERROR'

export interface PlayerInfo {
  id: string
  username: string
  host: boolean
}

export interface RoomResponse {
  code: string
  players: PlayerInfo[]
  hostId: string
  state: Record<string, unknown>
  maxPlayers: number
  status: RoomStatus
  allowJoinInGame: boolean
}

export interface RoomEvent {
  type: EventType
  room: RoomResponse
  payload: unknown
}

export interface CreateRoomOptions {
  username: string
  maxPlayers?: number
  allowJoinInGame?: boolean
}

export interface JoinRoomOptions {
  username: string
  code: string
}
