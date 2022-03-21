import { defineHandlers } from 'restrant2'
import { AcceptLanguageOption } from '../../../../endpoint_options'

export default defineHandlers<AcceptLanguageOption>((support, routeConfig) => {
  return {
    index: {
      success: async (ctx, output, option) =>
        ctx.res.render('users/index', { users: output, admin: { id: Number(ctx.req.params.adminId) }, ...option }),
    },

    build: (ctx) => ctx.res.render('users/build', { user: {} }),

    edit: {
      success: async (ctx, output, option) =>
        ctx.res.render('users/edit', { admin: { id: Number(ctx.req.params.adminId) }, data: output, ...option }),
    },

    create: {
      success: async (ctx, output) => {
        ctx.res.redirect(`/admin/${ctx.req.params.adminId}/users`)
      },
      invalid: async (ctx, err) => {
        ctx.res.render('users/build', { user: ctx.req.body, err })
      },
    },

    update: {
      success: async (ctx, output) => {
        ctx.res.redirect('/users')
      },
      invalid: async (ctx, err) => {
        ctx.res.render('users/edit', { user: ctx.req.body, err })
      },
    },

    destroy: {
      success: async (ctx, output) => {
        ctx.res.redirect('/users')
      },
    },

    done: {
      success: async (ctx, output) => {
        ctx.res.redirect('/users')
      },
    },
  }
})
