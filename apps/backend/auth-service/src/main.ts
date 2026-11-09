import { ConfigService } from '@nestjs/config';
import { createAuthApplication } from './bootstrap';

async function bootstrap() {
  const app = await createAuthApplication();
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  console.error('No fue posible iniciar Auth Service', error);
  process.exitCode = 1;
});
