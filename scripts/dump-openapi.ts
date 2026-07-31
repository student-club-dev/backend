import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildAppDocuments } from '../src/common/swagger/openapi-document';

/**
 * Writes both per-app OpenAPI documents to `docs/api/generated/`, and copies the student one into
 * `docs/handoff/mobile/` — the path the mobile team actually generates their client from. It used to
 * be copied by hand, which meant it silently lagged a whole feature behind.
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

  const student = `${JSON.stringify(docs.student, null, 2)}\n`;

  const outDir = resolve(__dirname, '..', 'docs', 'api', 'generated');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'student.json'), student);
  await writeFile(join(outDir, 'business.json'), `${JSON.stringify(docs.business, null, 2)}\n`);

  const handoffDir = resolve(__dirname, '..', 'docs', 'handoff', 'mobile');
  await mkdir(handoffDir, { recursive: true });
  await writeFile(join(handoffDir, 'student-api.json'), student);

  process.stdout.write(`OpenAPI written to ${outDir}\n`);
  process.stdout.write(`Student spec mirrored to ${handoffDir}\n`);
}

void main();
