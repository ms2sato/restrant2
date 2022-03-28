import express from 'express'
import { ServerRouter } from 'restrant2'
import { routes } from './routes'
import createDebug from 'debug'
import methodOverride from 'method-override'
import displayRoutes from 'express-routemap'
import path from 'path'
import { createOptions } from './endpoint_options'

const debug = createDebug('tasks:params')
const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.set('views', path.join(__dirname, '../views'))
app.set('view engine', 'pug')

// @see http://expressjs.com/en/resources/middleware/method-override.html
app.use(
  methodOverride(function (req, _res) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method
      delete req.body._method
      return method
    }
  })
)

app.use(methodOverride('_method', { methods: ['GET', 'POST'] })) // for GET Parameter

app.use((req, res, next) => {
  debug(`${req.method} ${req.path}`)

  next()
  if (debug.enabled) {
    debug(`req.params: %o`, req.params)
    debug(`req.body: %o`, req.body)
    debug(`req.query: %o`, req.query)
  }
})

const router: ServerRouter = new ServerRouter(__dirname, '/', {
  createOptions,
})
app.use(router.router)
routes(router).then(() => {
  displayRoutes(app)

  const port = 3000
  app.listen(port, () => {
    console.log(`REST API server ready at: http://localhost:${port}`)
  })
})
