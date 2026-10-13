import { mkdir, writeFile } from 'node:fs/promises'
const tabs = await (await fetch('http://localhost:9333/json')).json()
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
const errors = []
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
})
const call = (method, params = {}) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); socket.send(JSON.stringify({ id: key, method, params })) })
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
await call('Page.enable'); await call('Runtime.enable')
await mkdir('artifacts/design', { recursive: true })
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url: 'http://localhost:3001' })
await delay(2500)
await evaluate('document.fonts.ready')
const results = []
for (const theme of ['light', 'dark']) {
  await evaluate(`localStorage.setItem('gentry:theme','${theme}'); location.reload()`)
  await delay(1200)
  results.push({ theme, state: await evaluate('({theme:document.documentElement.dataset.theme, heading:document.querySelector("h1")?.textContent, overflow:document.documentElement.scrollWidth > innerWidth})') })
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: await evaluate('document.documentElement.scrollHeight'), scale: 1 } })
  await writeFile(`artifacts/design/home-${theme}.png`, Buffer.from(shot.result.data, 'base64'))
}
await evaluate('document.querySelector(".theme-toggle").click()')
await delay(150)
results.push({ toggle: await evaluate('document.documentElement.dataset.theme') })
await evaluate('document.querySelectorAll(".workflow-steps > button")[1].click()')
results.push({ workflow: await evaluate('document.querySelector("#workflow-detail").textContent') })
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await delay(300)
const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: await evaluate('document.documentElement.scrollHeight'), scale: 1 } })
await writeFile('artifacts/design/home-mobile.png', Buffer.from(mobile.result.data, 'base64'))
for (const route of ['signals', 'network', 'workspaces', 'leaderboard', 'builders']) {
  await evaluate(`location.hash='${route}'`); await delay(500)
  results.push({ route, overflow: await evaluate('document.documentElement.scrollWidth > innerWidth'), visible: await evaluate('document.querySelector("main").innerText.length') })
}
results.push({ errors })
console.log(JSON.stringify(results, null, 2))
socket.close()
