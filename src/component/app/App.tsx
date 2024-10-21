import { type Component, For, createSignal, onMount } from 'solid-js'
import { iceUrl, wsUrl } from '../../constant'
import './App.module.scss'

export type Peer = {
    id: string
    connected: boolean
}

export type PeerConnection = {
    peer: Peer
    rtcConn: RTCPeerConnection
    dataChannel?: RTCDataChannel
}
export type Message = {
    from: Peer
    text: string
}

export const App: Component = () => {
    const [me, setMe] = createSignal<Peer>()
    const [peers, setPeers] = createSignal<Peer[]>([])
    const [messages, setMessages] = createSignal<Message[]>([])
    const peerConnections = new Map<string, PeerConnection>()

    const ws = new WebSocket(wsUrl)

    onMount(async () => {
        ws.addEventListener('message', async m => {
            const data = JSON.parse(m.data)
            console.debug('ws message', data)
            switch (data.type) {
                case 'you': {
                    setMe(data.peer)
                    break
                }
                case 'peer-connected': {
                    setPeers([...peers(), data.peer])
                    break
                }
                case 'peer-disconnected': {
                    setPeers(peers().filter(p => p.id !== data.peer.id))
                    break
                }
                case 'new-ice-candidate': {
                    const remoteId = data.name
                    const remotePeerConn = peerConnections.get(remoteId)
                    if (!remotePeerConn) {
                        console.warn('no connection')
                        console.debug(peerConnections, remoteId)
                        return
                    }
                    const candidate = new RTCIceCandidate(data.candidate)
                    remotePeerConn.rtcConn.addIceCandidate(candidate)
                    break
                }
                case 'data-offer': {
                    const remoteId = data.name
                    const conn = createPeerConnection({ id: remoteId, connected: false })
                    const rtcConn = conn.rtcConn

                    await rtcConn.setRemoteDescription(new RTCSessionDescription(data.sdp))
                    const answer = await rtcConn.createAnswer()
                    await rtcConn.setLocalDescription(answer)

                    ws.send(
                        JSON.stringify({
                            name: me()!.id,
                            target: remoteId,
                            type: 'data-answer',
                            sdp: rtcConn.localDescription
                        })
                    )
                    break
                }
                case 'data-answer': {
                    const remoteId = data.name
                    const remotePeerConn = peerConnections.get(remoteId)
                    if (!remotePeerConn) {
                        console.warn('no connection')
                        return
                    }
                    const sessionDesc = new RTCSessionDescription(data.sdp)
                    remotePeerConn.rtcConn.setRemoteDescription(sessionDesc)
                    break
                }
            }
        })
        await new Promise(done => ws.addEventListener('open', done))
    })

    const createPeerConnection = (peer: Peer) => {
        const existing = peerConnections.get(peer.id)
        if (existing) return existing

        const rtcConn = new RTCPeerConnection({ iceServers: [{ urls: iceUrl, username: 'turn', credential: 'turn' }] })
        const conn: PeerConnection = { peer, rtcConn }
        peerConnections.set(peer.id, conn)

        const dataChannel = rtcConn.createDataChannel('data')
        dataChannel.addEventListener('open', () => console.debug('datachannel open'))
        dataChannel.addEventListener('close', () => console.debug('datachannel close'))
        dataChannel.addEventListener('message', e => {
            console.debug('datachannel message', e.data)
            const msg = { from: peer, text: e.data as string }
            setMessages([...messages(), msg])
        })

        rtcConn.addEventListener('datachannel', e => {
            console.debug('datachannel')
            conn.dataChannel = e.channel
        })

        rtcConn.addEventListener('icecandidate', e => {
            console.debug('icecandidate', e.candidate?.candidate)
            if (e.candidate) {
                ws.send(
                    JSON.stringify({
                        name: me()!.id,
                        type: 'new-ice-candidate',
                        target: peer.id,
                        candidate: e.candidate
                    })
                )
            }
        })
        rtcConn.addEventListener('negotiationneeded', e => {
            rtcConn
                .createOffer()
                .then(offer => rtcConn.setLocalDescription(offer))
                .then(() => {
                    ws.send(
                        JSON.stringify({
                            name: me()!.id,
                            target: peer.id,
                            type: 'data-offer',
                            sdp: rtcConn.localDescription
                        })
                    )
                })
                .catch(window.reportError)
        })
        rtcConn.addEventListener('iceconnectionstatechange', e =>
            console.debug(e.type, (e.target as RTCPeerConnection).iceConnectionState)
        )
        rtcConn.addEventListener('icegatheringstatechange', e =>
            console.debug('icegatheringstatechange', (e.target as RTCPeerConnection).iceGatheringState)
        )
        rtcConn.addEventListener('connectionstatechange', e => {
            console.debug('connectionstatechange', (e.target as RTCPeerConnection).connectionState)
            setPeers(
                peers().map(p => (p.id === peer.id ? { ...p, connected: rtcConn.connectionState === 'connected' } : p))
            )
        })
        rtcConn.addEventListener('signalingstatechange', e =>
            console.debug('signalingstatechange', (e.target as RTCPeerConnection).signalingState)
        )

        return conn
    }

    const sendData = (peer: Peer) => {
        const conn = peerConnections.get(peer.id)!
        const msg = `hello from ${me()!.id}!`
        console.debug(`sending to #${peer.id}`, msg)
        conn.dataChannel?.send(msg)
    }

    return (
        <div class="App">
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
                                    <button
                                        type="button"
                                        disabled={!(me() && peer.id !== me()!.id)}
                                        onClick={() => createPeerConnection(peer)}
                                    >
                                        connect
                                    </button>
                                </td>
                                <td>
                                    <input type="checkbox" checked={peer.connected} />
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
                            <td>{message.from.id}:</td>
                            <td>{message.text}</td>
                        </tr>
                    )}
                </For>
            </table>
        </div>
    )
}
