import { defineAdapter, Handler, AdapterOf } from 'restrant2'
import type resource from './resource'

type Adapter = AdapterOf<typeof resource> & { build: Handler }

export default defineAdapter((_support, _routeConfig): Adapter => {
  return {
    index: {
      success: (ctx, output) => ctx.render('tasks/index', { tasks: output }),
    },

    build: (ctx) => ctx.render('tasks/build', { task: { subtasks: [] } }),

    edit: {
      success: (ctx, output) => ctx.render('tasks/edit', { task: output }),
    },

    create: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
      invalid: (ctx, err, source) => {
        ctx.render('tasks/build', { task: source, err })
      },
    },

    update: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
      invalid: (ctx, err, source) => {
        ctx.render('tasks/edit', { task: source, err })
      },
    },

    destroy: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
    },

    done: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
    },
  }
})
