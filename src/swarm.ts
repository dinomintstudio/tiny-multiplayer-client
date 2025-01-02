import EventEmitter from 'events'
import { Instance, SignalData } from 'simple-peer'
import TypedEmitter from 'typed-emitter'
import { arr2hex, bin2hex, hash, hex2bin, randomBytes } from 'uint8-util'
import { Peer } from './peer'

export type SwarmOptions = {
    trackerUrl: string
    appId: string
    iceUrls?: string[]
    id?: string
    broadcastWidth?: number
}

export type Connection = {
    peerId: string
    instance?: Instance
    offerId?: string
}

export type SwarmEvents = {
    'new-peer': (peer: Connection) => void
    message: (message: string, connection: Connection) => void
    connect: (connection: Connection) => void
    error: (error: Error, connection: Connection) => void
    close: (connection: Connection) => void
}

export class Swarm extends (EventEmitter as new () => TypedEmitter<SwarmEvents>) {
    connections: { [id: string]: Connection } = {}
    offers: { [offerId: string]: Instance } = {}
    myId: string
    infoHash?: string
    ws?: WebSocket

    constructor(public opts: SwarmOptions) {
        super()
        this.myId = opts.id ?? arr2hex(randomBytes(20))
    }

    async connect(): Promise<void> {
        this.infoHash = (await hash(this.opts.appId, 'hex')).toString()
        const reconnect = async () => {
            const ws = new WebSocket(this.opts.trackerUrl)
            await new Promise(done => ws.addEventListener('open', done))
            return ws
        }
        this.ws = await reconnect()
        this.ws.addEventListener('message', async m => {
            const data = JSON.parse(m.data)
            if (data.action !== 'announce') return
            const offerId = data.offer_id ? bin2hex(data.offer_id) : undefined
            if (data.peer_id && offerId) {
                const peerId = bin2hex(data.peer_id)

                if (data.offer) {
                    console.debug('offer', data)
                    if (this.connections[peerId]) {
                        if (this.connections[peerId].instance?.connected) {
                            console.debug('already connected', this.connections[peerId])
                            return
                        }
                    } else {
                        this.connections[peerId] = { peerId, offerId }
                        this.emit('new-peer', this.connections[peerId])
                    }
                    const connection = this.connections[peerId]
                    connection.offerId = data.offer_id
                    await this.createPeer(connection)
                    connection.instance!.signal(data.offer)
                    return
                }
                if (data.answer) {
                    console.debug('answer', data)
                    const instance = this.offers[offerId]
                    if (!instance) throw Error('no instance')
                    instance.signal(data.answer)
                    if (!this.connections[peerId]) {
                        this.connections[peerId] = { peerId, instance, offerId }
                        this.emit('new-peer', this.connections[peerId])
                    }
                    this.connections[peerId].instance = instance
                    return
                }
                console.error('unknown message', data)
            }
        })
        this.ws.addEventListener('close', async e => {
            console.debug(e)
            this.ws = await reconnect()
        })
        this.ws.addEventListener('error', console.error)
    }

    async offer(): Promise<void> {
        await this.createPeer()
    }

    createPeer_(initiator = false): Instance {
        const peer = Peer({ initiator, trickle: false })
        const findConnection = () => Object.values(this.connections).find(c => c.instance === peer)!
        peer.on('data', (data: Uint8Array) => this.emit('message', data.toString(), findConnection()))
        peer.on('connect', () => this.emit('connect', findConnection()))
        peer.on('error', e => this.emit('error', e, findConnection()))
        peer.on('close', () => this.emit('close', findConnection()))
        return peer
    }

    async createPeer(connection?: Connection): Promise<void> {
        if (!connection) {
            const width = this.opts.broadcastWidth ?? 10
            const peers = new Array(width).fill(0).map(() => this.createPeer_(true))
            const offerIds = new Array(width).fill(0).map(() => arr2hex(randomBytes(20)))
            const offers = await Promise.all(
                peers.map(
                    (peer, i) =>
                        new Promise<{ offer: SignalData; offer_id: string }>(done =>
                            peer.on('signal', signal => done({ offer: signal, offer_id: hex2bin(offerIds[i]) }))
                        )
                )
            )
            peers.forEach((peer, i) => {
                this.offers[offerIds[i]] = peer
            })
            console.debug('create offers', this.offers)
            this.ws!.send(
                JSON.stringify({
                    action: 'announce',
                    info_hash: hex2bin(this.infoHash!),
                    peer_id: hex2bin(this.myId),
                    numwant: width,
                    offers
                })
            )
        } else {
            connection.instance = this.createPeer_()
            connection.instance.on('signal', signal => {
                if (signal.type === 'answer') {
                    this.ws!.send(
                        JSON.stringify({
                            action: 'announce',
                            info_hash: hex2bin(this.infoHash!),
                            peer_id: hex2bin(this.myId),
                            to_peer_id: hex2bin(connection.peerId),
                            answer: signal,
                            offer_id: connection.offerId
                        })
                    )
                }
            })
        }
    }

    send(toId: string, message: string): void {
        this.connections[toId].instance!.send(message)
    }
}
