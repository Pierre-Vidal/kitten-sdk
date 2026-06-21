import { Client } from '@stomp/stompjs'
import { KittenRoom } from './KittenRoom.js'
import type { CreateRoomOptions, JoinRoomOptions, RoomEvent, RoomResponse } from './types.js'

export class KittenClient {
  private readonly client: Client
  private sessionId: string | null = null
  private room: KittenRoom | null = null

  constructor(urlOrClient: string | Client) {
    this.client = typeof urlOrClient === 'string'
      ? new Client({ brokerURL: urlOrClient })
      : urlOrClient
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.onConnect = (frame) => {
        this.sessionId = frame.headers['user-name'] ?? null
        resolve()
      }
      this.client.onStompError = (frame) => {
        reject(new Error(frame.headers['message'] ?? 'STOMP error'))
      }
      this.client.activate()
    })
  }

  disconnect(): Promise<void> {
    this.room = null
    this.sessionId = null
    return this.client.deactivate()
  }

  createRoom(options: CreateRoomOptions): Promise<KittenRoom> {
    return new Promise((resolve, reject) => {
      if (!this.sessionId) {
        reject(new Error('Non connecté'))
        return
      }

      this.client.subscribe('/user/queue/room', (msg) => {
        const event: RoomEvent = JSON.parse(msg.body) as RoomEvent
        if (event.type === 'ROOM_CREATED') {
          const room = this._initRoom(event.room)
          resolve(room)
        }
      })

      this.client.publish({
        destination: '/app/room/create',
        body: JSON.stringify({
          username: options.username,
          maxPlayers: options.maxPlayers ?? null,
          allowJoinInGame: options.allowJoinInGame ?? false,
        }),
      })
    })
  }

  joinRoom(options: JoinRoomOptions): Promise<KittenRoom> {
    return new Promise((resolve, reject) => {
      if (!this.sessionId) {
        reject(new Error('Non connecté'))
        return
      }

      const sub = this.client.subscribe(`/topic/room/${options.code}`, (msg) => {
        const event: RoomEvent = JSON.parse(msg.body) as RoomEvent

        if (event.type === 'PLAYER_JOINED') {
          const joined = event.room.players.find(p => p.id === this.sessionId)
          if (joined) {
            sub.unsubscribe()
            const room = this._initRoom(event.room)
            resolve(room)
          }
        }

        if (event.type === 'ERROR') {
          sub.unsubscribe()
          reject(new Error(String(event.payload)))
        }
      })

      this.client.publish({
        destination: '/app/room/join',
        body: JSON.stringify({ username: options.username, code: options.code }),
      })
    })
  }

  private _initRoom(data: RoomResponse): KittenRoom {
    const sessionId = this.sessionId ?? ''
    const room = new KittenRoom(this.client, sessionId, data)
    this.room = room

    this.client.subscribe(`/topic/room/${data.code}`, (msg) => {
      const event: RoomEvent = JSON.parse(msg.body) as RoomEvent
      room._handleEvent(event)
    })

    this.client.subscribe('/user/queue/room', (msg) => {
      const event: RoomEvent = JSON.parse(msg.body) as RoomEvent
      if (event.type === 'KICKED') {
        room._handleEvent(event)
      }
    })

    return room
  }
}
