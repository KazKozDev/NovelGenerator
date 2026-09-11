import { describe, it, expect } from 'vitest';
import { sanitizeGeminiSchema } from '../services/geminiService';

describe('sanitizeGeminiSchema', () => {
  it('strips additionalProperties and non-Gemini fields from object schemas', () => {
    const rawSchema = {
      type: 'object',
      required: ['title', 'scenes'],
      additionalProperties: false,
      title: 'NovelPlan',
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        title: { type: 'string', minLength: 1 },
        scenes: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
          items: {
            type: 'object',
            required: ['id', 'weight'],
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              weight: { type: 'integer', minimum: 1, maximum: 5 }
            }
          }
        }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);

    expect(sanitized).toEqual({
      type: 'object',
      required: ['title', 'scenes'],
      properties: {
        title: {
          type: 'string'
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'weight'],
            properties: {
              id: { type: 'string' },
              weight: { type: 'integer' }
            }
          }
        }
      }
    });

    // Explicitly check that forbidden keywords were removed
    expect(sanitized).not.toHaveProperty('additionalProperties');
    expect(sanitized).not.toHaveProperty('$schema');
    expect(sanitized).not.toHaveProperty('title');
    expect(sanitized.properties.scenes).not.toHaveProperty('minItems');
    expect(sanitized.properties.scenes).not.toHaveProperty('maxItems');
    expect(sanitized.properties.scenes).not.toHaveProperty('uniqueItems');
    expect(sanitized.properties.scenes.items).not.toHaveProperty('additionalProperties');
    expect(sanitized.properties.scenes.items.properties.weight).not.toHaveProperty('minimum');
    expect(sanitized.properties.scenes.items.properties.weight).not.toHaveProperty('maximum');
  });

  it('preserves allowed fields like enum, description, format, and nullable', () => {
    const rawSchema = {
      type: 'object',
      description: 'Review issue output',
      properties: {
        category: {
          type: 'string',
          description: 'Category of issue',
          enum: ['grammar', 'plot', 'character']
        },
        resolvedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);

    expect(sanitized).toEqual({
      type: 'object',
      description: 'Review issue output',
      properties: {
        category: {
          type: 'string',
          description: 'Category of issue',
          enum: ['grammar', 'plot', 'character']
        },
        resolvedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true
        }
      }
    });
  });

  it('normalizes missing type when properties or items are present', () => {
    const rawSchema = {
      properties: {
        tag: {}
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);

    expect(sanitized).toEqual({
      type: 'object',
      properties: {
        tag: {
          type: 'string'
        }
      }
    });
  });

  it('filters required properties to only those defined in properties', () => {
    const rawSchema = {
      type: 'object',
      required: ['existingKey', 'nonExistentKey'],
      properties: {
        existingKey: { type: 'string' }
      }
    };

    const sanitized = sanitizeGeminiSchema(rawSchema);
    expect(sanitized.required).toEqual(['existingKey']);
  });
});
