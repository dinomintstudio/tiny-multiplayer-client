import { Instance } from 'simple-peer'
import { type Component, For, Match, Switch, createSignal, onMount } from 'solid-js'
import { arr2hex, bin2hex, hash, hex2bin, randomBytes } from 'uint8-util'
import { wsUrl } from '../../constant'
import { Peer } from '../../peer'
import './App.module.scss'

export type PeerInfo = {
    id: string
    connected: boolean
}

export type Message = {
    from: string
    text: string
}

export const App: Component = () => {
    const [me, setMe] = createSignal<PeerInfo>()
    const [peers, setPeers] = createSignal<PeerInfo[]>([])
    const [messages, setMessages] = createSignal<Message[]>([])
    const peerConnections = new Map<string, Instance>()

    const ws = new WebSocket(wsUrl)
    const appId = 'tiny-multiplayer'
    const peerId = arr2hex(randomBytes(20))
    setMe({ id: peerId, connected: false })
    setPeers([me()!])

    let peer: Instance | undefined
    let iPeerId: string | undefined
    let iOfferId: string | undefined

    onMount(async () => {
        await new Promise(done => ws.addEventListener('open', done))
        ws.addEventListener('message', async m => {
            const data = JSON.parse(m.data)

            switch (data.action) {
                case 'announce': {
                    if (data.peer_id) {
                        iPeerId = bin2hex(data.peer_id)
                        if (!peers().find(p => p.id === iPeerId)) {
                            console.debug('new peer', iPeerId)
                            setPeers([...peers(), { id: iPeerId, connected: false }])
                        }
                        if (data.offer) {
                            console.debug('offer', data)
                            iOfferId = data.offer_id
                            peer = await offer(false)
                            peer.signal(data.offer)
                            peerConnections.set(iPeerId!, peer)
                        }
                        if (data.answer) {
                            console.debug('answer', data)
                            if (!peer) throw Error('no peer')
                            peer.signal(data.answer)
                            peerConnections.set(iPeerId!, peer)
                        }
                    }
                    break
                }
            }
        })
        announce()
    })

    const announce = async () => {
        const infoHash = (await hash(appId, 'hex')).toString()
        ws.send(
            JSON.stringify({
                action: 'announce',
                info_hash: hex2bin(infoHash),
                peer_id: hex2bin(peerId),
                numwant: 10,
                offers: [{ offer: await new RTCPeerConnection().createOffer(), offer_id: arr2hex(randomBytes(20)) }]
            })
        )
    }

    const offer = async (initiator: boolean) => {
        const infoHash = (await hash(appId, 'hex')).toString()
        const peer = Peer({ initiator, trickle: false })
        if (initiator) {
            peer.on('signal', async signal => {
                if (signal.type === 'offer') {
                    ws.send(
                        JSON.stringify({
                            action: 'announce',
                            info_hash: hex2bin(infoHash),
                            peer_id: hex2bin(peerId),
                            numwant: 10,
                            offers: [{ offer: signal, offer_id: arr2hex(randomBytes(20)) }]
                        })
                    )
                }
            })
        } else {
            peer.on('signal', async signal => {
                if (signal.type === 'answer') {
                    ws.send(
                        JSON.stringify({
                            action: 'announce',
                            info_hash: hex2bin(infoHash),
                            peer_id: hex2bin(peerId),
                            to_peer_id: hex2bin(iPeerId!),
                            answer: signal,
                            offer_id: iOfferId!
                        })
                    )
                }
            })
        }
        peer.on('data', (data: Uint8Array) => {
            setMessages([...messages(), { from: iPeerId!, text: data.toString() }])
        })
        peer.on('connect', () => {
            setPeers(
                peers().map(p => {
                    if (p.id === iPeerId) {
                        p.connected = true
                    }
                    return { ...p }
                })
            )
        })
        const disconnect = (e: string | Error) => {
            console.debug(e)
            setPeers(
                peers().map(p => {
                    if (p.id === iPeerId) {
                        p.connected = false
                    }
                    return { ...p }
                })
            )
            peerConnections.delete(peerId)
        }
        peer.on('error', e => disconnect(e))
        peer.on('close', () => disconnect('close'))
        return peer
    }

    const sendData = (peer: PeerInfo) => {
        const inst = peerConnections.get(peer.id)
        const msg = 'hello!'
        inst?.send(msg)
    }

    return (
        <div class="App">
            <button
                type="button"
                onClick={async () => {
                    peer = await offer(true)
                }}
            >
                offer
            </button>
            <h2>Peers</h2>
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>connected</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={peers()}>
                        {peer => (
                            <tr>
                                <td>{peer.id}</td>
                                <td>
                                    <Switch>
                                        <Match when={me()!.id === peer.id}>me</Match>
                                        <Match when={true}>
                                            <input type="checkbox" checked={peer.connected === true} />
                                        </Match>
                                    </Switch>
                                </td>
                                <td>
                                    <button type="button" disabled={!peer.connected} onClick={() => sendData(peer)}>
                                        send
                                    </button>
                                </td>
                            </tr>
                        )}
                    </For>
                </tbody>
            </table>
            <h2>Messages</h2>
            <table>
                <For each={messages()}>
                    {message => (
                        <tr>
                            <td>{message.from}:</td>
                            <td>{message.text}</td>
                        </tr>
                    )}
                </For>
            </table>
        </div>
    )
}
