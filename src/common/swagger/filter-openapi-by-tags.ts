import type { OpenAPIObject } from '@nestjs/swagger';

type PathItem = OpenAPIObject['paths'][string];

// The operation-bearing keys of a path item; other keys (parameters, $ref, servers) are metadata.
const OPERATION_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

/**
 * Return a copy of `document` keeping only the operations tagged with one of `allowedTags`. Used to
 * split the single generated spec into the per-app docs (business vs student): an operation survives
 * when any of its tags is allowed, and a path with no surviving operation is dropped. `components`
 * are left intact — shared DTO schemas are referenced from both docs — and the top-level `tags` list
 * is narrowed to the allowed set.
 */
export function filterOpenApiByTags(document: OpenAPIObject, allowedTags: string[]): OpenAPIObject {
  const allowed = new Set(allowedTags);
  const paths: OpenAPIObject['paths'] = {};

  for (const [route, pathItem] of Object.entries(document.paths)) {
    const filtered: PathItem = { ...pathItem };
    let keptAny = false;
    for (const method of OPERATION_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      if (operation.tags?.some((tag) => allowed.has(tag))) {
        keptAny = true;
      } else {
        delete filtered[method];
      }
    }
    if (keptAny) {
      paths[route] = filtered;
    }
  }

  return {
    ...document,
    paths,
    tags: document.tags?.filter((tag) => allowed.has(tag.name)),
  };
}
