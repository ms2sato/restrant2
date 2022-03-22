import { defineHandlers } from 'restrant2'

export default defineHandlers((support, routeConfig) => {
  return {
    index: {
      success: async (ctx, output) => ctx.res.render('tasks/index', { tasks: output }),
    },

    build: (ctx) => ctx.res.render('tasks/build', { task: {} }),

    edit: {
      success: async (ctx, output) => ctx.res.render('tasks/edit', { task: output }),
    },

    create: {
      success: async (ctx, output) => {
        ctx.res.redirect('/tasks')
      },
      invalid: async (ctx, err) => {
        ctx.res.render('tasks/build', { task: ctx.req.body, err })
      },
    },

    update: {
      success: async (ctx, output) => {
        ctx.res.redirect('/tasks')
      },
      invalid: async (ctx, err) => {
        ctx.res.render('tasks/edit', { task: { id: ctx.req.params.id, ...ctx.req.body }, err })
      },
    },

    destroy: {
      success: async (ctx, output) => {
        ctx.res.redirect('/tasks')
      },
    },

    done: {
      success: async (ctx, output) => {
        ctx.res.redirect('/tasks')
      },
    },
  }
})
