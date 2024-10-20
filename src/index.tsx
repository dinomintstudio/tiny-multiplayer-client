import { render } from 'solid-js/web'

import { App } from './component/app/App'
import './index.scss'

const root = document.getElementById('root')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
    throw new Error('no root element')
}

render(() => <App />, root!)
