import { defineAdapter } from 'restrant2'
import { User } from './resource'
import { AcceptLanguageOption } from '../../../../endpoint_options'

export default defineAdapter<AcceptLanguageOption>((_support, _routeConfig) => {
  return {
    index: {
      success: async (ctx, output: User[], option) =>
        ctx.render('users/index', { users: output, admin: { id: Number(ctx.params.adminId) }, ...option }),
    },

    build: (ctx) => ctx.render('users/build', { data: { adminId: ctx.params.adminId } }),

    edit: {
      success: async (ctx, output: User, option) => ctx.render('users/edit', { data: output, ...option }),
    },

    create: {
      success: async (ctx, output: User) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        ctx.render('users/build', { data: source, err })
      },
    },

    update: {
      success: async (ctx, output: User) => {
        ctx.redirect(`/admins/${output.adminId}/users`)
      },
      invalid: async (ctx, err, source) => {
        ctx.render('users/edit', { data: source, err })
      },
    },

    destroy: {
      success: async (ctx, output) => {
        ctx.redirect('/users')
      },
    },

    photo: {
      success: async (ctx, output: string | null) => {
        if (!output) {
          ctx.res.send('Photo not found')
          return
        }
        await ctx.res.sendFile(output)
      },
    },
  }
})
