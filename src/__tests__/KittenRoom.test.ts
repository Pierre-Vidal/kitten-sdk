import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KittenRoom } from '../KittenRoom.js'
import type { Client } from '@stomp/stompjs'
import type { RoomEvent, RoomResponse } from '../types.js'

const makeRoom = (overrides: Partial<RoomResponse> = {}): RoomResponse => ({
  code: 'ABCDEF',
  players: [{ id: 'session-1', username: 'Alice', host: true }],
  hostId: 'session-1',
  state: {},
  maxPlayers: 8,
  status: 'WAITING',
  allowJoinInGame: false,
  ...overrides,
})

const makeClient = () => ({ publish: vi.fn() }) as unknown as Client

describe('KittenRoom — getters', () => {
  it('expose les propriétés de la room', () => {
    const room = new KittenRoom(makeClient(), 'session-1', makeRoom())

    expect(room.code).toBe('ABCDEF')
    expect(room.hostId).toBe('session-1')
    expect(room.status).toBe('WAITING')
    expect(room.maxPlayers).toBe(8)
    expect(room.allowJoinInGame).toBe(false)
    expect(room.players).toHaveLength(1)
  })

  it('isHost retourne true si on est le host', () => {
    const room = new KittenRoom(makeClient(), 'session-1', makeRoom())
    expect(room.isHost).toBe(true)
  })

  it('isHost retourne false si on est pas le host', () => {
    const room = new KittenRoom(makeClient(), 'session-2', makeRoom())
    expect(room.isHost).toBe(false)
  })
})

describe('KittenRoom — events', () => {
  let room: KittenRoom

  beforeEach(() => {
    room = new KittenRoom(makeClient(), 'session-1', makeRoom())
  })

  const makeEvent = (type: RoomEvent['type'], payload: unknown = null, overrides: Partial<RoomResponse> = {}): RoomEvent => ({
    type,
    room: makeRoom(overrides),
    payload,
  })

  it('émet playerJoined quand PLAYER_JOINED', () => {
    const handler = vi.fn()
    room.on('playerJoined', handler)

    const bob = { id: 'session-2', username: 'Bob', host: false }
    room._handleEvent(makeEvent('PLAYER_JOINED', bob, {
      players: [{ id: 'session-1', username: 'Alice', host: true }, bob],
    }))

    expect(handler).toHaveBeenCalledWith(bob)
  })

  it('émet playerLeft quand PLAYER_LEFT', () => {
    const handler = vi.fn()
    room.on('playerLeft', handler)

    room._handleEvent(makeEvent('PLAYER_LEFT', 'session-2'))

    expect(handler).toHaveBeenCalledWith('session-2')
  })

  it('émet hostChanged quand HOST_CHANGED', () => {
    const handler = vi.fn()
    room.on('hostChanged', handler)

    room._handleEvent(makeEvent('HOST_CHANGED', 'session-2', { hostId: 'session-2' }))

    expect(handler).toHaveBeenCalledWith('session-2')
  })

  it('émet stateUpdated quand STATE_UPDATED', () => {
    const handler = vi.fn()
    room.on('stateUpdated', handler)

    room._handleEvent(makeEvent('STATE_UPDATED', null, { state: { score: 10 } }))

    expect(handler).toHaveBeenCalledWith({ score: 10 })
  })

  it('émet statusChanged quand STATUS_CHANGED', () => {
    const handler = vi.fn()
    room.on('statusChanged', handler)

    room._handleEvent(makeEvent('STATUS_CHANGED', null, { status: 'IN_GAME' }))

    expect(handler).toHaveBeenCalledWith('IN_GAME')
  })

  it('émet stateReset quand STATE_RESET', () => {
    const handler = vi.fn()
    room.on('stateReset', handler)

    room._handleEvent(makeEvent('STATE_RESET'))

    expect(handler).toHaveBeenCalled()
  })

  it('émet kicked quand KICKED', () => {
    const handler = vi.fn()
    room.on('kicked', handler)

    room._handleEvent(makeEvent('KICKED'))

    expect(handler).toHaveBeenCalled()
  })

  it('met à jour les données de la room après chaque event', () => {
    room._handleEvent(makeEvent('STATUS_CHANGED', null, { status: 'IN_GAME' }))
    expect(room.status).toBe('IN_GAME')
  })

  it('off retire le handler', () => {
    const handler = vi.fn()
    room.on('playerLeft', handler)
    room.off('playerLeft', handler)

    room._handleEvent(makeEvent('PLAYER_LEFT', 'session-2'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('ne plante pas sur un event non écouté', () => {
    expect(() => room._handleEvent(makeEvent('PLAYER_JOINED', { id: 'x', username: 'X', host: false }))).not.toThrow()
  })
})

describe('KittenRoom — actions', () => {
  let client: Client
  let room: KittenRoom

  beforeEach(() => {
    client = makeClient()
    room = new KittenRoom(client, 'session-1', makeRoom())
  })

  it('leave publie sur /app/room/leave', async () => {
    await room.leave()
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/room/leave',
      body: JSON.stringify({ code: 'ABCDEF' }),
    })
  })

  it('updateState publie sur /app/room/state', async () => {
    await room.updateState({ score: 5 })
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/room/state',
      body: JSON.stringify({ code: 'ABCDEF', state: { score: 5 } }),
    })
  })

  it('setStatus publie sur /app/room/status', async () => {
    await room.setStatus('IN_GAME')
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/room/status',
      body: JSON.stringify({ code: 'ABCDEF', status: 'IN_GAME' }),
    })
  })

  it('kick publie sur /app/room/kick', async () => {
    await room.kick('session-2')
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/room/kick',
      body: JSON.stringify({ code: 'ABCDEF', targetSessionId: 'session-2' }),
    })
  })

  it('resetState publie sur /app/room/reset', async () => {
    await room.resetState()
    expect(client.publish).toHaveBeenCalledWith({
      destination: '/app/room/reset',
      body: JSON.stringify({ code: 'ABCDEF' }),
    })
  })
})
