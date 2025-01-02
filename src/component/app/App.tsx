import { type Component, For, Match, Switch, createSignal, onMount } from 'solid-js'
import { wsUrl } from '../../constant'
import { Connection, Swarm } from '../../swarm'
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

    const appId = 'tiny-multiplayer'

    const swarm = new Swarm({
        trackerUrl: wsUrl,
        appId,
        broadcastWidth: 5
    })
    setMe({ id: swarm.myId, connected: false })
    setPeers([me()!])
    swarm.on('new-peer', conn => setPeers([...peers(), { id: conn.peerId, connected: false }]))
    swarm.on('connect', conn => {
        console.warn('connect', conn)
        setPeers(
            peers().map(p => {
                if (p.id === conn.peerId) {
                    p.connected = true
                }
                return { ...p }
            })
        )
    })
    const disconnect = (conn: Connection, e?: Error) => {
        console.debug(e)
        setPeers(
            peers().map(p => {
                if (p.id === conn.peerId) {
                    p.connected = false
                }
                return { ...p }
            })
        )
    }
    swarm.on('error', (e, conn) => disconnect(conn, e))
    swarm.on('close', conn => disconnect(conn))
    swarm.on('message', (msg, conn) => setMessages([...messages(), { from: conn.peerId, text: msg }]))

    onMount(async () => {
        await swarm.connect()
    })

    return (
        <div class="App">
            <button type="button" onClick={() => swarm.offer()}>
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
                                    <button
                                        type="button"
                                        disabled={!peer.connected}
                                        onClick={() => swarm.send(peer.id, 'hello!')}
                                    >
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
