/**
 * Entorno común de las pruebas e2e. La base de pruebas es siempre distinta de
 * la de desarrollo: se recrea en cada ejecución.
 */
export function applyTestEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.DOCS_ENABLED = 'true';
  process.env.PORT = '3001';
  process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'auth_db_test';
  // Secreto exclusivo de pruebas; nunca se usa fuera de este proceso.
  process.env.JWT_SECRET = 'e2e-only-secret-with-more-than-32-bytes-0123456789';
  process.env.JWT_MAX_TTL_SECONDS = '900';
  // El publicador real no corre en las e2e; sus pruebas lo controlan a mano.
  process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
}

applyTestEnvironment();
