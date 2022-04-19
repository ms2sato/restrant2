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

export function stripDefault(schema: z.AnyZodObject) {
  if (schema instanceof z.ZodDefault) {
    return (schema._def as any).innerType
  }
  return schema
}

export function cast(schema: z.AnyZodObject, value: any): ArrangeResult {
  if (schema instanceof z.ZodBigInt && typeof value !== 'bigint') {
    return { arranged: true, result: BigInt(value) }
  }
  if (schema instanceof z.ZodNumber && typeof value !== 'number') {
    return { arranged: true, result: Number(value) }
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

export function isBaseSchema(schema: z.AnyZodObject) {
  return (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodDate ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodBigInt
  )
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

function traverseObject(schema: z.AnyZodObject, obj: any) {
  if (isValue(obj)) {
    const ret = cast(stripDefault(schema), obj)
    return ret.arranged ? ret.result : obj
  }

  if (obj instanceof Array) {
    const arraySchema = stripDefault(schema)
    if (arraySchema instanceof z.ZodArray) {
      const itemSchema = arraySchema.element
      obj.forEach((item, index) => {
        obj[index] = traverseObject(itemSchema, item)
      })
    }
    return obj
  }

  for (const [key, val] of Object.entries<any>(obj)) {
    const itemSchema = stripDefault(schema).shape[key]
    if (itemSchema) {
      obj[key] = traverseObject(itemSchema, val)
    }
  }
  return obj
}

export function deepCast(schema: z.AnyZodObject, obj: any): any {
  return traverseObject(schema, obj)
}
