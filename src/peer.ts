import { Instance, Options } from 'simple-peer'
// @ts-ignore
// @see https://github.com/feross/simple-peer/issues/883
import * as SimplePeer from 'simple-peer/simplepeer.min.js'

export const Peer = (opts?: Options): Instance => new SimplePeer(opts)
