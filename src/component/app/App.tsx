import { type Component, createSignal, onMount } from 'solid-js'
import { wsUrl } from '../../constant'
import './App.module.scss'

export type Client = { id: number }

export const App: Component = () => {
    const [me, setMe] = createSignal<Client>()
    const [peers, setPeers] = createSignal<Client[]>([])

    onMount(async () => {
        const ws = new WebSocket(wsUrl)
        ws.addEventListener('message', m => {
            console.log(m)
            const data = JSON.parse(m.data)
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
            }
        })
        await new Promise(done => ws.addEventListener('open', done))
    })

    return (
        <div class="App">
            <p>me: {me() ? JSON.stringify(me()) : ''}</p>
            <p>peers: {peers() ? JSON.stringify(peers()) : ''}</p>
        </div>
    )
}
