import EventEmitter from 'events'
import { Instance } from 'simple-peer'
import TypedEmitter from 'typed-emitter'
import { arr2hex, bin2hex, hash, hex2bin, randomBytes } from 'uint8-util'
import { Peer } from './peer'

export type SwarmOptions = {
    trackerUrl: string
    appId: string
    iceUrls?: string[]
    id?: string
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
    ws?: WebSocket
    connections: { [id: string]: Connection } = {}
    offers: { [offerId: string]: Instance } = {}
    myId: string

    constructor(public opts: SwarmOptions) {
        super()
        this.myId = opts.id ?? arr2hex(randomBytes(20))
    }

    async connect(): Promise<void> {
        this.ws = new WebSocket(this.opts.trackerUrl)
        this.ws.addEventListener('message', async m => {
            const data = JSON.parse(m.data)
            if (data.action !== 'announce') return
            const offerId = data.offer_id
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
                    console.log(this.offers, offerId)
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
        await new Promise(done => this.ws!.addEventListener('open', done))
    }

    async announce(): Promise<void> {
        const infoHash = (await hash(this.opts.appId, 'hex')).toString()
        const offer = await new RTCPeerConnection().createOffer()
        this.ws!.send(
            JSON.stringify({
                action: 'announce',
                info_hash: hex2bin(infoHash),
                peer_id: hex2bin(this.myId),
                numwant: 10,
                offers: [{ offer, offer_id: arr2hex(randomBytes(10)) }]
            })
        )
    }

    async offer(): Promise<void> {
        await this.createPeer()
    }

    async createPeer(connection?: Connection): Promise<void> {
        const infoHash = (await hash(this.opts.appId, 'hex')).toString()
        const peer = Peer({ initiator: !connection, trickle: false })
        if (!connection) {
            peer.on('signal', async signal => {
                if (signal.type === 'offer') {
                    const offer = { offer: signal, offer_id: arr2hex(randomBytes(10)) }
                    this.offers[offer.offer_id] = peer
                    console.log('create offer', this.offers, offer.offer_id)
                    this.ws!.send(
                        JSON.stringify({
                            action: 'announce',
                            info_hash: hex2bin(infoHash),
                            peer_id: hex2bin(this.myId),
                            numwant: 10,
                            offers: [offer]
                        })
                    )
                }
            })
        } else {
            connection.instance = peer
            peer.on('signal', async signal => {
                if (signal.type === 'answer') {
                    this.ws!.send(
                        JSON.stringify({
                            action: 'announce',
                            info_hash: hex2bin(infoHash),
                            peer_id: hex2bin(this.myId),
                            to_peer_id: hex2bin(connection.peerId),
                            answer: signal,
                            offer_id: connection.offerId
                        })
                    )
                }
            })
        }
        const findConnection = () => Object.values(this.connections).find(c => c.instance === peer)!
        peer.on('data', (data: Uint8Array) => this.emit('message', data.toString(), findConnection()))
        peer.on('connect', () => this.emit('connect', findConnection()))
        peer.on('error', e => this.emit('error', e, findConnection()))
        peer.on('close', () => this.emit('close', findConnection()))
    }

    send(toId: string, message: string): void {
        this.connections[toId].instance!.send(message)
    }
}
