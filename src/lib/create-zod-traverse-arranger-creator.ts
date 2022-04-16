import { z } from 'zod'
import { TraverseArranger, TraverseArrangerCreator, ArrangeResult, nullArrangeResult } from './request-body-parser'

export function createZodTraverseArrangerCreator(schema: z.AnyZodObject): TraverseArrangerCreator {
  return () => new ZodArranger(schema)
}

function stripDefault(schema: z.AnyZodObject) {
  if (schema instanceof z.ZodDefault) {
    return (schema._def as any).innerType
  }
  return schema
}

export class ZodArranger implements TraverseArranger {
  constructor(private schema: z.AnyZodObject) {}

  next(path: string, node: Record<string, any>, value: any, pathIndex: number): void {
    this.schema = stripDefault(this.schema.shape[path])
  }

  nextItem(name: string, node: Record<string, any>, value: any, pathIndex: number): void {
    let parentSchema = stripDefault(this.schema.shape[name])
    this.schema = stripDefault(parentSchema.element)
  }

  arrangeIndexedArrayItemOnLast(name: string, node: Record<string, any>, value: any, pathIndex: number): ArrangeResult {
    if (this.isArraySchema()) {
      return this.cast(this.elementSchema(), value)
    }
    return nullArrangeResult
  }

  arrangeUnindexedArrayOnLast(name: string, node: Record<string, any>, value: any[], pathIndex: number): ArrangeResult {
    if (this.isArraySchema()) {
      return this.castArray(this.elementSchema(), value)
    } else {
      console.error(this.schema, name, value)
      throw new Error(`Unexpected Type: ${this.schema}`)
    }
  }

  arrangePropertyOnLast(path: string, node: Record<string, any>, value: any, pathIndex: number): ArrangeResult {
    const result = this.cast(this.schema, value)
    if (result.arranged) {
      return result
    }
    return nullArrangeResult
  }

  private isArraySchema() {
    return this.schema instanceof z.ZodArray
  }

  private elementSchema() {
    if (!(this.schema instanceof z.ZodArray)) {
      throw new Error('Must be array schema')
    }
    return this.schema.element
  }

  private castArray(elementSchema: z.AnyZodObject, value: any) {
    return {
      arranged: true,
      result: value.map((item: any) => {
        const { result } = this.cast(elementSchema, item)
        return result
      }),
    }
  }

  private cast(schema: z.AnyZodObject, value: any): ArrangeResult {
    if (schema instanceof z.ZodNumber) {
      return { arranged: true, result: Number(value) }
    }
    if (schema instanceof z.ZodDate) {
      return { arranged: true, result: new Date(value) }
    }
    if (schema instanceof z.ZodString) {
      if (value === '') return { arranged: true, result: null }
      return { arranged: true, result: value.toString() }
    }
    return nullArrangeResult
  }
}
