
import express from 'express'
import { Router, ServerRouter } from 'restrant2.ts'
import { routes } from './routes'

const app = express()

app.use(express.json())
app.set('view engine', 'pug');

const router: Router = new ServerRouter(app, __dirname);
routes(router)

app.listen(3000, () =>
  console.log('REST API server ready at: http://localhost:3000'),
)