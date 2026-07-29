import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildAppDocuments } from '../src/common/swagger/openapi-document';

/**
 * Writes both per-app OpenAPI documents to `docs/api/generated/`, which is what the mobile clients
 * are generated from.
 *
 * Runs in Nest's preview mode: providers and controllers are never instantiated, only their route
 * metadata is read. That means no database, Redis, or credentials — so this works in CI and as a
 * test fixture, not just on a fully provisioned machine.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const prefix = process.env.API_PREFIX ?? 'v1';
  const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';
  // Must happen before the document is built, exactly as in `main.ts` — otherwise every path in the
  // dumped spec is missing its `/v1`, and the generated client calls the wrong URLs.
  app.setGlobalPrefix(prefix);
  const docs = buildAppDocuments(app, prefix, swaggerPath);
  await app.close();

  const outDir = resolve(__dirname, '..', 'docs', 'api', 'generated');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'student.json'), `${JSON.stringify(docs.student, null, 2)}\n`);
  await writeFile(join(outDir, 'business.json'), `${JSON.stringify(docs.business, null, 2)}\n`);
  process.stdout.write(`OpenAPI written to ${outDir}\n`);
}

void main();
