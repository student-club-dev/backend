import type { OpenAPIObject } from '@nestjs/swagger';
import { filterOpenApiByTags } from './filter-openapi-by-tags';

describe('filterOpenApiByTags', () => {
  const document: OpenAPIObject = {
    openapi: '3.0.0',
    info: { title: 'ElonUz API', version: '1.0' },
    paths: {
      '/v1/auth/business/login': { post: { tags: ['Auth — Business'], responses: {} } },
      '/v1/auth/student/login': { post: { tags: ['Auth — Student'], responses: {} } },
      '/v1/profile': {
        get: { tags: ['Profiles'], responses: {} },
        put: { tags: ['Profiles'], responses: {} },
      },
      // A path whose methods belong to different apps — only the allowed method survives.
      '/v1/mixed': {
        get: { tags: ['Profiles'], responses: {} },
        delete: { tags: ['Health'], responses: {} },
      },
      '/v1/health': { get: { tags: ['Health'], responses: {} } },
    },
    tags: [
      { name: 'Auth — Business' },
      { name: 'Auth — Student' },
      { name: 'Profiles' },
      { name: 'Health' },
    ],
  };

  it('keeps only paths whose operations carry an allowed tag', () => {
    const result = filterOpenApiByTags(document, ['Auth — Business', 'Profiles']);
    expect(Object.keys(result.paths).sort()).toEqual([
      '/v1/auth/business/login',
      '/v1/mixed',
      '/v1/profile',
    ]);
    expect(result.paths['/v1/health']).toBeUndefined();
    expect(result.paths['/v1/auth/student/login']).toBeUndefined();
  });

  it('drops the non-allowed method from a mixed path', () => {
    const result = filterOpenApiByTags(document, ['Profiles']);
    expect(result.paths['/v1/mixed'].get).toBeDefined();
    expect(result.paths['/v1/mixed'].delete).toBeUndefined();
  });

  it('narrows the top-level tags list to the allowed set', () => {
    const result = filterOpenApiByTags(document, ['Auth — Student', 'Profiles']);
    expect(result.tags?.map((tag) => tag.name)).toEqual(['Auth — Student', 'Profiles']);
  });

  it('does not mutate the source document', () => {
    filterOpenApiByTags(document, ['Profiles']);
    expect(Object.keys(document.paths)).toHaveLength(5);
    expect(document.paths['/v1/mixed'].delete).toBeDefined();
  });

  it('leaves components untouched (shared schemas)', () => {
    const withComponents: OpenAPIObject = {
      ...document,
      components: { schemas: { LoginDto: { type: 'object' } } },
    };
    const result = filterOpenApiByTags(withComponents, ['Auth — Student']);
    expect(result.components?.schemas?.LoginDto).toEqual({ type: 'object' });
  });
});
