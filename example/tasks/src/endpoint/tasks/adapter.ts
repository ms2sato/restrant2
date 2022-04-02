import { defineAdapter } from 'restrant2'
import { Task } from './resource'

export default defineAdapter((_support, _routeConfig) => {
  return {
    index: {
      success: (ctx, output: Task[]) => ctx.render('tasks/index', { tasks: output }),
    },

    build: (ctx) => ctx.render('tasks/build', { task: {} }),

    edit: {
      success: (ctx, output: Task) => ctx.render('tasks/edit', { task: output }),
    },

    create: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
      invalid: (ctx, err, source: Partial<Task>) => {
        ctx.render('tasks/build', { task: source, err })
      },
    },

    update: {
      success: (ctx) => {
        ctx.redirect('/tasks')
      },
      invalid: (ctx, err, source: Partial<Task>) => {
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
