export const iceServers: string = import.meta.env.ICE_SERVERS
if (!iceServers) {
    console.error('ICE_SERVERS not set')
}

export const wsUrl: string = import.meta.env.WS_URL
if (!wsUrl) {
    console.error('WS_URL not set')
}
