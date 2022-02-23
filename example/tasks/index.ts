
import express from 'express'
import { Router, ServerRouter } from 'restrant2'
import { routes } from './routes'
import createDebug from 'debug'

const debug = createDebug('tasks:params');
const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'pug');

app.use((req, res, next) => {
  debug(`${req.method} ${req.path}`);

  next();
  if (debug.enabled) {
    debug(`req.params: %o`, req.params);
    debug(`req.body: %o`, req.body);
    debug(`req.query: %o`, req.query);
  }
});

const router: Router = new ServerRouter(app, __dirname);
routes(router)

app.listen(3000, () =>
  console.log('REST API server ready at: http://localhost:3000'),
)