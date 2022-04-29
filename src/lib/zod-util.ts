import { z } from 'zod'

export type ArrangeResult =
  | {
      arranged: true
      result: any
    }
  | {
      arranged: false
      result: undefined
    }

const nullArrangeResult = { arranged: false, result: undefined }
export { nullArrangeResult }

export function strip(schema: z.AnyZodObject): z.AnyZodObject {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return strip((schema._def as any).innerType)
  }
  return schema
}

export function cast(schema: z.AnyZodObject, value: any): ArrangeResult {
  try {
    if (schema instanceof z.ZodBigInt && typeof value !== 'bigint') {
      return { arranged: true, result: BigInt(value) }
    }
    if (schema instanceof z.ZodNumber && typeof value !== 'number') {
      const num = Number(value)
      if (Number.isNaN(num)) {
        return nullArrangeResult
      }
      return { arranged: true, result: num }
    }
    if (schema instanceof z.ZodBoolean && typeof value !== 'boolean') {
      return { arranged: true, result: Boolean(value) }
    }
    if (schema instanceof z.ZodDate && !(value instanceof Date)) {
      return { arranged: true, result: new Date(value) }
    }
    if (schema instanceof z.ZodString) {
      if (value === '') return { arranged: true, result: null }
      return { arranged: true, result: value.toString() }
    }
    return nullArrangeResult
  } catch (err) {
    console.warn(err)
    return nullArrangeResult
  }
}

type TraverseCallback = {
  (schema: z.AnyZodObject, obj: any, key: string): void
}

// FIXME: draft implements
function traverseSchema(schema: z.AnyZodObject, obj: any, callback: TraverseCallback) {
  for (const [key, subSchema] of Object.entries<z.AnyZodObject>(schema.shape)) {
    if (key in obj) {
      if (obj[key] instanceof Array) {
        if (subSchema instanceof z.ZodArray) {
          for (const item of obj[key]) {
            traverseSchema(subSchema.element, item, callback)
          }
        }
      } else if (obj[key] instanceof Object) {
        if (subSchema instanceof z.ZodObject) {
          traverseSchema(subSchema, obj[key], callback)
        }
      }
      continue
    }

    callback(subSchema, obj, key)
  }
  return obj
}

export function fillDefault(schema: z.AnyZodObject, obj: any): any {
  return traverseSchema(schema, obj, (schema, obj, key) => {
    if (schema instanceof z.ZodDefault) {
      obj[key] = (schema._def as any).defaultValue()
    }
  })
}

export function isValue(obj: any): boolean {
  return (
    typeof obj === 'string' ||
    typeof obj === 'number' ||
    typeof obj === 'boolean' ||
    typeof obj === 'bigint' ||
    obj instanceof Date
  )
}

export function deepCast(schema: z.AnyZodObject, obj: any) {
  if (isValue(obj)) {
    const ret = cast(strip(schema), obj)
    return ret.arranged ? ret.result : obj
  }

  if (obj instanceof Array) {
    const arraySchema = strip(schema)
    if (arraySchema instanceof z.ZodArray) {
      const itemSchema = strip(arraySchema.element)
      obj.forEach((item, index) => {
        obj[index] = deepCast(itemSchema, item)
      })
    }
    return obj
  }

  for (const [key, val] of Object.entries<any>(obj)) {
    const itemSchema = strip(schema).shape[key]
    if (itemSchema) {
      obj[key] = deepCast(itemSchema, val)
    }
  }
  return obj
}
