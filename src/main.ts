import 'reflect-metadata';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { swaggerBasicAuth } from './common/middleware/swagger-basic-auth.middleware';
import { buildAppDocuments } from './common/swagger/openapi-document';
import { RedisIoAdapter } from './infrastructure/websocket/redis-io.adapter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import type { Env } from './config/env';

// Money is stored as BigInt (integer so'm) but the contract sends it as a JSON number.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this as unknown as bigint);
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const prefix = config.get('API_PREFIX', { infer: true });
  const port = config.get('PORT', { infer: true });
  const swaggerPath = config.get('SWAGGER_PATH', { infer: true });
  const swaggerUser = config.get('SWAGGER_USER', { infer: true });
  const swaggerPassword = config.get('SWAGGER_PASSWORD', { infer: true });
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  // CORS for the browser-based admin panel (native mobile apps are unaffected — they don't send an
  // Origin). Allowed origins come from CORS_ORIGINS (comma-separated). Auth is a Bearer token, so the
  // Authorization header must be allowed through.
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Real-time chat (`/chat`): fan Socket.IO events out across instances via the Redis adapter.
  const redisIoAdapter = new RedisIoAdapter(app, config.get('REDIS_URL', { infer: true }));
  redisIoAdapter.connect();
  app.useWebSocketAdapter(redisIoAdapter);

  // Serve uploaded media from disk in dev (prod serves the same /uploads path via Nginx). Kept
  // OUTSIDE the global `/v1` prefix — useStaticAssets is not affected by setGlobalPrefix.
  const uploadsDir = resolve(config.get('UPLOADS_DIR', { infer: true }));
  await mkdir(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Expose the docs only when protected (a password is set) or outside production. When a password
  // is set, gate the UI + JSON + YAML with Basic auth before SwaggerModule registers those routes;
  // keeping the JSON under `/${swaggerPath}/json` lets the browser reuse the same credentials.
  if (swaggerPassword || !isProd) {
    if (swaggerPassword) {
      // One mount on `/${swaggerPath}` covers both sub-docs and their JSON.
      app.use(`/${swaggerPath}`, swaggerBasicAuth(swaggerUser, swaggerPassword));
    }
    const { business: businessDoc, student: studentDoc } = buildAppDocuments(
      app,
      prefix,
      swaggerPath,
    );

    SwaggerModule.setup(`${swaggerPath}/business`, app, businessDoc, {
      jsonDocumentUrl: `${swaggerPath}/business/json`,
      yamlDocumentUrl: `${swaggerPath}/business/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup(`${swaggerPath}/student`, app, studentDoc, {
      jsonDocumentUrl: `${swaggerPath}/student/json`,
      yamlDocumentUrl: `${swaggerPath}/student/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
  } else {
    app
      .get(Logger)
      .warn('Swagger docs are disabled in production (set SWAGGER_PASSWORD to enable).');
  }

  await app.listen(port);
}

void bootstrap();
