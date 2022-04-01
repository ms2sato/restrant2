import path from 'path'
import { UserCreateParams, UserUpdateParams, AdminWithIdNumberParams } from '../../../../params'
import { IdNumberParams, defineResource, UploadedFile } from 'restrant2'
import { AcceptLanguageOption } from '../../../../endpoint_options'
import { save } from '../../../../lib/upload'

export type User = {
  id: number
  name: string
  photo?: string
  adminId: number
}

export default defineResource((support, options) => {
  const users: Map<number, User> = new Map([
    [1, { id: 1, name: 'test1', adminId: 1 }],
    [2, { id: 2, name: 'test2', adminId: 1 }],
  ])

  let lastId = 2

  const get = (id: number): User => {
    const user = users.get(id)
    if (user === undefined) {
      throw new Error(`User not found: ${id}`)
    }
    return user
  }

  const resourceRoot = path.join(support.rootPath, '../uploaded')

  const saveFile = (uploadedFile: UploadedFile) => {
    return save(uploadedFile, resourceRoot)
  }

  return {
    index: (option: AcceptLanguageOption) => {
      return Array.from(users, ([id, data]) => data)
    },

    create: async (params: UserCreateParams) => {
      const { photo, photoCache, ...data } = params

      const user: User = {
        ...data,
        id: ++lastId,
      }

      if (photo) {
        user.photo = await saveFile(photo)
      }

      users.set(user.id, user)
      return user
    },

    edit: (params: AdminWithIdNumberParams) => {
      return get(params.id)
    },

    update: async (params: UserUpdateParams) => {
      const { id, photo, photoCache, ...data } = params
      const user = { ...get(id), ...data }

      if (photo) {
        user.photo = await saveFile(photo)
      }

      users.set(id, user)
      return user
    },

    destroy: (params: IdNumberParams) => {
      const user = get(params.id)
      users.delete(params.id)
      return user
    },

    photo: (params: AdminWithIdNumberParams) => {
      const user = get(params.id)
      if (!user.photo) {
        return null
      }

      return path.join(resourceRoot, user.photo)
    },
  }
})
