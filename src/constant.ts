export const iceUrl: string = import.meta.env.ICE_URL
if (!iceUrl) {
    console.error('ICE_URL not set')
}

export const wsUrl: string = import.meta.env.WS_URL
if (!wsUrl) {
    console.error('WS_URL not set')
}
