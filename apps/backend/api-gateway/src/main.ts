import { createGateway } from './bootstrap';
import { ConfigService } from '@nestjs/config';

async function bootstrap(): Promise<void> {
  const app = await createGateway();
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

void bootstrap().catch(() => {
  console.error('No se pudo iniciar el API Gateway. Revisa la configuración.');
  process.exitCode = 1;
});
