import './app/app.css'
import { App } from './app/App'

const root = document.getElementById('app')
if (!root) {
  throw new Error('Не найден корневой элемент #app')
}

new App(root)
