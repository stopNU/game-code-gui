import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ToolContract, ToolExecutionContext } from '../types/tool.js';

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  const type = schema['type'];

  if (type === 'string') {
    let s = z.string();
    if (typeof schema['description'] === 'string') {
      s = s.describe(schema['description']);
    }
    return s;
  }

  if (type === 'number' || type === 'integer') {
    let n = z.number();
    if (typeof schema['description'] === 'string') {
      n = n.describe(schema['description']);
    }
    return n;
  }

  if (type === 'boolean') {
    return z.boolean();
  }

  if (type === 'array') {
    const items = schema['items'];
    const itemSchema =
      items !== null && typeof items === 'object' && !Array.isArray(items)
        ? jsonSchemaToZod(items as Record<string, unknown>)
        : z.unknown();
    return z.array(itemSchema);
  }

  if (type === 'object') {
    const properties = schema['properties'];
    const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];

    if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
      return z.record(z.unknown());
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, propSchema] of Object.entries(properties as Record<string, unknown>)) {
      if (propSchema !== null && typeof propSchema === 'object' && !Array.isArray(propSchema)) {
        const zodType = jsonSchemaToZod(propSchema as Record<string, unknown>);
        shape[key] = required.includes(key) ? zodType : zodType.optional();
      }
    }

    let obj = z.object(shape);
    if (typeof schema['description'] === 'string') {
      obj = obj.describe(schema['description']);
    }
    return obj;
  }

  return z.unknown();
}

/**
 * Converts a ToolContract to a LangChain DynamicStructuredTool.
 */
export function toLC(
  contract: ToolContract,
  execCtx: ToolExecutionContext,
): DynamicStructuredTool {
  const rawSchema = jsonSchemaToZod(contract.inputSchema as Record<string, unknown>);
  // DynamicStructuredTool requires a ZodObject at the top level.
  const schema = rawSchema instanceof z.ZodObject
    ? rawSchema
    : z.object({ input: z.string().optional() });

  // Use `any` to bypass exactOptionalPropertyTypes mismatch in zod v3 _def.description typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new DynamicStructuredTool({
    name: contract.name,
    description: contract.description,
    schema: schema as any,
    func: async (input: Record<string, unknown>) => {
      try {
        const output = await contract.execute(input, execCtx);
        return typeof output === 'string' ? output : JSON.stringify(output);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  }) as unknown as DynamicStructuredTool;
}

/** Convert an array of ToolContracts to LangChain DynamicStructuredTools. */
export function toLCTools(
  contracts: ToolContract[],
  execCtx: ToolExecutionContext,
): DynamicStructuredTool[] {
  return contracts.map((c) => toLC(c, execCtx));
}
