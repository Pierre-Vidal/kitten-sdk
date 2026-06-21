import type { Client } from '@stomp/stompjs'
import type { PlayerInfo, RoomResponse, RoomStatus, RoomEvent } from './types.js'

type RoomEventMap = {
  playerJoined: (player: PlayerInfo) => void
  playerLeft: (sessionId: string) => void
  hostChanged: (newHostId: string) => void
  stateUpdated: (state: Record<string, unknown>) => void
  statusChanged: (status: RoomStatus) => void
  stateReset: () => void
  kicked: () => void
}

export class KittenRoom {
  private listeners: { [K in keyof RoomEventMap]?: RoomEventMap[K][] } = {}
  private data: RoomResponse

  constructor(
    private readonly client: Client,
    private readonly sessionId: string,
    initialData: RoomResponse,
  ) {
    this.data = initialData
  }

  get code(): string { return this.data.code }
  get players(): PlayerInfo[] { return this.data.players }
  get hostId(): string { return this.data.hostId }
  get state(): Record<string, unknown> { return this.data.state }
  get status(): RoomStatus { return this.data.status }
  get maxPlayers(): number { return this.data.maxPlayers }
  get allowJoinInGame(): boolean { return this.data.allowJoinInGame }
  get isHost(): boolean { return this.data.hostId === this.sessionId }

  on<K extends keyof RoomEventMap>(event: K, handler: RoomEventMap[K]): this {
    if (!this.listeners[event]) this.listeners[event] = []
    ;(this.listeners[event] as RoomEventMap[K][]).push(handler)
    return this
  }

  off<K extends keyof RoomEventMap>(event: K, handler: RoomEventMap[K]): this {
    const arr = this.listeners[event] as RoomEventMap[K][] | undefined
    if (arr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.listeners[event] = arr.filter(h => h !== handler) as any
    }
    return this
  }

  _handleEvent(event: RoomEvent): void {
    this.data = event.room

    switch (event.type) {
      case 'PLAYER_JOINED':
        this._emit('playerJoined', event.payload as PlayerInfo)
        break
      case 'PLAYER_LEFT':
        this._emit('playerLeft', event.payload as string)
        break
      case 'HOST_CHANGED':
        this._emit('hostChanged', event.payload as string)
        break
      case 'STATE_UPDATED':
        this._emit('stateUpdated', this.data.state)
        break
      case 'STATUS_CHANGED':
        this._emit('statusChanged', this.data.status)
        break
      case 'STATE_RESET':
        this._emit('stateReset')
        break
      case 'KICKED':
        this._emit('kicked')
        break
    }
  }

  private _emit<K extends keyof RoomEventMap>(event: K, ...args: Parameters<RoomEventMap[K]>): void {
    const handlers = this.listeners[event] as ((...a: Parameters<RoomEventMap[K]>) => void)[] | undefined
    handlers?.forEach(h => h(...args))
  }

  async leave(): Promise<void> {
    this.client.publish({
      destination: '/app/room/leave',
      body: JSON.stringify({ code: this.data.code }),
    })
  }

  async updateState(state: Record<string, unknown>): Promise<void> {
    this.client.publish({
      destination: '/app/room/state',
      body: JSON.stringify({ code: this.data.code, state }),
    })
  }

  async setStatus(status: RoomStatus): Promise<void> {
    this.client.publish({
      destination: '/app/room/status',
      body: JSON.stringify({ code: this.data.code, status }),
    })
  }

  async kick(targetSessionId: string): Promise<void> {
    this.client.publish({
      destination: '/app/room/kick',
      body: JSON.stringify({ code: this.data.code, targetSessionId }),
    })
  }

  async resetState(): Promise<void> {
    this.client.publish({
      destination: '/app/room/reset',
      body: JSON.stringify({ code: this.data.code }),
    })
  }
}
