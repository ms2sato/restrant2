import { UserCreateParams, UserUpdateParams } from '../../../../params'
import { IdNumberParams, defineResource } from 'restrant2'
import { AcceptLanguageOption } from '../../../../endpoint_options'

export type User = {
  id: number
  name: string
  photo?: string
}

export default defineResource((support, options) => {
  const users: Map<number, User> = new Map([
    [1, { id: 1, name: 'test1' }],
    [2, { id: 2, name: 'test2' }],
  ])

  let lastId = 2

  const get = (id: number): User => {
    const user = users.get(id)
    if (user === undefined) {
      throw new Error(`User not found: ${id}`)
    }
    return user
  }

  return {
    index: (option: AcceptLanguageOption) => {
      return Array.from(users, ([id, data]) => data)
    },

    create: (params: UserCreateParams) => {
      const user: User = {
        ...params,
        id: ++lastId,
      }
      users.set(user.id, user)
      return user
    },

    edit: (params: IdNumberParams) => {
      return get(params.id)
    },

    update: (params: UserUpdateParams) => {
      const { id, ...data } = params
      const user = { ...get(id), ...data }
      users.set(id, user)
      return user
    },

    destroy: (params: IdNumberParams) => {
      const user = get(params.id)
      users.delete(params.id)
      return user
    },
  }
})
