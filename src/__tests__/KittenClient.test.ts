import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KittenClient } from '../KittenClient.js'
import type { Client } from '@stomp/stompjs'
import type { RoomEvent, RoomResponse } from '../types.js'

const makeRoomData = (overrides: Partial<RoomResponse> = {}): RoomResponse => ({
  code: 'ABCDEF',
  players: [{ id: 'session-1', username: 'Alice', host: true }],
  hostId: 'session-1',
  state: {},
  maxPlayers: 8,
  status: 'WAITING',
  allowJoinInGame: false,
  ...overrides,
})

type StompHandler = (msg: { body: string }) => void

const makeStompMock = () => {
  const subscriptions = new Map<string, StompHandler>()
  const published: { destination: string; body: string }[] = []

  const mock = {
    onConnect: null as ((frame: { headers: Record<string, string> }) => void) | null,
    onStompError: null as ((frame: { headers: Record<string, string> }) => void) | null,
    activate: vi.fn(function () {
      mock.onConnect?.({ headers: { 'user-name': 'session-1' } })
    }),
    deactivate: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((destination: string, handler: StompHandler) => {
      subscriptions.set(destination, handler)
      return { unsubscribe: vi.fn(() => subscriptions.delete(destination)) }
    }),
    publish: vi.fn((opts: { destination: string; body: string }) => {
      published.push(opts)
    }),
    trigger(destination: string, event: RoomEvent) {
      subscriptions.get(destination)?.({ body: JSON.stringify(event) })
    },
    published,
  }

  return mock
}

type StompMock = ReturnType<typeof makeStompMock>

const buildKitten = (mock: StompMock): KittenClient =>
  new KittenClient(mock as unknown as Client)

describe('KittenClient — connect', () => {
  it('se connecte et résout', async () => {
    const mock = makeStompMock()
    const kitten = buildKitten(mock)
    await expect(kitten.connect()).resolves.toBeUndefined()
  })

  it('rejette si erreur STOMP', async () => {
    const mock = makeStompMock()
    mock.activate = vi.fn(function () {
      mock.onStompError?.({ headers: { message: 'Connexion refusée' } })
    })
    const kitten = buildKitten(mock)
    await expect(kitten.connect()).rejects.toThrow('Connexion refusée')
  })

  it('disconnect appelle deactivate', async () => {
    const mock = makeStompMock()
    const kitten = buildKitten(mock)
    await kitten.connect()
    await kitten.disconnect()
    expect(mock.deactivate).toHaveBeenCalled()
  })
})

describe('KittenClient — createRoom', () => {
  let mock: StompMock
  let kitten: KittenClient

  beforeEach(async () => {
    mock = makeStompMock()
    kitten = buildKitten(mock)
    await kitten.connect()
  })

  it('retourne une KittenRoom après ROOM_CREATED', async () => {
    const promise = kitten.createRoom({ username: 'Alice' })
    mock.trigger('/user/queue/room', { type: 'ROOM_CREATED', room: makeRoomData(), payload: null })

    const room = await promise
    expect(room.code).toBe('ABCDEF')
    expect(room.isHost).toBe(true)
  })

  it('publie le bon message sur /app/room/create', async () => {
    kitten.createRoom({ username: 'Alice', maxPlayers: 4, allowJoinInGame: true }).catch(() => {})

    const msg = mock.published.find(p => p.destination === '/app/room/create')
    expect(msg).toBeDefined()
    expect(JSON.parse(msg!.body)).toMatchObject({ username: 'Alice', maxPlayers: 4, allowJoinInGame: true })
  })

  it('rejette si non connecté', async () => {
    await kitten.disconnect()
    await expect(kitten.createRoom({ username: 'Alice' })).rejects.toThrow('Non connecté')
  })
})

describe('KittenClient — joinRoom', () => {
  let mock: StompMock
  let kitten: KittenClient

  beforeEach(async () => {
    mock = makeStompMock()
    kitten = buildKitten(mock)
    await kitten.connect()
  })

  it('retourne une KittenRoom après PLAYER_JOINED', async () => {
    const promise = kitten.joinRoom({ username: 'Bob', code: 'ABCDEF' })

    mock.trigger('/topic/room/ABCDEF', {
      type: 'PLAYER_JOINED',
      room: makeRoomData({
        players: [
          { id: 'other', username: 'Alice', host: true },
          { id: 'session-1', username: 'Bob', host: false },
        ],
      }),
      payload: { id: 'session-1', username: 'Bob', host: false },
    })

    const room = await promise
    expect(room.code).toBe('ABCDEF')
  })

  it('publie le bon message sur /app/room/join', async () => {
    kitten.joinRoom({ username: 'Bob', code: 'ABCDEF' }).catch(() => {})

    const msg = mock.published.find(p => p.destination === '/app/room/join')
    expect(msg).toBeDefined()
    expect(JSON.parse(msg!.body)).toMatchObject({ username: 'Bob', code: 'ABCDEF' })
  })

  it('rejette si non connecté', async () => {
    await kitten.disconnect()
    await expect(kitten.joinRoom({ username: 'Bob', code: 'ABCDEF' })).rejects.toThrow('Non connecté')
  })
})
